import { NextRequest, NextResponse } from "next/server";
import { getTeamPage } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

export const revalidate = 60;

type Stat = {
  name: string;
  displayName: string;
  value: number;
  displayValue: string;
  category?: string;
};

const TEAM_SUMMARY_WHITELIST: Record<string, string[]> = {
  mlb: [
    "runspergame", "runsallowedpergame", "runsscored", "runsallowed",
    "rundifferential", "homerecord", "awayrecord", "vsleftrecord", "vsrightrecord",
    "onerunwins", "extrainnings",
  ],
  nfl: [
    "pointspergame", "pointsallowedpergame", "totalyardspergame",
    "yardsallowedpergame", "passingyardspergame", "rushingyardspergame",
    "turnoverdifferential", "thirddownpct", "redzonepct",
    "homerecord", "awayrecord", "divisionrecord",
  ],
  nba: [
    "avgpoints", "avgpointsagainst", "pointspergame", "pointsallowedpergame",
    "fieldgoalpct", "threepointpct", "rebounds", "assists",
    "homerecord", "awayrecord", "divisionrecord", "conferencerecord",
  ],
  nhl: [
    "goalsforpergame", "goalsagainstpergame", "powerplaypct", "penaltykillpct",
    "shotsforpergame", "shotsagainstpergame", "faceoffwinpct",
    "homerecord", "awayrecord", "divisionrecord",
  ],
};

function extractStats(t: any, league: string): Stat[] {
  const all: Stat[] = [];
  const seen = new Set<string>();

  const push = (s: any, category?: string) => {
    if (!s) return;
    const name = s.name || s.shortDisplayName || s.displayName;
    const displayName = s.displayName || s.shortDisplayName || s.name;
    const displayValue = s.displayValue ?? (s.value != null ? String(s.value) : null);
    if (!name || !displayName || displayValue == null || displayValue === "") return;
    const key = String(name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    all.push({
      name,
      displayName,
      value: typeof s.value === "number" ? s.value : Number(s.value) || 0,
      displayValue,
      category,
    });
  };

  if (Array.isArray(t?.statistics)) t.statistics.forEach((s: any) => push(s));
  if (Array.isArray(t?.stats)) t.stats.forEach((s: any) => push(s));

  const cats = t?.statistics?.splits?.categories;
  if (Array.isArray(cats)) {
    cats.forEach((cat: any) => {
      const catName = cat?.displayName || cat?.name;
      if (Array.isArray(cat?.stats)) cat.stats.forEach((s: any) => push(s, catName));
    });
  }

  const items = t?.record?.items;
  if (Array.isArray(items)) {
    items.forEach((item: any) => {
      const recordName = item?.description || item?.type || "Record";
      if (Array.isArray(item?.stats)) item.stats.forEach((s: any) => push(s, recordName));
    });
  }

  const whitelist = TEAM_SUMMARY_WHITELIST[league] || [];
  if (whitelist.length === 0) return all;

  const wlSet = new Set(whitelist.map((s) => s.toLowerCase()));
  const filtered = all.filter((s) => wlSet.has(s.name.toLowerCase()));

  filtered.sort((a, b) => {
    const ai = whitelist.indexOf(a.name.toLowerCase());
    const bi = whitelist.indexOf(b.name.toLowerCase());
    return ai - bi;
  });

  return filtered.length > 0 ? filtered : all;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  if (!teamKey || !TEAMS[teamKey]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  const team = TEAMS[teamKey];
  try {
    const data = await getTeamPage(team.league, team.abbr, ["stats"]);
    const t = data?.team;

    const stats = extractStats(t, team.league);

    const result = {
      id: t?.id,
      name: t?.displayName,
      abbreviation: t?.abbreviation,
      logo: t?.logos?.[0]?.href,
      colors: { primary: t?.color, alternate: t?.alternateColor },
      record: t?.record?.items?.[0]?.summary || null,
      standingSummary: t?.standingSummary || null,
      stats,
      nextEvent: t?.nextEvent?.[0]
        ? {
            id: t.nextEvent[0].id,
            date: t.nextEvent[0].date,
            name: t.nextEvent[0].name,
            shortName: t.nextEvent[0].shortName,
            status: t.nextEvent[0].status?.type?.description,
          }
        : null,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
