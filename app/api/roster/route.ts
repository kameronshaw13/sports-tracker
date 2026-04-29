import { NextRequest, NextResponse } from "next/server";
import { getTeamRoster, getTeamPage } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 3600;

// Roster JSON shape varies by sport. We handle all known variants:
//
// NFL/MLB: data.athletes is an array of position groups, each with .items[]
//   [{ position: "offense", items: [...] }, { position: "defense", items: [...] }]
//
// NBA: data.athletes is sometimes a flat array of athletes directly
//   [{ id, fullName, position: { abbreviation }, ... }]
//
// NHL: data.athletes can be position groups OR flat
//
// Fallback: data.team.athletes (from ?enable=roster)
function parseAthletes(data: any): any[] {
  if (!data) return [];

  // Source 1: top-level athletes array
  const top = data?.athletes;
  if (Array.isArray(top)) {
    // Format A: array of position groups with .items
    if (top.length > 0 && Array.isArray(top[0]?.items)) {
      const out: any[] = [];
      for (const group of top) {
        if (Array.isArray(group?.items)) {
          out.push(
            ...group.items.map((a: any) => ({
              ...a,
              _groupLabel: group.position || group.label || null,
            }))
          );
        }
      }
      return out;
    }
    // Format B: flat array of athletes
    if (top.length > 0 && (top[0]?.fullName || top[0]?.displayName || top[0]?.id)) {
      return top;
    }
  }

  // Source 2: data.team.athletes (when fetched via ?enable=roster)
  const teamAthletes = data?.team?.athletes;
  if (Array.isArray(teamAthletes)) {
    if (teamAthletes.length > 0 && Array.isArray(teamAthletes[0]?.items)) {
      const out: any[] = [];
      for (const group of teamAthletes) {
        if (Array.isArray(group?.items)) {
          out.push(...group.items.map((a: any) => ({ ...a, _groupLabel: group.position || group.label || null })));
        }
      }
      return out;
    }
    return teamAthletes;
  }

  return [];
}

function normalizePlayer(a: any) {
  return {
    id: a.id,
    name: a.fullName || a.displayName || a.shortName,
    jersey: a.jersey,
    position: a.position?.abbreviation || a.position?.name || a._groupLabel || null,
    headshot: a.headshot?.href || null,
    age: a.age,
    height: a.displayHeight,
    weight: a.displayWeight,
    experience: a.experience?.years,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];

  // Try the dedicated roster endpoint first
  let players: any[] = [];
  try {
    const data = await getTeamRoster(team.league, team.abbr);
    players = parseAthletes(data).map(normalizePlayer).filter((p) => p.name);
  } catch (e) {
    // ignore, will try fallback
  }

  // Fallback: team page with enable=roster
  if (players.length === 0) {
    try {
      const data = await getTeamPage(team.league, team.abbr, ["roster"]);
      players = parseAthletes(data).map(normalizePlayer).filter((p) => p.name);
    } catch (e) {
      // also failed
    }
  }

  if (players.length === 0) {
    return NextResponse.json({ team: team.name, players: [], warning: "Roster data not available from ESPN for this team" });
  }

  return NextResponse.json({ team: team.name, players });
}
