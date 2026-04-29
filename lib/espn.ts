// Wrapper around ESPN's undocumented public API.
// No auth required. These endpoints are reverse-engineered from espn.com.
// They can change without notice — that's the tradeoff of free data.

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";

type SportLeague = { sport: string; league: string };

const PATHS: Record<string, SportLeague> = {
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

async function fetchJson(url: string, revalidate = 30): Promise<any> {
  const res = await fetch(url, {
    next: { revalidate },
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
  if (!res.ok) throw new Error(`ESPN API ${res.status}: ${url}`);
  return res.json();
}

// Team page — includes record, next event, recent results, basic stats
export async function getTeamPage(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}`;
  return fetchJson(url, 60);
}

// Schedule for a team
export async function getTeamSchedule(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}/schedule`;
  return fetchJson(url, 300);
}

// Roster
export async function getTeamRoster(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}/roster`;
  return fetchJson(url, 3600);
}

// Game summary (boxscore + play-by-play)
export async function getGameSummary(league: string, eventId: string) {
  const url = `${SITE_WEB_API}/${path(league)}/summary?event=${eventId}`;
  // Live games: short cache. Final games: long cache.
  return fetchJson(url, 15);
}

// Scoreboard for a league (today by default, or a date)
export async function getScoreboard(league: string, date?: string) {
  const dateParam = date ? `?dates=${date}` : "";
  const url = `${SITE_API}/${path(league)}/scoreboard${dateParam}`;
  return fetchJson(url, 30);
}

// Standings — these endpoints are different per league, so we use the team page record instead
export async function getStandings(league: string) {
  const url = `${SITE_API}/${path(league)}/standings`;
  return fetchJson(url, 600);
}
