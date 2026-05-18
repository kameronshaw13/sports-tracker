import { NextRequest, NextResponse } from "next/server";
import { getScoreboard } from "@/lib/espn";
import { getOddsApiOddsForGamesWindow, type EspnGame } from "@/lib/oddsApi";
import { hasRefreshRun, lockStartedGames, oddsStoreEnabled, recordRefreshRun, upsertOddsSnapshots } from "@/lib/oddsStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];
const CENTRAL_TZ = "America/Chicago";
const PULL_LEAD_MS = 10 * 60 * 1000;
const MIN_WAVE_GAP_MS = 75 * 60 * 1000;

function ymdInZone(date: Date, timeZone = CENTRAL_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  return `${year}${month}${day}`;
}

function isoDateFromYmd(ymd: string) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function teamFromCompetitor(c: any) {
  return {
    id: c?.team?.id || c?.id || null,
    name: c?.team?.displayName || c?.team?.shortDisplayName || c?.team?.name || null,
    displayName: c?.team?.displayName || null,
    shortDisplayName: c?.team?.shortDisplayName || null,
    abbreviation: c?.team?.abbreviation || null,
    abbr: c?.team?.abbreviation || null,
  };
}

function gamesFromScoreboard(data: any): EspnGame[] {
  return (data?.events || []).map((event: any) => {
    const comp = event?.competitions?.[0];
    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const home = competitors.find((c: any) => c?.homeAway === "home");
    const away = competitors.find((c: any) => c?.homeAway === "away");
    return {
      id: String(event?.id || ""),
      date: event?.date || comp?.date || null,
      name: event?.name,
      shortName: event?.shortName,
      home: teamFromCompetitor(home),
      away: teamFromCompetitor(away),
      status: {
        state: comp?.status?.type?.state || event?.status?.type?.state || null,
        completed: comp?.status?.type?.completed || event?.status?.type?.completed || false,
      },
    };
  }).filter((game: EspnGame) => game.id && game.date);
}

function pregameFutureGames(games: EspnGame[], now: Date) {
  const nowMs = now.getTime();
  return games
    .filter((game) => {
      const start = new Date(String(game.date || "")).getTime();
      return String(game?.status?.state || "") === "pre" && Number.isFinite(start) && start > nowMs;
    })
    .sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime());
}

function wavesForSlate(games: EspnGame[], slateDate: string) {
  if (!games.length) return [];
  const gaps = games.slice(1).map((game, index) => ({
    index: index + 1,
    gap: new Date(String(game.date)).getTime() - new Date(String(games[index].date)).getTime(),
  }));
  const splits = gaps
    .filter((item) => item.gap >= MIN_WAVE_GAP_MS)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2)
    .map((item) => item.index)
    .sort((a, b) => a - b);

  const groups: EspnGame[][] = [];
  let start = 0;
  for (const split of splits) {
    groups.push(games.slice(start, split));
    start = split;
  }
  groups.push(games.slice(start));

  return groups.filter(Boolean).map((group, index) => {
    const firstStart = new Date(String(group[0].date));
    const hhmm = firstStart.toISOString().slice(11, 16).replace(":", "");
    return {
      index,
      waveKey: `${slateDate}-${index + 1}-${hhmm}`,
      games: group,
      pullAt: new Date(firstStart.getTime() - PULL_LEAD_MS),
    };
  });
}

function nextNightWindow(now: Date) {
  return new Date(now.getTime() + 36 * 60 * 60 * 1000);
}

function authOk(req: NextRequest) {
  const secret = process.env.ODDS_REFRESH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.nextUrl.searchParams.get("secret") === secret || req.headers.get("x-refresh-secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!oddsStoreEnabled()) {
    return NextResponse.json({ error: "Odds database is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." }, { status: 400 });
  }

  const now = new Date();
  const force = req.nextUrl.searchParams.get("force") === "1";
  const leagues = (req.nextUrl.searchParams.get("leagues") || req.nextUrl.searchParams.get("league") || "mlb,nba,nhl,nfl")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => VALID_LEAGUES.includes(item));
  const dateParams = (req.nextUrl.searchParams.get("dates") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{8}$/.test(item));
  const dates = dateParams.length
    ? dateParams
    : [ymdInZone(now), ymdInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000))];

  const results: any[] = [];
  for (const league of leagues) {
    const gamesByDate = new Map<string, EspnGame[]>();
    const allGames: EspnGame[] = [];
    for (const date of dates) {
      const scoreboard = await getScoreboard(league, date);
      const games = gamesFromScoreboard(scoreboard);
      gamesByDate.set(date, games);
      allGames.push(...games);
    }

    await lockStartedGames(league, allGames);

    const dueRuns: { slateDate: string; waveKey: string; gameCount: number }[] = [];
    for (const [slateDate, games] of gamesByDate) {
      const preGames = pregameFutureGames(games, now);
      for (const wave of wavesForSlate(preGames, slateDate)) {
        if (!force && now.getTime() < wave.pullAt.getTime()) continue;
        if (!force && await hasRefreshRun(league, isoDateFromYmd(slateDate), wave.waveKey)) continue;
        dueRuns.push({ slateDate, waveKey: wave.waveKey, gameCount: wave.games.length });
      }
    }

    if (!dueRuns.length) {
      results.push({ league, pulled: false, reason: "no due wave", games: allGames.length });
      continue;
    }

    const windowTo = nextNightWindow(now);
    const preGamesInWindow = pregameFutureGames(allGames, now).filter((game) => {
      const start = new Date(String(game.date || "")).getTime();
      return Number.isFinite(start) && start <= windowTo.getTime();
    });
    const odds = await getOddsApiOddsForGamesWindow(league, now, windowTo, preGamesInWindow, {
      cacheKeySuffix: `refresh-${dueRuns.map((run) => run.waveKey).join("-")}`,
      cacheTtlMs: 5 * 60 * 1000,
    });

    const pulledAt = new Date().toISOString();
    const rows = preGamesInWindow
      .map((game) => {
        const normalized = odds.get(String(game.id));
        if (!normalized) return null;
        return {
          league,
          event_id: String(game.id),
          game_date: isoDateFromYmd(ymdInZone(new Date(String(game.date)))),
          commence_time: new Date(String(game.date)).toISOString(),
          home_abbr: game.home?.abbr || game.home?.abbreviation || null,
          away_abbr: game.away?.abbr || game.away?.abbreviation || null,
          snapshot_type: "pregame",
          pulled_at: pulledAt,
          locked: false,
          odds: normalized,
        };
      })
      .filter(Boolean) as any[];
    const stored = await upsertOddsSnapshots(rows);

    for (const run of dueRuns) {
      await recordRefreshRun({
        league,
        slate_date: isoDateFromYmd(run.slateDate),
        wave_key: run.waveKey,
        pulled_at: pulledAt,
        window_from: now.toISOString(),
        window_to: windowTo.toISOString(),
        game_count: run.gameCount,
      });
    }

    results.push({ league, pulled: true, dueRuns, stored, windowFrom: now.toISOString(), windowTo: windowTo.toISOString() });
  }

  return NextResponse.json({ ok: true, now: now.toISOString(), results }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
