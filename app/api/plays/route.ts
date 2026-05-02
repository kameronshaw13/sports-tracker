import { NextRequest, NextResponse } from "next/server";
import { getGameSummary, getMlbFortyManRoster, getMlbHeadshotUrl } from "@/lib/espn";
import { ensureHash } from "@/lib/teams";

export const revalidate = 10;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

type TeamMeta = {
  id: string;
  abbr: string;
  name: string;
  color: string;
  logo?: string;
};

type MlbPerson = {
  id?: string | null;
  name?: string | null;
  shortName?: string | null;
  displayName?: string | null;
  headshot?: string | null;
  mlbId?: number | null;
  stats?: Record<string, string | number | null>;
};

type MlbAtBat = {
  id: string;
  text: string;
  result: string;
  period: number;
  halfInning: "top" | "bottom" | null;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  type?: string | null;
  clock?: string | null;
  batter?: MlbPerson | null;
  pitcher?: MlbPerson | null;
  pitches: string[];
  isAtBat: boolean;
  isMinor: boolean;
  isComplete?: boolean;
  sequence?: number;
};

type Play = {
  id: string;
  text: string;
  period: number;
  halfInning?: "top" | "bottom" | null;
  clock?: string | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  driveIndex?: number;
};

type Drive = {
  index: number;
  description: string;
  result: string;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  start?: string;
  end?: string;
};

function readTeamColor(c: any): string {
  return ensureHash(c?.team?.color || c?.color || "");
}

function buildTeamMeta(c: any): TeamMeta | null {
  if (!c) return null;
  return {
    id: String(c.id || c.team?.id || ""),
    abbr: String(c.team?.abbreviation || "").toUpperCase(),
    name: c.team?.displayName || c.team?.name || "",
    color: readTeamColor(c),
    logo: c.team?.logo || c.team?.logos?.[0]?.href,
  };
}

function readHalfInning(p: any): "top" | "bottom" | null {
  const raw = String(
    p?.period?.type ||
      p?.atBatPlayResult?.halfInning ||
      p?.halfInning ||
      ""
  ).toLowerCase();
  if (raw.startsWith("top") || raw === "middle") return "top";
  if (raw.startsWith("bot") || raw === "end") return "bottom";
  return null;
}

function readPlayTeamId(p: any): string | null {
  const direct = p?.team?.id || p?.team?.$ref?.match(/\/teams\/(\d+)/)?.[1] || null;
  return direct ? String(direct) : null;
}

function readPerson(raw: any): MlbPerson | null {
  if (!raw) return null;
  const person = raw.athlete || raw.player || raw.person || raw;
  const id = person.id || raw.id || null;
  const name =
    person.displayName ||
    person.fullName ||
    raw.displayName ||
    raw.fullName ||
    raw.name ||
    null;
  if (!id && !name) return null;
  return {
    id: id ? String(id) : null,
    name,
    shortName: person.shortName || raw.shortName || name,
    displayName: name,
    headshot: person.headshot?.href || person.headshot || raw.headshot?.href || raw.headshot || null,
  };
}

function personKey(person: MlbPerson | null | undefined): string {
  return String(person?.id || person?.displayName || person?.name || "").toLowerCase();
}

function normalizeNameKey(name: string | null | undefined): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type RosterPersonLite = { mlbId: number; name: string; headshot: string };

