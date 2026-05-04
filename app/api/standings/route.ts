import { NextRequest, NextResponse } from "next/server";
import { League, VALID_LEAGUES, formatCollegeSchoolName } from "@/lib/teams";

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
  const wanted = names.map((n) => n.toLowerCase());
  const found = Array.isArray(stats)
    ? stats.find((s: any) => {
        const keys = [s?.name, s?.abbreviation, s?.displayName, s?.shortDisplayName, s?.description]
          .map((v) => String(v || "").toLowerCase().replace(/\s+/g, ""));
        return keys.some((k) => wanted.includes(k));
      })
    : null;
  return found?.displayValue ?? found?.value ?? fallback;
}

function firstLogo(team: any) {
  const logos = team?.logos || team?.logo;
  if (Array.isArray(logos)) return logos[0]?.href || logos[0];
  return typeof logos === "string" ? logos : null;
}

function teamInfo(entry: any, league: League) {
  const team = entry?.team || entry?.competitor?.team || entry?.competitor || entry;
  const rawName = team?.displayName || team?.name || entry?.displayName || entry?.name || team?.shortDisplayName;
  return {
    id: team?.id || entry?.id,
    name: league === "cfb" ? formatCollegeSchoolName(team?.location || rawName) : rawName,
    abbr: team?.abbreviation || entry?.abbreviation,
    logo: firstLogo(team),
  };
}

function rowFromEntry(entry: any, league: League) {
  const t = teamInfo(entry, league);
  if (!t.name && !t.abbr) return null;
  return {
    id: t.id,
    name: t.name || t.abbr,
    abbr: t.abbr || t.name,
    logo: t.logo || null,
    wins: stat(entry, ["wins", "w"], "0"),
    losses: stat(entry, ["losses", "l"], "0"),
    ties: stat(entry, ["ties", "t"], ""),
    pct: stat(entry, ["winpercent", "winpct", "pct", "winpercentage", "percentage"], "—"),
    gb: stat(entry, ["gamesbehind", "gamesback", "gb", "gamesbehinddivision", "divisiongamesbehind"], "—"),
    streak: stat(entry, ["streak", "strk"], "—"),
  };
}

function extractEntries(node: any): any[] {
  const entries = node?.standings?.entries || node?.entries || node?.items || [];
  return Array.isArray(entries) ? entries : [];
}

function labelForNode(node: any, fallback: string) {
  return node?.name || node?.displayName || node?.shortName || node?.abbreviation || node?.group?.name || node?.group?.displayName || fallback;
}

function walk(node: any, sections: any[], league: League, path: string[] = []) {
  if (!node) return;
  const entries = extractEntries(node);
  const rows = entries.map((entry) => rowFromEntry(entry, league)).filter(Boolean);
  if (rows.length) {
    sections.push({ label: labelForNode(node, path[path.length - 1] || "Standings"), rows });
  }
  const children = node?.children || node?.groups || node?.divisions || node?.conferences || node?.standings?.children || [];
  if (Array.isArray(children)) {
    for (const child of children) walk(child, sections, league, [...path, labelForNode(child, "Group")]);
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

function currentSeasonForLeague(league: League) {
  const now = new Date();
  const year = now.getFullYear();
  // In spring/summer, NFL/CFB/CBB standings usually still belong to the prior completed season.
  if ((league === "nfl" || league === "cfb" || league === "cbb") && now.getMonth() < 7) return year - 1;
  if ((league === "nba" || league === "nhl") && now.getMonth() < 6) return year - 1;
  return year;
}

function standingsUrls(league: League, subdivision?: string) {
  const season = currentSeasonForLeague(league);
  const cfbGroup = subdivision === "FCS" ? "81" : "80";
  const group = league === "cfb" ? `?groups=${cfbGroup}` : league === "cbb" ? "?groups=50" : "";
  const join = group ? "&" : "?";
  const path = SPORT_PATH[league];
  return [
    `https://site.api.espn.com/apis/v2/sports/${path}/standings${group}`,
    `https://site.api.espn.com/apis/v2/sports/${path}/standings${group}${join}season=${season}&seasontype=2`,
    `https://site.web.api.espn.com/apis/v2/sports/${path}/standings${group}${join}region=us&lang=en&contentorigin=espn&season=${season}&seasontype=2`,
    `https://site.web.api.espn.com/apis/v2/sports/${path}/standings${group}${join}region=us&lang=en&contentorigin=espn`,
  ];
}

function collectSections(data: any, league: League) {
  const sections: any[] = [];
  walk(data, sections, league, [league.toUpperCase()]);
  if (!sections.length && Array.isArray(data?.children)) {
    for (const child of data.children) walk(child, sections, league, []);
  }
  if (!sections.length && Array.isArray(data?.standings)) {
    for (const child of data.standings) walk(child, sections, league, []);
  }
  return dedupeSections(sections);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league") as League | null;
  const subdivision = searchParams.get("subdivision") || undefined;
  if (!league || !VALID_LEAGUES.includes(league)) return NextResponse.json({ error: "Invalid league" }, { status: 400 });

  const errors: string[] = [];
  for (const url of standingsUrls(league, subdivision)) {
    try {
      const data = await fetchJson(url);
      const sections = collectSections(data, league);
      if (sections.length) {
        return NextResponse.json({ league, sections }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" } });
      }
      errors.push(`No rows: ${url}`);
    } catch (err: any) {
      errors.push(err.message || String(err));
    }
  }

  return NextResponse.json({ league, sections: [], error: errors[0] || "Standings unavailable" }, { status: 200 });
}
