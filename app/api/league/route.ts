import { NextRequest, NextResponse } from "next/server";
import { getScoreboard } from "@/lib/espn";
import { getOddsApiOddsForGames, mergeOdds } from "@/lib/oddsApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

function pickRecord(c: any) {
  const records = Array.isArray(c?.records) ? c.records : [];
  return records.find((r: any) => /overall|total/i.test(String(r?.type || r?.name || "")))?.summary || records[0]?.summary || c?.record?.[0]?.summary || null;
}

function pickSeriesRecord(c: any) {
  const records = Array.isArray(c?.records) ? c.records : [];
  const series = records.find((r: any) => /series|playoff|postseason|vs\s*\.?\s*opponent|vsopponent|head.?to.?head/i.test(String(r?.type || r?.name || r?.displayName || "")));
  const summary = series?.summary || series?.displayValue || series?.record || null;
  const match = String(summary || "").match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return match && !(match[1] === "0" && match[2] === "0") ? `${Number(match[1])}-${Number(match[2])}` : null;
}

function textValue(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.displayName || value.fullName || value.name || value.shortName || value.text || value.summary || null;
}

function cleanPitcherName(txt: string | null): string | null {
  if (!txt) return null;
  const value = String(txt).trim();
  if (!value || /probable|starting pitcher|starter tbd|^tbd$/i.test(value)) return null;
  return value;
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
    const txt = cleanPitcherName(textValue(item) || textValue(item?.athlete) || textValue(item?.player));
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
  if (awayPitcher || homePitcher) return `${awayPitcher || "TBD"} vs ${homePitcher || "TBD"}`;
  return null;
}

function extractSeriesInfo(ev: any, comp: any) {
  const series = comp?.series || ev?.series || ev?.competitions?.[0]?.series || null;
  const summary =
    textValue(series?.summary) ||
    textValue(series?.shortSummary) ||
    textValue(series?.description) ||
    textValue(series?.name) ||
    textValue(comp?.notes?.[0]?.headline) ||
    textValue(comp?.notes?.[0]?.text) ||
    textValue(ev?.note) ||
    textValue(comp?.status?.type?.detail) ||
    textValue(comp?.status?.type?.shortDetail) ||
    null;
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
  for (const c of comp?.competitors || []) {
    const id = String(c?.team?.id || c?.id || "");
    const rec = pickSeriesRecord(c);
    if (id && rec && !recordById.has(id)) recordById.set(id, rec);
  }
  return { summary, seriesGame, recordById };
}


function fallbackSeriesGame(ev: any, comp: any): string | null {
  const candidates = [
    comp?.notes?.[0]?.headline,
    comp?.notes?.[0]?.text,
    ev?.note,
    comp?.status?.type?.shortDetail,
    comp?.status?.type?.detail,
    ev?.shortName,
    ev?.name,
  ];
  for (const raw of candidates) {
    const txt = String(raw || "");
    const match = txt.match(/\bGame\s+(\d+)\b/i);
    if (match) return `Game ${match[1]}`;
  }
  return null;
}

