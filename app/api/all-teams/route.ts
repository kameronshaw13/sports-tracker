import { NextResponse } from "next/server";
import { TeamConfig, League, VALID_LEAGUES, makeKey, ensureHash, pickTextColor, getSport, formatCollegeSchoolName } from "@/lib/teams";
import { COLLEGE_FOOTBALL_TEAMS_2026 } from "@/lib/collegeFootballTeams2026";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SPORT_PATH: Record<League, string> = {
  mlb: "baseball/mlb",
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  cfb: "football/college-football",
  cbb: "basketball/mens-college-basketball",
};

const COLLEGE_FOOTBALL_GROUPS = [
  { group: "80", subdivision: "FBS" as const },
  { group: "81", subdivision: "FCS" as const },
];

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return res.json();
}

function normalizeName(value: any): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/\buniversity\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeam(league: League, t: any, extra?: Partial<TeamConfig>): TeamConfig | null {
  if (!t?.abbreviation || !t?.displayName) return null;
  const primary = ensureHash(t.color || t.teamColor);
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
    logo: t.logos?.[0]?.href || t.logo || null,
    ...extra,
  } as TeamConfig;
}

function shouldKeepCollegeBasketball(t: any): boolean {
  if (!t?.abbreviation || !t?.displayName) return false;
  const name = String(t.displayName).toLowerCase();
  if (/\b(d ?ii|d ?iii|division ii|division iii|naia|club|junior college|community college)\b/.test(name)) return false;
  return true;
}

function csvCandidates(row: { teamName: string; nickname: string }) {
  return new Set([
    normalizeName(row.teamName),
    normalizeName(`${row.teamName} ${row.nickname}`),
  ].filter(Boolean));
}

function csvMarker(row: { division: string; teamName: string }) {
  return `${row.division}:${normalizeName(row.teamName)}`;
}

function espnCandidates(t: any) {
  return new Set([
    normalizeName(t?.displayName),
    normalizeName(t?.name),
    normalizeName(t?.shortDisplayName),
    normalizeName(t?.location),
    normalizeName(t?.nickname),
    normalizeName(`${t?.location || ""} ${t?.nickname || t?.name || ""}`),
  ].filter(Boolean));
}

function displaySchoolName(name: string) {
  return formatCollegeSchoolName(name);
}

function displayCollegeFullName(row: { teamName: string; nickname: string }) {
  const school = displaySchoolName(row.teamName);
  const nickname = String(row.nickname || "").trim();
  return nickname ? `${school} ${nickname}` : school;
}

function fallbackAbbr(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "team";
}

async function fetchCollegeFootballTeams(): Promise<TeamConfig[]> {
  const csvRows = COLLEGE_FOOTBALL_TEAMS_2026;
  const rowByKey = new Map<string, typeof csvRows[number]>();
  for (const row of csvRows) {
    for (const c of csvCandidates(row)) rowByKey.set(c, row);
  }

  const matchedCsvKeys = new Set<string>();
  const out: TeamConfig[] = [];
  const seen = new Set<string>();
  const seenCsvMarkers = new Set<string>();

  const results = await Promise.allSettled(
    COLLEGE_FOOTBALL_GROUPS.map(async ({ group, subdivision }) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH.cfb}/teams?limit=700&groups=${group}`;
      const data = await fetchJson(url);
      const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
      const teams: TeamConfig[] = [];
      for (const entry of items) {
        const raw = entry?.team;
        let matchedRow: typeof csvRows[number] | undefined;
        for (const cand of espnCandidates(raw)) {
          const row = rowByKey.get(cand);
          if (row && row.division === subdivision) {
            matchedRow = row;
            matchedCsvKeys.add(csvMarker(row));
            break;
          }
        }
        if (!matchedRow) continue;
        const schoolName = displaySchoolName(matchedRow.teamName);
        const fullName = displayCollegeFullName(matchedRow);
        const team = normalizeTeam("cfb", raw, { name: fullName, short: schoolName, subdivision: matchedRow.division, conference: matchedRow.conference } as any);
        if (team) teams.push(team);
      }
      return teams;
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const team of r.value) {
      const marker = `${team.subdivision || ""}:${normalizeName(team.name)}`;
      if (seen.has(team.key) || seenCsvMarkers.has(marker)) continue;
      seen.add(team.key);
      seenCsvMarkers.add(marker);
      out.push(team);
    }
  }

  // If ESPN misses a team from your CSV, still show it in Add Teams. It may not
  // have ESPN schedule data until ESPN exposes a matching abbreviation, but the
  // list remains exactly your FBS/FCS source of truth.
  for (const row of csvRows) {
    const marker = csvMarker(row);
    if (matchedCsvKeys.has(marker)) continue;
    const abbr = fallbackAbbr(row.teamName);
    const key = makeKey("cfb", abbr);
    if (seen.has(key)) continue;
    seen.add(key);
    seenCsvMarkers.add(marker);
    out.push({
      key,
      name: displayCollegeFullName(row),
      short: displaySchoolName(row.teamName),
      abbr,
      league: "cfb",
      sport: "football",
      primary: "#374151",
      secondary: "#9CA3AF",
      textOnPrimary: "#FFFFFF",
      subdivision: row.division,
      conference: row.conference,
      logo: null,
    });
  }

  return out;
}

async function fetchLeagueTeams(league: League): Promise<TeamConfig[]> {
  if (league === "cfb") return fetchCollegeFootballTeams();
  const groupParam = league === "cbb" ? "&groups=50" : "";
  const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH[league]}/teams?limit=1000${groupParam}`;
  const data = await fetchJson(url);
  const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  return items
    .map((entry) => entry?.team)
    .filter((t) => league !== "cbb" || shouldKeepCollegeBasketball(t))
    .map((t) => normalizeTeam(league, t))
    .filter((t): t is TeamConfig => Boolean(t));
}

export async function GET() {
  const settled = await Promise.allSettled(VALID_LEAGUES.map(fetchLeagueTeams));
  const byKey = new Map<string, TeamConfig>();
  settled.forEach((r) => {
    if (r.status === "fulfilled") for (const t of r.value) byKey.set(t.key, t);
  });
  const teams = Array.from(byKey.values()).sort((a, b) => {
    if (a.league !== b.league) return VALID_LEAGUES.indexOf(a.league) - VALID_LEAGUES.indexOf(b.league);
    if (a.league === "cfb" && a.subdivision !== b.subdivision) return String(a.subdivision).localeCompare(String(b.subdivision));
    if (a.league === "cfb" && a.conference !== b.conference) return String(a.conference || "").localeCompare(String(b.conference || ""));
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ teams }, { headers: { "Cache-Control": "no-store" } });
}
