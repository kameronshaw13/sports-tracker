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
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  const value = `${type || ""} ${cleanText}`.toLowerCase();
  if (!value.trim()) return false;
  if (isMinorBaseballEvent(cleanText, type)) return false;

  // ESPN's MLB feed labels the contact pitch row like:
  //   text: "Pitch 5 : Ball In Play"
  //   type: "Ground Out" / "Fly Out" / "Single" / "Home Run"
  // So checking looksLikeAtBat(type) before recognizing this as a pitch
  // accidentally dropped the final BIP pitch from the sequence.
  // Any row whose text starts with "Pitch N :" is a pitch row, even when
  // the type describes the eventual batted-ball result.
  if (/^pitch\s*\d+\s*:/i.test(cleanText)) return true;
  if (/\bball\s+in\s+play\b|\bin\s+play\b/i.test(cleanText)) return true;

  if (looksLikeAtBat(cleanText, type)) return false;
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
  return /single|double|triple|home run|homerun|homer(?:ed|ing|s)|ground|fly|line|pop|strikeout|struck out|walk|hit by pitch|reached|fielder|sacrifice|intentional|double play|forceout|bunt|error|out/.test(value);
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

  // ESPN MLB summary plays expose a stable at-bat id inside the play id.
  // Example from the debug feed:
  //   4018151570002020005  -> at-bat stem 0002, pitch row
  //   4018151570002060022  -> at-bat stem 0002, Ball In Play pitch row
  //   4018151570002990057  -> at-bat stem 0002, final result row
  // The previous parser grouped by half-inning and tried to "back attach" BIP
  // rows, which caused pitch bleed across batters. Grouping by this stem makes
  // ESPN's own at-bat boundary the source of truth.
  const sortedPlays = [...rawPlays].sort((a, b) => {
    const ai = Number(a?.id);
    const bi = Number(b?.id);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return 0;
  });

  type PendingGroup = {
    atBatKey: string;
    sortKey: number;
    period: number;
    halfInning: "top" | "bottom" | null;
    teamId: string | null;
    homeAway: "home" | "away" | null;
    batter: MlbPerson | null;
    pitcher: MlbPerson | null;
    pitches: string[];
    resultPlay: any | null;
    resultText: string;
    resultType: string | null;
    scoringPlay: boolean;
    awayScore?: number;
    homeScore?: number;
    clock?: string | null;
    firstIndex: number;
  };

  const groups = new Map<string, PendingGroup>();
  const minorRows: MlbAtBat[] = [];
  const pitcherByHalf = new Map<string, MlbPerson | null>();

  function halfKey(period: number, halfInning: "top" | "bottom" | null) {
    return `${period || 0}-${halfInning || "unknown"}`;
  }

  function readSortKey(p: any, fallback: number) {
    const numericId = Number(p?.id);
    if (Number.isFinite(numericId)) return numericId;
    const seq = Number(p?.sequenceNumber);
    if (Number.isFinite(seq)) return seq;
    return fallback;
  }

  function atBatStemFromPlayId(p: any): string | null {
    const id = String(p?.id || "");
    const m = id.match(/(\d{10})$/);
    if (!m) return null;
    const code = m[1];
    // last two digits are the ESPN row type; positions 1-4 identify inning/AB.
    // 0000 / 9999 are inning transition rows, not at-bats.
    const stem = code.slice(0, 4);
    if (!stem || stem === "0000" || stem.endsWith("99")) return null;
    return stem;
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

  function parsePitcherBatterIntro(text: string): { pitcher: MlbPerson | null; batter: MlbPerson | null } | null {
    const m = text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+pitches to\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\.?$/i);
    if (!m) return null;
    return {
      pitcher: enrichAndAttachStats({ name: m[1], displayName: m[1], shortName: m[1] }, statsMap, rosterLookup),
      batter: enrichAndAttachStats({ name: m[2], displayName: m[2], shortName: m[2] }, statsMap, rosterLookup),
    };
  }

  function pitchTextFromRow(baseText: string, type?: string | null): string {
    const clean = String(baseText || "").replace(/\s+/g, " ").trim();
    if (clean) return clean;
    return type || "Pitch";
  }

  function isLikelyScoringText(text: string, type?: string | null) {
    const value = `${type || ""} ${text || ""}`.toLowerCase();
    return /home run|homerun|homer(?:ed|ing|s)|grand slam|\bscored\b|\bscores\b/.test(value);
  }

  function getOrCreateGroup(atBatKey: string, base: ReturnType<typeof getEventBase>, idx: number, sortKey: number): PendingGroup {
    const existing = groups.get(atBatKey);
    if (existing) return existing;
    const key = halfKey(base.period, base.halfInning);
    const group: PendingGroup = {
      atBatKey,
      sortKey,
      period: base.period,
      halfInning: base.halfInning,
      teamId: base.teamId,
      homeAway: base.homeAway,
      batter: base.batter,
      pitcher: base.pitcher || pitcherByHalf.get(key) || null,
      pitches: [],
      resultPlay: null,
      resultText: "",
      resultType: null,
      scoringPlay: false,
      awayScore: undefined,
      homeScore: undefined,
      clock: null,
      firstIndex: idx,
    };
    groups.set(atBatKey, group);
    return group;
  }

  for (const p of sortedPlays) {
    const idx = minorRows.length + groups.size;
    const base = getEventBase(p, idx);
    if (!base.text) continue;
    if (isInningTransitionText(base.text, base.type)) continue;

    const key = halfKey(base.period, base.halfInning);
    const intro = parsePitcherBatterIntro(base.text);
    const atBatStem = atBatStemFromPlayId(p);
    const sortKey = readSortKey(p, idx);

    if (intro && atBatStem) {
      const group = getOrCreateGroup(`${base.period}-${base.halfInning || "x"}-${atBatStem}`, base, idx, sortKey);
      if (intro.pitcher) {
        group.pitcher = intro.pitcher;
        pitcherByHalf.set(key, intro.pitcher);
      }
      if (intro.batter) group.batter = intro.batter;
      if (!group.teamId && base.teamId) group.teamId = base.teamId;
      if (!group.homeAway && base.homeAway) group.homeAway = base.homeAway;
      continue;
    }

    const minor = isMinorBaseballEvent(base.text, base.type);
    const isFinalAtBat = looksLikeAtBat(base.text, base.type) && !/^pitch\s*\d*\s*:/i.test(base.text);
    const isPitchRow = !minor && !isFinalAtBat && isPitchEvent(base.text, base.type);

    if (atBatStem && (intro || isPitchRow || isFinalAtBat)) {
      const group = getOrCreateGroup(`${base.period}-${base.halfInning || "x"}-${atBatStem}`, base, idx, sortKey);
      if (base.batter && !group.batter) group.batter = base.batter;
      if (base.pitcher && !group.pitcher) group.pitcher = base.pitcher;
      if (!group.teamId && base.teamId) group.teamId = base.teamId;
      if (!group.homeAway && base.homeAway) group.homeAway = base.homeAway;
      group.period = group.period || base.period;
      group.halfInning = group.halfInning || base.halfInning;
      group.sortKey = Math.min(group.sortKey, sortKey);

      if (isPitchRow) {
        const extracted = extractPitchTexts(p);
        pushUnique(group.pitches, extracted.length ? extracted : [pitchTextFromRow(base.text, base.type)]);
        continue;
      }

      if (isFinalAtBat) {
        const extracted = extractPitchTexts(p);
        pushUnique(group.pitches, extracted);
        group.resultPlay = p;
        group.resultText = base.text;
        group.resultType = base.type;
        group.scoringPlay = !!p?.scoringPlay || isLikelyScoringText(base.text, base.type);
        group.awayScore = p?.awayScore;
        group.homeScore = p?.homeScore;
        group.clock = p?.clock?.displayValue || null;
        if (!group.batter) group.batter = inferBatterFromText(base.text);
        if (!group.pitcher) group.pitcher = pitcherByHalf.get(key) || null;
        if (group.pitcher) pitcherByHalf.set(key, group.pitcher);
        continue;
      }
    }

    if (minor || !atBatStem) {
      const pitcher = base.pitcher || inferPitcherFromText(base.text) || pitcherByHalf.get(key) || null;
      if (pitcher && /relieved|pitching change/i.test(base.text)) pitcherByHalf.set(key, pitcher);
      minorRows.push({
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
        sequence: minorRows.length,
      });
    }
  }

  const rows: MlbAtBat[] = [];
  for (const group of groups.values()) {
    if (!group.resultText && !group.pitches.length) continue;
    rows.push({
      id: String(group.resultPlay?.id || `live-${group.atBatKey}-${group.firstIndex}`),
      text: group.resultText || "Current at-bat",
      result: group.resultText ? normalizeResult(group.resultText, group.resultType) : "Current at-bat",
      period: group.period,
      halfInning: group.halfInning,
      teamId: group.teamId,
      homeAway: group.homeAway,
      scoringPlay: group.scoringPlay,
      awayScore: group.awayScore,
      homeScore: group.homeScore,
      type: group.resultType,
      clock: group.clock || null,
      batter: group.batter || (group.resultText ? inferBatterFromText(group.resultText) : null),
      pitcher: group.pitcher,
      pitches: group.pitches,
      isAtBat: true,
      isMinor: false,
      isComplete: !!group.resultText,
      sequence: group.sortKey,
    });
  }

  const allRows = [...rows, ...minorRows].sort((a, b) => {
    const ai = Number(a.id);
    const bi = Number(b.id);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return (a.sequence || 0) - (b.sequence || 0);
  });

  // Track running scores so any at-bat that increases the score is flagged as
  // a scoring play, even when ESPN forgets to mark the BIP pitch row itself.
  let lastAway = 0;
  let lastHome = 0;
  for (const row of allRows) {
    const awayScore = typeof row.awayScore === "number" ? row.awayScore : null;
    const homeScore = typeof row.homeScore === "number" ? row.homeScore : null;
    if (row.isAtBat && awayScore != null && homeScore != null) {
      if (awayScore > lastAway || homeScore > lastHome) row.scoringPlay = true;
      lastAway = awayScore;
      lastHome = homeScore;
    } else if (awayScore != null && homeScore != null) {
      lastAway = awayScore;
      lastHome = homeScore;
    }
  }

  return allRows.map((ab, sequence) => ({ ...ab, sequence }));
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
  const debug = searchParams.get("debug") === "1";

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

    if (debug && league === "mlb") {
      const rawPlays = Array.isArray(data?.plays) ? data.plays : [];
      const normalizedRawPlays = rawPlays.map((p: any, index: number) => ({
        index,
        id: p?.id,
        sequenceNumber: p?.sequenceNumber,
        text: p?.text || p?.description || "",
        type: p?.type?.text || p?.type?.abbreviation || null,
        period: p?.period?.number || p?.period || null,
        halfInning: readHalfInning(p),
        scoringPlay: !!p?.scoringPlay,
        awayScore: p?.awayScore,
        homeScore: p?.homeScore,
        extractedPitchTexts: extractPitchTexts(p),
        hasPlayEvents: Array.isArray(p?.playEvents),
        playEventsCount: Array.isArray(p?.playEvents) ? p.playEvents.length : 0,
        hasEvents: Array.isArray(p?.events),
        eventsCount: Array.isArray(p?.events) ? p.events.length : 0,
      }));

      return NextResponse.json({
        league,
        eventId,
        home,
        away,
        rawPlayCount: rawPlays.length,
        rawPlays: normalizedRawPlays,
        builtAtBats: mlbAtBats.map((ab) => ({
          sequence: ab.sequence,
          id: ab.id,
          period: ab.period,
          halfInning: ab.halfInning,
          result: ab.result,
          isAtBat: ab.isAtBat,
          isMinor: ab.isMinor,
          isComplete: ab.isComplete,
          pitches: ab.pitches,
          batter: ab.batter?.displayName || ab.batter?.name || null,
          pitcher: ab.pitcher?.displayName || ab.pitcher?.name || null,
          awayScore: ab.awayScore,
          homeScore: ab.homeScore,
        })),
      });
    }

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