async function buildMlbRosterLookup(home?: TeamMeta | null, away?: TeamMeta | null): Promise<Map<string, RosterPersonLite>> {
  const map = new Map<string, RosterPersonLite>();
  const abbrs = [home?.abbr, away?.abbr].filter(Boolean) as string[];
  await Promise.all(
    abbrs.map(async (abbr) => {
      try {
        const roster = await getMlbFortyManRoster(abbr);
        for (const p of roster || []) {
          if (!p?.mlbId || !p?.name) continue;
          const item = { mlbId: Number(p.mlbId), name: p.name, headshot: getMlbHeadshotUrl(p.mlbId) };
          const fullKey = normalizeNameKey(p.name);
          if (fullKey) map.set(fullKey, item);
          const parts = fullKey.split(" ").filter(Boolean);
          if (parts.length >= 2) {
            map.set(`${parts[0]} ${parts[parts.length - 1]}`, item);
            // Useful for ESPN short names like "J. Latz" when they appear.
            map.set(`${parts[0][0]} ${parts[parts.length - 1]}`, item);
          }
          if (parts.length) map.set(parts[parts.length - 1], item);
        }
      } catch {
        // Headshots are a nice-to-have; never let roster enrichment break plays.
      }
    })
  );
  return map;
}

function enrichPersonFromRoster(person: MlbPerson | null, rosterLookup: Map<string, RosterPersonLite>): MlbPerson | null {
  if (!person) return person;
  const keys = [person.displayName, person.name, person.shortName]
    .map((name) => normalizeNameKey(name))
    .filter(Boolean);
  let match: RosterPersonLite | undefined;
  for (const key of keys) {
    match = rosterLookup.get(key);
    if (match) break;
    const parts = key.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      match = rosterLookup.get(`${parts[0]} ${parts[parts.length - 1]}`) || rosterLookup.get(parts[parts.length - 1]);
      if (match) break;
    }
  }
  if (!match) return person;
  return {
    ...person,
    name: person.name || match.name,
    displayName: person.displayName || match.name,
    shortName: person.shortName || match.name,
    mlbId: match.mlbId,
    headshot: match.headshot,
  };
}

function enrichAndAttachStats(person: MlbPerson | null, statsMap: Map<string, Record<string, string | number | null>>, rosterLookup: Map<string, RosterPersonLite>) {
  return attachStats(enrichPersonFromRoster(person, rosterLookup), statsMap);
}

function normalizeStatValue(value: any): string | number | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value.displayValue === "string") return value.displayValue;
  if (typeof value.value === "string" || typeof value.value === "number") return value.value;
  return null;
}

function buildMlbPlayerStats(summary: any): Map<string, Record<string, string | number | null>> {
  const map = new Map<string, Record<string, string | number | null>>();
  const players = Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : [];

  for (const team of players) {
    const categories = Array.isArray(team?.statistics) ? team.statistics : [];
    for (const cat of categories) {
      const labels: string[] = Array.isArray(cat?.labels) ? cat.labels : [];
      const athletes = Array.isArray(cat?.athletes) ? cat.athletes : [];
      const categoryName = String(cat?.name || cat?.displayName || "").toLowerCase();

      for (const row of athletes) {
        const athlete = row?.athlete || row;
        const id = athlete?.id ? String(athlete.id) : null;
        const name = athlete?.displayName || athlete?.fullName || athlete?.shortName || row?.displayName || row?.name;
        const shortName = athlete?.shortName || row?.shortName;
        const keys = [id, name, shortName]
          .filter(Boolean)
          .flatMap((x) => {
            const raw = String(x);
            const normalized = normalizeNameKey(raw);
            const parts = normalized.split(" ").filter(Boolean);
            const expanded = [raw.toLowerCase(), normalized];
            if (parts.length >= 2) {
              expanded.push(`${parts[0]} ${parts[parts.length - 1]}`, `${parts[0][0]} ${parts[parts.length - 1]}`, parts[parts.length - 1]);
            }
            return expanded.filter(Boolean);
          });
        if (keys.length === 0) continue;

        const stats: Record<string, string | number | null> = {};
        if (name) stats.__name = name;
        const values = Array.isArray(row?.stats) ? row.stats : [];
        labels.forEach((label, idx) => {
          if (!label) return;
          stats[label] = normalizeStatValue(values[idx]);
        });

        // Useful normalized fields for the live header.
        if (categoryName.includes("bat")) {
          stats.H_AB = buildHitsAtBats(stats);
        }
        if (categoryName.includes("pitch")) {
          stats.P = stats.P || stats.PC || stats["#P"] || stats.Pitches || null;
          stats.IP = stats.IP || null;
        }

        for (const key of keys) {
          map.set(key, { ...(map.get(key) || {}), ...stats });
        }
      }
    }
  }

  return map;
}

