import { NextRequest, NextResponse } from "next/server";
import { getLeagueLeaders, getLeagueStatLeaders } from "@/lib/espn";

export const revalidate = 600;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

type LeaderQuery = {
  name: string;
  displayName: string;
  category: string;
  sort: string;
  stat: string;
  direction?: "asc" | "desc";
};

const QUERIES: Record<string, LeaderQuery[]> = {
  mlb: [
    { name: "homeRuns", displayName: "Home Runs", category: "batting", sort: "batting.homeRuns", stat: "homeRuns" },
    { name: "RBIs", displayName: "RBI", category: "batting", sort: "batting.RBIs", stat: "RBIs" },
    { name: "avg", displayName: "Batting Average", category: "batting", sort: "batting.avg", stat: "avg" },
    { name: "ERA", displayName: "ERA", category: "pitching", sort: "pitching.ERA", stat: "ERA", direction: "asc" },
    { name: "strikeouts", displayName: "Strikeouts", category: "pitching", sort: "pitching.strikeouts", stat: "strikeouts" },
  ],
  nfl: [
    { name: "passingYards", displayName: "Passing Yards", category: "offense:passing", sort: "passing.passingYards", stat: "passingYards" },
    { name: "passingTouchdowns", displayName: "Pass TD", category: "offense:passing", sort: "passing.passingTouchdowns", stat: "passingTouchdowns" },
    { name: "rushingYards", displayName: "Rushing Yards", category: "offense:rushing", sort: "rushing.rushingYards", stat: "rushingYards" },
    { name: "receivingYards", displayName: "Receiving Yards", category: "offense:receiving", sort: "receiving.receivingYards", stat: "receivingYards" },
    { name: "sacks", displayName: "Sacks", category: "defense", sort: "defensive.sacks", stat: "sacks" },
  ],
  cfb: [
    { name: "passingYards", displayName: "Passing Yards", category: "offense:passing", sort: "passing.passingYards", stat: "passingYards" },
    { name: "passingTouchdowns", displayName: "Pass TD", category: "offense:passing", sort: "passing.passingTouchdowns", stat: "passingTouchdowns" },
    { name: "rushingYards", displayName: "Rushing Yards", category: "offense:rushing", sort: "rushing.rushingYards", stat: "rushingYards" },
    { name: "receivingYards", displayName: "Receiving Yards", category: "offense:receiving", sort: "receiving.receivingYards", stat: "receivingYards" },
    { name: "sacks", displayName: "Sacks", category: "defense", sort: "defensive.sacks", stat: "sacks" },
  ],
  nba: [
    { name: "avgPoints", displayName: "Points", category: "offensive", sort: "offensive.avgPoints", stat: "avgPoints" },
    { name: "avgRebounds", displayName: "Rebounds", category: "general", sort: "general.avgRebounds", stat: "avgRebounds" },
    { name: "avgAssists", displayName: "Assists", category: "offensive", sort: "offensive.avgAssists", stat: "avgAssists" },
    { name: "avgSteals", displayName: "Steals", category: "defensive", sort: "defensive.avgSteals", stat: "avgSteals" },
    { name: "avgBlocks", displayName: "Blocks", category: "defensive", sort: "defensive.avgBlocks", stat: "avgBlocks" },
  ],
  cbb: [
    { name: "avgPoints", displayName: "Points", category: "offensive", sort: "offensive.avgPoints", stat: "avgPoints" },
    { name: "avgRebounds", displayName: "Rebounds", category: "general", sort: "general.avgRebounds", stat: "avgRebounds" },
    { name: "avgAssists", displayName: "Assists", category: "offensive", sort: "offensive.avgAssists", stat: "avgAssists" },
    { name: "avgSteals", displayName: "Steals", category: "defensive", sort: "defensive.avgSteals", stat: "avgSteals" },
    { name: "avgBlocks", displayName: "Blocks", category: "defensive", sort: "defensive.avgBlocks", stat: "avgBlocks" },
  ],
  nhl: [
    { name: "points", displayName: "Points", category: "skaters", sort: "offensive.points", stat: "points" },
    { name: "goals", displayName: "Goals", category: "skaters", sort: "offensive.goals", stat: "goals" },
    { name: "assists", displayName: "Assists", category: "skaters", sort: "offensive.assists", stat: "assists" },
    { name: "savePct", displayName: "Save %", category: "goalies", sort: "goalie.savePct", stat: "savePct" },
    { name: "goalsAgainstAverage", displayName: "GAA", category: "goalies", sort: "goalie.goalsAgainstAverage", stat: "goalsAgainstAverage", direction: "asc" },
  ],
};

