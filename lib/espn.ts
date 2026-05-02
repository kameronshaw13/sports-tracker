// Wrapper around ESPN's undocumented public API.
//
// v21 additions:
//   - getMlbFortyManRoster: hits MLB's official statsapi.mlb.com to get the
//     full 40-man roster with accurate IL/MIN/active status codes. ESPN's
//     MLB roster endpoint is unreliable about which players are on the IL
//     — it often returns just the 26-man without injury labels the parser
//     can match. MLB statsapi is official, free, no auth required, and
//     gives every player on the 40-man with a clean status code.
//
// v20.1 additions:
//   - getTeamMeta: returns team page including the numeric team id
//   - getSeasonTeamAthletes: returns every athlete who appeared for the team
//     in a given season. Used by /api/players to surface guys who played
//     for the team but aren't currently on the 26-man (e.g. optioned to AAA
//     after a brief callup).

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";
const CORE_API = "https://sports.core.api.espn.com/v2/sports";

// v21: MLB's official stats API. Free, no auth, well-documented enough.
// Used only for MLB-specific endpoints we can't get cleanly from ESPN.
const MLB_STATSAPI = "https://statsapi.mlb.com/api/v1";

const PATHS: Record<string, { sport: string; league: string }> = {
  mlb: { sport: "baseball", league: "mlb" },
  nfl: { sport: "football", league: "nfl" },
  nba: { sport: "basketball", league: "nba" },
  nhl: { sport: "hockey", league: "nhl" },
};

function path(league: string): string {
  const p = PATHS[league];
  if (!p) throw new Error(`Unknown league: ${league}`);
  return `${p.sport}/${p.league}`;
}

function corePath(league: string): string {
  const p = PATHS[league];
  if (!p) throw new Error(`Unknown league: ${league}`);
  return `${p.sport}/leagues/${p.league}`;
}

function currentSeasonYear(league: string): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (league === "mlb") return year;
  if (league === "nfl") return month < 8 ? year - 1 : year;
  if (league === "nba" || league === "nhl") return month >= 8 ? year + 1 : year;
  return year;
}

