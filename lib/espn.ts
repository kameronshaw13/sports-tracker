// Wrapper around ESPN's undocumented public API.

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";
// Core API uses a different URL shape: /v2/sports/{sport}/leagues/{league}/...
// This is what actually returns per-athlete season stats with splits.categories.
const CORE_API = "https://sports.core.api.espn.com/v2/sports";

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
    next: { revalidate },
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

export async function getTeamSchedule(league: string, teamId: string) {
  const base = `${SITE_API}/${path(league)}/teams/${teamId}/schedule`;
  const year = currentSeasonYear(league);

  const requests = [
    fetchJson(`${base}?season=${year}&seasontype=2`, 300),
    fetchJson(`${base}?season=${year}&seasontype=3`, 300),
    fetchJson(base, 300),
  ];

  if (league === "nfl" || league === "nba" || league === "nhl") {
    requests.push(fetchJson(`${base}?season=${year - 1}&seasontype=3`, 300));
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

// Per-athlete season stats. Uses the CORE API (sports.core.api.espn.com) which
// is the only endpoint that actually returns splits.categories with stat data.
//
// URL shape: /v2/sports/{sport}/leagues/{league}/seasons/{year}/types/{seasonType}/athletes/{id}/statistics
//   seasonType: 1=preseason, 2=regular, 3=postseason
//
// We try regular season first; if empty, fall back to last year's regular
// season (handles MLB pre-Opening-Day, NFL post-Super-Bowl, etc.).
export async function getAthleteStats(league: string, athleteId: string) {
  const year = currentSeasonYear(league);
  const baseFor = (y: number, type: number) =>
    `${CORE_API}/${corePath(league)}/seasons/${y}/types/${type}/athletes/${athleteId}/statistics`;

  // 1-hour cache — tradeoff: stats can be slightly stale during a live game,
  // but we only need to refetch once per hour to keep things current enough.
  const tryFetch = async (url: string) => {
    try {
      const data = await fetchJson(url, 3600);
      const cats = data?.splits?.categories;
      if (Array.isArray(cats) && cats.length > 0) return data;
    } catch {}
    return null;
  };

  // Current year regular season
  let data = await tryFetch(baseFor(year, 2));
  if (data) return data;

  // Previous year regular season — most common offseason fallback
  data = await tryFetch(baseFor(year - 1, 2));
  if (data) return data;

  // Last attempt: previous year postseason (catches just-finished playoffs)
  data = await tryFetch(baseFor(year - 1, 3));
  return data;
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
  return fetchJson(url, 15);
}

export async function getScoreboard(league: string, date?: string) {
  const dateParam = date ? `?dates=${date}` : "";
  const url = `${SITE_API}/${path(league)}/scoreboard${dateParam}`;
  return fetchJson(url, 30);
}

export async function getStandings(league: string) {
  const url = `${SITE_API}/${path(league)}/standings`;
  return fetchJson(url, 600);
}

export { currentSeasonYear };
