import { NextRequest, NextResponse } from "next/server";
import { currentSeasonYear } from "@/lib/espn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";
const CORE_API = "https://sports.core.api.espn.com/v2/sports";
const MLB_STATSAPI = "https://statsapi.mlb.com/api/v1";

const PATHS: Record<string, { sport: string; league: string }> = {
  mlb: { sport: "baseball", league: "mlb" },
  nfl: { sport: "football", league: "nfl" },
  nba: { sport: "basketball", league: "nba" },
  nhl: { sport: "hockey", league: "nhl" },
  cfb: { sport: "football", league: "college-football" },
  cbb: { sport: "basketball", league: "mens-college-basketball" },
};

type FlatMap = Record<string, string>;

type StatCell = { label: string; value: string };

type GameLogRow = { id: string; date: string; opponent: string; stats: StatCell[] };

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  return res.json();
}
function espnPath(league: string) { const p = PATHS[league]; return `${p.sport}/${p.league}`; }
function corePath(league: string) { const p = PATHS[league]; return `${p.sport}/leagues/${p.league}`; }

function pretty(name: string) {
  return String(name).replace(/Pct$/," %").replace(/([A-Z])/g," $1").replace(/^./,(c)=>c.toUpperCase()).trim();
}
function statValue(v: any) { return v?.displayValue ?? v?.value ?? (v ?? "—"); }
function flatSet(map: FlatMap, key: string, v: any) {
  const val = statValue(v);
  if (val !== undefined && val !== null && val !== "") map[key] = String(val);
}
function flatGet(map: FlatMap, keys: string[]) {
  for (const key of keys) {
    const v = map[key];
    if (v != null && v !== "" && v !== "—") return String(v);
  }
  return "—";
}
function hasAny(map: FlatMap, keys: string[]) {
  return keys.some((k) => map[k] != null && map[k] !== "" && map[k] !== "—");
}

function flattenEspnStatMap(data: any): FlatMap {
  const out: FlatMap = {};
  for (const cat of data?.splits?.categories || []) {
    const catName = String(cat?.name || "");
    for (const s of cat?.stats || []) {
      if (!catName || !s?.name) continue;
      flatSet(out, `${catName}.${s.name}`, s);
      flatSet(out, s.name, s);
    }
  }
  return out;
}

function buildStatRow(cells: [string, string][]) {
  return cells.map(([label, value]) => ({ label, value })).filter((c) => c.value && c.value !== "—");
}

const QB_POS = new Set(["QB"]);
const RB_POS = new Set(["RB", "FB", "HB"]);
const REC_POS = new Set(["WR", "TE"]);
const DEF_POS = new Set(["DE", "DT", "NT", "DL", "LB", "ILB", "OLB", "MLB", "CB", "S", "FS", "SS", "DB"]);
const K_POS = new Set(["K", "PK", "P"]);
const GOALIE_POS = new Set(["G"]);
const PITCHER_POS = new Set(["P", "SP", "RP", "CP", "CL"]);

