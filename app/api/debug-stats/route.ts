import { NextRequest, NextResponse } from "next/server";
import { getTeamPage } from "@/lib/espn";
import { TEAMS } from "@/lib/teams";

// Throwaway debug endpoint — returns the raw ESPN team payload + a flat
// extracted list of every stat we can find, with the path it came from.
// Used by /debug-stats to let the user pick which stats to keep.
export const revalidate = 60;

type DebugStat = {
  source: string;          // which path in the ESPN response this came from
  name: string;            // machine name (e.g. "battingAvg")
  displayName: string;     // human label (e.g. "Batting Avg")
  shortDisplayName?: string;
  description?: string;
  value?: number;
  displayValue: string;
  rank?: number;
  category?: string;       // for shape B (categorized) — which category
};

function collectStats(t: any): DebugStat[] {
  const out: DebugStat[] = [];

  const make = (s: any, source: string, category?: string): DebugStat | null => {
    if (!s) return null;
    const name = s.name || s.shortDisplayName || s.displayName;
    const displayName = s.displayName || s.shortDisplayName || s.name;
    const displayValue = s.displayValue ?? (s.value != null ? String(s.value) : null);
    if (!name || !displayName || displayValue == null || displayValue === "") return null;
    return {
      source,
      name,
      displayName,
      shortDisplayName: s.shortDisplayName,
      description: s.description,
      value: typeof s.value === "number" ? s.value : undefined,
      displayValue,
      rank: s.rank,
      category,
    };
  };

  // Shape A: flat array on team
  if (Array.isArray(t?.statistics)) {
    t.statistics.forEach((s: any) => {
      const x = make(s, "team.statistics[]");
      if (x) out.push(x);
    });
  }
  if (Array.isArray(t?.stats)) {
    t.stats.forEach((s: any) => {
      const x = make(s, "team.stats[]");
      if (x) out.push(x);
    });
  }

  // Shape B: categorized splits
  const cats = t?.statistics?.splits?.categories;
  if (Array.isArray(cats)) {
    cats.forEach((cat: any) => {
      const catName = cat?.displayName || cat?.name || "uncategorized";
      if (Array.isArray(cat?.stats)) {
        cat.stats.forEach((s: any) => {
          const x = make(s, `team.statistics.splits.categories[${catName}].stats[]`, catName);
          if (x) out.push(x);
        });
      }
    });
  }

  // Shape C: per-record stats
  const items = t?.record?.items;
  if (Array.isArray(items)) {
    items.forEach((item: any, idx: number) => {
      const recordName = item?.description || item?.type || `record[${idx}]`;
      if (Array.isArray(item?.stats)) {
        item.stats.forEach((s: any) => {
          const x = make(s, `team.record.items[${recordName}].stats[]`, recordName);
          if (x) out.push(x);
        });
      }
    });
  }

  return out;
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

    const flat = collectStats(t);

    // Group by source so the UI can render sections
    const grouped: Record<string, DebugStat[]> = {};
    flat.forEach((s) => {
      if (!grouped[s.source]) grouped[s.source] = [];
      grouped[s.source].push(s);
    });

    return NextResponse.json({
      teamKey,
      teamName: team.name,
      league: team.league,
      record: t?.record?.items?.[0]?.summary || null,
      standingSummary: t?.standingSummary || null,
      totalStats: flat.length,
      groupedBySource: grouped,
      flat,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