function candidateRows(data: any): any[] {
  const candidates = [data?.athletes, data?.items, data?.leaders, data?.results];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function athleteName(row: any): string | null {
  const athlete = row?.athlete || row?.player || row;
  return athlete?.displayName || athlete?.fullName || athlete?.name || null;
}

function athleteId(row: any, idx: number): string {
  const athlete = row?.athlete || row?.player || row;
  return String(athlete?.id || row?.id || `${athleteName(row) || "leader"}-${idx}`);
}

function athleteTeam(row: any): string | null {
  const athlete = row?.athlete || row?.player || row;
  const team = row?.team || athlete?.team || athlete?.teamAbbreviation;
  if (typeof team === "string") return team;
  return team?.abbreviation || team?.shortDisplayName || team?.displayName || null;
}

function statDisplay(input: any, stat: string, depth = 0): string | null {
  if (!input || depth > 7) return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = statDisplay(item, stat, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof input !== "object") return null;
  const name = String(input?.name || input?.abbreviation || input?.shortDisplayName || "").toLowerCase();
  if (name === stat.toLowerCase()) {
    return String(input?.displayValue ?? input?.value ?? input?.rankDisplayValue ?? "—");
  }
  for (const value of Object.values(input)) {
    const found = statDisplay(value, stat, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchQuery(query: LeaderQuery, league: string) {
  try {
    const data = await getLeagueStatLeaders(league, query.category, query.sort, query.direction || "desc");
    const leaders = candidateRows(data)
      .map((row: any, idx: number) => {
        const name = athleteName(row);
        if (!name) return null;
        return {
          id: athleteId(row, idx),
          name,
          displayValue: statDisplay(row, query.stat) || String(row?.displayValue ?? row?.value ?? "—"),
          team: athleteTeam(row),
          rank: idx + 1,
        };
      })
      .filter(Boolean)
      .slice(0, 5);
    if (!leaders.length) return null;
    return { name: query.name, displayName: query.displayName, leaders };
  } catch {
    return null;
  }
}

async function fallbackLeagueLeaders(league: string) {
  try {
    const data = await getLeagueLeaders(league);
    const raw = [data?.leaders, data?.categories, data?.stats].find(Array.isArray) || [];
    return raw.slice(0, 5).map((category: any) => {
      const entries = [category?.leaders, category?.athletes, category?.entries, category?.items].find(Array.isArray) || [];
      return {
        name: category?.name || category?.displayName || "leaders",
        displayName: category?.displayName || category?.shortDisplayName || category?.name || "Leaders",
        leaders: entries.slice(0, 5).map((entry: any, idx: number) => ({
          id: athleteId(entry, idx),
          name: athleteName(entry) || "Player",
          displayValue: String(entry?.displayValue ?? entry?.value ?? "—"),
          team: athleteTeam(entry),
          rank: idx + 1,
        })),
      };
    }).filter((category: any) => category.leaders.length);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "";
  if (!VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }

  const settled = await Promise.all((QUERIES[league] || []).map((query) => fetchQuery(query, league)));
  const categories = settled.filter(Boolean);
  const fallback = categories.length ? [] : await fallbackLeagueLeaders(league);
  return NextResponse.json({ league, categories: categories.length ? categories : fallback });
}