async function fetchJson(url: string, revalidate = 30): Promise<any> {
  const res = await fetch(url, {
    ...(revalidate <= 0 ? { cache: "no-store" as RequestCache } : { next: { revalidate } }),
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
  if (!res.ok) throw new Error(`ESPN API ${res.status}: ${url}`);
  return res.json();
}

export async function getTeamPage(league: string, teamId: string, enable?: string[]) {
  const enableQuery = enable && enable.length > 0 ? `?enable=${enable.join(",")}` : "";
  const url = `${SITE_API}/${path(league)}/teams/${teamId}${enableQuery}`;
  return fetchJson(url, 60);
}

// v20.1: Get just the team meta (id, name, etc.) — this is what the team page
// returns even without enable params. We use it to convert the abbreviation
// the rest of the app uses into the numeric team id that the core API needs.
export async function getTeamMeta(league: string, abbr: string): Promise<{ id: string; abbreviation: string } | null> {
  try {
    const data = await fetchJson(`${SITE_API}/${path(league)}/teams/${abbr}`, 3600);
    const team = data?.team;
    if (!team?.id) return null;
    return { id: String(team.id), abbreviation: String(team.abbreviation || abbr).toLowerCase() };
  } catch {
    return null;
  }
}

export async function getTeamSchedule(league: string, teamId: string) {
  const base = `${SITE_API}/${path(league)}/teams/${teamId}/schedule`;
  const year = currentSeasonYear(league);

  const requests = [
    fetchJson(`${base}?season=${year}&seasontype=2`, 0),
    fetchJson(`${base}?season=${year}&seasontype=3`, 0),
    fetchJson(base, 0),
  ];

  if (league === "nfl" || league === "nba" || league === "nhl") {
    requests.push(fetchJson(`${base}?season=${year - 1}&seasontype=3`, 0));
  }

  const results = await Promise.allSettled(requests);
  const allEvents: any[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value?.events) {
      const isPlayoff = i === 1 || i === 3;
      r.value.events.forEach((ev: any) => {
        allEvents.push({ ...ev, _isPlayoff: isPlayoff || ev.seasonType?.id === "3" });
      });
    }
  });

  const seen = new Set<string>();
  const merged = allEvents.filter((e) => {
    if (!e.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { events: merged };
}

export async function getTeamRoster(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}/roster`;
  return fetchJson(url, 3600);
}

// v20.1: Returns every athlete who has appeared in a game for the team in
// the given season — including players currently optioned to the minors
// (their data only stops appearing once they're traded to a different
// franchise). This is the fix for "Cade Povich pitched 1 game then got
// sent down — should still show in Orioles pitching stats."
//
// ESPN endpoint shape:
//   /v2/sports/{sport}/leagues/{league}/seasons/{year}/types/2/teams/{teamId}/athletes
// Returns { items: [{ $ref: ".../athletes/{id}?..." }, ...] }
//
// We extract the numeric athlete IDs from the $ref URLs. Cached 1h since
// the list of season contributors only changes when someone makes their
// debut or gets traded out — neither happens often enough to warrant fresh
// fetches.
export async function getSeasonTeamAthletes(
  league: string,
  numericTeamId: string,
  year?: number
): Promise<string[]> {
  const y = year || currentSeasonYear(league);
  // Try regular season first.
  const tryFetch = async (seasonType: number) => {
    try {
      const url = `${CORE_API}/${corePath(league)}/seasons/${y}/types/${seasonType}/teams/${numericTeamId}/athletes?limit=200`;
      const data = await fetchJson(url, 3600);
      const items: any[] = data?.items || [];
      const ids = new Set<string>();
      for (const it of items) {
        const ref: string = it?.$ref || "";
        const m = ref.match(/\/athletes\/(\d+)/);
        if (m) ids.add(m[1]);
      }
      return Array.from(ids);
    } catch {
      return null;
    }
  };

  const reg = await tryFetch(2);
  if (reg && reg.length > 0) return reg;

  // Fall back to last year's regular season for offseason coverage.
  try {
    const url = `${CORE_API}/${corePath(league)}/seasons/${y - 1}/types/2/teams/${numericTeamId}/athletes?limit=200`;
    const data = await fetchJson(url, 3600);
    const items: any[] = data?.items || [];
    const ids = new Set<string>();
    for (const it of items) {
      const ref: string = it?.$ref || "";
      const m = ref.match(/\/athletes\/(\d+)/);
      if (m) ids.add(m[1]);
    }
    return Array.from(ids);
  } catch {
    return [];
  }
}

// v20.1: Fetch a specific athlete's data (name, headshot, position, etc.)
// Used when the season-team-athletes endpoint gives us a player ID we don't
// have profile data for from the roster endpoint. Cached 1h.
export async function getAthleteProfile(league: string, athleteId: string): Promise<any | null> {
  try {
    const url = `${SITE_WEB_API}/${path(league)}/athletes/${athleteId}`;
    const data = await fetchJson(url, 3600);
    return data?.athlete || data;
  } catch {
    return null;
  }
}

// Per-athlete season stats. Uses the CORE API which is the only endpoint
// that returns splits.categories with stat data.
export async function getAthleteStats(league: string, athleteId: string) {
  const year = currentSeasonYear(league);
  const baseFor = (y: number, type: number) =>
    `${CORE_API}/${corePath(league)}/seasons/${y}/types/${type}/athletes/${athleteId}/statistics`;

  const tryFetch = async (url: string) => {
    try {
      const data = await fetchJson(url, 3600);
      const cats = data?.splits?.categories;
      if (Array.isArray(cats) && cats.length > 0) return data;
    } catch {}
    return null;
  };

  let data = await tryFetch(baseFor(year, 2));
  if (data) return data;

  data = await tryFetch(baseFor(year - 1, 2));
  if (data) return data;

  data = await tryFetch(baseFor(year - 1, 3));
  return data;
}

// v20.1: Per-athlete TEAM-SPECIFIC season stats. Returns null if not exposed
// for this combination. Used by /api/players to get clean per-team stats
// (no consolidated cross-team totals) when the player has been traded.
export async function getAthleteStatsForTeam(
  league: string,
  athleteId: string,
  numericTeamId: string,
  year?: number
): Promise<any | null> {
  const y = year || currentSeasonYear(league);
  const url = `${CORE_API}/${corePath(league)}/seasons/${y}/types/2/teams/${numericTeamId}/athletes/${athleteId}/statistics`;
  try {
    const data = await fetchJson(url, 3600);
    const cats = data?.splits?.categories;
    if (Array.isArray(cats) && cats.length > 0) return data;
    return null;
  } catch {
    return null;
  }
}

export async function getTeamLeaders(league: string, teamId: string) {
  const urlSite = `${SITE_API}/${path(league)}/teams/${teamId}/leaders`;
  const urlWeb = `${SITE_WEB_API}/${path(league)}/teams/${teamId}/leaders`;
  try {
    return await fetchJson(urlSite, 600);
  } catch {
    return fetchJson(urlWeb, 600);
  }
}

export async function getGameSummary(league: string, eventId: string) {
  const url = `${SITE_WEB_API}/${path(league)}/summary?event=${eventId}`;
  return fetchJson(url, 0);
}

export async function getScoreboard(league: string, date?: string) {
  const dateParam = date ? `?dates=${date}` : "";
  const url = `${SITE_API}/${path(league)}/scoreboard${dateParam}`;
  return fetchJson(url, 0);
}

export async function getStandings(league: string) {
  const url = `${SITE_API}/${path(league)}/standings`;
  return fetchJson(url, 600);
}

// =====================================================================
// v21: MLB statsapi.mlb.com integration
// =====================================================================
//
// We use ESPN abbreviations everywhere in the app, but MLB statsapi takes
// numeric team IDs. This map translates. Some teams have multiple abbreviation
// variants (e.g. ESPN sometimes returns "CHW" and sometimes "CWS" for the
// White Sox depending on which endpoint) so we map both → the same team id.
export const MLB_TEAM_IDS: Record<string, number> = {
  ari: 109, az: 109,
  atl: 144,
  bal: 110,
  bos: 111,
  chc: 112,
  chw: 145, cws: 145,
  cin: 113,
  cle: 114,
  col: 115,
  det: 116,
  hou: 117,
  kc: 118, kcr: 118,
  laa: 108,
  lad: 119,
  mia: 146,
  mil: 158,
  min: 142,
  nym: 121,
  nyy: 147,
  oak: 133, ath: 133,
  phi: 143,
  pit: 134,
  sd: 135, sdp: 135,
  sea: 136,
  sf: 137, sfg: 137,
  stl: 138,
  tb: 139, tbr: 139,
  tex: 140,
  tor: 141,
  wsh: 120, was: 120,
};


export function getMlbTeamId(abbr: string): number | null {
  return MLB_TEAM_IDS[abbr.toLowerCase()] || null;
}

export function getMlbHeadshotUrl(mlbId: number | string, size = 213): string {
  // Official MLB image CDN used by MLB.com player pages. The URL stays stable
  // across active, injured-list, and optioned players because it is keyed by
  // MLBAM person id rather than ESPN athlete id.
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_${size},q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}

export type MlbSeasonPlayerStatLine = {
  mlbId: number;
  name: string;
  teamId?: number;
  teamAbbr?: string;
  positionAbbr?: string | null;
  positionName?: string | null;
  group: "hitting" | "pitching";
  stat: Record<string, any>;
};

export async function getMlbSeasonPlayerStats(
  abbr: string,
  year?: number
): Promise<MlbSeasonPlayerStatLine[]> {
  const teamId = getMlbTeamId(abbr);
  if (!teamId) return [];
  const season = year || currentSeasonYear("mlb");

  const fetchGroup = async (group: "hitting" | "pitching") => {
    try {
      const url = `${MLB_STATSAPI}/stats?stats=season&group=${group}&playerPool=ALL&teamId=${teamId}&season=${season}&gameType=R&limit=200`;
      const data = await fetchJson(url, 1800);
      const splits: any[] = data?.stats?.[0]?.splits || [];
      return splits
        .map((s) => ({
          mlbId: Number(s?.player?.id || 0),
          name: String(s?.player?.fullName || "").trim(),
          teamId: s?.team?.id ? Number(s.team.id) : undefined,
          teamAbbr: s?.team?.abbreviation || undefined,
          positionAbbr: s?.position?.abbreviation || s?.position?.code || null,
          positionName: s?.position?.name || null,
          group,
          stat: s?.stat || {},
        }))
        .filter((p) => p.mlbId && p.name);
    } catch {
      return [] as MlbSeasonPlayerStatLine[];
    }
  };

  const [hitting, pitching] = await Promise.all([fetchGroup("hitting"), fetchGroup("pitching")]);
  return [...hitting, ...pitching];
}


export async function getMlbPersonSeasonStats(
  mlbId: number,
  teamId?: number | null,
  year?: number
): Promise<MlbSeasonPlayerStatLine[]> {
  const season = year || currentSeasonYear("mlb");

  const fetchGroup = async (group: "hitting" | "pitching") => {
    try {
      const url = `${MLB_STATSAPI}/people/${mlbId}/stats?stats=season&group=${group}&season=${season}&gameType=R`;
      const data = await fetchJson(url, 1800);
      const splits: any[] = data?.stats?.[0]?.splits || [];
      return splits
        .filter((s) => {
          if (!teamId) return true;
          const splitTeamId = s?.team?.id ? Number(s.team.id) : null;
          // Some individual stat responses omit team on the current split.
          // When omitted, keep it for current-roster/IL players; when present,
          // require the requested club so traded-player totals don't leak in.
          return splitTeamId == null || splitTeamId === teamId;
        })
        .map((s) => ({
          mlbId,
          name: String(s?.player?.fullName || s?.person?.fullName || "").trim(),
          teamId: s?.team?.id ? Number(s.team.id) : teamId || undefined,
          teamAbbr: s?.team?.abbreviation || undefined,
          positionAbbr: s?.position?.abbreviation || s?.position?.code || null,
          positionName: s?.position?.name || null,
          group,
          stat: s?.stat || {},
        }))
        .filter((line) => line.stat && Object.keys(line.stat).length > 0);
    } catch {
      return [] as MlbSeasonPlayerStatLine[];
    }
  };

  const [hitting, pitching] = await Promise.all([fetchGroup("hitting"), fetchGroup("pitching")]);
  return [...hitting, ...pitching];
}

export type MlbRosterEntry = {
  mlbId: number;
  name: string;
  jersey: string | null;
  positionAbbr: string | null;  // P, C, 1B, 2B, 3B, SS, LF, CF, RF, OF, DH, TWP
  positionName: string | null;  // "Pitcher", "Catcher", etc.
  // Status code is the canonical machine-readable identifier.
  // Common values:
  //   A   = Active 26-man
  //   D7  = 7-Day Injured List   (concussion/minor leagues)
  //   D10 = 10-Day Injured List  (most position-player injuries)
  //   D15 = 15-Day Injured List  (most pitcher injuries since 2022)
  //   D60 = 60-Day Injured List  (longer-term — clears 40-man spot)
  //   MIN = In the minor leagues (still on 40-man, optioned)
  //   BRV = Bereavement
  //   PL  = Paternity Leave
  //   RES = Restricted List
  //   SU  = Suspended
  //   DEC = Designated for Assignment (in transition off the 40-man)
  //   RM  = Removed from 40-man
  statusCode: string;
  statusDescription: string;    // "Active", "10-Day Injured List", "Minors", ...
  injuryStatus?: string | null;
  injuryDetail?: string | null;
  injuryComment?: string | null;
  injuryReturnDate?: string | null;
};

// v21: Fetch the full 40-man roster from MLB's official statsapi. The 40-man
// roster includes every player under MLB contract for that club — those on
// the 26-man, those on the IL (any flavor), and those optioned to the minors.
// Each entry has a status code we can use to bucket cleanly.
//
// Returns [] if:
//   - the abbreviation isn't recognized (caller should fall back to ESPN)
//   - the network call fails
export async function getMlbFortyManRoster(abbr: string): Promise<MlbRosterEntry[]> {
  const id = MLB_TEAM_IDS[abbr.toLowerCase()];
  if (!id) return [];
  try {
    const url = `${MLB_STATSAPI}/teams/${id}/roster?rosterType=40Man&hydrate=person(injuries)`;
    const data = await fetchJson(url, 1800);
    const roster: any[] = Array.isArray(data?.roster) ? data.roster : [];
    return roster
      .map((r) => {
        const injuries = Array.isArray(r?.person?.injuries)
          ? r.person.injuries
          : Array.isArray(r?.injuries)
          ? r.injuries
          : [];
        const injury = injuries[0] || null;
        const injuryDetail =
          injury?.injury ||
          injury?.injuryDesc ||
          injury?.description ||
          injury?.bodyPart ||
          injury?.details?.location ||
          null;
        const injuryComment =
          injury?.injuryComment ||
          injury?.comment ||
          injury?.shortComment ||
          injury?.longComment ||
          null;
        return {
          mlbId: Number(r?.person?.id || 0),
          name: String(r?.person?.fullName || "").trim(),
          jersey: r?.jerseyNumber ? String(r.jerseyNumber) : null,
          positionAbbr: r?.position?.abbreviation
            ? String(r.position.abbreviation).toUpperCase()
            : null,
          positionName: r?.position?.name || null,
          statusCode: String(r?.status?.code || "").toUpperCase(),
          statusDescription: String(r?.status?.description || ""),
          injuryStatus: injury?.status || injury?.injuredListStatus || null,
          injuryDetail: injuryDetail ? String(injuryDetail) : null,
          injuryComment: injuryComment ? String(injuryComment) : null,
          injuryReturnDate: injury?.expectedReturnDate || injury?.returnDate || injury?.dateUpdated || null,
        };
      })
      .filter((p) => p.mlbId && p.name);
  } catch {
    return [];
  }
}

export { currentSeasonYear };
