import { NextRequest, NextResponse } from "next/server";
import { getTeamSchedule } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  const parsed = parseTeamKey(teamKey);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid team key (expected format: league-abbr, e.g. mlb-bal)" },
      { status: 400 }
    );
  }

  try {
    const data = await getTeamSchedule(parsed.league, parsed.abbr);
    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      // Match "us" by abbreviation rather than numeric ID — works for any team
      const us = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() === parsed.abbr.toLowerCase()
      );
      const them = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() !== parsed.abbr.toLowerCase()
      );
      const status = ev.status || comp?.status;
      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        weekText: ev.week?.text || ev.seasonType?.name || null,
        playoff: ev._isPlayoff || ev.seasonType?.id === "3" || false,
        status: {
          state: status?.type?.state,
          completed: status?.type?.completed,
          description: status?.type?.description,
          detail: status?.type?.shortDetail,
          // v18: canonical ESPN status name. Used by Schedule.tsx to detect
          // STATUS_POSTPONED / STATUS_CANCELED / STATUS_SUSPENDED so the row
          // renders "Postponed" instead of an erroneous "0-0 L".
          statusName: status?.type?.name || null,
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

    return NextResponse.json({ team: parsed.abbr.toUpperCase(), events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