function buildHitsAtBats(stats: Record<string, string | number | null>): string | null {
  const already = stats.H_AB ?? stats["H-AB"] ?? stats["H/AB"];
  if (already != null && String(already).trim()) return String(already);
  const h = stats.H ?? stats.Hits;
  const ab = stats.AB ?? stats.AtBats;
  if (h == null && ab == null) return null;
  return `${h ?? 0}-${ab ?? 0}`;
}

function attachStats(person: MlbPerson | null, statsMap: Map<string, Record<string, string | number | null>>) {
  if (!person) return person;
  const candidateKeys = [person.id, person.name, person.displayName, person.shortName]
    .filter(Boolean)
    .flatMap((x) => {
      const raw = String(x);
      const normalized = normalizeNameKey(raw);
      const parts = normalized.split(" ").filter(Boolean);
      const keys = [raw.toLowerCase(), normalized];
      if (parts.length >= 2) keys.push(`${parts[0]} ${parts[parts.length - 1]}`, parts[parts.length - 1]);
      return keys.filter(Boolean);
    });

  for (const key of candidateKeys) {
    const stats = statsMap.get(key);
    if (stats) {
      const statName = typeof stats.__name === "string" ? stats.__name : null;
      return {
        ...person,
        name: person.name || statName,
        displayName: person.displayName || statName,
        shortName: person.shortName || statName,
        stats,
      };
    }
  }
  return { ...person, stats: {} };
}

function firstPersonFromCandidates(...values: any[]): MlbPerson | null {
  for (const value of values) {
    const person = readPerson(value);
    if (person) return person;
  }
  return null;
}

function extractPitchTexts(p: any): string[] {
  const sources = [
    p?.pitches,
    p?.pitchSequence,
    p?.atBatPlayResult?.pitchSequence,
    p?.playEvents,
    p?.events,
  ];
  const result: string[] = [];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const text =
        item?.text ||
        item?.displayText ||
        item?.description ||
        item?.type?.text ||
        item?.result?.description ||
        item?.details?.description ||
        "";
      if (text && !result.includes(String(text))) result.push(String(text));
    }
  }

  return result;
}

function isPitchEvent(text: string, type?: string | null): boolean {
  const value = `${type || ""} ${text || ""}`.toLowerCase();
  if (!value.trim()) return false;
  if (isMinorBaseballEvent(text, type)) return false;
  if (looksLikeAtBat(text, type)) return false;
  return /\b(ball|strike|called strike|swinging strike|strike looking|strike swinging|foul|pitch|blocked|wild pitch|passed ball|pickoff|automatic ball|intent ball|bunt foul|missed bunt|hit by pitch)\b/.test(value);
}

function isInningTransitionText(text: string, type?: string | null): boolean {
  const value = `${type || ""} ${text || ""}`.toLowerCase().trim();
  return /^(top|bottom|middle|end) of the \d+(st|nd|rd|th)? inning\.?$/.test(value) || /^(middle|end) of the/.test(value);
}

function isPitcherBatterIntroText(text: string): boolean {
  return /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}\s+pitches to\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}\.?$/i.test(String(text || "").trim());
}

function isMinorBaseballEvent(text: string, type?: string | null): boolean {
  const value = `${type || ""} ${text}`.toLowerCase();
  return /defensive replacement|pitching change|mound visit|injury delay|delay|challeng|substitution|pinch-runner|pinch runner|coach visit|umpire/.test(value);
}

