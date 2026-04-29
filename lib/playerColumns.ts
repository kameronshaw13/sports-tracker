// Column schemas for the player stats tables.
//
// CHANGES IN v12:
// - Every column now specifies the ESPN category it belongs to. The /api/players
//   route stores stats keyed by `${category}.${name}` to resolve cross-category
//   name collisions (e.g. "interceptions" exists in both `passing` and
//   `defensiveInterceptions`, with very different meanings).
// - Each section can specify a `positions` whitelist. Players whose position
//   isn't in the list are filtered out of that section. This stops e.g. a WR
//   who made one tackle from showing up in the Defense table.
//
// All names verified against /api/debug-player output for at least one player
// per league.

export type Column = {
  category: string;       // ESPN response category (e.g. "passing", "defensive")
  name: string;           // exact camelCase machine name from ESPN
  label: string;
  format?: "avg" | "pct" | "rate2" | "decimal1" | "count" | "raw";
};

export type Section = {
  id: string;
  label: string;
  qualifier: { category: string; name: string };  // qualifier stat for inclusion
  positions?: string[];   // if set, only players with these position abbreviations appear
  defaultSort: { column: string; dir: "asc" | "desc" };  // matches a column.name
  columns: Column[];
};

// Position groups
const MLB_BATTERS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH", "IF", "UT"];
const MLB_STARTERS = ["SP"];
const MLB_RELIEVERS = ["RP", "CL", "P"];

const NFL_QB = ["QB"];
const NFL_RB = ["RB", "FB", "HB"];
const NFL_RECEIVERS = ["WR", "TE"];
const NFL_RUSHRECV = [...NFL_RB, ...NFL_RECEIVERS, "QB"]; // QBs do rush
const NFL_DEFENSE = [
  "DE", "DT", "NT", "DL",
  "LB", "ILB", "OLB", "MLB",
  "CB", "S", "FS", "SS", "DB",
];
const NFL_KICKER = ["K", "PK"];

const NHL_SKATER_POS = ["C", "LW", "RW", "L", "R", "D", "F"];
const NHL_GOALIE_POS = ["G"];