function pickPositionRow(league: string, position: string | undefined, map: FlatMap): StatCell[] {
  const pos = String(position || "").toUpperCase();
  if (league === "mlb") {
    const isPitcher = PITCHER_POS.has(pos) || hasAny(map, ["pitching.ERA", "pitching.WHIP", "ERA", "WHIP"]);
    return isPitcher
      ? buildStatRow([
          ["W", flatGet(map, ["pitching.wins", "wins"])],
          ["L", flatGet(map, ["pitching.losses", "losses"])],
          ["SV", flatGet(map, ["pitching.saves", "saves"])],
          ["IP", flatGet(map, ["pitching.innings", "innings"])],
          ["H", flatGet(map, ["pitching.hits", "hits"])],
          ["ER", flatGet(map, ["pitching.earnedRuns", "earnedRuns"])],
          ["BB", flatGet(map, ["pitching.walks", "walks"])],
          ["K", flatGet(map, ["pitching.strikeouts", "strikeouts"])],
          ["ERA", flatGet(map, ["pitching.ERA", "ERA"])],
          ["WHIP", flatGet(map, ["pitching.WHIP", "WHIP"])],
        ])
      : buildStatRow([
          ["G", flatGet(map, ["batting.gamesPlayed", "gamesPlayed"])],
          ["AB", flatGet(map, ["batting.atBats", "atBats"])],
          ["R", flatGet(map, ["batting.runs", "runs"])],
          ["H", flatGet(map, ["batting.hits", "hits"])],
          ["HR", flatGet(map, ["batting.homeRuns", "homeRuns"])],
          ["RBI", flatGet(map, ["batting.RBIs", "RBIs", "rbi"])],
          ["SB", flatGet(map, ["batting.stolenBases", "stolenBases"])],
          ["AVG", flatGet(map, ["batting.avg", "avg"])],
          ["OBP", flatGet(map, ["batting.onBasePct", "onBasePct", "obp"])],
          ["SLG", flatGet(map, ["batting.slugAvg", "slugAvg", "slg"])],
          ["OPS", flatGet(map, ["batting.OPS", "OPS", "ops"])],
        ]);
  }

  if (league === "nba" || league === "cbb") {
    return buildStatRow([
      ["PTS/G", flatGet(map, ["offensive.avgPoints", "pointsPerGame", "avgPoints"])],
      ["AST/G", flatGet(map, ["offensive.avgAssists", "assistsPerGame", "avgAssists"])],
      ["REB/G", flatGet(map, ["general.avgRebounds", "reboundsPerGame", "avgRebounds"])],
      ["BLK/G", flatGet(map, ["defensive.avgBlocks", "blocksPerGame", "avgBlocks"])],
      ["STL/G", flatGet(map, ["defensive.avgSteals", "stealsPerGame", "avgSteals"])],
      ["FG%", flatGet(map, ["offensive.fieldGoalPct", "fieldGoalPct"])],
      ["3P%", flatGet(map, ["offensive.threePointPct", "threePointPct"])],
      ["FT%", flatGet(map, ["offensive.freeThrowPct", "freeThrowPct"])],
    ]);
  }

  if (league === "nhl") {
    const isGoalie = GOALIE_POS.has(pos) || hasAny(map, ["defensive.saves", "saves", "defensive.savePct", "savePct"]);
    return isGoalie
      ? buildStatRow([
          ["GP", flatGet(map, ["general.games", "gamesPlayed", "games"])],
          ["W", flatGet(map, ["general.wins", "wins"])],
          ["L", flatGet(map, ["general.losses", "losses"])],
          ["SV", flatGet(map, ["defensive.saves", "saves"])],
          ["SA", flatGet(map, ["defensive.shotsAgainst", "shotsAgainst"])],
          ["SV%", flatGet(map, ["defensive.savePct", "savePct"])],
          ["GAA", flatGet(map, ["defensive.avgGoalsAgainst", "goalsAgainstAverage", "avgGoalsAgainst"])],
          ["SO", flatGet(map, ["defensive.shutouts", "shutouts"])],
        ])
      : buildStatRow([
          ["GP", flatGet(map, ["general.games", "gamesPlayed", "games"])],
          ["G", flatGet(map, ["offensive.goals", "goals"])],
          ["A", flatGet(map, ["offensive.assists", "assists"])],
          ["P", flatGet(map, ["offensive.points", "points"])],
          ["+/-", flatGet(map, ["general.plusMinus", "plusMinus"])],
          ["SOG", flatGet(map, ["offensive.shotsTotal", "shots"])],
          ["PIM", flatGet(map, ["penalties.penaltyMinutes", "penaltyMinutes"])],
        ]);
  }

  if (league === "nfl" || league === "cfb") {
    if (QB_POS.has(pos)) {
      return buildStatRow([
        ["CMP", flatGet(map, ["passing.completions", "completions"])],
        ["ATT", flatGet(map, ["passing.passingAttempts", "passingAttempts"])],
        ["CMP%", flatGet(map, ["passing.completionPct", "completionPct"])],
        ["YDS", flatGet(map, ["passing.passingYards", "passingYards"])],
        ["TD", flatGet(map, ["passing.passingTouchdowns", "passingTouchdowns"])],
        ["INT", flatGet(map, ["passing.interceptions", "interceptions"])],
        ["RTG", flatGet(map, ["passing.QBRating", "QBRating"])],
        ["RUSH YDS", flatGet(map, ["rushing.rushingYards", "rushingYards"])],
        ["RUSH TD", flatGet(map, ["rushing.rushingTouchdowns", "rushingTouchdowns"])],
      ]);
    }
    if (RB_POS.has(pos)) {
      return buildStatRow([
        ["ATT", flatGet(map, ["rushing.rushingAttempts", "rushingAttempts"])],
        ["YDS", flatGet(map, ["rushing.rushingYards", "rushingYards"])],
        ["AVG", flatGet(map, ["rushing.yardsPerRushAttempt", "yardsPerRushAttempt"])],
        ["TD", flatGet(map, ["rushing.rushingTouchdowns", "rushingTouchdowns"])],
        ["LONG", flatGet(map, ["rushing.longRushing", "longRushing"])],
      ]);
    }
    if (REC_POS.has(pos)) {
      return buildStatRow([
        ["REC", flatGet(map, ["receiving.receptions", "receptions"])],
        ["TGT", flatGet(map, ["receiving.receivingTargets", "receivingTargets"])],
        ["YDS", flatGet(map, ["receiving.receivingYards", "receivingYards"])],
        ["AVG", flatGet(map, ["receiving.yardsPerReception", "yardsPerReception"])],
        ["TD", flatGet(map, ["receiving.receivingTouchdowns", "receivingTouchdowns"])],
      ]);
    }
    if (K_POS.has(pos)) {
      return buildStatRow([
        ["FGM", flatGet(map, ["scoring.fieldGoals", "fieldGoals"])],
        ["XPM", flatGet(map, ["scoring.kickExtraPointsMade", "kickExtraPointsMade"])],
        ["PTS", flatGet(map, ["scoring.totalPoints", "totalPoints"])],
      ]);
    }
    if (DEF_POS.has(pos) || hasAny(map, ["defensive.totalTackles", "totalTackles"])) {
      return buildStatRow([
        ["TKL", flatGet(map, ["defensive.totalTackles", "totalTackles"])],
        ["SOLO", flatGet(map, ["defensive.soloTackles", "soloTackles"])],
        ["AST", flatGet(map, ["defensive.assistTackles", "assistTackles"])],
        ["SCK", flatGet(map, ["defensive.sacks", "sacks"])],
        ["TFL", flatGet(map, ["defensive.tacklesForLoss", "tacklesForLoss"])],
        ["INT", flatGet(map, ["defensiveInterceptions.interceptions", "interceptions" ])],
        ["PD", flatGet(map, ["defensive.passesDefended", "passesDefended"])],
        ["FF", flatGet(map, ["general.fumblesForced", "fumblesForced"])],
        ["FR", flatGet(map, ["general.fumblesRecovered", "fumblesRecovered"])],
      ]);
    }
  }

  return buildStatRow(Object.entries(map).slice(0, 8).map(([k, v]) => [pretty(k.split(".").pop() || k), v]));
}

