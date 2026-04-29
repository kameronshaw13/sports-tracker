import { NextRequest, NextResponse } from "next/server";
import { TEAMS } from "@/lib/teams";
import { getTeamRoster, getAthleteStats } from "@/lib/espn";

// Debug: returns one player's full stats payload so we can see ESPN's stat
// names per category. Picks a position-appropriate player by default.
//
// Usage:
//   /api/debug-player?team=orioles
//   /api/debug-player?team=orioles&athleteId=33861

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

function pickAthlete(league: string, flat: any[]): any {
  if (league === "mlb") {
    return (
      flat.find(
        (a) =>
          a?.position?.abbreviation &&
          !["SP", "RP", "P"].includes(a.position.abbreviation)
      ) || flat.find((a) => a?.id)
    );
  }
  if (league === "nfl") {
    const byPos = (pos: string) => flat.find((a) => a?.position?.abbreviation === pos);
    return byPos("QB") || byPos("WR") || byPos("RB") || byPos("LB") || flat.find((a) => a?.id);
  }
  if (league === "nhl") {
    return (
      flat.find((a) => a?.position?.abbreviation && a.position.abbreviation !== "G") ||
      flat.find((a) => a?.id)
    );
  }
  return flat.find((a) => a?.id);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team") || "orioles";
  const athleteIdParam = searchParams.get("athleteId");

  if (!TEAMS[teamKey]) {
    return NextResponse.json({ error: `Unknown team: ${teamKey}` }, { status: 400 });
  }

  const team = TEAMS[teamKey];

  let athleteId = athleteIdParam;
  let athleteName = "";
  let athletePosition = "";
  let rosterCount = 0;

  if (!athleteId) {
    try {
      const rosterData = await getTeamRoster(team.league, team.abbr);
      const flat = flattenRoster(rosterData);
      rosterCount = flat.length;
      const chosen = pickAthlete(team.league, flat);
      if (chosen) {
        athleteId = String(chosen.id);
        athleteName = chosen.displayName || chosen.fullName || "";
        athletePosition = chosen.position?.abbreviation || "";
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Roster fetch failed: ${e.message}` }, { status: 500 });
    }
  }

  if (!athleteId) {
    return NextResponse.json({
      error: "Could not find an athlete",
      rosterCount,
    });
  }

  const statsData = await getAthleteStats(team.league, athleteId);

  const found: any[] = [];
  const collect = (cats: any[]) => {
    if (!Array.isArray(cats)) return;
    for (const c of cats) {
      const cn = c?.name || c?.displayName;
      if (Array.isArray(c?.stats)) {
        for (const s of c.stats) {
          found.push({
            key: `${cn}.${s?.name}`, // the actual lookup key used by /api/players
            category: cn,
            name: s?.name,
            displayName: s?.displayName,
            value: s?.value,
            displayValue: s?.displayValue,
          });
        }
      }
    }
  };
  collect(statsData?.splits?.categories);
  collect(statsData?.categories);

  return NextResponse.json({
    league: team.league,
    teamKey,
    rosterCount,
    testedAthlete: { id: athleteId, name: athleteName, position: athletePosition },
    gotData: !!statsData,
    statCount: found.length,
    categoriesFound: Array.from(new Set(found.map((f) => f.category))),
    stats: found,
  });
}
