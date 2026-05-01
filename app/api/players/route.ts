// Players API
//
// MLB uses MLB.com's official StatsAPI for both player IDs/headshots and
// team-season stat lines. That fixes two issues ESPN causes for MLB:
//   1) injured/optioned players can be missing from ESPN's active roster feed
//   2) ESPN athlete IDs do not map cleanly to MLB.com headshots
//
// NFL/NBA/NHL still use the existing ESPN flow.

import { NextRequest, NextResponse } from "next/server";
import {
  getTeamRoster,
  getTeamPage,
  getTeamMeta,
  getSeasonTeamAthletes,
  getAthleteProfile,
  getAthleteStats,
  getAthleteStatsForTeam,
  getMlbFortyManRoster,
  getMlbHeadshotUrl,
  getMlbSeasonPlayerStats,
  getMlbPersonSeasonStats,
  getMlbTeamId,
  MlbSeasonPlayerStatLine,
} from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 1800;

type Stat = { value: number | null; displayValue: string };
type Player = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  primaryPosition?: string;
  pitchingRole?: "SP" | "RP";
  headshot?: string;
  hasStats: boolean;
  tradedIn?: boolean;
  tradedInDetail?: string;
  stats: Record<string, Stat>;
};

function parseAthletes(data: any): any[] {
  if (!data) return [];
  const top = data?.athletes;
  if (Array.isArray(top)) {
    if (top.length > 0 && Array.isArray(top[0]?.items)) {
      const out: any[] = [];
      for (const group of top) {
        if (Array.isArray(group?.items)) {
          out.push(...group.items.map((a: any) => ({ ...a, _group: group.position || group.label || null })));
        }
      }
      return out;
    }
    if (top.length > 0 && (top[0]?.fullName || top[0]?.displayName || top[0]?.id)) return top;
  }
  const teamAthletes = data?.team?.athletes;
  if (Array.isArray(teamAthletes)) {
    if (teamAthletes.length > 0 && Array.isArray(teamAthletes[0]?.items)) {
      const out: any[] = [];
      for (const group of teamAthletes) {
        if (Array.isArray(group?.items)) {
          out.push(...group.items.map((a: any) => ({ ...a, _group: group.position || group.label || null })));
        }
      }
      return out;
    }
    return teamAthletes;
  }
  return [];
}

function flattenStats(catData: any): { stats: Record<string, Stat>; hasAny: boolean } {
  const out: Record<string, Stat> = {};
  let hasAny = false;
  const categories = catData?.splits?.categories;
  if (!Array.isArray(categories)) return { stats: out, hasAny: false };
  for (const cat of categories) {
    const catName = cat?.name;
    if (!catName || !Array.isArray(cat?.stats)) continue;
    for (const s of cat.stats) {
      if (!s?.name) continue;
      const numeric = s.value != null && !isNaN(Number(s.value)) ? Number(s.value) : null;
      out[`${catName}.${s.name}`] = {
        value: numeric,
        displayValue: s.displayValue ?? (numeric != null ? String(numeric) : "—"),
      };
      if (numeric != null && numeric > 0) hasAny = true;
    }
  }
  return { stats: out, hasAny };
}

function detectTradeIn(catData: any, currentTeamAbbr: string): { detail: string } | null {
  const splits = catData?.splits?.splits;
  if (!Array.isArray(splits) || splits.length < 2) return null;
  const perTeam: { abbr: string; games: number }[] = [];
  for (const s of splits) {
    const abbr = String(s?.team?.abbreviation || s?.abbreviation || "").toUpperCase();
    if (!abbr) continue;
    const gamesStat = (s?.stats || []).find((x: any) => /^(games|gamesplayed|appearances)$/i.test(String(x?.name || "")));
    const games = gamesStat ? Number(gamesStat.value) || 0 : 0;
    perTeam.push({ abbr, games });
  }
  const current = currentTeamAbbr.toUpperCase();
  const others = perTeam.filter((p) => p.abbr && p.abbr !== current && p.games > 0);
  if (others.length === 0) return null;
  others.sort((a, b) => b.games - a.games);
  const top = others[0];
  return { detail: `${top.games} G with ${top.abbr}` };
}

