import { NextRequest, NextResponse } from "next/server";
import { getTeamSchedule } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getTeamSchedule(team.league, team.espnTeamId);
    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const us = comp?.competitors?.find((c: any) => c.id === team.espnTeamId);
      const them = comp?.competitors?.find((c: any) => c.id !== team.espnTeamId);
      const status = ev.status || comp?.status;
      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        weekText: ev.week?.text || ev.seasonType?.name || null,
        status: {
          state: status?.type?.state, // 'pre' | 'in' | 'post'
          completed: status?.type?.completed,
          description: status?.type?.description,
          detail: status?.type?.shortDetail,
        },
        home: us?.homeAway === "home",
        opponent: {
          id: them?.id,
          name: them?.team?.displayName,
          abbr: them?.team?.abbreviation,
          logo: them?.team?.logos?.[0]?.href || them?.team?.logo,
          score: them?.score?.value ?? them?.score,
        },
        us: {
          score: us?.score?.value ?? us?.score,
          winner: us?.winner,
        },
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      };
    });

    return NextResponse.json({ team: team.name, events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
