import { NextResponse } from "next/server";
import { TeamConfig, League, VALID_LEAGUES, makeKey, ensureHash, pickTextColor, getSport } from "@/lib/teams";

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

// ESPN's "groups" parameter on the college-football teams endpoint:
//   80 = FBS (Football Bowl Subdivision)  ← what was Division I-A
//   81 = FCS (Football Championship Subdivision)  ← what was Division I-AA
// Together these ARE Division I football. We previously cross-referenced
// against D1 men's basketball to filter, which was both unnecessary (ESPN's
// group filter already restricts to D1) and actively broken — a single
// failed basketball fetch would silently drop every CFB team. Trust the
// groups parameter directly.
const COLLEGE_FOOTBALL_GROUPS = [
  { group: "80", subdivision: "FBS" as const },
  { group: "81", subdivision: "FCS" as const },
];

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return res.json();
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

// Filter to D1 men's basketball. ESPN's group=50 is supposed to do this on
// its own, but the response occasionally includes lower-division teams or
// junior college club programs depending on the time of year — so we drop
// anything that explicitly identifies as D-II/D-III/NAIA/JUCO.
function shouldKeepCollegeBasketball(t: any): boolean {
  if (!t?.abbreviation || !t?.displayName) return false;
  const name = String(t.displayName).toLowerCase();
  if (/\b(d ?ii|d ?iii|division ii|division iii|naia|club|junior college|community college)\b/.test(name)) return false;
  return true;
}

async function fetchCollegeFootballTeams(): Promise<TeamConfig[]> {
  const out: TeamConfig[] = [];
  const seen = new Set<string>();

  // Fetch FBS and FCS in parallel; if one bucket fails, we still get the
  // other. (Previously a single failure would clear ALL CFB teams.)
  const results = await Promise.allSettled(
    COLLEGE_FOOTBALL_GROUPS.map(async ({ group, subdivision }) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH.cfb}/teams?limit=700&groups=${group}`;
      const data = await fetchJson(url);
      const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
      const teams: TeamConfig[] = [];
      for (const entry of items) {
        const team = normalizeTeam("cfb", entry?.team, { subdivision });
        if (team) teams.push(team);
      }
      return teams;
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const team of r.value) {
      if (seen.has(team.key)) continue;
      seen.add(team.key);
      out.push(team);
    }
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
    // FBS before FCS within CFB.
    if (a.league === "cfb" && a.subdivision !== b.subdivision) {
      if (a.subdivision === "FBS") return -1;
      if (b.subdivision === "FBS") return 1;
    }
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ teams }, { headers: { "Cache-Control": "no-store" } });
}