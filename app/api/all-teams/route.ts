// Fetches the full team catalog from ESPN for all 4 leagues in parallel.
// Used by ManageTeams to power the "Browse all teams" picker.
// Cached 1 hour — rosters/colors don't change mid-season.

import { NextResponse } from "next/server";
import {
  TeamConfig,
  League,
  VALID_LEAGUES,
  makeKey,
  ensureHash,
  pickTextColor,
  getSport,
} from "@/lib/teams";

export const revalidate = 3600;

const SPORT_PATH: Record<League, string> = {
  mlb: "baseball/mlb",
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
};

async function fetchLeagueTeams(league: League): Promise<TeamConfig[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[league]}/teams?limit=500`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${league}`);
  const data = await res.json();
  const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  return items
    .map((entry) => entry?.team)
    .filter((t) => t?.abbreviation)
    .map((t) => {
      const primary = ensureHash(t.color);
      return {
        key: makeKey(league, t.abbreviation),
        name: t.displayName || t.name || t.abbreviation,
        short: t.shortDisplayName || t.nickname || t.abbreviation,
        abbr: String(t.abbreviation).toLowerCase(),
        league,
        sport: getSport(league),
        primary,
        secondary: ensureHash(t.alternateColor),
        textOnPrimary: pickTextColor(primary),
      } as TeamConfig;
    });
}

export async function GET() {
  const settled = await Promise.allSettled(VALID_LEAGUES.map(fetchLeagueTeams));
  const teams: TeamConfig[] = [];
  settled.forEach((r) => {
    if (r.status === "fulfilled") teams.push(...r.value);
  });
  teams.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ teams });
}
