import { NextRequest, NextResponse } from "next/server";
import { getScoreboard } from "@/lib/espn";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

function pickRecord(c: any) {
  const records = Array.isArray(c?.records) ? c.records : [];
  return records.find((r: any) => /overall|total/i.test(String(r?.type || r?.name || "")))?.summary || records[0]?.summary || c?.record?.[0]?.summary || null;
}

function pickSeriesRecord(c: any) {
  const records = Array.isArray(c?.records) ? c.records : [];
  const series = records.find((r: any) => /series|playoff|vsopponent|vs opponent/i.test(String(r?.type || r?.name || "")));
  return series?.summary || null;
}

function textValue(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.displayName || value.fullName || value.name || value.shortName || value.text || value.summary || null;
}

function extractProbablePitcher(c: any): string | null {
  const paths = [
    c?.probablePitcher,
    c?.probableStarter,
    c?.starter,
    c?.pitcher,
    c?.probables?.[0],
    c?.probables?.[0]?.athlete,
    c?.statistics?.probablePitcher,
  ];
  for (const item of paths) {
    const txt = textValue(item) || textValue(item?.athlete) || textValue(item?.player);
    if (txt) return txt;
  }
  return null;
}

function extractPitchingMatchup(comp: any, away: any, home: any): string | null {
  const awayPitcher = extractProbablePitcher(away);
  const homePitcher = extractProbablePitcher(home);
  if (awayPitcher && homePitcher) return `${awayPitcher} vs ${homePitcher}`;

  const probables = Array.isArray(comp?.probables) ? comp.probables : [];
  const names = probables.map((p: any) => textValue(p?.athlete) || textValue(p?.player) || textValue(p)).filter(Boolean);
  if (names.length >= 2) return `${names[0]} vs ${names[1]}`;
  if (names.length === 1) return names[0];
  return null;
}

function extractSeriesInfo(ev: any, comp: any) {
  const series = comp?.series || ev?.series || ev?.competitions?.[0]?.series || null;
  const summary = textValue(series?.summary) || textValue(series?.shortSummary) || textValue(series?.description) || textValue(series?.name) || null;
  const seriesGame = series?.gameNumber ? `Game ${series.gameNumber}` : (summary && /game\s+\d+/i.test(summary) ? summary.match(/game\s+\d+/i)?.[0]?.replace(/^game/i, "Game") : null);
  const competitors = Array.isArray(series?.competitors) ? series.competitors : [];
  const recordById = new Map<string, string>();
  for (const c of competitors) {
    const id = String(c?.team?.id || c?.id || "");
    const wins = c?.wins ?? c?.record?.wins;
    const losses = c?.losses ?? c?.record?.losses;
    const rec = textValue(c?.record) || (wins != null && losses != null ? `${wins}-${losses}` : null);
    if (id && rec) recordById.set(id, rec);
  }
  return { summary, seriesGame, recordById };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const date = searchParams.get("date");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }

  try {
    const data = await getScoreboard(league, date || undefined);

    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");

      // v19 fix: ESPN's scoreboard payload sometimes returns competitor.team.logo
      // as a singular URL string and sometimes as a logos[] array. v18 only
      // checked the array path which is why logos disappeared on the league
      // view game cards. Fall through both.
      const seriesInfo = extractSeriesInfo(ev, comp);
      const isPlayoff = ev?.season?.type === 3 || comp?.season?.type === 3 || !!seriesInfo.summary || !!seriesInfo.seriesGame;

      const formatTeam = (c: any) =>
        c && {
          id: c.id,
          name: c.team?.displayName,
          abbr: c.team?.abbreviation,
          logo: c.team?.logo || c.team?.logos?.[0]?.href || null,
          score: c.score,
          record: pickRecord(c),
          seriesRecord: pickSeriesRecord(c) || seriesInfo.recordById.get(String(c.team?.id || c.id || "")) || null,
          winner: c.winner,
        };

      // Pass through situation block for live games. Used by LeaguesView to
      // render bases/count/outs (MLB) and down/distance (NFL) inline with the
      // status header. Shape varies per sport — see notes in v18.
      const situation = comp?.situation || null;
      const normalizedSituation = situation
        ? {
            balls: typeof situation.balls === "number" ? situation.balls : null,
            strikes: typeof situation.strikes === "number" ? situation.strikes : null,
            outs: typeof situation.outs === "number" ? situation.outs : null,
            onFirst: !!situation.onFirst,
            onSecond: !!situation.onSecond,
            onThird: !!situation.onThird,
            down: typeof situation.down === "number" ? situation.down : null,
            distance: typeof situation.distance === "number" ? situation.distance : null,
            yardLine: typeof situation.yardLine === "number" ? situation.yardLine : null,
            possession: situation.possession || null,
            isRedZone: !!situation.isRedZone,
            shortDownDistanceText: situation.shortDownDistanceText || null,
            possessionText: situation.possessionText || null,
            lastPlay: situation.lastPlay?.text || null,
          }
        : null;

      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        status: {
          state: comp?.status?.type?.state,
          completed: comp?.status?.type?.completed,
          description: comp?.status?.type?.description,
          detail: comp?.status?.type?.shortDetail,
          statusName: comp?.status?.type?.name || null,
        },
        home: formatTeam(home),
        away: formatTeam(away),
        situation: normalizedSituation,
        isPlayoff,
        seriesSummary: seriesInfo.summary,
        seriesGame: seriesInfo.seriesGame,
        pitchers: league === "mlb" ? extractPitchingMatchup(comp, away, home) : null,
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      };
    });

    return NextResponse.json({ league, date, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed" },
      { status: 500 }
    );
  }
}
