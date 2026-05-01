// v21 Roster API
//
// Two big changes vs v20.1:
//
// 1) MLB now uses MLB's OFFICIAL statsapi.mlb.com for the 40-man roster.
//    ESPN's MLB roster endpoint was unreliable about which players are on
//    the IL — it usually returned just the 26-man with no clean status
//    string for the parser to match. Result: the Injured tab was empty
//    even when several Orioles were actually on the IL.
//
//    The new flow for MLB:
//      a. Call statsapi to get the full 40-man with status codes
//         (A=Active, D7/D10/D15/D60=IL, MIN=optioned, etc.)
//      b. Bucket by status code:
//           - Active tab  ← status A only
//           - Injured tab ← status D7 / D10 / D15 / D60
//           - Dropped     ← MIN, RES, SU, DEC, BRV, PL, ...
//      c. Use ESPN's roster as a source of profile metadata (headshot,
//         height, position from ESPN's perspective). Match on name first
//         (case-insensitive, trimmed) and fall back to MLB ID → ESPN
//         athlete by name match.
//      d. ESPN headshots are keyed by ESPN athlete ID. For 40-man players
//         that ESPN doesn't have profile data for (rare but happens for
//         September call-ups), we fall back to MLB's headshot CDN.
//
// 2) NFL position groups are now FINE-GRAINED. Old v20.1 was just
//    Offense / Defense / Special Teams which the user found too coarse.
//    New buckets:
//      Offense:
//        - Quarterbacks       (QB)
//        - Running Backs      (RB, FB, HB)
//        - Wide Receivers     (WR)
//        - Tight Ends         (TE)
//        - Offensive Tackles  (OT, T, LT, RT)
//        - Guards             (G, OG, LG, RG)
//        - Centers            (C)
//      Defense:
//        - Defensive Line     (DE, DT, NT, DL, EDGE)
//        - Linebackers        (LB, ILB, OLB, MLB)
//        - Cornerbacks        (CB)
//        - Safeties           (S, FS, SS)
//        - Defensive Backs    (DB — fallback for unspecified DBs)
//      Special Teams:
//        - Kickers            (K, PK)
//        - Punters            (P)
//        - Long Snappers      (LS)
//        - Returners          (KR, PR)
//
// Other behavior carried forward from v20.1:
//   - Returns { active, injured, positionGroups, players } for backwards
//     compat with the existing Roster.tsx (no client changes needed).
//   - NHL uses Forwards / Defense / Goalies.
//   - NBA stays flat.

import { NextRequest, NextResponse } from "next/server";
import {
  getTeamRoster,
  getTeamPage,
  getMlbFortyManRoster,
  getMlbHeadshotUrl,
  getMlbSeasonPlayerStats,
  MlbRosterEntry,
} from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 1800;

// ---- Types ----

type InjuryView = {
  status: string;
  detail: string | null;
  longDetail: string | null;
  returnDate: string | null;
  ilDesignation?: string | null;
};

type Player = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  positionAbbr?: string;
  headshot?: string;
  height?: string;
  weight?: string;
  age?: number;
  isInjured: boolean;
  statusLabel?: string | null;
  injury?: InjuryView | null;
};

type PositionGroup = { id: string; label: string; players: Player[] };

// ---- ESPN response parsing (defensive across schema variants) ----

function parseAthletes(data: any): any[] {
  if (!data) return [];
  const top = data?.athletes;
  if (Array.isArray(top)) {
    if (top.length > 0 && Array.isArray(top[0]?.items)) {
      const out: any[] = [];
      for (const group of top) {
        if (Array.isArray(group?.items)) {
          out.push(
            ...group.items.map((a: any) => ({
              ...a,
              _groupLabel: group.position || group.label || null,
            }))
          );
        }
      }
      return out;
    }
    if (top.length > 0 && (top[0]?.fullName || top[0]?.displayName || top[0]?.id)) {
      return top;
    }
  }
  const teamAthletes = data?.team?.athletes;
  if (Array.isArray(teamAthletes)) {
    if (teamAthletes.length > 0 && Array.isArray(teamAthletes[0]?.items)) {
      const out: any[] = [];
      for (const group of teamAthletes) {
        if (Array.isArray(group?.items)) {
          out.push(...group.items.map((a: any) => ({ ...a, _groupLabel: group.position || group.label || null })));
        }
      }
      return out;
    }
    return teamAthletes;
  }
  return [];
}

