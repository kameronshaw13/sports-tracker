type League = "mlb" | "nfl" | "nba" | "nhl" | "cfb" | "cbb";

type EspnGame = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  home?: any;
  away?: any;
  status?: any;
};

type NormalizedOdds = {
  awayMoneyLine?: string | null;
  homeMoneyLine?: string | null;
  overUnder?: string | null;
  overOdds?: string | null;
  underOdds?: string | null;
  awaySpread?: string | null;
  homeSpread?: string | null;
  awaySpreadOdds?: string | null;
  homeSpreadOdds?: string | null;
  details?: string | null;
  source?: "oddsapi";
};

const ODDS_SPORT_KEYS: Record<League, string> = {
  mlb: "baseball_mlb",
  nfl: "americanfootball_nfl",
  nba: "basketball_nba",
  nhl: "icehockey_nhl",
  cfb: "americanfootball_ncaaf",
  cbb: "basketball_ncaab",
};

const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports";
const ODDS_CACHE_TTL_MS = 5 * 60 * 1000;
const oddsApiRawCache = new Map<string, { expires: number; data: any[] }>();

function normalizeName(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|fc|sc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamTokens(team: any): string[] {
  return [
    team?.name,
    team?.displayName,
    team?.shortDisplayName,
    team?.short,
    team?.abbr,
    team?.abbreviation,
    team?.team?.displayName,
    team?.team?.shortDisplayName,
    team?.team?.name,
    team?.team?.abbreviation,
  ]
    .map(normalizeName)
    .filter(Boolean);
}

function teamMatches(oddsName: string, team: any): boolean {
  const odds = normalizeName(oddsName);
  if (!odds) return false;
  return teamTokens(team).some((token) => {
    if (!token) return false;
    return odds === token || odds.includes(token) || token.includes(odds);
  });
}

function formatAmerican(value: any): string | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return null;
  return num > 0 ? `+${Math.round(num)}` : `${Math.round(num)}`;
}

function formatPoint(value: any): string | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  const display = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace(/\.0$/, "");
  if (num === 0) return "0";
  return `${num > 0 ? "+" : "-"}${display}`;
}

function formatTotal(value: any): string | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, "");
}

function dateWindow(dateParam?: string | null) {
  if (!dateParam || !/^\d{8}$/.test(dateParam)) return {};
  const y = Number(dateParam.slice(0, 4));
  const m = Number(dateParam.slice(4, 6));
  const d = Number(dateParam.slice(6, 8));
  const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const to = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return {
    commenceTimeFrom: from.toISOString().replace(/\.\d{3}Z$/, "Z"),
    commenceTimeTo: to.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

function gameTimeClose(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return true;
  return Math.abs(ta - tb) <= 1000 * 60 * 60 * 14;
}

function pickBookmaker(bookmakers: any[]) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;
  const preferred = ["draftkings", "fanduel", "betmgm", "caesars", "espnbet", "betrivers", "pointsbetus"];
  return preferred.map((key) => bookmakers.find((b) => String(b?.key || "").toLowerCase() === key)).find(Boolean) || bookmakers[0];
}

function market(bookmaker: any, key: string) {
  return (bookmaker?.markets || []).find((m: any) => String(m?.key || "").toLowerCase() === key);
}

function outcomeForTeam(marketData: any, team: any) {
  return (marketData?.outcomes || []).find((outcome: any) => teamMatches(outcome?.name, team));
}

function totalOutcome(marketData: any, label: "Over" | "Under") {
  return (marketData?.outcomes || []).find((outcome: any) => String(outcome?.name || "").toLowerCase() === label.toLowerCase());
}

function normalizeOddsEvent(oddsGame: any, espnGame: EspnGame): NormalizedOdds | null {
  const bookmaker = pickBookmaker(oddsGame?.bookmakers || []);
  if (!bookmaker) return null;

  const h2h = market(bookmaker, "h2h");
  const spreads = market(bookmaker, "spreads");
  const totals = market(bookmaker, "totals");

  const awayMl = outcomeForTeam(h2h, espnGame.away);
  const homeMl = outcomeForTeam(h2h, espnGame.home);
  const awaySpread = outcomeForTeam(spreads, espnGame.away);
  const homeSpread = outcomeForTeam(spreads, espnGame.home);
  const over = totalOutcome(totals, "Over");
  const under = totalOutcome(totals, "Under");
  const total = formatTotal(over?.point ?? under?.point);

  const normalized: NormalizedOdds = {
    awayMoneyLine: formatAmerican(awayMl?.price),
    homeMoneyLine: formatAmerican(homeMl?.price),
    awaySpread: formatPoint(awaySpread?.point),
    homeSpread: formatPoint(homeSpread?.point),
    awaySpreadOdds: formatAmerican(awaySpread?.price),
    homeSpreadOdds: formatAmerican(homeSpread?.price),
    overUnder: total ? `o${total}` : null,
    overOdds: formatAmerican(over?.price),
    underOdds: formatAmerican(under?.price),
    details: bookmaker?.title ? `Odds from ${bookmaker.title}` : "Odds from The Odds API",
    source: "oddsapi",
  };

  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function matchOddsGame(oddsGames: any[], espnGame: EspnGame) {
  return oddsGames.find((oddsGame) => {
    if (!gameTimeClose(oddsGame?.commence_time, espnGame.date)) return false;
    const awayMatches = teamMatches(oddsGame?.away_team, espnGame.away);
    const homeMatches = teamMatches(oddsGame?.home_team, espnGame.home);
    return awayMatches && homeMatches;
  });
}

export async function getOddsApiOddsForGames(league: string, dateParam: string | null | undefined, games: EspnGame[]) {
  const apiKey = process.env.THE_ODDS_API_KEY;
  const sport = ODDS_SPORT_KEYS[league as League];
  const pregameGames = games.filter((game) => String(game?.status?.state || "") === "pre");
  if (!apiKey || !sport || !pregameGames.length) return new Map<string, NormalizedOdds>();

  const window = dateWindow(dateParam);
  const params = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    dateFormat: "iso",
  });
  if (window.commenceTimeFrom) params.set("commenceTimeFrom", window.commenceTimeFrom);
  if (window.commenceTimeTo) params.set("commenceTimeTo", window.commenceTimeTo);
  const cacheKey = `${sport}:${window.commenceTimeFrom || "all"}:${window.commenceTimeTo || "all"}`;

  try {
    const cached = oddsApiRawCache.get(cacheKey);
    let oddsGames = cached && cached.expires > Date.now() ? cached.data : null;
    if (!oddsGames) {
      const res = await fetch(`${ODDS_API_BASE}/${sport}/odds?${params.toString()}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) return new Map<string, NormalizedOdds>();
      oddsGames = await res.json();
      oddsApiRawCache.set(cacheKey, { expires: Date.now() + ODDS_CACHE_TTL_MS, data: oddsGames });
    }
    const out = new Map<string, NormalizedOdds>();
    for (const game of pregameGames) {
      if (!game?.id) continue;
      const match = matchOddsGame(oddsGames, game);
      if (!match) continue;
      const normalized = normalizeOddsEvent(match, game);
      if (normalized) out.set(String(game.id), normalized);
    }
    return out;
  } catch {
    return new Map<string, NormalizedOdds>();
  }
}

export function mergeOdds(primary: any, fallback: any) {
  if (!primary) return fallback || null;
  if (!fallback) return primary;
  return {
    ...primary,
    ...Object.fromEntries(Object.entries(fallback).filter(([, value]) => value != null && value !== "")),
  };
}
