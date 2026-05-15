import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 15;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

function collectStrings(input: any, out = new Set<string>(), depth = 0) {
  if (!input || depth > 6 || out.size > 200) return out;
  if (typeof input === "string") {
    const s = input.trim();
    if (s) out.add(s);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      if (["summary", "description", "headline", "text", "shortDetail", "detail", "note", "notes", "name"].includes(key) || typeof value === "string" || Array.isArray(value) || typeof value === "object") {
        collectStrings(value, out, depth + 1);
      }
    }
  }
  return out;
}

function parseGameNumber(strings: string[]): string | null {
  for (const s of strings) {
    const m = s.match(/\bGame\s+(\d+)\b/i);
    if (m) return `Game ${m[1]}`;
  }
  return null;
}

function buildRecordString(wins: number, losses: number) {
  return `${wins}-${losses}`;
}

function validSeriesRecord(record: any): string | null {
  const text = String(record || "").trim();
  const m = text.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  if (m[1] === "0" && m[2] === "0") return null;
  return `${Number(m[1])}-${Number(m[2])}`;
}

function teamNameTokens(team: any): string[] {
  return [
    team?.team?.displayName,
    team?.team?.shortDisplayName,
    team?.team?.name,
    team?.team?.abbreviation,
    team?.displayName,
    team?.shortDisplayName,
    team?.name,
    team?.abbreviation,
  ].filter(Boolean).map((v: any) => String(v).toLowerCase());
}

function nameMatchesTeam(candidate: string, names: string[]) {
  const clean = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return names.some((n) => {
    const team = n.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    return !!team && (clean.includes(team) || team.includes(clean));
  });
}

function parseSeriesFromString(strings: string[], home: any, away: any) {
  const homeNames = teamNameTokens(home);
  const awayNames = teamNameTokens(away);

  for (const raw of strings) {
    const s = raw.toLowerCase();
    const tied = s.match(/series\s+tied\s+(\d+)\s*[-–]\s*(\d+)/i);
    if (tied) {
      return { homeSeriesRecord: `${tied[1]}-${tied[2]}`, awaySeriesRecord: `${tied[2]}-${tied[1]}` };
    }
    const leads =
      s.match(/(.+?)\s+(?:leads|lead|wins|win|won|takes|take)\s+(?:the\s+)?series\s+(\d+)\s*[-–]\s*(\d+)/i) ||
      s.match(/(.+?)\s+(?:leads|lead|wins|win|won|takes|take)\s+(\d+)\s*[-–]\s*(\d+)/i);
    if (leads) {
      const leader = leads[1].trim();
      const w = Number(leads[2]);
      const l = Number(leads[3]);
      const leaderIsHome = nameMatchesTeam(leader, homeNames);
      const leaderIsAway = nameMatchesTeam(leader, awayNames);
      if (leaderIsHome || leaderIsAway) {
        return leaderIsHome
          ? { homeSeriesRecord: buildRecordString(w, l), awaySeriesRecord: buildRecordString(l, w) }
          : { awaySeriesRecord: buildRecordString(w, l), homeSeriesRecord: buildRecordString(l, w) };
      }
    }
  }
  return { homeSeriesRecord: null, awaySeriesRecord: null };
}

// Series records ("2-1", "tied 1-1", etc.) are only meaningful in playoff
// series. ESPN's `comp.series` ALSO carries data during MLB regular-season
// 3-game sets (e.g. "Yankees lead series 2-1") — which is NOT what we want
// to show as a season record under the team name. Same idea for spring
// training. So we only surface series info for the three leagues that
// actually have multi-game playoff series, AND only when the game is a
// postseason game.
//
// NFL is excluded because every NFL playoff game is single-elimination —
// a "1-0" record after a divisional win is just confusing.
const SERIES_LEAGUES = new Set(["mlb", "nba", "nhl"]);

function isPostseasonGame(data: any, comp: any): boolean {
  // ESPN encodes season type as 1=preseason, 2=regular season, 3=postseason.
  // It can land in several places depending on which endpoint shape ESPN
  // returns, so check all the usual spots.
  const candidates: any[] = [
    data?.header?.season?.type,
    comp?.season?.type,
    data?.season?.type,
    comp?.seasonType?.id,
    comp?.seasonType,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === "object") {
      if (Number((v as any).type) === 3 || Number((v as any).id) === 3) return true;
      continue;
    }
    if (Number(v) === 3) return true;
  }
  // Backup signal: ESPN sometimes labels playoff games with a series "type"
  // string. We accept any of the obvious playoff vocabulary.
  const seriesType = String(comp?.series?.type || data?.series?.type || "").toLowerCase();
  if (/playoff|championship|wild ?card|division series|conference|finals|nlds|alds|nlcs|alcs|world series|stanley|elimination/.test(seriesType)) {
    return true;
  }
  return false;
}

