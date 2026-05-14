import { NextRequest, NextResponse } from "next/server";
import { getLeagueLeaders } from "@/lib/espn";

export const revalidate = 600;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

const PRIORITY: Record<string, string[]> = {
  mlb: ["battingaverage", "homeruns", "rbis", "hits", "era", "strikeouts"],
  nfl: ["passingyards", "passingtouchdowns", "rushingyards", "receivingyards", "sacks"],
  cfb: ["passingyards", "passingtouchdowns", "rushingyards", "receivingyards", "sacks"],
  nba: ["points", "rebounds", "assists", "steals", "blocks"],
  cbb: ["points", "rebounds", "assists", "steals", "blocks"],
  nhl: ["points", "goals", "assists", "savepercentage", "goalsagainstaverage"],
};

function key(value: any): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function athleteName(entry: any): string | null {
  const athlete = entry?.athlete || entry?.player || entry?.athlete?.athlete || {};
  return athlete?.displayName || athlete?.fullName || athlete?.name || entry?.displayName || entry?.name || null;
}

function athleteTeam(entry: any): string | null {
  const team = entry?.team || entry?.athlete?.team || entry?.athlete?.teamAbbreviation;
  if (typeof team === "string") return team;
  return team?.abbreviation || team?.shortDisplayName || team?.displayName || null;
}

function entryValue(entry: any): string {
  return String(entry?.displayValue ?? entry?.value ?? entry?.stat ?? "—");
}

function rawCategories(data: any): any[] {
  const candidates = [
    data?.leaders,
    data?.categories,
    data?.stats,
    data?.league?.leaders,
    data?.sports?.[0]?.leagues?.[0]?.leaders,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function categoryEntries(category: any): any[] {
  const candidates = [category?.leaders, category?.athletes, category?.entries, category?.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "";
  if (!VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }

  try {
    const data = await getLeagueLeaders(league);
    const priority = PRIORITY[league] || [];
    const categories = rawCategories(data)
      .map((category: any) => {
        const name = category?.name || category?.shortDisplayName || category?.displayName || category?.abbreviation;
        const leaders = categoryEntries(category)
          .map((entry: any, index: number) => {
            const nameText = athleteName(entry);
            if (!nameText) return null;
            return {
              id: String(entry?.athlete?.id || entry?.player?.id || `${nameText}-${index}`),
              name: nameText,
              displayValue: entryValue(entry),
              team: athleteTeam(entry),
              rank: Number(entry?.rank || index + 1),
            };
          })
          .filter(Boolean)
          .slice(0, 5);
        if (!name || leaders.length === 0) return null;
        return {
          name,
          sortKey: key(name),
          displayName: category?.displayName || category?.shortDisplayName || name,
          leaders,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const ai = priority.indexOf(a.sortKey);
        const bi = priority.indexOf(b.sortKey);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return String(a.displayName).localeCompare(String(b.displayName));
      })
      .slice(0, 5)
      .map(({ sortKey, ...category }: any) => category);

    return NextResponse.json({ league, categories });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed", categories: [] }, { status: 500 });
  }
}