function flattenEspnGameLog(league: string, data: any): GameLogRow[] {
  const events = data?.events || data?.splits?.splits || [];
  if (!Array.isArray(events)) return [];
  return events.map((g: any) => {
    const raw = g.stats || g.stat || {};
    const stats = Array.isArray(raw)
      ? raw.slice(0, 8).map((x: any) => ({ label: pretty(x.name || x.displayName || "Stat"), value: String(statValue(x)) }))
      : Object.entries(raw).slice(0, 8).map(([k, v]: any) => ({ label: pretty(k), value: String(v) }));
    return {
      id: g.id || g.eventId || g.event?.id || `${g.date || ""}-${g.opponent?.id || ""}`,
      date: g.date || g.event?.date || g.gameDate,
      opponent: g.opponent?.abbreviation || g.opponent?.displayName || g.event?.shortName || "—",
      stats,
    };
  }).filter((r: any) => r.date && r.stats.length).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// MLB statsapi uses different stat-name conventions than ESPN's API:
//   ESPN: RBIs, walks, strikeouts, onBasePct, slugAvg, OPS, ERA, WHIP, innings
//   MLB:  rbi,  baseOnBalls, strikeOuts, obp,  slg,    ops, era, whip, inningsPitched
// /api/players (the team-level route) already maps these correctly via
// addMappedStat. We mirror the same translation here so that the
// position-aware lookups in pickPositionRow find values under the canonical
// names. Without this translation, MLB hitter stats showed empty AVG/OBP/
// SLG/OPS/RBI columns and pitcher stats showed empty ERA/WHIP/IP/K.
function setNumeric(map: FlatMap, key: string, raw: any) {
  if (raw == null || raw === "") return;
  map[key] = String(raw);
}

function mlbSeasonMap(data: any): { positionHint?: string; stats: FlatMap } {
  const map: FlatMap = {};
  let positionHint: string | undefined;
  for (const group of data?.stats || []) {
    const stat = group?.splits?.[0]?.stat || {};
    const groupName = String(group.group?.displayName || group.type?.displayName || "").toLowerCase();
    const isPitching = /pitch/i.test(groupName);

    if (isPitching) {
      positionHint = "P";
      setNumeric(map, "pitching.gamesPlayed", stat.gamesPlayed);
      setNumeric(map, "pitching.gamesStarted", stat.gamesStarted);
      setNumeric(map, "pitching.wins", stat.wins);
      setNumeric(map, "pitching.losses", stat.losses);
      setNumeric(map, "pitching.saves", stat.saves);
      setNumeric(map, "pitching.holds", stat.holds);
      setNumeric(map, "pitching.innings", stat.inningsPitched);
      setNumeric(map, "pitching.hits", stat.hits);
      setNumeric(map, "pitching.runs", stat.runs);
      setNumeric(map, "pitching.earnedRuns", stat.earnedRuns);
      setNumeric(map, "pitching.homeRuns", stat.homeRuns);
      setNumeric(map, "pitching.walks", stat.baseOnBalls ?? stat.walks);
      setNumeric(map, "pitching.strikeouts", stat.strikeOuts ?? stat.strikeouts);
      setNumeric(map, "pitching.ERA", stat.era);
      setNumeric(map, "pitching.WHIP", stat.whip);
    } else {
      setNumeric(map, "batting.gamesPlayed", stat.gamesPlayed);
      setNumeric(map, "batting.atBats", stat.atBats);
      setNumeric(map, "batting.runs", stat.runs);
      setNumeric(map, "batting.hits", stat.hits);
      setNumeric(map, "batting.doubles", stat.doubles);
      setNumeric(map, "batting.triples", stat.triples);
      setNumeric(map, "batting.homeRuns", stat.homeRuns);
      setNumeric(map, "batting.RBIs", stat.rbi ?? stat.runsBattedIn);
      setNumeric(map, "batting.stolenBases", stat.stolenBases);
      setNumeric(map, "batting.walks", stat.baseOnBalls ?? stat.walks);
      setNumeric(map, "batting.strikeouts", stat.strikeOuts ?? stat.strikeouts);
      setNumeric(map, "batting.avg", stat.avg);
      setNumeric(map, "batting.onBasePct", stat.obp);
      setNumeric(map, "batting.slugAvg", stat.slg);
      setNumeric(map, "batting.OPS", stat.ops);
    }
  }
  return { positionHint, stats: map };
}

// Position-aware MLB game log. Picks columns appropriate for hitters vs.
// pitchers, using the canonical column labels everyone is used to. For two-
// way players (Ohtani-style) we render whichever group matches the player's
// primary position to keep the column set consistent across rows.
function flattenMlbGameLog(data: any, position?: string | null): GameLogRow[] {
  const isPitcher = /^P$|^SP$|^RP$|^CP$|^CL$|pitcher/i.test(String(position || ""));

  const rows: GameLogRow[] = [];
  for (const group of data?.stats || []) {
    const groupName = String(group.group?.displayName || group.type?.displayName || "").toLowerCase();
    const isPitchingGroup = /pitch/i.test(groupName);
    // If we know the player's role, only render rows from the matching group.
    // If we don't, fall back to whichever group has data.
    if (position && isPitcher !== isPitchingGroup) continue;

    for (const s of group.splits || []) {
      const stat = s.stat || {};
      const cells: StatCell[] = isPitchingGroup
        ? [
            { label: "IP",  value: String(stat.inningsPitched ?? "—") },
            { label: "H",   value: String(stat.hits ?? "—") },
            { label: "R",   value: String(stat.runs ?? "—") },
            { label: "ER",  value: String(stat.earnedRuns ?? "—") },
            { label: "BB",  value: String(stat.baseOnBalls ?? "—") },
            { label: "K",   value: String(stat.strikeOuts ?? "—") },
            { label: "HR",  value: String(stat.homeRuns ?? "—") },
            { label: "ERA", value: String(stat.era ?? "—") },
          ]
        : [
            { label: "AB",  value: String(stat.atBats ?? "—") },
            { label: "R",   value: String(stat.runs ?? "—") },
            { label: "H",   value: String(stat.hits ?? "—") },
            { label: "2B",  value: String(stat.doubles ?? "—") },
            { label: "HR",  value: String(stat.homeRuns ?? "—") },
            { label: "RBI", value: String(stat.rbi ?? "—") },
            { label: "BB",  value: String(stat.baseOnBalls ?? "—") },
            { label: "SO",  value: String(stat.strikeOuts ?? "—") },
            { label: "AVG", value: String(stat.avg ?? "—") },
          ];
      const id = `${s.date || ""}-${s.opponent?.id || ""}-${groupName}`;
      rows.push({
        id,
        date: s.date,
        opponent: s.opponent?.abbreviation || s.opponent?.name || s.opponent?.displayName || "—",
        stats: cells.filter((c) => c.value && c.value !== "—" && c.value !== "undefined"),
      });
    }
  }
  return rows
    .filter((r) => r.date && r.stats.length)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// MLB statsapi takes its own numeric IDs which are NOT the same as ESPN's
// athlete IDs. The boxscore + plays routes are now enriched server-side to
// hand the client an MLB ID for MLB players, but if an old client cached an
// ESPN ID — or if the roster lookup misses — fall back to searching MLB
// statsapi by name. This is what stops "Player ${id}" placeholder cards
// when you tap a top-performer or at-bat batter on the box score.
async function resolveMlbIdByName(name: string): Promise<string | null> {
  if (!name) return null;
  try {
    const url = `${MLB_STATSAPI}/people/search?names=${encodeURIComponent(name)}&active=true`;
    const data = await fetchJson(url);
    const candidates: any[] = data?.people || [];
    if (!candidates.length) return null;
    // Prefer exact full-name match, then fall through to first result.
    const target = name.toLowerCase().trim();
    const exact = candidates.find((p) => String(p?.fullName || "").toLowerCase() === target);
    const chosen = exact || candidates[0];
    return chosen?.id ? String(chosen.id) : null;
  } catch {
    return null;
  }
}

async function handleMlb(id: string, fallbackName: string) {
  const season = currentSeasonYear("mlb");

  // First attempt: assume `id` is a real MLB statsapi person ID.
  let resolvedId = id;
  let personRes = await Promise.resolve(null as any).then(() =>
    fetchJson(`${MLB_STATSAPI}/people/${resolvedId}?hydrate=currentTeam`).catch(() => null)
  );

  // If MLB statsapi didn't recognize the ID, try resolving by name. This
  // handles the case where an ESPN athlete ID slipped through.
  if ((!personRes || !personRes?.people?.length) && fallbackName) {
    const byName = await resolveMlbIdByName(fallbackName);
    if (byName && byName !== resolvedId) {
      resolvedId = byName;
      personRes = await fetchJson(`${MLB_STATSAPI}/people/${resolvedId}?hydrate=currentTeam`).catch(() => null);
    }
  }

  const [seasonRes, gameLogRes] = await Promise.allSettled([
    fetchJson(`${MLB_STATSAPI}/people/${resolvedId}/stats?stats=season&group=hitting,pitching&season=${season}&gameType=R`),
    fetchJson(`${MLB_STATSAPI}/people/${resolvedId}/stats?stats=gameLog&group=hitting,pitching&season=${season}&gameType=R`),
  ]);
  const person = personRes?.people?.[0] || null;
  const seasonData = seasonRes.status === "fulfilled" ? seasonRes.value : null;
  const gameLogData = gameLogRes.status === "fulfilled" ? gameLogRes.value : null;
  const { stats: map, positionHint } = mlbSeasonMap(seasonData);
  const position = person?.primaryPosition?.abbreviation || person?.primaryPosition?.name || positionHint || null;
  return {
    profile: {
      id: resolvedId,
      name: person?.fullName || fallbackName || `Player ${resolvedId}`,
      team: person?.currentTeam?.name || null,
      position,
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${resolvedId}/headshot/67/current`,
      bio: [person?.height, person?.weight ? `${person.weight} lbs` : null, person?.birthDate ? `Born ${person.birthDate}` : null].filter(Boolean).join(" · "),
    },
    stats: pickPositionRow("mlb", position || undefined, map),
    gameLog: flattenMlbGameLog(gameLogData, position),
  };
}

async function handleEspn(league: string, id: string, fallbackName: string) {
  const season = currentSeasonYear(league);
  const [profileRes, statsRes, logRes] = await Promise.allSettled([
    fetchJson(`${SITE_WEB_API}/${espnPath(league)}/athletes/${id}`),
    fetchJson(`${CORE_API}/${corePath(league)}/seasons/${season}/types/2/athletes/${id}/statistics`),
    fetchJson(`${SITE_WEB_API}/${espnPath(league)}/athletes/${id}/gamelog?season=${season}`),
  ]);
  const athlete = profileRes.status === "fulfilled" ? (profileRes.value?.athlete || profileRes.value) : null;
  const statsData = statsRes.status === "fulfilled" ? statsRes.value : null;
  const logData = logRes.status === "fulfilled" ? logRes.value : null;
  const headshot = athlete?.headshot?.href || athlete?.headshot || (/^\d+$/.test(id) ? `https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png` : null);
  const position = athlete?.position?.abbreviation || athlete?.position?.displayName || null;
  const flat = flattenEspnStatMap(statsData);
  return {
    profile: {
      id,
      name: athlete?.displayName || athlete?.fullName || athlete?.name || fallbackName || `Player ${id}`,
      team: athlete?.team?.displayName || athlete?.team?.name || null,
      position,
      headshot,
      bio: [athlete?.height, athlete?.weight, athlete?.age ? `Age ${athlete.age}` : null].filter(Boolean).join(" · "),
    },
    stats: pickPositionRow(league, position || undefined, flat),
    gameLog: flattenEspnGameLog(league, logData),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league") || "";
  const id = searchParams.get("id") || "";
  const fallbackName = searchParams.get("name") || "";
  if (!PATHS[league] || !id) return NextResponse.json({ error: "Missing league/id" }, { status: 400 });
  try {
    const data = league === "mlb" ? await handleMlb(id, fallbackName) : await handleEspn(league, id, fallbackName);
    return NextResponse.json({ league, id, ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Player fetch failed" }, { status: 500 });
  }
}