// ---- Status / IL classification (NON-MLB only — MLB uses statsapi codes) ----

const MINOR_LEAGUE_REGEX =
  /minor\s*league|triple-?\s*a|double-?\s*a|single-?\s*a|rookie|aaa|aa\b|low-a|high-a/i;
const PRACTICE_REGEX = /practice\s*squad|reserve\/future|exempt/i;
const SUSPENDED_REGEX = /suspended|suspension/i;

function readStatusName(a: any): string {
  return String(
    a?.status?.name ||
      a?.status?.type ||
      a?.status?.description ||
      a?.injuries?.[0]?.status ||
      ""
  );
}

// Non-MLB classifier. Returns null when we should drop the player.
function classifyOther(a: any): { include: boolean; isInjured: boolean } {
  const status = readStatusName(a);

  if (PRACTICE_REGEX.test(status)) return { include: false, isInjured: false };
  if (SUSPENDED_REGEX.test(status)) return { include: false, isInjured: false };
  if (MINOR_LEAGUE_REGEX.test(status)) return { include: false, isInjured: false };

  const looksInjured = /(injured|out\b|day[-\s]*to[-\s]*day|questionable|doubtful|injured\s*reserve|\bir\b)/i.test(
    status
  );
  const hasInjuriesArray = Array.isArray(a?.injuries) && a.injuries.length > 0;

  return { include: true, isInjured: looksInjured || hasInjuriesArray };
}

// ---- Injury narrative builder ----

function buildInjuryView(inj: any, ilDesignation?: string | null): InjuryView | null {
  if (!inj && !ilDesignation) return null;

  const status =
    ilDesignation ||
    inj?.status ||
    inj?.details?.fantasyStatus?.description ||
    inj?.shortStatus ||
    "Injured";

  const parts: string[] = [];
  const side = inj?.details?.side;
  const location = inj?.details?.location || inj?.details?.type;
  const subDetail = inj?.details?.detail || inj?.injuryDetail || inj?.injury || inj?.injuryDesc || inj?.description;

  if (side && side !== "Not Specified") parts.push(side);
  if (location && location !== "Not Specified") parts.push(location);
  if (subDetail && subDetail !== "Not Specified" && subDetail !== location) parts.push(subDetail);

  let detail = parts.length > 0 ? parts.join(" ") : null;
  if (!detail && (inj?.shortComment || inj?.injuryComment || inj?.comment)) {
    const rawComment = inj.shortComment || inj.injuryComment || inj.comment;
    const firstSentence = String(rawComment).split(". ")[0];
    detail = firstSentence.length < 120 ? firstSentence : firstSentence.slice(0, 117) + "…";
  }

  return {
    status: String(status),
    detail,
    longDetail: inj?.longComment || inj?.shortComment || inj?.injuryComment || inj?.comment || null,
    returnDate: inj?.details?.returnDate || inj?.expectedReturnDate || inj?.returnDate || inj?.date || null,
    ilDesignation: ilDesignation || null,
  };
}

// ---- Player normalization ----

function leagueHeadshotPath(league: string): string {
  return league;
}

function normalizePlayer(
  league: string,
  a: any,
  isInjured: boolean,
  ilDesignation: string | null
): Player | null {
  const id = String(a?.id || "");
  if (!id) return null;
  const name = a?.fullName || a?.displayName || a?.name;
  if (!name) return null;

  const positionAbbr =
    a?.position?.abbreviation || a?.position?.abbr || a?._groupLabel || "";
  const positionLabel = a?.position?.displayName || a?.position?.name || positionAbbr;

  const headshot =
    a?.headshot?.href ||
    (typeof a?.headshot === "string" ? a.headshot : undefined) ||
    `https://a.espncdn.com/i/headshots/${leagueHeadshotPath(league)}/players/full/${id}.png`;

  const firstInjury = Array.isArray(a?.injuries) ? a.injuries[0] : null;
  const injury = isInjured ? buildInjuryView(firstInjury, ilDesignation) : null;

  return {
    id,
    name: String(name).trim(),
    jersey: a?.jersey ? String(a.jersey) : undefined,
    position: positionLabel || undefined,
    positionAbbr: positionAbbr ? String(positionAbbr).toUpperCase() : undefined,
    headshot,
    height: a?.displayHeight || a?.height,
    weight: a?.displayWeight || a?.weight,
    age: a?.age,
    isInjured,
    statusLabel: readStatusName(a) || null,
    injury,
  };
}

