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

function parseSeriesFromString(strings: string[], home: any, away: any) {
  const homeNames = [home?.team?.displayName, home?.team?.shortDisplayName, home?.team?.name, home?.team?.abbreviation].filter(Boolean).map((v: any) => String(v).toLowerCase());
  const awayNames = [away?.team?.displayName, away?.team?.shortDisplayName, away?.team?.name, away?.team?.abbreviation].filter(Boolean).map((v: any) => String(v).toLowerCase());

  for (const raw of strings) {
    const s = raw.toLowerCase();
    const tied = s.match(/series\s+tied\s+(\d+)\s*[-–]\s*(\d+)/i);
    if (tied) {
      return { homeSeriesRecord: `${tied[1]}-${tied[2]}`, awaySeriesRecord: `${tied[2]}-${tied[1]}` };
    }
    const leads = s.match(/(.+?)\s+leads\s+(?:the\s+)?series\s+(\d+)\s*[-–]\s*(\d+)/i) || s.match(/(.+?)\s+lead[s]?\s+(\d+)\s*[-–]\s*(\d+)/i);
    if (leads) {
      const leader = leads[1].trim();
      const w = Number(leads[2]);
      const l = Number(leads[3]);
      const leaderIsHome = homeNames.some((n) => leader.includes(n));
      const leaderIsAway = awayNames.some((n) => leader.includes(n));
      if (leaderIsHome || leaderIsAway) {
        return leaderIsHome
          ? { homeSeriesRecord: buildRecordString(w, l), awaySeriesRecord: buildRecordString(l, w) }
          : { awaySeriesRecord: buildRecordString(w, l), homeSeriesRecord: buildRecordString(l, w) };
      }
    }
  }
  return { homeSeriesRecord: null, awaySeriesRecord: null };
}

function extractSeriesInfo(data: any, comp: any, home: any, away: any) {
  const strings = Array.from(collectStrings({ dataSeries: data?.series, compSeries: comp?.series, notes: comp?.notes, header: data?.header, status: comp?.status }));
  let seriesGame = comp?.status?.seriesGame != null ? `Game ${comp.status.seriesGame}` : parseGameNumber(strings);
  let homeSeriesRecord: string | null = null;
  let awaySeriesRecord: string | null = null;

  const competitors = comp?.series?.competitors || data?.series?.competitors || [];
  if (Array.isArray(competitors) && competitors.length) {
    for (const c of competitors) {
      const id = String(c?.id || c?.competitor?.id || c?.team?.id || "");
      const wins = c?.wins ?? c?.competitor?.wins;
      const losses = c?.losses ?? c?.competitor?.losses;
      const summary = c?.summary || c?.record || c?.displayValue;
      const record = summary || (wins != null && losses != null ? `${wins}-${losses}` : null);
      if (!record) continue;
      if (id && id === String(home?.id)) homeSeriesRecord = String(record);
      if (id && id === String(away?.id)) awaySeriesRecord = String(record);
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
    const seriesInfo = extractSeriesInfo(data, comp, home, away);

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
      venue: comp?.venue?.fullName || null,
      broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      date: header?.competitions?.[0]?.date,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