function extractSeriesInfo(data: any, comp: any, home: any, away: any, league: string) {
  // Bail early if this league doesn't have playoff series, or if this game
  // isn't a postseason game. This is what stops MLB regular-season 3-game
  // sets from showing a "series record" under each team.
  if (!SERIES_LEAGUES.has(league) || !isPostseasonGame(data, comp)) {
    return { summary: null, seriesGame: null, homeSeriesRecord: null, awaySeriesRecord: null };
  }

  const strings = Array.from(collectStrings({ dataSeries: data?.series, compSeries: comp?.series, notes: comp?.notes, header: data?.header, status: comp?.status }));
  let seriesGame = comp?.status?.seriesGame != null ? `Game ${comp.status.seriesGame}` : parseGameNumber(strings);
  let homeSeriesRecord: string | null = null;
  let awaySeriesRecord: string | null = null;

  const parsedFromText = parseSeriesFromString(strings, home, away);
  homeSeriesRecord = parsedFromText.homeSeriesRecord;
  awaySeriesRecord = parsedFromText.awaySeriesRecord;

  const competitors = comp?.series?.competitors || data?.series?.competitors || [];
  if (Array.isArray(competitors) && competitors.length) {
    const homeIds = [home?.id, home?.team?.id, home?.teamId].filter(Boolean).map(String);
    const awayIds = [away?.id, away?.team?.id, away?.teamId].filter(Boolean).map(String);
    for (const c of competitors) {
      const id = String(c?.id || c?.competitor?.id || c?.team?.id || "");
      const wins = c?.wins ?? c?.competitor?.wins;
      const losses = c?.losses ?? c?.competitor?.losses;
      const summary = c?.summary || c?.record || c?.displayValue;
      const record = validSeriesRecord(summary || (wins != null && losses != null ? `${wins}-${losses}` : null));
      if (!record) continue;
      if (id && homeIds.includes(id) && !homeSeriesRecord) homeSeriesRecord = String(record);
      if (id && awayIds.includes(id) && !awaySeriesRecord) awaySeriesRecord = String(record);
    }
  }

  if ((!homeSeriesRecord || !awaySeriesRecord) && comp?.series?.summary) {
    const parsed = parseSeriesFromString([String(comp.series.summary)], home, away);
    homeSeriesRecord = homeSeriesRecord || parsed.homeSeriesRecord;
    awaySeriesRecord = awaySeriesRecord || parsed.awaySeriesRecord;
  }
  if ((!homeSeriesRecord || !awaySeriesRecord) && strings.length) {
    const parsed = parseSeriesFromString(strings, home, away);
    homeSeriesRecord = homeSeriesRecord || parsed.homeSeriesRecord;
    awaySeriesRecord = awaySeriesRecord || parsed.awaySeriesRecord;
  }

  const summary = comp?.series?.summary || comp?.series?.description || strings.find((s) => /series|game\s+\d+/i.test(s)) || null;

  if (!seriesGame && summary) seriesGame = parseGameNumber([summary]);

  return { summary, seriesGame, homeSeriesRecord, awaySeriesRecord };
}

function formatAmericanOdds(value: any): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "object" ? (value?.american || value?.displayValue || value?.value) : value;
  const num = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num === 0) return null;
  return num > 0 ? `+${Math.round(num)}` : `${Math.round(num)}`;
}

function formatOverUnder(value: any): string | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "object" ? (value?.displayValue || value?.value) : value;
  const num = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, "");
}

function extractOdds(comp: any) {
  const odds = Array.isArray(comp?.odds) ? comp.odds[0] : comp?.odds;
  if (!odds) return null;
  const awayMoneyLine = formatAmericanOdds(
    odds?.awayTeamOdds?.moneyLine ??
    odds?.awayTeamOdds?.moneyline ??
    odds?.awayTeamOdds?.current?.moneyLine ??
    odds?.awayMoneyLine ??
    odds?.awayMoneyline
  );
  const homeMoneyLine = formatAmericanOdds(
    odds?.homeTeamOdds?.moneyLine ??
    odds?.homeTeamOdds?.moneyline ??
    odds?.homeTeamOdds?.current?.moneyLine ??
    odds?.homeMoneyLine ??
    odds?.homeMoneyline
  );
  const overUnder = formatOverUnder(odds?.overUnder ?? odds?.total ?? odds?.oU);
  if (!awayMoneyLine && !homeMoneyLine && !overUnder) return null;
  return { awayMoneyLine, homeMoneyLine, overUnder };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event");
  let league = searchParams.get("league");
  const teamKey = searchParams.get("team");

  if (!league && teamKey) {
    const parsed = parseTeamKey(teamKey);
    if (parsed) league = parsed.league;
  }

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  try {
    const data = await getGameSummary(league, eventId);

    const header = data?.header;
    const comp = header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");
    const seriesInfo = extractSeriesInfo(data, comp, home, away, league);

    const plays = (data?.plays || []).slice().reverse().slice(0, 50).map((p: any) => ({
      id: p.id,
      text: p.text,
      period: p.period?.number,
      clock: p.clock?.displayValue,
      type: p.type?.text,
      scoringPlay: p.scoringPlay,
      awayScore: p.awayScore,
      homeScore: p.homeScore,
    }));

    const formatTeam = (c: any, side: "home" | "away") => c && {
      id: c.id,
      name: c.team?.displayName,
      abbr: c.team?.abbreviation,
      logo: c.team?.logos?.[0]?.href,
      score: c.score,
      record: c.record?.[0]?.summary || c.records?.[0]?.summary,
      seriesRecord: side === "home" ? seriesInfo.homeSeriesRecord : seriesInfo.awaySeriesRecord,
      winner: c.winner,
    };

    const result = {
      eventId,
      league,
      status: {
        state: comp?.status?.type?.state,
        completed: comp?.status?.type?.completed,
        description: comp?.status?.type?.description,
        detail: comp?.status?.type?.shortDetail,
        statusName: comp?.status?.type?.name || null,
        seriesSummary: seriesInfo.summary,
        seriesGame: seriesInfo.seriesGame,
        period: comp?.status?.period,
        clock: comp?.status?.displayClock,
      },
      home: formatTeam(home, "home"),
      away: formatTeam(away, "away"),
      plays,
      situation: data?.situation || null,
      odds: extractOdds(comp),
      venue: comp?.venue?.fullName || null,
      broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      date: header?.competitions?.[0]?.date,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
