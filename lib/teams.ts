// ESPN's API accepts BOTH numeric team IDs and lowercase abbreviations.
// We use abbreviations because they're stable (numeric IDs sometimes change for expansion teams).

export type TeamConfig = {
  key: string;
  name: string;
  short: string;
  abbr: string;             // The lowercase abbreviation IS the ESPN team ID
  league: "mlb" | "nfl" | "nba" | "nhl";
  sport: "baseball" | "football" | "basketball" | "hockey";
  primary: string;
  secondary: string;
  textOnPrimary: string;
};

export const TEAMS: Record<string, TeamConfig> = {
  orioles: {
    key: "orioles",
    name: "Baltimore Orioles",
    short: "Orioles",
    abbr: "bal",
    league: "mlb",
    sport: "baseball",
    primary: "#DF4601",
    secondary: "#000000",
    textOnPrimary: "#FFFFFF",
  },
  chargers: {
    key: "chargers",
    name: "Los Angeles Chargers",
    short: "Chargers",
    abbr: "lac",
    league: "nfl",
    sport: "football",
    primary: "#0080C6",
    secondary: "#FFC20E",
    textOnPrimary: "#FFFFFF",
  },
  nuggets: {
    key: "nuggets",
    name: "Denver Nuggets",
    short: "Nuggets",
    abbr: "den",
    league: "nba",
    sport: "basketball",
    primary: "#0E2240",
    secondary: "#FEC524",
    textOnPrimary: "#FFFFFF",
  },
  kraken: {
    key: "kraken",
    name: "Seattle Kraken",
    short: "Kraken",
    abbr: "sea",
    league: "nhl",
    sport: "hockey",
    primary: "#001628",
    secondary: "#99D9D9",
    textOnPrimary: "#FFFFFF",
  },
};

export const TEAM_ORDER = ["orioles", "chargers", "nuggets", "kraken"];

export function getTeam(key: string): TeamConfig | undefined {
  return TEAMS[key];
}

// Logo URL - ESPN's CDN uses lowercase abbreviation
export function logoUrl(team: TeamConfig): string {
  const sportPath = team.sport === "baseball" ? "mlb"
    : team.sport === "football" ? "nfl"
    : team.sport === "basketball" ? "nba"
    : "nhl";
  return `https://a.espncdn.com/i/teamlogos/${sportPath}/500/${team.abbr.toLowerCase()}.png`;
}
