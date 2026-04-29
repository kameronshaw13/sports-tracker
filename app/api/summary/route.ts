import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 15;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");
  const eventId = searchParams.get("event");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getGameSummary(team.league, eventId);

    const header = data?.header;
    const comp = header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const us = competitors.find((c: any) => c.id === team.espnTeamId);
    const them = competitors.find((c: any) => c.id !== team.espnTeamId);

    // Plays — most recent last from ESPN. We reverse so newest is first.
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

    const result = {
      eventId,
      status: {
        state: comp?.status?.type?.state,
        completed: comp?.status?.type?.completed,
        description: comp?.status?.type?.description,
        detail: comp?.status?.type?.shortDetail,
        period: comp?.status?.period,
        clock: comp?.status?.displayClock,
      },
      home: them && them.homeAway === "home"
        ? { id: them.id, name: them.team?.displayName, abbr: them.team?.abbreviation, logo: them.team?.logos?.[0]?.href, score: them.score }
        : us
          ? { id: us.id, name: us.team?.displayName, abbr: us.team?.abbreviation, logo: us.team?.logos?.[0]?.href, score: us.score }
          : null,
      away: us && us.homeAway === "away"
        ? { id: us.id, name: us.team?.displayName, abbr: us.team?.abbreviation, logo: us.team?.logos?.[0]?.href, score: us.score }
        : them
          ? { id: them.id, name: them.team?.displayName, abbr: them.team?.abbreviation, logo: them.team?.logos?.[0]?.href, score: them.score }
          : null,
      plays,
      situation: data?.situation || null,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