function looksLikeAtBat(text: string, type?: string | null): boolean {
  const value = `${type || ""} ${text}`.toLowerCase();
  if (isMinorBaseballEvent(text, type)) return false;
  return /single|double|triple|home run|homers|ground|fly|line|pop|strikeout|struck out|walk|hit by pitch|reached|fielder|sacrifice|intentional|double play|forceout|bunt|error|out/.test(value);
}

function normalizeResult(text: string, type?: string | null): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return type || "Play";
  // ESPN text is usually already the best human-readable result, so keep it.
  return clean;
}

async function buildMlbAtBats(summary: any, home: TeamMeta | null, away: TeamMeta | null) {
  const statsMap = buildMlbPlayerStats(summary);
  const rosterLookup = await buildMlbRosterLookup(home, away);
  const rawPlays: any[] = Array.isArray(summary?.plays) ? summary.plays : [];
  const homeId = home?.id || "";
  const awayId = away?.id || "";

  // ESPN's MLB feed can be flat and occasionally odd-ordered: pitch rows can
  // arrive after the final at-bat result. Normalize into: half-inning -> at-bat
  // -> pitch details. Delayed "Ball In Play" pitch rows are back-attached to the
  // completed at-bat instead of being rendered as their own at-bat.
  const sortedPlays = [...rawPlays].sort((a, b) => {
    const ai = Number(a?.id);
    const bi = Number(b?.id);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return 0;
  });

  type PendingGroup = {
    key: string;
    period: number;
    halfInning: "top" | "bottom" | null;
    teamId: string | null;
    homeAway: "home" | "away" | null;
    batter: MlbPerson | null;
    pitcher: MlbPerson | null;
    pitches: string[];
    firstIndex: number;
  };

  const rows: MlbAtBat[] = [];
  const pendingByHalf = new Map<string, PendingGroup>();
  const pitcherByHalf = new Map<string, MlbPerson | null>();

  function halfKey(period: number, halfInning: "top" | "bottom" | null) {
    return `${period || 0}-${halfInning || "unknown"}`;
  }

  function getEventBase(p: any, idx: number) {
    const period = Number(p?.period?.number || p?.period || 0);
    const halfInning = readHalfInning(p);
    let teamId: string | null = readPlayTeamId(p);
    if (!teamId && halfInning) teamId = halfInning === "top" ? awayId : homeId;
    const homeAway: "home" | "away" | null =
      teamId && teamId === homeId ? "home" : teamId && teamId === awayId ? "away" : null;

    const text = String(p?.text || p?.description || "").replace(/\s+/g, " ").trim();
    const type = p?.type?.text || p?.type?.abbreviation || null;
    const batter = enrichAndAttachStats(
      firstPersonFromCandidates(
        p?.batter,
        p?.atBatPlayResult?.batter,
        p?.participants?.find?.((x: any) => /batter|hitter/.test(String(x?.type || x?.position || "").toLowerCase())),
        p?.athletes?.find?.((x: any) => /batter|hitter/.test(String(x?.role || x?.type || "").toLowerCase()))
      ),
      statsMap,
      rosterLookup
    );
    const pitcher = enrichAndAttachStats(
      firstPersonFromCandidates(
        p?.pitcher,
        p?.atBatPlayResult?.pitcher,
        p?.participants?.find?.((x: any) => /pitcher/.test(String(x?.type || x?.position || "").toLowerCase())),
        p?.athletes?.find?.((x: any) => /pitcher/.test(String(x?.role || x?.type || "").toLowerCase()))
      ),
      statsMap,
      rosterLookup
    );

    return { period, halfInning, teamId, homeAway, text, type, batter, pitcher, idx };
  }

  function pushUnique(target: string[], values: string[]) {
    for (const value of values) {
      const clean = String(value || "").replace(/\s+/g, " ").trim();
      if (clean && !target.includes(clean)) target.push(clean);
    }
  }

  function inferBatterFromText(text: string): MlbPerson | null {
    const possibleName = text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+(singled|doubled|tripled|homered|grounded|flied|lined|popped|struck|walked|hit|reached|sacrificed|bunted)/i)?.[1];
    if (!possibleName) return null;
    return enrichAndAttachStats({ name: possibleName, displayName: possibleName, shortName: possibleName }, statsMap, rosterLookup);
  }

  function inferPitcherFromText(text: string): MlbPerson | null {
    const relieved = text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+relieved/i)?.[1];
    const pitchesTo = text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+pitches to/i)?.[1];
    const possibleName = relieved || pitchesTo;
    if (!possibleName) return null;
    return enrichAndAttachStats({ name: possibleName, displayName: possibleName, shortName: possibleName }, statsMap, rosterLookup);
  }

  function lastAtBatInHalf(key: string): MlbAtBat | null {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!row.isAtBat) continue;
      if (halfKey(row.period, row.halfInning) === key) return row;
    }
    return null;
  }

  function lastAtBatInPeriod(period: number): MlbAtBat | null {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!row.isAtBat) continue;
      if (row.period === period) return row;
    }
    return null;
  }

  function attachPitchToRecentAtBat(key: string, pitchTexts: string[], period?: number) {
    const last = lastAtBatInHalf(key) || (period ? lastAtBatInPeriod(period) : null);
    if (!last) return false;
    pushUnique(last.pitches, pitchTexts);
    return true;
  }

  function parsePitcherBatterIntro(text: string): { pitcher: MlbPerson | null; batter: MlbPerson | null } | null {
    const m = text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+pitches to\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\.?$/i);
    if (!m) return null;
    return {
      pitcher: enrichAndAttachStats({ name: m[1], displayName: m[1], shortName: m[1] }, statsMap, rosterLookup),
      batter: enrichAndAttachStats({ name: m[2], displayName: m[2], shortName: m[2] }, statsMap, rosterLookup),
    };
  }

  function isLeakedPitchResult(row: MlbAtBat) {
    const value = String(row.result || row.text || "").trim();
    return /^pitch\s*\d*\s*:/i.test(value) || /^pitch\b/i.test(value) || /^(ball\s+in\s+play|in\s+play)$/i.test(value);
  }

  function isLikelyScoringText(text: string, type?: string | null) {
    const value = `${type || ""} ${text || ""}`.toLowerCase();
    return /home run|homer|homered|homers|grand slam/.test(value);
  }

  for (const p of sortedPlays) {
    const idx = rows.length;
    const base = getEventBase(p, idx);
    if (!base.text) continue;
    if (isInningTransitionText(base.text, base.type)) continue;
    const key = halfKey(base.period, base.halfInning);
    const knownPitcher = pitcherByHalf.get(key) || null;
    const existing = pendingByHalf.get(key);
    const pending: PendingGroup = existing || {
      key,
      period: base.period,
      halfInning: base.halfInning,
      teamId: base.teamId,
      homeAway: base.homeAway,
      batter: base.batter,
      pitcher: base.pitcher || knownPitcher,
      pitches: [],
      firstIndex: idx,
    };

    if (base.batter && !pending.batter) pending.batter = base.batter;
    if (base.pitcher && !pending.pitcher) pending.pitcher = base.pitcher;
    if (!pending.teamId && base.teamId) pending.teamId = base.teamId;
    if (!pending.homeAway && base.homeAway) pending.homeAway = base.homeAway;

    const intro = parsePitcherBatterIntro(base.text);
    if (intro) {
      if (intro.pitcher) {
        pending.pitcher = intro.pitcher;
        pitcherByHalf.set(key, intro.pitcher);
      }
      if (intro.batter) pending.batter = intro.batter;
      pendingByHalf.set(key, pending);
      continue;
    }

    const pitchTexts = extractPitchTexts(p);
    const isFinalAtBat = looksLikeAtBat(base.text, base.type);
    const minor = isMinorBaseballEvent(base.text, base.type);
    const pitchOnly = !isFinalAtBat && !minor && isPitchEvent(base.text, base.type);
    const delayedBallInPlayPitch = pitchOnly && /ball\s+in\s+play|in\s+play/i.test(base.text);

    if (pitchOnly) {
      const pitchValues = pitchTexts.length ? pitchTexts : [base.text];
      // "Pitch X: Ball In Play" is the last pitch of the current at-bat. ESPN
      // often sends it after the completed result or with batter metadata, so
      // always try to back-attach it before creating/updating a pending AB.
      if (delayedBallInPlayPitch) {
        if (attachPitchToRecentAtBat(key, pitchValues, base.period)) continue;
        // If there is no batter result yet, keep it as pitch detail only. It should
        // never render as its own at-bat row.
      }
      pushUnique(pending.pitches, pitchValues);
      pendingByHalf.set(key, pending);
      continue;
    }

    if (isFinalAtBat) {
      const pitches = [...pending.pitches];
      pushUnique(pitches, pitchTexts);
      const batter = base.batter || pending.batter || inferBatterFromText(base.text);
      const pitcher = base.pitcher || pending.pitcher || knownPitcher;
      if (pitcher) pitcherByHalf.set(key, pitcher);
      rows.push({
        id: String(p?.id || `${base.period}-${base.halfInning || "x"}-${idx}`),
        text: base.text,
        result: normalizeResult(base.text, base.type),
        period: base.period,
        halfInning: base.halfInning,
        teamId: base.teamId || pending.teamId,
        homeAway: base.homeAway || pending.homeAway,
        scoringPlay: !!p?.scoringPlay || isLikelyScoringText(base.text, base.type),
        awayScore: p?.awayScore,
        homeScore: p?.homeScore,
        type: base.type,
        clock: p?.clock?.displayValue || null,
        batter,
        pitcher,
        pitches,
        isAtBat: true,
        isMinor: false,
        isComplete: true,
        sequence: rows.length,
      });
      pendingByHalf.delete(key);
      continue;
    }

    if (minor) {
      const pitcher = base.pitcher || inferPitcherFromText(base.text) || knownPitcher;
      if (pitcher && /relieved|pitching change/i.test(base.text)) pitcherByHalf.set(key, pitcher);
      rows.push({
        id: String(p?.id || `${base.period}-${base.halfInning || "x"}-${idx}`),
        text: base.text,
        result: normalizeResult(base.text, base.type),
        period: base.period,
        halfInning: base.halfInning,
        teamId: base.teamId,
        homeAway: base.homeAway,
        scoringPlay: !!p?.scoringPlay || isLikelyScoringText(base.text, base.type),
        awayScore: p?.awayScore,
        homeScore: p?.homeScore,
        type: base.type,
        clock: p?.clock?.displayValue || null,
        batter: base.batter,
        pitcher,
        pitches: [],
        isAtBat: false,
        isMinor: true,
        isComplete: true,
        sequence: rows.length,
      });
      continue;
    }

    rows.push({
      id: String(p?.id || `${base.period}-${base.halfInning || "x"}-${idx}`),
      text: base.text,
      result: normalizeResult(base.text, base.type),
      period: base.period,
      halfInning: base.halfInning,
      teamId: base.teamId,
      homeAway: base.homeAway,
      scoringPlay: !!p?.scoringPlay || isLikelyScoringText(base.text, base.type),
      awayScore: p?.awayScore,
      homeScore: p?.homeScore,
      type: base.type,
      clock: p?.clock?.displayValue || null,
      batter: base.batter,
      pitcher: base.pitcher || knownPitcher,
      pitches: [],
      isAtBat: false,
      isMinor: true,
      isComplete: true,
      sequence: rows.length,
    });
  }

  // Preserve a true in-progress at-bat, but do not render orphaned delayed
  // Ball-In-Play pitch rows as standalone at-bats.
  for (const pending of pendingByHalf.values()) {
    if (!pending.pitches.length) continue;
    const onlyBallInPlay = pending.pitches.every((pitch) => /ball\s+in\s+play|in\s+play/i.test(pitch));
    if (onlyBallInPlay && attachPitchToRecentAtBat(pending.key, pending.pitches, pending.period)) continue;
    rows.push({
      id: `live-${pending.key}-${pending.firstIndex}`,
      text: "Current at-bat",
      result: "Current at-bat",
      period: pending.period,
      halfInning: pending.halfInning,
      teamId: pending.teamId,
      homeAway: pending.homeAway,
      scoringPlay: false,
      batter: pending.batter,
      pitcher: pending.pitcher,
      pitches: pending.pitches,
      isAtBat: true,
      isMinor: false,
      isComplete: false,
      sequence: rows.length,
    });
  }

  const cleaned: MlbAtBat[] = [];
  for (const row of rows) {
    const leakedPitch = isLeakedPitchResult(row);
    if (leakedPitch) {
      const pitchValues = row.pitches?.length ? row.pitches : [row.result || row.text].filter(Boolean);
      let attached = false;

      // Prefer the same half-inning, but ESPN can tag the final BIP pitch with
      // transition metadata. Fall back to same inning, then nearest previous AB.
      for (const mode of ["sameHalf", "samePeriod", "nearest"] as const) {
        for (let i = cleaned.length - 1; i >= 0; i--) {
          const prev = cleaned[i];
          if (!prev.isAtBat || isLeakedPitchResult(prev)) continue;
          if (mode === "sameHalf" && halfKey(prev.period, prev.halfInning) !== halfKey(row.period, row.halfInning)) continue;
          if (mode === "samePeriod" && prev.period !== row.period) continue;
          pushUnique(prev.pitches, pitchValues);
          attached = true;
          break;
        }
        if (attached) break;
      }

      // Never render leaked pitch events as their own row.
      continue;
    }
    cleaned.push(row);
  }

  let lastAway: number | null = null;
  let lastHome: number | null = null;
  for (const row of cleaned) {
    const awayScore = typeof row.awayScore === "number" ? row.awayScore : null;
    const homeScore = typeof row.homeScore === "number" ? row.homeScore : null;
    if (row.isAtBat && awayScore != null && homeScore != null) {
      if ((lastAway != null && awayScore > lastAway) || (lastHome != null && homeScore > lastHome)) {
        row.scoringPlay = true;
      }
      lastAway = awayScore;
      lastHome = homeScore;
    } else if (awayScore != null && homeScore != null) {
      lastAway = awayScore;
      lastHome = homeScore;
    }
  }

  return cleaned.map((ab, sequence) => ({ ...ab, sequence }));
}

