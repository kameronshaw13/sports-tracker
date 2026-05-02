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
  cfb: "football/college-football",
  cbb: "basketball/mens-college-basketball",
};

const COLLEGE_FOOTBALL_GROUPS = [
  { group: "80", subdivision: "FBS" },
  { group: "81", subdivision: "FCS" },
];

async function fetchJson(url: string) {
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
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

function shouldKeepCollegeBasketball(t: any): boolean {
  const name = String(t?.displayName || t?.name || "").toLowerCase();
  if (!name || !t?.abbreviation) return false;
  if (/\b(d-?ii|d-?iii|division ii|division iii|naia|club|junior college|community college)\b/.test(name)) return false;
  return true;
}

function shouldKeepFcsTeam(t: any): boolean {
  const name = String(t?.displayName || t?.name || "").toLowerCase();
  const slug = String(t?.slug || "").toLowerCase();
  if (!name || !t?.abbreviation) return false;
  if (/\b(d-?ii|d-?iii|division ii|division iii|naia|club|prep|junior college|community college)\b/.test(name)) return false;
  if (/\b(d-?ii|d-?iii|naia|club|prep)\b/.test(slug)) return false;
  return true;
}

async function fetchCollegeFootballTeams(): Promise<TeamConfig[]> {
  const out: TeamConfig[] = [];
  for (const { group, subdivision } of COLLEGE_FOOTBALL_GROUPS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH.cfb}/teams?limit=500&groups=${group}`;
      const data = await fetchJson(url);
      const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
      for (const entry of items) {
        const raw = entry?.team;
        if (subdivision === "FCS" && !shouldKeepFcsTeam(raw)) continue;
        const team = normalizeTeam("cfb", raw, { subdivision } as any);
        if (team) out.push(team);
      }
    } catch {}
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
    if (r.status === "fulfilled") {
      for (const t of r.value) byKey.set(t.key, t);
    }
  });
  const teams = Array.from(byKey.values()).sort((a, b) => {
    if (a.league !== b.league) return VALID_LEAGUES.indexOf(a.league) - VALID_LEAGUES.indexOf(b.league);
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ teams });
}