function buildPlayer(
  league: string,
  a: any,
  statsResult: { stats: Record<string, Stat>; hasStats: boolean; tradedIn?: boolean; tradedInDetail?: string }
): Player | null {
  const id = String(a?.id || "");
  if (!id) return null;
  const name = a?.fullName || a?.displayName || a?.name;
  if (!name) return null;
  const explicitHeadshot = a?.headshot?.href || (typeof a?.headshot === "string" ? a.headshot : undefined);
  const fallbackHeadshot = /^\d+$/.test(id)
    ? `https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png`
    : undefined;
  return {
    id,
    name: String(name).trim(),
    jersey: a?.jersey ? String(a.jersey) : undefined,
    position: a?.position?.abbreviation || a?.position?.displayName || a?.position?.name || undefined,
    headshot: explicitHeadshot || fallbackHeadshot,
    hasStats: statsResult.hasStats,
    tradedIn: statsResult.tradedIn || undefined,
    tradedInDetail: statsResult.tradedInDetail,
    stats: statsResult.stats,
  };
}

async function fetchStatsForPlayer(
  league: string,
  athleteId: string,
  numericTeamId: string | null,
  teamAbbr: string
): Promise<{ stats: Record<string, Stat>; hasStats: boolean; tradedIn?: boolean; tradedInDetail?: string }> {
  if (numericTeamId) {
    const teamSpecific = await getAthleteStatsForTeam(league, athleteId, numericTeamId);
    if (teamSpecific) {
      const flat = flattenStats(teamSpecific);
      return { stats: flat.stats, hasStats: flat.hasAny };
    }
  }
  const consolidated = await getAthleteStats(league, athleteId);
  if (!consolidated) return { stats: {}, hasStats: false };
  const flat = flattenStats(consolidated);
  const trade = detectTradeIn(consolidated, teamAbbr);
  return {
    stats: flat.stats,
    hasStats: flat.hasAny,
    tradedIn: trade != null,
    tradedInDetail: trade?.detail,
  };
}

function statValue(raw: any): Stat {
  if (raw == null || raw === "" || raw === "-.---") return { value: null, displayValue: "—" };
  const displayValue = String(raw);
  const numeric = !isNaN(Number(displayValue)) ? Number(displayValue) : null;
  return { value: numeric, displayValue };
}

function addMappedStat(out: Record<string, Stat>, category: string, appName: string, raw: any) {
  out[`${category}.${appName}`] = statValue(raw);
}

function normalizeMlbPosition(line: MlbSeasonPlayerStatLine): string | undefined {
  const pos = String(line.positionAbbr || "").toUpperCase();
  if (pos === "TWP") return "DH";
  return pos || undefined;
}

function normalizeMlbPitchingRole(line: MlbSeasonPlayerStatLine): "SP" | "RP" {
  const gs = Number(line.stat?.gamesStarted || 0);
  return gs > 0 ? "SP" : "RP";
}

function isPitcherPosition(pos?: string): boolean {
  return ["P", "SP", "RP", "CP", "CL", "PITCHER", "STARTING PITCHER", "RELIEF PITCHER"].includes(
    String(pos || "").toUpperCase()
  );
}

