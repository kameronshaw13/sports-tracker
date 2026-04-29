import { NextRequest, NextResponse } from "next/server";
import { getTeamRoster } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getTeamRoster(team.league, team.abbr);

    let athletes: any[] = [];
    if (Array.isArray(data?.athletes)) {
      for (const group of data.athletes) {
        if (Array.isArray(group?.items)) {
          athletes.push(...group.items.map((a: any) => ({ ...a, _groupLabel: group.position || group.label || null })));
        }
      }
    }

    const players = athletes.map((a: any) => ({
      id: a.id,
      name: a.fullName || a.displayName,
      jersey: a.jersey,
      position: a.position?.abbreviation || a._groupLabel || null,
      headshot: a.headshot?.href || null,
      age: a.age,
      height: a.displayHeight,
      weight: a.displayWeight,
      experience: a.experience?.years,
    })).filter((p: any) => p.name);

    return NextResponse.json({ team: team.name, players });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