function seriesGameNumber(value: any): number | null {
  const match = String(value || "").match(/\bGame\s+(\d+)\b/i);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

async function fetchMlbSummaryPitchers(eventId: string, away: any, home: any): Promise<string | null> {
  try {
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`;
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const text = JSON.stringify(data);
    const names = Array.from(text.matchAll(/"(?:probableStarter|probablePitcher|starter|athlete)"\s*:\s*\{[^{}]*"(?:displayName|fullName|name)"\s*:\s*"([^"]+)"/gi)).map((m) => m[1]);
    const unique = names.map((n) => cleanPitcherName(n)).filter((n, i, arr): n is string => !!n && arr.indexOf(n) === i);
    if (unique.length >= 2) return `${unique[0]} vs ${unique[1]}`;
    if (unique.length === 1) return `${unique[0]} vs TBD`;
  } catch {}
  return null;
}

function normalizeTextName(value: any): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function deriveSeriesRecords(summary: string | null, away: any, home: any): { away?: string; home?: string } {
  if (!summary) return {};
  const txt = String(summary);
  const tied = txt.match(/tied[^0-9]*(\d+)\s*-\s*(\d+)/i) || txt.match(/series\s+tied[^0-9]*(\d+)?\s*-?\s*(\d+)?/i);
  if (tied) {
    if (tied[1] == null || tied[2] == null) return {};
    const rec = `${tied[1]}-${tied[2]}`;
    return { away: rec, home: rec };
  }
  const lead =
    txt.match(/(.+?)\s+(?:lead[s]?|win[s]?|won|take[s]?|took)\s+(?:the\s+)?(?:series\s+)?(\d+)\s*[-–]\s*(\d+)/i) ||
    txt.match(/(.+?)\s+(?:defeat[s]?|beat[s]?|eliminate[s]?|knock[s]?\s+out)\s+.+?\s+(?:in|to win|wins?)\s+(?:the\s+)?series\s+(\d+)\s*[-–]\s*(\d+)/i);
  if (lead) {
    const leader = normalizeTextName(lead[1]);
    const rec = `${lead[2]}-${lead[3]}`;
    const other = `${lead[3]}-${lead[2]}`;
    const awayName = normalizeTextName(`${away?.team?.displayName || ""} ${away?.team?.shortDisplayName || ""} ${away?.team?.abbreviation || ""}`);
    const homeName = normalizeTextName(`${home?.team?.displayName || ""} ${home?.team?.shortDisplayName || ""} ${home?.team?.abbreviation || ""}`);
    const awayShort = normalizeTextName(away?.team?.shortDisplayName || away?.team?.name || away?.team?.abbreviation);
    const homeShort = normalizeTextName(home?.team?.shortDisplayName || home?.team?.name || home?.team?.abbreviation);
    if (awayName.includes(leader) || leader.includes(awayShort) || (awayShort && leader.endsWith(awayShort))) return { away: rec, home: other };
    if (homeName.includes(leader) || leader.includes(homeShort) || (homeShort && leader.endsWith(homeShort))) return { away: other, home: rec };
  }
  return {};
}

function formatAmericanOdds(value: any): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "object" ? (value?.american || value?.displayValue || value?.value) : value;
  const num = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num === 0 || Math.abs(num) < 50) return null;
  return num > 0 ? `+${Math.round(num)}` : `${Math.round(num)}`;
}

function formatOverUnder(value: any): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "object" ? (value?.displayValue || value?.value) : value;
  const num = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  return `o${Number.isInteger(num) ? num : num.toFixed(1).replace(/\.0$/, "")}`;
}

function formatSpreadValue(value: any): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "object" ? (value?.displayValue || value?.value) : value;
  const num = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num === 0 || Math.abs(num) >= 50) return null;
  const display = Number.isInteger(num) ? String(Math.abs(num)) : Math.abs(num).toFixed(1).replace(/\.0$/, "");
  return `${num > 0 ? "+" : "-"}${display}`;
}

function parseOddsDetails(details: any, comp: any) {
  const text = String(details || "").trim();
  if (!text) return {};
  const out: any = {};
  const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const byAbbr = new Map<string, "away" | "home">();
  for (const c of competitors) {
    const side = c?.homeAway === "home" ? "home" : c?.homeAway === "away" ? "away" : null;
    const abbr = String(c?.team?.abbreviation || c?.team?.shortDisplayName || "").toUpperCase();
    if (side && abbr) byAbbr.set(abbr, side);
  }

  const teamLineMatches = Array.from(text.matchAll(/\b([A-Z]{2,5})\s*([+-]\d+(?:\.\d+)?)\b/g));
  for (const match of teamLineMatches) {
    const side = byAbbr.get(match[1].toUpperCase());
    if (!side) continue;
    const raw = match[2];
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    if (Math.abs(num) >= 50) {
      if (side === "away") out.awayMoneyLine = raw;
      if (side === "home") out.homeMoneyLine = raw;
    } else {
      const display = formatSpreadValue(raw);
      if (side === "away") {
        out.awaySpread = display;
        out.homeSpread = invertSpread(display);
      }
      if (side === "home") {
        out.homeSpread = display;
        out.awaySpread = invertSpread(display);
      }
    }
  }

  const total = text.match(/\b(?:O\/U|OU|TOTAL)\s*:?\s*(\d+(?:\.\d+)?)\b/i);
  if (total) out.overUnder = total[1];

  return out;
}

function invertSpread(value: any): string | null {
  const n = Number(String(value || "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return formatSpreadValue(-n);
}

function pickAmericanOdds(...values: any[]) {
  for (const value of values) {
    const formatted = formatAmericanOdds(value);
    if (formatted) return formatted;
  }
  return null;
}

function pickSpread(...values: any[]) {
  for (const value of values) {
    const formatted = formatSpreadValue(value);
    if (formatted) return formatted;
  }
  return null;
}

function extractOdds(comp: any) {
  const odds = Array.isArray(comp?.odds) ? comp.odds[0] : comp?.odds;
  if (!odds) return null;
  const details = typeof odds?.details === "string" ? odds.details : null;
  const parsed = parseOddsDetails(details, comp);
  const awayMoneyLine = pickAmericanOdds(
    odds?.awayTeamOdds?.moneyLine ??
    odds?.awayTeamOdds?.moneyline ??
    odds?.awayTeamOdds?.current?.moneyLine,
    odds?.awayTeamOdds?.current?.moneyline,
    odds?.awayTeamOdds?.ml,
    odds?.awayTeamOdds?.odds,
    odds?.awayTeamOdds?.price,
    odds?.awayMoneyLine ??
    odds?.awayMoneyline,
    parsed.awayMoneyLine
  );
  const homeMoneyLine = pickAmericanOdds(
    odds?.homeTeamOdds?.moneyLine ??
    odds?.homeTeamOdds?.moneyline ??
    odds?.homeTeamOdds?.current?.moneyLine,
    odds?.homeTeamOdds?.current?.moneyline,
    odds?.homeTeamOdds?.ml,
    odds?.homeTeamOdds?.odds,
    odds?.homeTeamOdds?.price,
    odds?.homeMoneyLine ??
    odds?.homeMoneyline,
    parsed.homeMoneyLine
  );
  const overUnder = formatOverUnder(odds?.overUnder ?? odds?.total ?? odds?.oU ?? parsed.overUnder);
  const overOdds = pickAmericanOdds(odds?.overOdds, odds?.over?.odds, odds?.over?.price, odds?.over?.moneyLine, odds?.totalOverOdds, odds?.overTeamOdds?.moneyLine, odds?.overTeamOdds?.odds, odds?.overTeamOdds?.price);
  const underOdds = pickAmericanOdds(odds?.underOdds, odds?.under?.odds, odds?.under?.price, odds?.under?.moneyLine, odds?.totalUnderOdds, odds?.underTeamOdds?.moneyLine, odds?.underTeamOdds?.odds, odds?.underTeamOdds?.price);
  const awaySpread = pickSpread(odds?.awayTeamOdds?.spread, odds?.awayTeamOdds?.current?.spread, odds?.awayTeamOdds?.line, odds?.awayTeamOdds?.handicap, odds?.awaySpread, parsed.awaySpread);
  const homeSpread = pickSpread(odds?.homeTeamOdds?.spread, odds?.homeTeamOdds?.current?.spread, odds?.homeTeamOdds?.line, odds?.homeTeamOdds?.handicap, odds?.homeSpread, parsed.homeSpread);
  const awaySpreadOdds = pickAmericanOdds(odds?.awayTeamOdds?.spreadOdds, odds?.awayTeamOdds?.current?.spreadOdds, odds?.awayTeamOdds?.lineOdds, odds?.awayTeamOdds?.spreadPrice, odds?.awaySpreadOdds);
  const homeSpreadOdds = pickAmericanOdds(odds?.homeTeamOdds?.spreadOdds, odds?.homeTeamOdds?.current?.spreadOdds, odds?.homeTeamOdds?.lineOdds, odds?.homeTeamOdds?.spreadPrice, odds?.homeSpreadOdds);
  if (!awayMoneyLine && !homeMoneyLine && !overUnder && !awaySpread && !homeSpread && !awaySpreadOdds && !homeSpreadOdds && !details) return null;
  return { awayMoneyLine, homeMoneyLine, overUnder, overOdds, underOdds, awaySpread, homeSpread, awaySpreadOdds, homeSpreadOdds, details };
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

    const events = await Promise.all((data?.events || []).map(async (ev: any) => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");

      // v19 fix: ESPN's scoreboard payload sometimes returns competitor.team.logo
      // as a singular URL string and sometimes as a logos[] array. v18 only
      // checked the array path which is why logos disappeared on the league
      // view game cards. Fall through both.
      const seriesInfo = extractSeriesInfo(ev, comp);
      const hasPlayoffSeries = ["nba", "nhl", "mlb"].includes(league);
      const isPlayoff = ev?.season?.type === 3 || comp?.season?.type === 3 || (hasPlayoffSeries && (!!seriesInfo.summary || !!seriesInfo.seriesGame));
      const derivedSeries = deriveSeriesRecords(seriesInfo.summary, away, home);
      const displaySeriesGame = seriesInfo.seriesGame || fallbackSeriesGame(ev, comp);
      const defaultSeriesRecord = isPlayoff && seriesGameNumber(displaySeriesGame) === 1 ? "0-0" : null;

      const formatTeam = (c: any) => {
        if (!c) return null;
        const seriesRecord = isPlayoff
          ? (
              seriesInfo.recordById.get(String(c.team?.id || c.id || "")) ||
              (c.homeAway === "away" ? derivedSeries.away : derivedSeries.home) ||
              pickSeriesRecord(c) ||
              defaultSeriesRecord
            )
          : null;
        return {
          id: c.id,
          homeAway: c.homeAway,
          name: c.team?.displayName,
          abbr: c.team?.abbreviation,
          logo: c.team?.logo || c.team?.logos?.[0]?.href || null,
          score: c.score,
          record: pickRecord(c),
          seriesRecord,
          winner: c.winner,
        };
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
        odds: extractOdds(comp),
        situation: normalizedSituation,
        isPlayoff,
        seriesSummary: seriesInfo.summary,
        seriesGame: displaySeriesGame,
        pitchers: league === "mlb" ? (extractPitchingMatchup(comp, away, home) || await fetchMlbSummaryPitchers(ev.id, away, home) || "TBD vs TBD") : null,
        note: comp?.notes?.[0]?.headline || comp?.notes?.[0]?.text || ev?.note || null,
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      };
    }));
    const oddsApiOdds = await getOddsApiOddsForGames(league, date || null, events);
    const enrichedEvents = events.map((event: any) => ({
      ...event,
      odds: mergeOdds(event.odds, oddsApiOdds.get(String(event.id))),
    }));

    return NextResponse.json({ league, date, events: enrichedEvents }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed" },
      { status: 500 }
    );
  }
}
