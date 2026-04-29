// ESPN league slugs and team IDs for the four favorite teams.
// ESPN logos: https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png

export type TeamConfig = {
  key: string;
  name: string;
  short: string;
  abbr: string;
  league: "mlb" | "nfl" | "nba" | "nhl";
  sport: "baseball" | "football" | "basketball" | "hockey";
  espnTeamId: string;
  primary: string;
  secondary: string;
  textOnPrimary: string;
};

export const TEAMS: Record<string, TeamConfig> = {
  orioles: {
    key: "orioles",
    name: "Baltimore Orioles",
    short: "Orioles",
    abbr: "BAL",
    league: "mlb",
    sport: "baseball",
    espnTeamId: "1",
    primary: "#DF4601",
    secondary: "#000000",
    textOnPrimary: "#FFFFFF",
  },
  chargers: {
    key: "chargers",
    name: "Los Angeles Chargers",
    short: "Chargers",
    abbr: "LAC",
    league: "nfl",
    sport: "football",
    espnTeamId: "24",
    primary: "#0080C6",
    secondary: "#FFC20E",
    textOnPrimary: "#FFFFFF",
  },
  nuggets: {
    key: "nuggets",
    name: "Denver Nuggets",
    short: "Nuggets",
    abbr: "DEN",
    league: "nba",
    sport: "basketball",
    espnTeamId: "7",
    primary: "#0E2240",
    secondary: "#FEC524",
    textOnPrimary: "#FFFFFF",
  },
  kraken: {
    key: "kraken",
    name: "Seattle Kraken",
    short: "Kraken",
    abbr: "SEA",
    league: "nhl",
    sport: "hockey",
    espnTeamId: "124292", // ESPN ID for Seattle Kraken
    primary: "#001628",
    secondary: "#99D9D9",
    textOnPrimary: "#FFFFFF",
  },
};

export const TEAM_ORDER = ["orioles", "chargers", "nuggets", "kraken"];

export function getTeam(key: string): TeamConfig | undefined {
  return TEAMS[key];
}

// ESPN logo URL by sport + abbreviation
export function logoUrl(team: TeamConfig): string {
  const sportPath = team.sport === "baseball" ? "mlb"
    : team.sport === "football" ? "nfl"
    : team.sport === "basketball" ? "nba"
    : "nhl";
  return `https://a.espncdn.com/i/teamlogos/${sportPath}/500/${team.abbr.toLowerCase()}.png`;
}
