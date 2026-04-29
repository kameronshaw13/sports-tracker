import { NextRequest, NextResponse } from "next/server";
import { getTeamRoster, getAthleteStats } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";
import { relevantStatKeys } from "@/lib/playerColumns";

export const revalidate = 3600;

type Stat = { value: number | null; displayValue: string };

type Player = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  headshot?: string;
  hasStats: boolean;
  // Stats are now keyed by `${category}.${name}` to avoid cross-category
  // collisions. ESPN reuses names like "interceptions" across passing and
  // defensiveInterceptions categories with very different meanings.
  stats: Record<string, Stat>;
};

function flattenRoster(rosterData: any): any[] {
  const out: any[] = [];
  const athletes = rosterData?.athletes;
  if (!Array.isArray(athletes)) return out;
  for (const entry of athletes) {
    if (!entry) continue;
    if (Array.isArray(entry?.items)) out.push(...entry.items);
    else if (entry?.id) out.push(entry);
  }
  return out;
}

function extractAthleteStats(statsData: any, relevant: Set<string>): Record<string, Stat> {
  const out: Record<string, Stat> = {};
  if (!statsData) return out;

  const collectFrom = (categories: any[]) => {
    if (!Array.isArray(categories)) return;
    for (const cat of categories) {
      const catName = cat?.name; // ESPN's category machine name (e.g. "passing")
      if (!catName) continue;
      const list = cat?.stats || [];
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        const name = s?.name;
        if (!name) continue;
        const key = `${catName}.${name}`;
        if (!relevant.has(key)) continue;
        const value = typeof s?.value === "number" ? s.value : null;
        const displayValue =
          s?.displayValue ?? (value != null ? String(value) : "—");
        out[key] = { value, displayValue };
      }
    }
  };

  collectFrom(statsData?.splits?.categories);
  collectFrom(statsData?.categories);

  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  const relevant = relevantStatKeys(team.league);

  try {
    const rosterData = await getTeamRoster(team.league, team.abbr);
    const athletes = flattenRoster(rosterData);

    if (athletes.length === 0) {
      return NextResponse.json({
        teamKey,
        league: team.league,
        players: [],
      });
    }

    const settled = await Promise.allSettled(
      athletes.map((a: any) => getAthleteStats(team.league, String(a.id)))
    );

    const players: Player[] = athletes.map((a: any, i: number) => {
      const r = settled[i];
      const statsData = r.status === "fulfilled" ? r.value : null;
      const stats = extractAthleteStats(statsData, relevant);
      const hasStats = Object.keys(stats).length > 0;

      return {
        id: String(a.id),
        name: a.displayName || a.fullName || a.name || "",
        jersey: a.jersey,
        position: a.position?.abbreviation || a.position?.displayName,
        headshot: a.headshot?.href,
        hasStats,
        stats,
      };
    });

    return NextResponse.json({
      teamKey,
      league: team.league,
      players,
      total: players.length,
      withStats: players.filter((p) => p.hasStats).length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed", players: [] },
      { status: 500 }
    );
  }
}
