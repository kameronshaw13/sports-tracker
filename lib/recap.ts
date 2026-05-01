// Game recap engine. Pure functions — no fetching here.
// The /api/recap route gathers the inputs and calls buildRecap() to assemble
// the paragraphs. Keeping it pure means the wording is easy to iterate on
// without touching the network layer.

export type RecapTeam = {
  abbr: string;
  name: string;        // "Baltimore Orioles"
  short: string;       // "Orioles"
  score: number;
};

export type RecapLeader = {
  category: string;    // "passingYards", "battingAverage", "points", etc.
  shortName: string;   // "PASS YDS"
  player: string;      // "Justin Herbert"
  position?: string;
  displayValue: string; // "342 YDS, 3 TD"
};

export type RecapPastGame = {
  won: boolean;
  ourScore: number;
  theirScore: number;
  date: string;
};

export type RecapInput = {
  league: string;
  status: { detail: string; isOT: boolean };
  away: RecapTeam;
  home: RecapTeam;
  awayLeaders: RecapLeader[];   // top 2-3 from boxscore leaders for away team
  homeLeaders: RecapLeader[];
  // Each team's recent results, sorted oldest → newest. The most recent
  // entry IS this game (since the schedule includes completed games).
  awayRecent: RecapPastGame[];
  homeRecent: RecapPastGame[];
};

export type RecapTrend = {
  // High-level current streak (W3, L2, etc) including this game.
  currentStreak: { type: "W" | "L"; count: number } | null;
  // If this game snapped a 3+ game streak in the opposite direction.
  snappedStreak: { type: "W" | "L"; count: number } | null;
  // Last 10 record (or however many we have).
  lastN: { w: number; l: number; n: number };
  // Optional flavor: scoring trend over recent games for sports where it lands well
  scoringNote: string | null;
};

export type RecapOutput = {
  paragraphs: string[];
  awayTrend: RecapTrend;
  homeTrend: RecapTrend;
};

// --- streak math ---

function computeStreak(games: RecapPastGame[]): { type: "W" | "L"; count: number } | null {
  if (games.length === 0) return null;
  const last = games[games.length - 1];
  let count = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].won === last.won) count++;
    else break;
  }
  return { type: last.won ? "W" : "L", count };
}

// "Snapped" = this game flipped a streak of 3+ opposite-result games.
// e.g. team had lost 5 straight, then won today → snappedStreak {type: "L", count: 5}.
function computeSnappedStreak(
  games: RecapPastGame[]
): { type: "W" | "L"; count: number } | null {
  if (games.length < 4) return null;
  const last = games[games.length - 1];
  let count = 0;
  for (let i = games.length - 2; i >= 0; i--) {
    if (games[i].won !== last.won) count++;
    else break;
  }
  if (count >= 3) {
    return { type: last.won ? "L" : "W", count };
  }
  return null;
}

function computeLastN(games: RecapPastGame[], n = 10): { w: number; l: number; n: number } {
  const slice = games.slice(-n);
  const w = slice.filter((g) => g.won).length;
  return { w, l: slice.length - w, n: slice.length };
}

// "Scored 2 or fewer in 4 of their last 5" / "averaging 6+ runs over the last 5".
// Only fires for sports where it reads naturally (MLB runs, NHL goals,
// NBA points). NFL excluded — weekly cadence doesn't yield meaningful trends
// over 4-5 games.
function computeScoringNote(
  league: string,
  games: RecapPastGame[],
  teamWonThisGame: boolean
): string | null {
  if (league === "nfl") return null;
  if (games.length < 4) return null;

  const last5 = games.slice(-5);
  const ourTotal = last5.reduce((s, g) => s + g.ourScore, 0);
  const ourAvg = ourTotal / last5.length;
  const theirTotal = last5.reduce((s, g) => s + g.theirScore, 0);
  const theirAvg = theirTotal / last5.length;

  // Sport-specific thresholds
  const cold = league === "mlb" ? 2 : league === "nhl" ? 2 : 95;   // baseball runs / hockey goals / hoops points
  const hot = league === "mlb" ? 6 : league === "nhl" ? 5 : 115;
  const unitLabel = league === "mlb" ? "runs" : league === "nhl" ? "goals" : "points";

  const lowGames = last5.filter((g) => g.ourScore <= cold).length;
  const highGames = last5.filter((g) => g.ourScore >= hot).length;

  if (highGames >= 3) {
    return `They've scored ${hot}+ ${unitLabel} in ${highGames} of their last ${last5.length}.`;
  }
  if (lowGames >= 3) {
    return `They've been held to ${cold} or fewer ${unitLabel} in ${lowGames} of their last ${last5.length}.`;
  }

  // Defense angle (for the team that just won, sometimes more interesting)
  if (teamWonThisGame && league !== "nba") {
    const defLow = league === "mlb" ? 3 : 2;
    const defGames = last5.filter((g) => g.theirScore <= defLow).length;
    if (defGames >= 3) {
      const defLabel = league === "mlb" ? "runs" : "goals";
      return `Their pitching has held opponents to ${defLow} or fewer ${defLabel} in ${defGames} of the last ${last5.length}${league !== "mlb" ? " — that's the defense, not pitching" : ""}.`;
    }
  }

  return null;
}

