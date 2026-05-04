import { NextRequest, NextResponse } from "next/server";
import { League, VALID_LEAGUES } from "@/lib/teams";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SPORT_PATH: Record<League, string> = {
  mlb: "baseball/mlb",
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  cfb: "football/college-football",
  cbb: "basketball/mens-college-basketball",
};

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 300 }, headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return res.json();
}

function stat(entry: any, names: string[], fallback = "—") {
  const stats = entry?.stats || entry?.statistics || [];
  const found = Array.isArray(stats)
    ? stats.find((s: any) => names.includes(String(s?.name || s?.abbreviation || s?.displayName || s?.shortDisplayName || "").toLowerCase()))
    : null;
  return found?.displayValue ?? found?.value ?? fallback;
}

function teamInfo(entry: any) {
  const team = entry?.team || entry?.competitor?.team || entry?.competitor || entry;
  return {
    id: team?.id || entry?.id,
    name: team?.displayName || team?.name || entry?.displayName || entry?.name,
    abbr: team?.abbreviation || entry?.abbreviation,
    logo: team?.logos?.[0]?.href || team?.logo,
  };
}

function rowFromEntry(entry: any) {
  const t = teamInfo(entry);
  if (!t.name && !t.abbr) return null;
  return {
    id: t.id,
    name: t.name || t.abbr,
    abbr: t.abbr || t.name,
    logo: t.logo || null,
    wins: stat(entry, ["wins", "w"], "0"),
    losses: stat(entry, ["losses", "l"], "0"),
    ties: stat(entry, ["ties", "t"], ""),
    pct: stat(entry, ["winpercent", "winpct", "pct", "win percentage"], "—"),
    gb: stat(entry, ["gamesbehind", "games back", "gb", "gamesbehinddivision", "divisiongamesbehind"], "—"),
    streak: stat(entry, ["streak"], "—"),
  };
}

function extractEntries(node: any): any[] {
  const entries = node?.standings?.entries || node?.entries || node?.items || [];
  return Array.isArray(entries) ? entries : [];
}

function labelForNode(node: any, fallback: string) {
  return node?.name || node?.displayName || node?.shortName || node?.abbreviation || fallback;
}

function walk(node: any, sections: any[], path: string[] = []) {
  if (!node) return;
  const entries = extractEntries(node);
  const rows = entries.map(rowFromEntry).filter(Boolean);
  if (rows.length) {
    sections.push({ label: labelForNode(node, path[path.length - 1] || "Standings"), rows });
  }
  const children = node?.children || node?.groups || node?.divisions || node?.conferences || [];
  if (Array.isArray(children)) {
    for (const child of children) walk(child, sections, [...path, labelForNode(child, "Group")]);
  }
}

function dedupeSections(sections: any[]) {
  const seen = new Set<string>();
  return sections.filter((s) => {
    const key = `${s.label}:${s.rows.map((r: any) => r.id || r.abbr).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league") as League | null;
  if (!league || !VALID_LEAGUES.includes(league)) return NextResponse.json({ error: "Invalid league" }, { status: 400 });

  try {
    const group = league === "cfb" ? "?groups=80" : league === "cbb" ? "?groups=50" : "";
    const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[league]}/standings${group}`;
    const data = await fetchJson(url);
    const sections: any[] = [];
    walk(data, sections, [league.toUpperCase()]);

    // Some ESPN shapes have `children` under the first object only.
    if (!sections.length && Array.isArray(data?.children)) {
      for (const child of data.children) walk(child, sections, []);
    }

    return NextResponse.json({ league, sections: dedupeSections(sections) }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" } });
  } catch (err: any) {
    return NextResponse.json({ league, sections: [], error: err.message || "Standings unavailable" }, { status: 200 });
  }
}
