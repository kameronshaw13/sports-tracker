import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 15;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event");
  // Accept either a league directly OR a teamKey (for backwards compat)
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

    const formatTeam = (c: any) => c && {
      id: c.id,
      name: c.team?.displayName,
      abbr: c.team?.abbreviation,
      logo: c.team?.logos?.[0]?.href,
      score: c.score,
      record: c.record?.[0]?.summary || c.records?.[0]?.summary,
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
        period: comp?.status?.period,
        clock: comp?.status?.displayClock,
      },
      home: formatTeam(home),
      away: formatTeam(away),
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