export const SECTIONS_BY_LEAGUE: Record<string, Section[]> = {
  mlb: [
    {
      id: "batting",
      label: "Batting",
      qualifier: { category: "batting", name: "atBats" },
      positions: MLB_BATTERS,
      defaultSort: { column: "avg", dir: "desc" },
      columns: [
        { category: "batting", name: "gamesPlayed", label: "G", format: "count" },
        { category: "batting", name: "atBats", label: "AB", format: "count" },
        { category: "batting", name: "runs", label: "R", format: "count" },
        { category: "batting", name: "hits", label: "H", format: "count" },
        { category: "batting", name: "doubles", label: "2B", format: "count" },
        { category: "batting", name: "triples", label: "3B", format: "count" },
        { category: "batting", name: "homeRuns", label: "HR", format: "count" },
        { category: "batting", name: "RBIs", label: "RBI", format: "count" },
        { category: "batting", name: "stolenBases", label: "SB", format: "count" },
        { category: "batting", name: "walks", label: "BB", format: "count" },
        { category: "batting", name: "strikeouts", label: "SO", format: "count" },
        { category: "batting", name: "avg", label: "AVG", format: "avg" },
        { category: "batting", name: "onBasePct", label: "OBP", format: "avg" },
        { category: "batting", name: "slugAvg", label: "SLG", format: "avg" },
        { category: "batting", name: "OPS", label: "OPS", format: "avg" },
      ],
    },
    {
      id: "starters",
      label: "Starting Pitchers",
      qualifier: { category: "pitching", name: "innings" },
      positions: MLB_STARTERS,
      defaultSort: { column: "ERA", dir: "asc" },
      columns: [
        { category: "pitching", name: "gamesPlayed", label: "G", format: "count" },
        { category: "pitching", name: "gamesStarted", label: "GS", format: "count" },
        { category: "pitching", name: "wins", label: "W", format: "count" },
        { category: "pitching", name: "losses", label: "L", format: "count" },
        { category: "pitching", name: "innings", label: "IP", format: "decimal1" },
        { category: "pitching", name: "hits", label: "H", format: "count" },
        { category: "pitching", name: "earnedRuns", label: "ER", format: "count" },
        { category: "pitching", name: "homeRuns", label: "HR", format: "count" },
        { category: "pitching", name: "walks", label: "BB", format: "count" },
        { category: "pitching", name: "strikeouts", label: "K", format: "count" },
        { category: "pitching", name: "ERA", label: "ERA", format: "rate2" },
        { category: "pitching", name: "WHIP", label: "WHIP", format: "rate2" },
      ],
    },
    {
      id: "relievers",
      label: "Relief Pitchers",
      qualifier: { category: "pitching", name: "innings" },
      positions: MLB_RELIEVERS,
      defaultSort: { column: "ERA", dir: "asc" },
      columns: [
        { category: "pitching", name: "gamesPlayed", label: "G", format: "count" },
        { category: "pitching", name: "wins", label: "W", format: "count" },
        { category: "pitching", name: "losses", label: "L", format: "count" },
        { category: "pitching", name: "saves", label: "SV", format: "count" },
        { category: "pitching", name: "holds", label: "HLD", format: "count" },
        { category: "pitching", name: "innings", label: "IP", format: "decimal1" },
        { category: "pitching", name: "hits", label: "H", format: "count" },
        { category: "pitching", name: "earnedRuns", label: "ER", format: "count" },
        { category: "pitching", name: "walks", label: "BB", format: "count" },
        { category: "pitching", name: "strikeouts", label: "K", format: "count" },
        { category: "pitching", name: "ERA", label: "ERA", format: "rate2" },
        { category: "pitching", name: "WHIP", label: "WHIP", format: "rate2" },
      ],
    },
  ],
  nfl: [
    {
      id: "passing",
      label: "Passing",
      qualifier: { category: "passing", name: "passingYards" },
      positions: NFL_QB,
      defaultSort: { column: "passingYards", dir: "desc" },
      columns: [
        { category: "passing", name: "completions", label: "CMP", format: "count" },
        { category: "passing", name: "passingAttempts", label: "ATT", format: "count" },
        { category: "passing", name: "completionPct", label: "CMP%", format: "pct" },
        { category: "passing", name: "passingYards", label: "YDS", format: "count" },
        { category: "passing", name: "yardsPerPassAttempt", label: "Y/A", format: "decimal1" },
        { category: "passing", name: "passingTouchdowns", label: "TD", format: "count" },
        { category: "passing", name: "interceptions", label: "INT", format: "count" },
        { category: "passing", name: "longPassing", label: "LNG", format: "count" },
        { category: "passing", name: "QBRating", label: "RTG", format: "decimal1" },
      ],
    },
    {
      id: "rushing",
      label: "Rushing",
      qualifier: { category: "rushing", name: "rushingYards" },
      positions: NFL_RUSHRECV,
      defaultSort: { column: "rushingYards", dir: "desc" },
      columns: [
        { category: "rushing", name: "rushingAttempts", label: "ATT", format: "count" },
        { category: "rushing", name: "rushingYards", label: "YDS", format: "count" },
        { category: "rushing", name: "yardsPerRushAttempt", label: "AVG", format: "decimal1" },
        { category: "rushing", name: "rushingTouchdowns", label: "TD", format: "count" },
        { category: "rushing", name: "longRushing", label: "LNG", format: "count" },
        { category: "rushing", name: "rushingFumbles", label: "FUM", format: "count" },
      ],
    },
    {
      id: "receiving",
      label: "Receiving",
      qualifier: { category: "receiving", name: "receivingYards" },
      positions: NFL_RECEIVERS,
      defaultSort: { column: "receivingYards", dir: "desc" },
      columns: [
        { category: "receiving", name: "receptions", label: "REC", format: "count" },
        { category: "receiving", name: "receivingTargets", label: "TGT", format: "count" },
        { category: "receiving", name: "receivingYards", label: "YDS", format: "count" },
        { category: "receiving", name: "yardsPerReception", label: "AVG", format: "decimal1" },
        { category: "receiving", name: "receivingTouchdowns", label: "TD", format: "count" },
        { category: "receiving", name: "longReception", label: "LNG", format: "count" },
      ],
    },
    {
      id: "defense",
      label: "Defense",
      qualifier: { category: "defensive", name: "totalTackles" },
      positions: NFL_DEFENSE,
      defaultSort: { column: "totalTackles", dir: "desc" },
      columns: [
        { category: "defensive", name: "totalTackles", label: "TKL", format: "count" },
        { category: "defensive", name: "soloTackles", label: "SOLO", format: "count" },
        { category: "defensive", name: "assistTackles", label: "AST", format: "count" },
        { category: "defensive", name: "sacks", label: "SCK", format: "decimal1" },
        { category: "defensive", name: "tacklesForLoss", label: "TFL", format: "count" },
        // Defender INTs live in defensiveInterceptions, not defensive — namespace fixes the collision
        { category: "defensiveInterceptions", name: "interceptions", label: "INT", format: "count" },
        { category: "defensive", name: "passesDefended", label: "PD", format: "count" },
        // FF and FR for defenders are in `general`, not `defensive` — confirmed from debug
        { category: "general", name: "fumblesForced", label: "FF", format: "count" },
        { category: "general", name: "fumblesRecovered", label: "FR", format: "count" },
      ],
    },
    {
      id: "kicking",
      label: "Kicking",
      qualifier: { category: "scoring", name: "fieldGoals" },
      positions: NFL_KICKER,
      defaultSort: { column: "fieldGoals", dir: "desc" },
      columns: [
        { category: "scoring", name: "fieldGoals", label: "FGM", format: "count" },
        { category: "scoring", name: "kickExtraPointsMade", label: "XPM", format: "count" },
        { category: "scoring", name: "totalPoints", label: "PTS", format: "count" },
      ],
    },
  ],
  nba: [
    {
      // Per-game stats. avg* names confirmed from debug (avgPoints, avgRebounds, etc.)
      id: "all",
      label: "Players",
      qualifier: { category: "general", name: "gamesPlayed" },
      defaultSort: { column: "avgPoints", dir: "desc" },
      columns: [
        { category: "general", name: "gamesPlayed", label: "GP", format: "count" },
        { category: "general", name: "avgMinutes", label: "MIN", format: "decimal1" },
        { category: "offensive", name: "avgPoints", label: "PTS", format: "decimal1" },
        { category: "general", name: "avgRebounds", label: "REB", format: "decimal1" },
        { category: "offensive", name: "avgAssists", label: "AST", format: "decimal1" },
        { category: "defensive", name: "avgSteals", label: "STL", format: "decimal1" },
        { category: "defensive", name: "avgBlocks", label: "BLK", format: "decimal1" },
        { category: "offensive", name: "avgTurnovers", label: "TO", format: "decimal1" },
        { category: "offensive", name: "fieldGoalPct", label: "FG%", format: "pct" },
        { category: "offensive", name: "threePointPct", label: "3P%", format: "pct" },
        { category: "offensive", name: "freeThrowPct", label: "FT%", format: "pct" },
      ],
    },
  ],
  nhl: [
    {
      id: "skaters",
      label: "Skaters",
      qualifier: { category: "general", name: "games" },
      positions: NHL_SKATER_POS,
      defaultSort: { column: "points", dir: "desc" },
      columns: [
        { category: "general", name: "games", label: "GP", format: "count" },
        { category: "offensive", name: "goals", label: "G", format: "count" },
        { category: "offensive", name: "assists", label: "A", format: "count" },
        { category: "offensive", name: "points", label: "P", format: "count" },
        { category: "general", name: "plusMinus", label: "+/-", format: "count" },
        { category: "penalties", name: "penaltyMinutes", label: "PIM", format: "count" },
        // SOG = shotsTotal, confirmed
        { category: "offensive", name: "shotsTotal", label: "SOG", format: "count" },
        { category: "offensive", name: "shootingPct", label: "S%", format: "pct" },
        { category: "offensive", name: "powerPlayGoals", label: "PPG", format: "count" },
      ],
    },
    {
      id: "goalies",
      label: "Goalies",
      qualifier: { category: "defensive", name: "saves" },
      positions: NHL_GOALIE_POS,
      defaultSort: { column: "savePct", dir: "desc" },
      columns: [
        { category: "general", name: "games", label: "GP", format: "count" },
        { category: "general", name: "wins", label: "W", format: "count" },
        { category: "general", name: "losses", label: "L", format: "count" },
        { category: "defensive", name: "overtimeLosses", label: "OTL", format: "count" },
        { category: "defensive", name: "saves", label: "SV", format: "count" },
        { category: "defensive", name: "shotsAgainst", label: "SA", format: "count" },
        { category: "defensive", name: "savePct", label: "SV%", format: "avg" },
        { category: "defensive", name: "avgGoalsAgainst", label: "GAA", format: "rate2" },
        { category: "defensive", name: "shutouts", label: "SO", format: "count" },
      ],
    },
  ],
};

// Set of category.name keys we want to extract per league. Used by /api/players
// to keep the per-player payload compact.
export function relevantStatKeys(league: string): Set<string> {
  const sections = SECTIONS_BY_LEAGUE[league] || [];
  const set = new Set<string>();
  for (const sec of sections) {
    for (const col of sec.columns) set.add(`${col.category}.${col.name}`);
    set.add(`${sec.qualifier.category}.${sec.qualifier.name}`);
  }
  return set;
}