// v21: Build a Player record from an MLB statsapi roster entry, optionally
// merged with ESPN profile data (headshot, height, etc).
function normalizeMlbPlayer(
  entry: MlbRosterEntry,
  espnProfile: any | null
): Player {
  // Status code drives whether this is the Active or Injured tab.
  const isInjured = /^D(7|10|15|60)$/i.test(entry.statusCode);

  // Pretty IL designation: "10-Day IL" rather than "10-Day Injured List"
  let ilDesignation: string | null = null;
  if (isInjured) {
    const m = entry.statusCode.match(/^D(\d+)$/i);
    ilDesignation = m ? `${m[1]}-Day IL` : entry.statusDescription;
  }

  // MLB headshots come from MLB.com's official CDN and are keyed by MLBAM id.
  // This works for active players, injured-list players, and optioned players
  // without needing an ESPN athlete id.
  const espnId = espnProfile ? String(espnProfile.id || "") : "";
  const headshot = getMlbHeadshotUrl(entry.mlbId);

  // Build an ESPN-style "injury narrative" for the injured tab. We don't get
  // the rich detail (body part, expected return) from MLB statsapi's roster
  // endpoint — only the IL flavor — so the narrative is just the IL label.
  // If ESPN's profile happens to include an injuries[] array, layer that in
  // for the location/detail string.
  const espnInj = Array.isArray(espnProfile?.injuries) ? espnProfile.injuries[0] : null;
  const mlbInj = {
    status: entry.injuryStatus,
    injuryDetail: entry.injuryDetail,
    injuryComment: entry.injuryComment,
    returnDate: entry.injuryReturnDate,
  };
  const injury = isInjured ? buildInjuryView(espnInj || mlbInj, ilDesignation) : null;

  const id = espnId || `mlb-${entry.mlbId}`;

  return {
    id,
    name: entry.name,
    jersey: entry.jersey || undefined,
    position: entry.positionName || entry.positionAbbr || undefined,
    positionAbbr: entry.positionAbbr || undefined,
    headshot,
    height: espnProfile?.displayHeight || espnProfile?.height,
    weight: espnProfile?.displayWeight || espnProfile?.weight,
    age: espnProfile?.age,
    isInjured,
    statusLabel: entry.statusDescription || null,
    injury,
  };
}

// ---- Position bucketing ----

type Bucket = { id: string; label: string; positions: string[] };

const MLB_BUCKETS: Bucket[] = [
  { id: "starting-pitchers", label: "Starting Pitchers (Rotation)", positions: ["SP", "STARTING PITCHER"] },
  { id: "relief-pitchers", label: "Relief Pitchers", positions: ["RP", "CP", "CL", "P", "PITCHER", "RELIEF PITCHER", "CLOSER"] },
  { id: "catchers", label: "Catchers", positions: ["C", "CATCHER"] },
  { id: "infielders", label: "Infielders", positions: ["1B", "2B", "3B", "SS", "IF", "INF"] },
  { id: "outfielders", label: "Outfielders", positions: ["LF", "CF", "RF", "OF"] },
  { id: "dh", label: "Designated Hitters", positions: ["DH"] },
];