function mergeMlbStatLine(player: Player, line: MlbSeasonPlayerStatLine) {
  const s = line.stat || {};
  if (line.group === "hitting") {
    addMappedStat(player.stats, "batting", "gamesPlayed", s.gamesPlayed);
    addMappedStat(player.stats, "batting", "atBats", s.atBats);
    addMappedStat(player.stats, "batting", "runs", s.runs);
    addMappedStat(player.stats, "batting", "hits", s.hits);
    addMappedStat(player.stats, "batting", "doubles", s.doubles);
    addMappedStat(player.stats, "batting", "triples", s.triples);
    addMappedStat(player.stats, "batting", "homeRuns", s.homeRuns);
    addMappedStat(player.stats, "batting", "RBIs", s.rbi ?? s.runsBattedIn);
    addMappedStat(player.stats, "batting", "stolenBases", s.stolenBases);
    addMappedStat(player.stats, "batting", "walks", s.baseOnBalls ?? s.walks);
    addMappedStat(player.stats, "batting", "strikeouts", s.strikeOuts ?? s.strikeouts);
    addMappedStat(player.stats, "batting", "avg", s.avg);
    addMappedStat(player.stats, "batting", "onBasePct", s.obp);
    addMappedStat(player.stats, "batting", "slugAvg", s.slg);
    addMappedStat(player.stats, "batting", "OPS", s.ops);
  } else {
    player.pitchingRole = normalizeMlbPitchingRole(line);
    addMappedStat(player.stats, "pitching", "gamesPlayed", s.gamesPlayed);
    addMappedStat(player.stats, "pitching", "gamesStarted", s.gamesStarted);
    addMappedStat(player.stats, "pitching", "wins", s.wins);
    addMappedStat(player.stats, "pitching", "losses", s.losses);
    addMappedStat(player.stats, "pitching", "saves", s.saves);
    addMappedStat(player.stats, "pitching", "holds", s.holds);
    addMappedStat(player.stats, "pitching", "innings", s.inningsPitched);
    addMappedStat(player.stats, "pitching", "hits", s.hits);
    addMappedStat(player.stats, "pitching", "earnedRuns", s.earnedRuns);
    addMappedStat(player.stats, "pitching", "homeRuns", s.homeRuns);
    addMappedStat(player.stats, "pitching", "walks", s.baseOnBalls ?? s.walks);
    addMappedStat(player.stats, "pitching", "strikeouts", s.strikeOuts ?? s.strikeouts);
    addMappedStat(player.stats, "pitching", "ERA", s.era);
    addMappedStat(player.stats, "pitching", "WHIP", s.whip);
  }
  player.hasStats = true;
}

async function handleMlb(abbr: string) {
  const teamAbbr = abbr.toUpperCase();
  const teamId = getMlbTeamId(abbr);
  const [fortyMan, initialStatLines] = await Promise.all([
    getMlbFortyManRoster(abbr),
    getMlbSeasonPlayerStats(abbr),
  ]);

  const jerseyByMlbId = new Map<number, string>();
  const rosterPositionByMlbId = new Map<number, string>();
  const rosterNameByMlbId = new Map<number, string>();
  const currentOrIlRosterIds: number[] = [];

  for (const p of fortyMan) {
    if (p.jersey) jerseyByMlbId.set(p.mlbId, p.jersey);
    if (p.positionAbbr) rosterPositionByMlbId.set(p.mlbId, p.positionAbbr);
    rosterNameByMlbId.set(p.mlbId, p.name);

    // Add individual stat fallbacks only for players who should still be tied
    // to the MLB club right now. This catches 60-day IL players who can be
    // absent from the team aggregate endpoint even though they played earlier.
    const isActive = p.statusCode === "A";
    const isOnIl = /^D(7|10|15|60)$/i.test(p.statusCode);
    if (isActive || isOnIl) currentOrIlRosterIds.push(p.mlbId);
  }

  const seenGroupById = new Set(initialStatLines.map((line) => `${line.mlbId}:${line.group}`));
  const missingRosterIds = currentOrIlRosterIds.filter(
    (id) => !seenGroupById.has(`${id}:hitting`) && !seenGroupById.has(`${id}:pitching`)
  );

  const fallbackResults = await Promise.allSettled(
    missingRosterIds.map((id) => getMlbPersonSeasonStats(id, teamId))
  );
  const fallbackStatLines = fallbackResults.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  const statLines = [...initialStatLines];
  for (const line of fallbackStatLines) {
    const key = `${line.mlbId}:${line.group}`;
    if (seenGroupById.has(key)) continue;
    seenGroupById.add(key);
    if (!line.name) line.name = rosterNameByMlbId.get(line.mlbId) || line.name;
    statLines.push(line);
  }

  const playersByMlbId = new Map<number, Player>();
  for (const line of statLines) {
    let p = playersByMlbId.get(line.mlbId);
    if (!p) {
      const rosterPosition = rosterPositionByMlbId.get(line.mlbId);
      const linePosition = normalizeMlbPosition(line);
      const primaryPosition = rosterPosition || linePosition || (line.group === "pitching" ? normalizeMlbPitchingRole(line) : undefined);
      p = {
        id: String(line.mlbId),
        name: line.name || rosterNameByMlbId.get(line.mlbId) || String(line.mlbId),
        jersey: jerseyByMlbId.get(line.mlbId),
        position: primaryPosition,
        primaryPosition,
        pitchingRole: line.group === "pitching" ? normalizeMlbPitchingRole(line) : undefined,
        headshot: getMlbHeadshotUrl(line.mlbId),
        hasStats: false,
        stats: {},
      };
      playersByMlbId.set(line.mlbId, p);
    }

    const linePosition = normalizeMlbPosition(line);
    if (line.group === "hitting") {
      // Keep hitters as hitters even if they also threw in a blowout. This is
      // the Weston Wilson fix: his pitching line should not turn his batting
      // table position into RP.
      const rosterPosition = rosterPositionByMlbId.get(line.mlbId);
      const preferred = rosterPosition && !isPitcherPosition(rosterPosition) ? rosterPosition : linePosition;
      if (preferred && !isPitcherPosition(preferred)) {
        p.position = preferred;
        p.primaryPosition = preferred;
      } else if (!p.position) {
        p.position = linePosition || p.position;
        p.primaryPosition = p.position;
      }
    } else {
      p.pitchingRole = normalizeMlbPitchingRole(line);
      if (!p.position || isPitcherPosition(p.position)) {
        p.position = p.pitchingRole;
        p.primaryPosition = p.pitchingRole;
      }
    }

    mergeMlbStatLine(p, line);
  }

  const players = Array.from(playersByMlbId.values()).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    team: teamAbbr,
    league: "mlb",
    source: "MLB StatsAPI",
    total: players.length,
    players,
  });
}

