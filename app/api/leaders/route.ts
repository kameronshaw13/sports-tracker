import { NextRequest, NextResponse } from "next/server";
import { getTeamLeaders } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 600;

// Per-league mapping: which leader category names belong to which side.
// ESPN's category `name` field is the machine name we match on (lowercased).
// Anything not listed falls into "misc".
const SIDE_BY_LEAGUE: Record<string, { offense: string[]; defense: string[] }> = {
  mlb: {
    // Hitting
    offense: [
      "battingaverage", "homeruns", "rbis", "hits", "runs",
      "stolenbases", "onbasepercentage", "sluggingpercentage", "ops",
      "walks", "strikeouts", "totalbases", "doubles", "triples",
    ],
    // Pitching
    defense: [
      "era", "whip", "wins", "saves", "strikeouts_pitching",
      "pitcherstrikeouts", "inningspitched", "qualitystart",
      "earnedrunaverage", "winsaboveaverage",
    ],
  },
  nfl: {
    offense: [
      "passingyards", "passingtouchdowns", "rushingyards", "rushingtouchdowns",
      "receivingyards", "receivingtouchdowns", "receptions", "passercompletions",
      "completionpercentage", "qbrating", "yardsfromscrimmage", "totaltouchdowns",
    ],
    defense: [
      "totaltackles", "sacks", "interceptions", "passesdefended",
      "forcedfumbles", "fumblerecoveries", "defensivetouchdowns",
      "tackles", "soloTackles", "totalsacks",
    ],
  },
  nba: {
    offense: [
      "points", "pointspergame", "assists", "assistspergame",
      "fieldgoalpercentage", "threepointfieldgoalpercentage",
      "freethrowpercentage", "offensiverebounds", "offensiveboards",
    ],
    defense: [
      "rebounds", "reboundspergame", "defensiverebounds",
      "steals", "stealspergame", "blocks", "blockspergame",
    ],
  },
  nhl: {
    offense: [
      "goals", "assists", "points", "shotsongoal", "powerplaygoals",
      "shorthandedgoals", "gamewinninggoals", "shootingpercentage",
    ],
    defense: [
      "savepercentage", "goalsagainstaverage", "saves", "shutouts",
      "wins_goalie", "goaliewins", "goalieshutouts",
    ],
  },
};

type LeaderAthlete = {
  id?: string;
  name: string;
  headshot?: string;
  position?: string;
  jersey?: string;
  value: number | null;
  displayValue: string;
};

type LeaderCategory = {
  name: string;
  displayName: string;
  shortDisplayName?: string;
  side: "offense" | "defense" | "misc";
  athletes: LeaderAthlete[];
};

function classifySide(league: string, catName: string): "offense" | "defense" | "misc" {
  const map = SIDE_BY_LEAGUE[league];
  if (!map) return "misc";
  const k = (catName || "").toLowerCase();
  if (map.offense.includes(k)) return "offense";
  if (map.defense.includes(k)) return "defense";
  return "misc";
}

function extractAthlete(entry: any): LeaderAthlete | null {
  // ESPN leader entry shape: { value, displayValue, athlete: { id, displayName, headshot: { href }, position: { abbreviation }, jersey } }
  const a = entry?.athlete || {};
  const name = a?.displayName || a?.fullName || a?.name;
  if (!name) return null;
  return {
    id: a?.id,
    name,
    headshot: a?.headshot?.href,
    position: a?.position?.abbreviation || a?.position?.displayName,
    jersey: a?.jersey,
    value: typeof entry?.value === "number" ? entry.value : null,
    displayValue: entry?.displayValue ?? (entry?.value != null ? String(entry.value) : "—"),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getTeamLeaders(team.league, team.abbr);

    // ESPN response shape: data.leaders = Category[] (or sometimes nested under team.leaders)
    const rawCategories: any[] =
      data?.leaders ||
      data?.team?.leaders ||
      data?.categories ||
      [];

    const categories: LeaderCategory[] = [];

    for (const cat of rawCategories) {
      const catName = cat?.name || cat?.shortDisplayName || cat?.displayName;
      if (!catName) continue;
      const leadersArr = cat?.leaders || cat?.athletes || [];
      const athletes: LeaderAthlete[] = [];
      for (const entry of leadersArr.slice(0, 3)) {
        const a = extractAthlete(entry);
        if (a) athletes.push(a);
      }
      if (athletes.length === 0) continue;
      categories.push({
        name: catName,
        displayName: cat?.displayName || cat?.shortDisplayName || catName,
        shortDisplayName: cat?.shortDisplayName,
        side: classifySide(team.league, catName),
        athletes,
      });
    }

    return NextResponse.json({
      teamKey,
      league: team.league,
      total: categories.length,
      categories,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed", categories: [] },
      { status: 500 }
    );
  }
}