function buildTrend(league: string, games: RecapPastGame[]): RecapTrend {
  if (games.length === 0) {
    return {
      currentStreak: null,
      snappedStreak: null,
      lastN: { w: 0, l: 0, n: 0 },
      scoringNote: null,
    };
  }
  const last = games[games.length - 1];
  return {
    currentStreak: computeStreak(games),
    snappedStreak: computeSnappedStreak(games),
    lastN: computeLastN(games, 10),
    scoringNote: computeScoringNote(league, games, last.won),
  };
}

// --- leader formatting ---

// Format a leader as a short clause: "Adley Rutschman (2-4, HR, 3 RBI)"
// or "Justin Herbert (24/35, 287 yards, 2 TDs)".
function formatLeader(l: RecapLeader): string {
  return `${l.player} (${l.displayValue})`;
}

// --- paragraph composition ---

function pickWinnerLoser(input: RecapInput): {
  winner: RecapTeam;
  loser: RecapTeam;
  winnerLeaders: RecapLeader[];
  loserLeaders: RecapLeader[];
  winnerTrend: RecapTrend;
  loserTrend: RecapTrend;
  awayWon: boolean;
} {
  const awayWon = input.away.score > input.home.score;
  return awayWon
    ? {
        winner: input.away,
        loser: input.home,
        winnerLeaders: input.awayLeaders,
        loserLeaders: input.homeLeaders,
        winnerTrend: buildTrend(input.league, input.awayRecent),
        loserTrend: buildTrend(input.league, input.homeRecent),
        awayWon,
      }
    : {
        winner: input.home,
        loser: input.away,
        winnerLeaders: input.homeLeaders,
        loserLeaders: input.awayLeaders,
        winnerTrend: buildTrend(input.league, input.homeRecent),
        loserTrend: buildTrend(input.league, input.awayRecent),
        awayWon,
      };
}

function trendSentence(team: RecapTeam, trend: RecapTrend, justWon: boolean): string {
  const recordPart =
    trend.lastN.n > 0
      ? ` They are ${trend.lastN.w}-${trend.lastN.l} in their last ${trend.lastN.n}.`
      : "";

  // Priorities, in order:
  // 1. Snapped a 3+ game opposite streak — most newsworthy
  // 2. Extending a 3+ game streak in this direction
  // 3. Just record + scoring note

  if (trend.snappedStreak && trend.snappedStreak.count >= 3) {
    if (justWon && trend.snappedStreak.type === "L") {
      return `${team.short} snap a ${trend.snappedStreak.count}-game losing streak.${recordPart}`;
    }
    if (!justWon && trend.snappedStreak.type === "W") {
      return `${team.short}' ${trend.snappedStreak.count}-game winning streak comes to an end.${recordPart}`;
    }
  }

  if (trend.currentStreak && trend.currentStreak.count >= 3) {
    if (justWon && trend.currentStreak.type === "W") {
      return `${team.short} extend their winning streak to ${trend.currentStreak.count} games.${recordPart}`;
    }
    if (!justWon && trend.currentStreak.type === "L") {
      return `${team.short} have now dropped ${trend.currentStreak.count} straight.${recordPart}`;
    }
  }

  // Default — just record + optional scoring note
  const base = justWon ? `${team.short} pick up the win.` : `${team.short} drop this one.`;
  const scoring = trend.scoringNote ? ` ${trend.scoringNote}` : "";
  return `${base}${recordPart}${scoring}`;
}

export function buildRecap(input: RecapInput): RecapOutput {
  const { winner, loser, winnerLeaders, loserLeaders, winnerTrend, loserTrend, awayWon } =
    pickWinnerLoser(input);

  const paragraphs: string[] = [];

  // ─── Paragraph 1: final score ───
  // "Final: Orioles 6, Yankees 3." or with OT "Final/OT: Kraken 4, Avalanche 3."
  const tag = input.status.isOT ? "Final/OT" : "Final";
  paragraphs.push(
    `${tag}: ${input.away.short} ${input.away.score}, ${input.home.short} ${input.home.score}.`
  );

  // ─── Paragraph 2: winner's top performers ───
  if (winnerLeaders.length > 0) {
    const top = winnerLeaders.slice(0, 2).map(formatLeader);
    if (top.length === 1) {
      paragraphs.push(`${winner.short} were paced by ${top[0]}.`);
    } else {
      paragraphs.push(`${winner.short} were paced by ${top[0]}, with ${top[1]} also contributing.`);
    }
  }

  // ─── Paragraph 3: loser's notable performance ───
  if (loserLeaders.length > 0) {
    const top = loserLeaders[0];
    paragraphs.push(`For ${loser.short}, ${formatLeader(top)} stood out in defeat.`);
  }

  // ─── Paragraph 4: trends ───
  // Combine both teams' trend sentences into one paragraph if both have something
  // notable to say, otherwise just the more interesting one.
  const winnerSentence = trendSentence(winner, winnerTrend, true);
  const loserSentence = trendSentence(loser, loserTrend, false);
  paragraphs.push(`${winnerSentence} ${loserSentence}`);

  return {
    paragraphs,
    awayTrend: awayWon ? winnerTrend : loserTrend,
    homeTrend: awayWon ? loserTrend : winnerTrend,
  };
}