async function handleOther(league: string, abbr: string) {
  const teamAbbr = abbr.toUpperCase();
  const teamMeta = await getTeamMeta(league, abbr);
  const numericTeamId = teamMeta?.id || null;

  const athleteProfiles = new Map<string, any>();
  const allIds = new Set<string>();

  try {
    const data = await getTeamRoster(league, abbr);
    for (const a of parseAthletes(data)) {
      const id = String(a?.id || "");
      if (!id) continue;
      athleteProfiles.set(id, a);
      allIds.add(id);
    }
  } catch {}

  if (athleteProfiles.size === 0) {
    try {
      const teamData = await getTeamPage(league, abbr, ["roster"]);
      for (const a of parseAthletes(teamData)) {
        const id = String(a?.id || "");
        if (!id) continue;
        athleteProfiles.set(id, a);
        allIds.add(id);
      }
    } catch {}
  }

  if (numericTeamId) {
    const seasonIds = await getSeasonTeamAthletes(league, numericTeamId);
    for (const id of seasonIds) allIds.add(id);
  }

  const missingProfileIds = Array.from(allIds).filter((id) => !athleteProfiles.has(id));
  if (missingProfileIds.length > 0) {
    const profileResults = await Promise.allSettled(missingProfileIds.map((id) => getAthleteProfile(league, id)));
    profileResults.forEach((r, i) => {
      const id = missingProfileIds[i];
      if (r.status === "fulfilled" && r.value) athleteProfiles.set(id, r.value);
    });
  }

  const orderedIds = Array.from(allIds);
  const statsResults = await Promise.all(
    orderedIds.map((id) =>
      fetchStatsForPlayer(league, id, numericTeamId, teamAbbr).catch(() => ({
        stats: {} as Record<string, Stat>,
        hasStats: false,
      }))
    )
  );

  const players: Player[] = [];
  orderedIds.forEach((id, i) => {
    const profile = athleteProfiles.get(id);
    if (!profile) return;
    const p = buildPlayer(league, profile, statsResults[i]);
    if (p) players.push(p);
  });

  return NextResponse.json({ team: teamAbbr, league, total: players.length, players });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");
  const parsed = parseTeamKey(teamKey);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing or invalid team (expected league-abbr like mlb-bal)" },
      { status: 400 }
    );
  }

  if (parsed.league === "mlb") return handleMlb(parsed.abbr);
  return handleOther(parsed.league, parsed.abbr);
}
