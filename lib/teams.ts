// Pure types + helpers, safe to import from API routes (server) or components (client).
// The localStorage hook lives in lib/useFavorites.ts (client-only).

export type League = "mlb" | "nfl" | "nba" | "nhl";
export type Sport = "baseball" | "football" | "basketball" | "hockey";

export type TeamConfig = {
  key: string;          // ${league}-${abbr}, lowercase. Globally unique.
  name: string;         // "Baltimore Orioles"
  short: string;        // "Orioles"
  abbr: string;         // "bal" — lowercase, used for ESPN logo CDN + API
  league: League;
  sport: Sport;
  primary: string;      // "#DF4601" — always with leading #
  secondary: string;
  textOnPrimary: string;
  // Marks a team being viewed but NOT saved as a favorite. Set by
  // page.tsx#handleTeamLogoClick when navigating to a non-favorite team
  // (e.g. tapping the Astros logo on an Orioles boxscore). Stripped before
  // saving to localStorage.
  _transient?: boolean;
};

export const VALID_LEAGUES: League[] = ["mlb", "nfl", "nba", "nhl"];

const SPORTS: Record<League, Sport> = {
  mlb: "baseball",
  nfl: "football",
  nba: "basketball",
  nhl: "hockey",
};

export function getSport(league: League): Sport {
  return SPORTS[league];
}

export function makeKey(league: League, abbr: string): string {
  return `${league}-${abbr.toLowerCase()}`;
}

// Parses a team key like "mlb-bal" into { league, abbr }. Returns null if malformed.
// API routes use this instead of looking up a static TEAMS map, so the app works
// for any ESPN team — not just the four hardcoded defaults.
export function parseTeamKey(key: string | null | undefined): { league: League; abbr: string } | null {
  if (!key) return null;
  const idx = key.indexOf("-");
  if (idx < 0) return null;
  const league = key.slice(0, idx);
  const abbr = key.slice(idx + 1).toLowerCase();
  if (!VALID_LEAGUES.includes(league as League) || !abbr) return null;
  return { league: league as League, abbr };
}

export function logoUrl(team: { league: League; abbr: string }): string {
  return `https://a.espncdn.com/i/teamlogos/${team.league}/500/${team.abbr.toLowerCase()}.png`;
}

// ESPN returns colors as bare hex (no leading #). Normalize.
export function ensureHash(c?: string | null): string {
  if (!c) return "#000000";
  return c.startsWith("#") ? c : `#${c}`;
}

// Pick black or white text for readable contrast against any hex background.
export function pickTextColor(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#FFFFFF";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000000" : "#FFFFFF";
}

// Original four — used as default favorites for new users + a fallback if catalog API fails.
export const DEFAULT_FAVORITES: TeamConfig[] = [
  { key: "mlb-bal", name: "Baltimore Orioles",      short: "Orioles",  abbr: "bal", league: "mlb", sport: "baseball",   primary: "#DF4601", secondary: "#000000", textOnPrimary: "#FFFFFF" },
  { key: "nfl-lac", name: "Los Angeles Chargers",   short: "Chargers", abbr: "lac", league: "nfl", sport: "football",   primary: "#0080C6", secondary: "#FFC20E", textOnPrimary: "#FFFFFF" },
  { key: "nba-den", name: "Denver Nuggets",         short: "Nuggets",  abbr: "den", league: "nba", sport: "basketball", primary: "#0E2240", secondary: "#FEC524", textOnPrimary: "#FFFFFF" },
  { key: "nhl-sea", name: "Seattle Kraken",         short: "Kraken",   abbr: "sea", league: "nhl", sport: "hockey",     primary: "#001628", secondary: "#99D9D9", textOnPrimary: "#FFFFFF" },
];

// --- Backwards-compat exports (legacy paths only) ---
export const TEAMS: Record<string, TeamConfig> = Object.fromEntries(
  DEFAULT_FAVORITES.map((t) => [t.key, t])
);
export const TEAM_ORDER: string[] = DEFAULT_FAVORITES.map((t) => t.key);
export function getTeam(key: string): TeamConfig | undefined {
  return TEAMS[key];
}