function readCurrentMlbSituation(summary: any, atBats: MlbAtBat[], rosterLookup: Map<string, RosterPersonLite>) {
  const comp = summary?.header?.competitions?.[0];
  const situation = summary?.situation || comp?.situation || null;
  const lastAtBat = [...atBats].reverse().find((p) => p.isAtBat) || atBats[atBats.length - 1] || null;
  const period = Number(comp?.status?.period || lastAtBat?.period || 0);
  const halfInning =
    readHalfInning(situation || {}) ||
    lastAtBat?.halfInning ||
    null;

  const batter = firstPersonFromCandidates(situation?.batter, situation?.onDeck, situation?.dueUp?.[0]);
  const pitcher = firstPersonFromCandidates(situation?.pitcher);
  const statsMap = buildMlbPlayerStats(summary);

  return {
    balls: typeof situation?.balls === "number" ? situation.balls : null,
    strikes: typeof situation?.strikes === "number" ? situation.strikes : null,
    outs: typeof situation?.outs === "number" ? situation.outs : null,
    onFirst: !!situation?.onFirst,
    onSecond: !!situation?.onSecond,
    onThird: !!situation?.onThird,
    lastPlay: situation?.lastPlay?.text || lastAtBat?.text || null,
    period,
    halfInning,
    batter: enrichAndAttachStats(batter || null, statsMap, rosterLookup),
    pitcher: enrichAndAttachStats(pitcher || null, statsMap, rosterLookup),
  };
}