// v21: Detailed NFL position groups. ORDER MATTERS — buckets are matched
// top-to-bottom and the first hit wins. So "C" matches Centers (last in
// the offensive line) instead of getting accidentally caught somewhere else.
const NFL_BUCKETS: Bucket[] = [
  // Offense
  { id: "qb",      label: "Quarterbacks",        positions: ["QB"] },
  { id: "rb",      label: "Running Backs",       positions: ["RB", "FB", "HB"] },
  { id: "wr",      label: "Wide Receivers",      positions: ["WR"] },
  { id: "te",      label: "Tight Ends",          positions: ["TE"] },
  { id: "ot",      label: "Offensive Tackles",   positions: ["OT", "T", "LT", "RT"] },
  { id: "og",      label: "Guards",              positions: ["G", "OG", "LG", "RG"] },
  { id: "c",       label: "Centers",             positions: ["C"] },
  // Defense
  { id: "dl",      label: "Defensive Line",      positions: ["DE", "DT", "NT", "DL", "EDGE"] },
  { id: "lb",      label: "Linebackers",         positions: ["LB", "OLB", "ILB", "MLB"] },
  { id: "cb",      label: "Cornerbacks",         positions: ["CB"] },
  { id: "saf",     label: "Safeties",            positions: ["S", "FS", "SS"] },
  { id: "db",      label: "Defensive Backs",     positions: ["DB"] },
  // Special teams
  { id: "k",       label: "Kickers",             positions: ["K", "PK"] },
  { id: "punter",  label: "Punters",             positions: ["P"] },
  { id: "ls",      label: "Long Snappers",       positions: ["LS"] },
  { id: "ret",     label: "Returners",           positions: ["KR", "PR"] },
];

const NHL_BUCKETS: Bucket[] = [
  { id: "forwards", label: "Forwards", positions: ["C", "LW", "RW", "F", "W"] },
  { id: "defense", label: "Defense", positions: ["D", "LD", "RD"] },
  { id: "goalies", label: "Goalies", positions: ["G", "GOALIE"] },
];

function bucketsFor(league: string): Bucket[] {
  if (league === "mlb") return MLB_BUCKETS;
  if (league === "nfl") return NFL_BUCKETS;
  if (league === "nhl") return NHL_BUCKETS;
  return [];
}

function groupByPosition(league: string, players: Player[]): PositionGroup[] {
  const buckets = bucketsFor(league);
  if (buckets.length === 0) {
    return [{ id: "all", label: "Roster", players }];
  }

  const result: PositionGroup[] = buckets.map((b) => ({ id: b.id, label: b.label, players: [] }));
  const other: Player[] = [];

  for (const p of players) {
    const pos = (p.positionAbbr || "").toUpperCase();
    if (!pos) {
      other.push(p);
      continue;
    }
    let matched = false;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].positions.includes(pos)) {
        result[i].players.push(p);
        matched = true;
        break;
      }
    }
    if (!matched) other.push(p);
  }

  if (other.length > 0) {
    result.push({ id: "other", label: "Other", players: other });
  }

  return result.filter((g) => g.players.length > 0);
}

// ---- MLB handler (v21 — uses statsapi.mlb.com) ----

async function handleMlb(abbr: string) {
  // Source of truth: MLB's official 40-man roster.
  const [fortyMan, statLines] = await Promise.all([
    getMlbFortyManRoster(abbr),
    getMlbSeasonPlayerStats(abbr),
  ]);

  const pitchingRoleByMlbId = new Map<number, "SP" | "RP">();
  for (const line of statLines) {
    if (line.group !== "pitching") continue;
    const gs = Number(line.stat?.gamesStarted || 0);
    pitchingRoleByMlbId.set(line.mlbId, gs > 0 ? "SP" : "RP");
  }

  // Build a lookup of ESPN profile data so we can grab heights/weights and,
  // when available, richer injury notes. Headshots still come from MLB.com.
  const espnByName = new Map<string, any>();
  const espnById = new Map<string, any>();
  try {
    const espnRoster = await getTeamRoster("mlb", abbr);
    for (const a of parseAthletes(espnRoster)) {
      const name = String(a?.fullName || a?.displayName || "").trim().toLowerCase();
      if (name) espnByName.set(name, a);
      const id = String(a?.id || "");
      if (id) espnById.set(id, a);
    }
  } catch {}
  if (espnByName.size === 0) {
    try {
      const teamData = await getTeamPage("mlb", abbr, ["roster"]);
      for (const a of parseAthletes(teamData)) {
        const name = String(a?.fullName || a?.displayName || "").trim().toLowerCase();
        if (name) espnByName.set(name, a);
        const id = String(a?.id || "");
        if (id) espnById.set(id, a);
      }
    } catch {}
  }

  const players: Player[] = [];

  for (const entry of fortyMan) {
    const code = entry.statusCode;
    const isActive = code === "A";
    const isOnIl = /^D(7|10|15|60)$/i.test(code);
    if (!isActive && !isOnIl) continue;

    const espnProfile = espnByName.get(entry.name.toLowerCase()) || null;
    const player = normalizeMlbPlayer(entry, espnProfile);

    // MLB's roster endpoint usually says every pitcher is just "P". For the
    // active tab we split active pitchers into rotation vs bullpen using the
    // team-season pitching line. Position players who pitched stay grouped by
    // their real fielding position because their roster position is not P.
    if (!player.isInjured && String(entry.positionAbbr || "").toUpperCase() === "P") {
      const role = pitchingRoleByMlbId.get(entry.mlbId) || "RP";
      player.positionAbbr = role;
      player.position = role === "SP" ? "Starting Pitcher" : "Relief Pitcher";
    }

    players.push(player);
  }

  return finalize("mlb", abbr, players);
}

