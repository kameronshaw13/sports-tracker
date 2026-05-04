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

const COLLEGE_FOOTBALL_GROUPS = [
  { group: "80", subdivision: "FBS" },
  { group: "81", subdivision: "FCS" },
] as const;

const FCS_ALLOWED = new Set([
  'Abilene Christian','Alabama A&M','Alabama State','Albany','Alcorn State','Arkansas-Pine Bluff','Austin Peay','Bethune-Cookman','Brown','Bryant','Bucknell','Butler','Cal Poly','Campbell','Central Arkansas','Central Connecticut','Charleston Southern','Chattanooga','The Citadel','Colgate','Columbia','Cornell','Dartmouth','Davidson','Dayton','Delaware State','Drake','Duquesne','East Tennessee State','East Texas A&M','Eastern Illinois','Eastern Kentucky','Eastern Washington','Elon','Florida A&M','Fordham','Furman','Gardner-Webb','Georgetown','Grambling State','Hampton','Harvard','Holy Cross','Houston Christian','Howard','Idaho','Idaho State','Illinois State','Incarnate Word','Indiana State','Jackson State','Lafayette','Lamar','Lehigh','Lindenwood','LIU','Maine','Marist','McNeese','Mercer','Merrimack','Mississippi Valley State','Monmouth','Montana','Montana State','Morehead State','Morgan State','Murray State','New Hampshire','Nicholls','Norfolk State','North Alabama','North Carolina A&T','North Carolina Central','North Dakota','North Dakota State','Northern Arizona','Northern Colorado','Northern Iowa','Northwestern State','Penn','Portland State','Prairie View A&M','Presbyterian','Princeton','Rhode Island','Richmond','Robert Morris','Sacramento State','Sacred Heart','Saint Francis','Saint Thomas','Samford','San Diego','South Carolina State','South Dakota','South Dakota State','Southeast Missouri State','Southeastern Louisiana','Southern','Southern Illinois','Southern Utah','Stephen F. Austin','Stetson','Stonehill','Stony Brook','Tarleton State','Tennessee State','Tennessee Tech','Texas Southern','Towson','UC Davis','UT Martin','Utah Tech','UTRGV','Valparaiso','Villanova','VMI','Wagner','Weber State','Western Carolina','Western Illinois','William & Mary','Wofford','Yale','Youngstown State'
].map(normalizeName));

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  return res.json();
}

function normalizeName(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/\bthe\b/g, "")
    .replace(/\buniversity\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\bstate university\b/g, "state")
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
  const name = normalizeName(t?.displayName || t?.name);
  if (!name || !t?.abbreviation) return false;
  if (/\b(d ii|d iii|division ii|division iii|naia|club|junior college|community college)\b/.test(name)) return false;
  return true;
}

function teamNameCandidates(t: any): string[] {
  return Array.from(new Set([
    normalizeName(t?.displayName),
    normalizeName(t?.name),
    normalizeName(t?.shortDisplayName),
    normalizeName(t?.location),
    normalizeName([t?.location, t?.name].filter(Boolean).join(" ")),
    normalizeName([t?.location, t?.nickname].filter(Boolean).join(" ")),
  ].filter(Boolean)));
}

async function fetchCollegeBasketballSet(): Promise<Set<string>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH.cbb}/teams?limit=1000&groups=50`;
  const data = await fetchJson(url);
  const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  const out = new Set<string>();
  for (const entry of items) {
    const t = entry?.team;
    if (!shouldKeepCollegeBasketball(t)) continue;
    for (const c of teamNameCandidates(t)) out.add(c);
  }
  return out;
}

function isDivisionOneFootballTeam(raw: any, d1BasketballNames: Set<string>): boolean {
  const candidates = teamNameCandidates(raw);
  if (!candidates.length || !raw?.abbreviation) return false;
  const joined = candidates.join(" ");
  if (/\b(d ii|d iii|division ii|division iii|naia|club|prep|junior college|community college)\b/.test(joined)) return false;
  return candidates.some((c) => d1BasketballNames.has(c));
}

function isAllowedFcs(raw: any): boolean {
  const candidates = teamNameCandidates(raw);
  return candidates.some((c) => FCS_ALLOWED.has(c));
}

async function fetchCollegeFootballTeams(): Promise<TeamConfig[]> {
  const d1BasketballNames = await fetchCollegeBasketballSet();
  const out: TeamConfig[] = [];
  const seen = new Set<string>();

  for (const { group, subdivision } of COLLEGE_FOOTBALL_GROUPS) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH.cfb}/teams?limit=700&groups=${group}`;
      const data = await fetchJson(url);
      const items: any[] = data?.sports?.[0]?.leagues?.[0]?.teams || [];
      for (const entry of items) {
        const raw = entry?.team;
        if (!isDivisionOneFootballTeam(raw, d1BasketballNames)) continue;
        if (subdivision === "FCS" && !isAllowedFcs(raw)) continue;
        const team = normalizeTeam("cfb", raw, { subdivision } as any);
        if (team && !seen.has(team.key)) {
          seen.add(team.key);
          out.push(team);
        }
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
    if (r.status === "fulfilled") for (const t of r.value) byKey.set(t.key, t);
  });
  const teams = Array.from(byKey.values()).sort((a, b) => {
    if (a.league !== b.league) return VALID_LEAGUES.indexOf(a.league) - VALID_LEAGUES.indexOf(b.league);
    if (a.league === "cfb" && a.subdivision !== b.subdivision) return String(a.subdivision).localeCompare(String(b.subdivision));
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ teams }, { headers: { "Cache-Control": "no-store" } });
}
