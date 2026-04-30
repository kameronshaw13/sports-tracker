import { NextRequest, NextResponse } from "next/server";
import { getTeamPage } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 60;

// ESPN puts team stats in different shapes depending on the league + endpoint:
// - Sometimes data.team.statistics
// - Sometimes data.team.record.items[0].stats (record-flavored stats)
// - Sometimes data.team.stats (newer format)
// - Sometimes nested under data.statistics.splits.categories[].stats
//
// Previously v13 only checked `team.statistics` and `team.stats`, AND filtered
// out any stat with displayValue === "—" — but ESPN sometimes returns "0"
// formatted as the placeholder string for a real zero (e.g. losses for an
// undefeated team). The combined effect was that non-favorite teams (which
// hit slightly different ESPN shapes) returned empty stats lists.
function extractStats(team: any): { name: string; displayName: string; value: number; displayValue: string }[] {
  const out: any[] = [];
  const seen = new Set<string>();

  const push = (s: any) => {
    if (!s) return;
    const name = s.name || s.shortDisplayName;
    if (!name || seen.has(name)) return;
    const displayName = s.displayName || s.shortDisplayName || s.name;
    if (!displayName) return;
    seen.add(name);
    out.push({
      name,
      displayName,
      value: s.value ?? 0,
      displayValue: s.displayValue ?? String(s.value ?? "0"),
    });
  };

  // Source 1: team.statistics — common on most leagues
  if (Array.isArray(team?.statistics)) {
    team.statistics.forEach(push);
  }

  // Source 2: team.stats — sometimes used in newer responses
  if (Array.isArray(team?.stats)) {
    team.stats.forEach(push);
  }

  // Source 3: team.record.items[].stats — record-flavored stats are critical
  // (W/L/PCT) and live here. Always merge them in.
  const recordItems = team?.record?.items;
  if (Array.isArray(recordItems)) {
    recordItems.forEach((item: any) => {
      if (Array.isArray(item?.stats)) {
        item.stats.forEach(push);
      }
    });
  }

  // Source 4: team.statistics.splits.categories[].stats — deep-nested shape
  // some ESPN endpoints use, especially for "split" totals.
  const cats = team?.statistics?.splits?.categories;
  if (Array.isArray(cats)) {
    cats.forEach((cat: any) => {
      if (Array.isArray(cat?.stats)) {
        cat.stats.forEach(push);
      }
    });
  }

  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  const parsed = parseTeamKey(teamKey);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid team key (expected format: league-abbr, e.g. mlb-bal)" },
      { status: 400 }
    );
  }

  try {
    // Fetch with stats enabled to get the real season stats array
    const data = await getTeamPage(parsed.league, parsed.abbr, ["stats"]);
    const t = data?.team;

    const stats = extractStats(t);

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
