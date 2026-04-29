import { NextRequest, NextResponse } from "next/server";
import { getTeamPage } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getTeamPage(team.league, team.espnTeamId);
    const t = data?.team;

    // Normalize what we actually need into a small, predictable shape
    const result = {
      id: t?.id,
      name: t?.displayName,
      abbreviation: t?.abbreviation,
      logo: t?.logos?.[0]?.href,
      colors: { primary: t?.color, alternate: t?.alternateColor },
      record: t?.record?.items?.[0]?.summary || null,
      standingSummary: t?.standingSummary || null,
      nextEvent: t?.nextEvent?.[0]
        ? {
            id: t.nextEvent[0].id,
            date: t.nextEvent[0].date,
            name: t.nextEvent[0].name,
            shortName: t.nextEvent[0].shortName,
            status: t.nextEvent[0].status?.type?.description,
            competitors: t.nextEvent[0].competitions?.[0]?.competitors?.map((c: any) => ({
              id: c.id,
              homeAway: c.homeAway,
              team: { name: c.team?.displayName, abbreviation: c.team?.abbreviation, logo: c.team?.logos?.[0]?.href },
              score: c.score,
            })),
          }
        : null,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