function buildGenericPlays(league: string, summary: any, home: TeamMeta | null, away: TeamMeta | null): Play[] {
  const homeId = home?.id || "";
  const awayId = away?.id || "";
  const rawPlays: any[] = Array.isArray(summary?.plays) ? summary.plays : [];

  return rawPlays.map((p: any) => {
    const period = Number(p?.period?.number || 0);
    const halfInning = league === "mlb" ? readHalfInning(p) : null;
    let teamId: string | null = readPlayTeamId(p);
    if (!teamId && league === "mlb" && halfInning) teamId = halfInning === "top" ? awayId : homeId;
    const homeAway: "home" | "away" | null =
      teamId && teamId === homeId ? "home" : teamId && teamId === awayId ? "away" : null;

    return {
      id: String(p.id),
      text: String(p.text || ""),
      period,
      halfInning,
      clock: p.clock?.displayValue || null,
      scoringPlay: !!p.scoringPlay,
      awayScore: p.awayScore,
      homeScore: p.homeScore,
      teamId,
      homeAway,
    };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event");
  const league = searchParams.get("league");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  try {
    const data = await getGameSummary(league, eventId);

    const header = data?.header;
    const comp = header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const homeC = competitors.find((c: any) => c.homeAway === "home");
    const awayC = competitors.find((c: any) => c.homeAway === "away");

    const home = buildTeamMeta(homeC);
    const away = buildTeamMeta(awayC);
    const plays = buildGenericPlays(league, data, home, away);

    let drives: Drive[] = [];
    if (league === "nfl") {
      const homeId = home?.id || "";
      const awayId = away?.id || "";
      const previous: any[] = Array.isArray(data?.drives?.previous) ? data.drives.previous : [];
      const current = data?.drives?.current;
      const allDrives = current ? [...previous, current] : previous;

      drives = allDrives.map((d: any, idx: number) => {
        const tid = String(d?.team?.id || d?.team?.$ref?.match(/\/teams\/(\d+)/)?.[1] || "");
        const homeAway: "home" | "away" | null = tid && tid === homeId ? "home" : tid && tid === awayId ? "away" : null;
        return {
          index: idx,
          description: String(d?.description || ""),
          result: String(d?.displayResult || d?.result || ""),
          teamId: tid || null,
          homeAway,
          start: d?.start?.text,
          end: d?.end?.text,
        };
      });

      const playIdToDrive = new Map<string, number>();
      allDrives.forEach((d: any, idx: number) => {
        const dp = Array.isArray(d?.plays) ? d.plays : [];
        for (const pl of dp) if (pl?.id) playIdToDrive.set(String(pl.id), idx);
      });
      for (const p of plays) {
        const di = playIdToDrive.get(p.id);
        if (di != null) p.driveIndex = di;
      }
    }

    const mlbRosterLookup = league === "mlb" ? await buildMlbRosterLookup(home, away) : new Map<string, RosterPersonLite>();
    const mlbAtBats = league === "mlb" ? await buildMlbAtBats(data, home, away) : [];
    const mlbSituation = league === "mlb" ? readCurrentMlbSituation(data, mlbAtBats, mlbRosterLookup) : null;

    return NextResponse.json({
      league,
      eventId,
      status: {
        state: comp?.status?.type?.state,
        detail: comp?.status?.type?.shortDetail,
        period: comp?.status?.period,
      },
      home,
      away,
      situation: league === "mlb" ? mlbSituation : data?.situation || null,
      plays,
      drives,
      mlb: league === "mlb" ? { atBats: mlbAtBats, situation: mlbSituation } : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed", plays: [], drives: [], mlb: null },
      { status: 500 }
    );
  }
}
