// Wrapper around ESPN's undocumented public API.

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";

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

async function fetchJson(url: string, revalidate = 30): Promise<any> {
  const res = await fetch(url, {
    next: { revalidate },
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
  if (!res.ok) throw new Error(`ESPN API ${res.status}: ${url}`);
  return res.json();
}

// Team page — record, next event, etc. teamId can be numeric or lowercase abbr.
export async function getTeamPage(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}`;
  return fetchJson(url, 60);
}

// Schedule for a team. ESPN defaults to regular season; pass seasontype to get
// preseason (1), regular (2), or postseason (3). We fetch both regular AND
// postseason and merge so playoff games show up.
export async function getTeamSchedule(league: string, teamId: string) {
  const base = `${SITE_API}/${path(league)}/teams/${teamId}/schedule`;

  // Fetch regular season (default) and postseason in parallel
  const [regular, post] = await Promise.allSettled([
    fetchJson(base, 300),
    fetchJson(`${base}?seasontype=3`, 300),
  ]);

  const regEvents = regular.status === "fulfilled" ? regular.value?.events || [] : [];
  const postEvents = post.status === "fulfilled" ? post.value?.events || [] : [];

  // Tag postseason events so the UI can label them
  const taggedPost = postEvents.map((e: any) => ({ ...e, _isPlayoff: true }));

  // Merge, deduplicate by id (in case overlap), sort by date
  const seen = new Set<string>();
  const merged = [...regEvents, ...taggedPost].filter((e) => {
    if (!e.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Return the merged result in the same shape ESPN uses
  return {
    ...(regular.status === "fulfilled" ? regular.value : {}),
    events: merged,
  };
}

// Roster
export async function getTeamRoster(league: string, teamId: string) {
  const url = `${SITE_API}/${path(league)}/teams/${teamId}/roster`;
  return fetchJson(url, 3600);
}

// Game summary (boxscore + play-by-play)
export async function getGameSummary(league: string, eventId: string) {
  const url = `${SITE_WEB_API}/${path(league)}/summary?event=${eventId}`;
  return fetchJson(url, 15);
}

// Scoreboard for a league (today by default, or a date)
export async function getScoreboard(league: string, date?: string) {
  const dateParam = date ? `?dates=${date}` : "";
  const url = `${SITE_API}/${path(league)}/scoreboard${dateParam}`;
  return fetchJson(url, 30);
}

export async function getStandings(league: string) {
  const url = `${SITE_API}/${path(league)}/standings`;
  return fetchJson(url, 600);
}