// ---- Non-MLB handler (NFL / NBA / NHL) ----

async function handleOther(league: string, abbr: string) {
  const playersById = new Map<string, Player>();

  // Source 1: dedicated roster endpoint
  try {
    const data = await getTeamRoster(league, abbr);
    for (const a of parseAthletes(data)) {
      const c = classifyOther(a);
      if (!c.include) continue;
      const p = normalizePlayer(league, a, c.isInjured, null);
      if (p) playersById.set(p.id, p);
    }
  } catch {}

  // Fallback to team page if source 1 came back empty
  if (playersById.size === 0) {
    try {
      const teamData = await getTeamPage(league, abbr, ["roster"]);
      for (const a of parseAthletes(teamData)) {
        const c = classifyOther(a);
        if (!c.include) continue;
        const p = normalizePlayer(league, a, c.isInjured, null);
        if (p) playersById.set(p.id, p);
      }
    } catch {}
  }

  // Merge in top-level injuries[]. This is how NFL/NBA/NHL surface IR /
  // multi-game injuries that aren't on the active roster payload.
  try {
    const teamData = await getTeamPage(league, abbr, ["roster", "injuries"]);
    const topInjuries = teamData?.team?.injuries || teamData?.injuries || [];
    if (Array.isArray(topInjuries)) {
      for (const inj of topInjuries) {
        const aId = String(inj?.athlete?.id || inj?.player?.id || "");
        if (!aId) continue;

        const existing = playersById.get(aId);
        if (existing) {
          existing.isInjured = true;
          existing.injury = existing.injury || buildInjuryView(inj);
        } else {
          const a = inj.athlete || inj.player;
          if (!a) continue;
          const p = normalizePlayer(league, a, true, null);
          if (p) {
            p.injury = buildInjuryView(inj);
            playersById.set(p.id, p);
          }
        }
      }
    }
  } catch {}

  return finalize(league, abbr, Array.from(playersById.values()));
}

// ---- Finalize: sort, split, group, return ----

function finalize(league: string, abbr: string, allPlayers: Player[]) {
  const active = allPlayers.filter((p) => !p.isInjured);
  const injured = allPlayers.filter((p) => p.isInjured);

  const sortByJersey = (a: Player, b: Player) => {
    const aj = a.jersey ? parseInt(a.jersey, 10) : 9999;
    const bj = b.jersey ? parseInt(b.jersey, 10) : 9999;
    if (aj !== bj) return aj - bj;
    return a.name.localeCompare(b.name);
  };
  active.sort(sortByJersey);
  injured.sort(sortByJersey);

  const positionGroups = groupByPosition(league, active);

  return NextResponse.json({
    team: abbr.toUpperCase(),
    league,
    players: allPlayers,
    active,
    injured,
    positionGroups,
  });
}

// ---- Main handler ----

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

  if (parsed.league === "mlb") {
    return handleMlb(parsed.abbr);
  }
  return handleOther(parsed.league, parsed.abbr);
}
