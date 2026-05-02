import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";
import { ensureHash } from "@/lib/teams";

export const revalidate = 5;

const MLB_STATSAPI = "https://statsapi.mlb.com/api/v1";
const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

type TeamMeta = {
  id: string;
  abbr: string;
  name: string;
  logo?: string;
  color: string;
  score?: string | number;
};

type PitchEvent = {
  id: string;
  index: number;
  description: string;
  pitchNumber: number | null;
  pitchType: string | null;
  pitchName: string | null;
  velocity: number | null;
  px: number | null;
  pz: number | null;
  zone: number | null;
  isPitch: boolean;
  isBallInPlay: boolean;
  isStrike: boolean;
  isBall: boolean;
  count: { balls: number | null; strikes: number | null; outs: number | null };
  hitData: HitData | null;
};

type HitData = {
  exitVelocity: number | null;
  launchAngle: number | null;
  distance: number | null;
  trajectory: string | null;
  hardness: string | null;
  location: string | null;
  xba: number | null;
};

type MlbAtBat = {
  id: string;
  atBatIndex: number;
  inning: number;
  half: "top" | "bottom";
  battingTeam: "away" | "home";
  battingTeamAbbr: string;
  batter: string;
  pitcher: string;
  result: string;
  event: string;
  isComplete: boolean;
  isCurrent: boolean;
  rbi: number | null;
  awayScore: number | null;
  homeScore: number | null;
  startCount: { balls: number | null; strikes: number | null; outs: number | null };
  endCount: { balls: number | null; strikes: number | null; outs: number | null };
  pitches: PitchEvent[];
  hitData: HitData | null;
};

type MlbHalfInning = {
  id: string;
  inning: number;
  half: "top" | "bottom";
  battingTeam: "away" | "home";
  battingTeamAbbr: string;
  battingTeamLogo?: string;
  pitchingTeamAbbr: string;
  pitcher: string | null;
  atBats: MlbAtBat[];
  isCurrent: boolean;
};

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
  });
  if (!res.ok) throw new Error(`Fetch ${res.status}: ${url}`);
  return res.json();
}

function buildTeamMeta(c: any): TeamMeta | null {
  if (!c) return null;
  return {
    id: String(c.id || c.team?.id || ""),
    abbr: String(c.team?.abbreviation || "").toUpperCase(),
    name: c.team?.displayName || c.team?.name || "",
    logo: c.team?.logo || c.team?.logos?.[0]?.href,
    color: ensureHash(c.team?.color || c.color || ""),
    score: c.score,
  };
}

function extractGamePkFromText(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 100000 ? n : null;
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function mlbAbbrAliases(abbr: string): string[] {
  const a = String(abbr || "").toUpperCase();
  const aliases: Record<string, string[]> = {
    ARI: ["ARI", "AZ"],
    ATH: ["ATH", "OAK"],
    CWS: ["CWS", "CHW"],
    CHW: ["CHW", "CWS"],
    KCR: ["KCR", "KC"],
    SDP: ["SDP", "SD"],
    SFG: ["SFG", "SF"],
    TBR: ["TBR", "TB"],
    WSN: ["WSN", "WSH"],
  };
  return aliases[a] || [a];
}

function sameMlbTeam(a: string, b: string): boolean {
  const aa = mlbAbbrAliases(a);
  const bb = mlbAbbrAliases(b);
  return aa.some((x) => bb.includes(x));
}

async function findMlbGamePk(eventId: string, summary: any): Promise<number | null> {
  const direct = extractGamePkFromText(eventId);
  if (direct) {
    try {
      await fetchJson(`${MLB_STATSAPI}/game/${direct}/feed/live`);
      return direct;
    } catch {}
  }

  const comp = summary?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find((c: any) => c.homeAway === "home");
  const away = competitors.find((c: any) => c.homeAway === "away");
  const homeAbbr = String(home?.team?.abbreviation || "").toUpperCase();
  const awayAbbr = String(away?.team?.abbreviation || "").toUpperCase();
  const baseDate = comp?.date || summary?.header?.season?.year || new Date().toISOString();
  const date = new Date(baseDate);
  const startDate = toYmd(addDays(date, -1));
  const endDate = toYmd(addDays(date, 1));

  const url = `${MLB_STATSAPI}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,status`;
  const schedule = await fetchJson(url);
  const games = (schedule?.dates || []).flatMap((d: any) => d.games || []);

  const exact = games.find((g: any) => {
    const gh = g?.teams?.home?.team?.abbreviation || g?.teams?.home?.team?.teamCode;
    const ga = g?.teams?.away?.team?.abbreviation || g?.teams?.away?.team?.teamCode;
    return sameMlbTeam(gh, homeAbbr) && sameMlbTeam(ga, awayAbbr);
  });

  return exact?.gamePk ? Number(exact.gamePk) : null;
}

function readNumber(...values: any[]): number | null {
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readHitData(event: any): HitData | null {
  const h = event?.hitData || event?.details?.hitData || event?.result?.hitData;
  if (!h) return null;

  const xba = readNumber(
    h.estimatedBAUsingSpeedAngle,
    h.estimatedBattingAverage,
    h.xBA,
    h.xba,
    h.expectedBattingAverage
  );

  return {
    exitVelocity: readNumber(h.launchSpeed, h.exitVelocity, h.launch_speed),
    launchAngle: readNumber(h.launchAngle, h.launch_angle),
    distance: readNumber(h.totalDistance, h.distance, h.hitDistance),
    trajectory: h.trajectory || null,
    hardness: h.hardness || null,
    location: h.location != null ? String(h.location) : null,
    xba,
  };
}

function eventDescription(ev: any): string {
  return (
    ev?.details?.description ||
    ev?.details?.event ||
    ev?.result?.description ||
    ev?.result?.event ||
    ev?.play?.description ||
    "Pitch"
  );
}

function mapPitchEvent(ev: any, idx: number): PitchEvent {
  const details = ev?.details || {};
  const pitchData = ev?.pitchData || {};
  const coords = pitchData?.coordinates || {};
  const callCode = String(details?.call?.code || "").toUpperCase();
  const callDesc = String(details?.call?.description || details?.description || "").toLowerCase();
  const isPitch = !!ev?.isPitch || !!details?.type || !!pitchData?.startSpeed;
  const isBallInPlay = !!details?.isInPlay || !!ev?.hitData || /in play/.test(callDesc);
  const isStrike = !!details?.isStrike || ["C", "S", "T", "W", "M", "F", "L"].includes(callCode);
  const isBall = !!details?.isBall || ["B", "I", "P", "V"].includes(callCode);

  return {
    id: String(ev?.playId || ev?.index || idx),
    index: Number(ev?.index ?? idx),
    description: eventDescription(ev),
    pitchNumber: readNumber(ev?.pitchNumber, idx + 1),
    pitchType: details?.type?.code || null,
    pitchName: details?.type?.description || null,
    velocity: readNumber(pitchData?.startSpeed, pitchData?.endSpeed),
    px: readNumber(coords?.pX, coords?.px, coords?.x),
    pz: readNumber(coords?.pZ, coords?.pz, coords?.z),
    zone: readNumber(coords?.zone),
    isPitch,
    isBallInPlay,
    isStrike,
    isBall,
    count: {
      balls: readNumber(ev?.count?.balls),
      strikes: readNumber(ev?.count?.strikes),
      outs: readNumber(ev?.count?.outs),
    },
    hitData: readHitData(ev),
  };
}

function basesFromMatchup(matchup: any) {
  return {
    first: !!matchup?.postOnFirst?.id,
    second: !!matchup?.postOnSecond?.id,
    third: !!matchup?.postOnThird?.id,
    firstName: matchup?.postOnFirst?.fullName || null,
    secondName: matchup?.postOnSecond?.fullName || null,
    thirdName: matchup?.postOnThird?.fullName || null,
  };
}

function buildMlbLivePayload(live: any, summary: any, gamePk: number | null) {
  const comp = summary?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const espnHome = buildTeamMeta(competitors.find((c: any) => c.homeAway === "home"));
  const espnAway = buildTeamMeta(competitors.find((c: any) => c.homeAway === "away"));

  const box = live?.gameData || {};
  const linescore = live?.liveData?.linescore || {};
  const playsBlock = live?.liveData?.plays || {};
  const allPlays: any[] = Array.isArray(playsBlock?.allPlays) ? playsBlock.allPlays : [];
  const currentPlay = playsBlock?.currentPlay || allPlays[allPlays.length - 1] || null;

  const home: TeamMeta = {
    id: String(box?.teams?.home?.id || espnHome?.id || ""),
    abbr: String(box?.teams?.home?.abbreviation || espnHome?.abbr || "HOME").toUpperCase(),
    name: box?.teams?.home?.name || espnHome?.name || "Home",
    logo: espnHome?.logo,
    color: espnHome?.color || "#64748b",
    score: linescore?.teams?.home?.runs ?? espnHome?.score,
  };

  const away: TeamMeta = {
    id: String(box?.teams?.away?.id || espnAway?.id || ""),
    abbr: String(box?.teams?.away?.abbreviation || espnAway?.abbr || "AWAY").toUpperCase(),
    name: box?.teams?.away?.name || espnAway?.name || "Away",
    logo: espnAway?.logo,
    color: espnAway?.color || "#64748b",
    score: linescore?.teams?.away?.runs ?? espnAway?.score,
  };

  const atBats: MlbAtBat[] = allPlays.map((p: any, idx: number) => {
    const half = String(p?.about?.halfInning || "top").toLowerCase().startsWith("bot") ? "bottom" : "top";
    const battingTeam = half === "top" ? "away" : "home";
    const pitches = (Array.isArray(p?.playEvents) ? p.playEvents : [])
      .map((ev: any, evIdx: number) => mapPitchEvent(ev, evIdx))
      .filter((ev: PitchEvent) => ev.isPitch || ev.hitData || ev.description);
    const hitData = pitches.map((x) => x.hitData).find(Boolean) || readHitData(p);
    const result = String(p?.result?.description || p?.result?.event || "At-bat in progress");

    return {
      id: String(p?.playEndTime || p?.about?.atBatIndex || idx),
      atBatIndex: Number(p?.about?.atBatIndex ?? idx),
      inning: Number(p?.about?.inning || 0),
      half,
      battingTeam,
      battingTeamAbbr: battingTeam === "away" ? away.abbr : home.abbr,
      batter: p?.matchup?.batter?.fullName || "Batter",
      pitcher: p?.matchup?.pitcher?.fullName || "Pitcher",
      result,
      event: String(p?.result?.event || ""),
      isComplete: !!p?.about?.isComplete,
      isCurrent: currentPlay && Number(p?.about?.atBatIndex) === Number(currentPlay?.about?.atBatIndex),
      rbi: readNumber(p?.result?.rbi),
      awayScore: readNumber(p?.result?.awayScore),
      homeScore: readNumber(p?.result?.homeScore),
      startCount: {
        balls: readNumber(p?.count?.balls),
        strikes: readNumber(p?.count?.strikes),
        outs: readNumber(p?.count?.outs),
      },
      endCount: {
        balls: readNumber(p?.count?.balls),
        strikes: readNumber(p?.count?.strikes),
        outs: readNumber(p?.count?.outs),
      },
      pitches,
      hitData,
    };
  });

  const currentAtBatIndex = currentPlay?.about?.atBatIndex != null
    ? Number(currentPlay.about.atBatIndex)
    : atBats[atBats.length - 1]?.atBatIndex ?? null;
  const currentAtBat = atBats.find((a) => a.atBatIndex === currentAtBatIndex) || atBats[atBats.length - 1] || null;
  const currentHalf = currentAtBat ? { inning: currentAtBat.inning, half: currentAtBat.half } : null;

  const halfInningsMap = new Map<string, MlbHalfInning>();
  for (const ab of atBats) {
    const key = `${ab.inning}-${ab.half}`;
    if (!halfInningsMap.has(key)) {
      const battingTeam = ab.battingTeam;
      const pitchingTeam = battingTeam === "away" ? "home" : "away";
      halfInningsMap.set(key, {
        id: key,
        inning: ab.inning,
        half: ab.half,
        battingTeam,
        battingTeamAbbr: battingTeam === "away" ? away.abbr : home.abbr,
        battingTeamLogo: battingTeam === "away" ? away.logo : home.logo,
        pitchingTeamAbbr: pitchingTeam === "away" ? away.abbr : home.abbr,
        pitcher: ab.pitcher || null,
        atBats: [],
        isCurrent: !!currentHalf && currentHalf.inning === ab.inning && currentHalf.half === ab.half,
      });
    }
    const half = halfInningsMap.get(key)!;
    half.atBats.push(ab);
    if (ab.isCurrent || !half.pitcher) half.pitcher = ab.pitcher;
  }

  const halfInnings = Array.from(halfInningsMap.values()).sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    if (a.half === b.half) return 0;
    return a.half === "top" ? -1 : 1;
  });

  const matchup = currentPlay?.matchup || {};
  const situation = {
    balls: readNumber(linescore?.balls, currentAtBat?.endCount?.balls),
    strikes: readNumber(linescore?.strikes, currentAtBat?.endCount?.strikes),
    outs: readNumber(linescore?.outs, currentAtBat?.endCount?.outs),
    inning: readNumber(linescore?.currentInning, currentAtBat?.inning),
    half: String(linescore?.inningHalf || currentAtBat?.half || "").toLowerCase().startsWith("bot") ? "bottom" : "top",
    batter: matchup?.batter?.fullName || currentAtBat?.batter || null,
    pitcher: matchup?.pitcher?.fullName || currentAtBat?.pitcher || null,
    bases: basesFromMatchup(matchup),
  };

  const currentHalfAtBats = currentHalf
    ? atBats.filter((ab) => ab.inning === currentHalf.inning && ab.half === currentHalf.half)
    : [];

  return {
    league: "mlb",
    source: "mlb-live-feed",
    gamePk,
    status: {
      state: comp?.status?.type?.state || box?.status?.abstractGameState,
      detail: comp?.status?.type?.shortDetail || box?.status?.detailedState,
    },
    home,
    away,
    situation,
    currentAtBat,
    currentHalfAtBats,
    halfInnings,
    atBats,
  };
}

function buildMlbEspnFallback(summary: any, reason?: string) {
  const comp = summary?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = buildTeamMeta(competitors.find((c: any) => c.homeAway === "home"));
  const away = buildTeamMeta(competitors.find((c: any) => c.homeAway === "away"));
  const plays = Array.isArray(summary?.plays) ? summary.plays : [];
  return {
    league: "mlb",
    source: "espn-fallback",
    error: reason || null,
    status: {
      state: comp?.status?.type?.state,
      detail: comp?.status?.type?.shortDetail,
    },
    home,
    away,
    situation: summary?.situation || null,
    currentAtBat: null,
    currentHalfAtBats: [],
    halfInnings: [],
    atBats: [],
    fallbackPlays: plays.map((p: any) => ({
      id: String(p.id),
      text: String(p.text || ""),
      period: p.period?.number || 0,
      clock: p.clock?.displayValue || null,
      scoringPlay: !!p.scoringPlay,
    })),
  };
}

function buildFootballPayload(summary: any) {
  const comp = summary?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = buildTeamMeta(competitors.find((c: any) => c.homeAway === "home"));
  const away = buildTeamMeta(competitors.find((c: any) => c.homeAway === "away"));
  const situation = summary?.situation || null;
  const drives = [
    ...(Array.isArray(summary?.drives?.previous) ? summary.drives.previous : []),
    ...(summary?.drives?.current ? [summary.drives.current] : []),
  ].map((d: any, idx: number) => ({
    id: String(d.id || idx),
    description: d.description || "",
    result: d.displayResult || d.result || "",
    start: d.start?.text || null,
    end: d.end?.text || null,
    team: d.team?.abbreviation || d.team?.displayName || "",
  }));

  return { league: "nfl", source: "espn", home, away, situation, drives };
}

function buildHockeyPayload(summary: any) {
  const comp = summary?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = buildTeamMeta(competitors.find((c: any) => c.homeAway === "home"));
  const away = buildTeamMeta(competitors.find((c: any) => c.homeAway === "away"));
  const plays = Array.isArray(summary?.plays) ? summary.plays : [];
  const shots = plays
    .filter((p: any) => /shot|goal|save|missed|blocked/i.test(String(p?.type?.text || p?.text || "")))
    .map((p: any) => ({
      id: String(p.id),
      text: p.text || "",
      period: p.period?.number || 0,
      teamId: p.team?.id || null,
      x: readNumber(p.coordinate?.x, p.coordinates?.x, p.x),
      y: readNumber(p.coordinate?.y, p.coordinates?.y, p.y),
      xg: readNumber(p.xg, p.expectedGoals),
      scoringPlay: !!p.scoringPlay,
    }));
  return { league: "nhl", source: "espn", home, away, shots };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const eventId = searchParams.get("event");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return json({ error: "Invalid league" }, 400);
  }
  if (!eventId) return json({ error: "Missing event id" }, 400);

  try {
    const summary = await getGameSummary(league, eventId);

    if (league === "mlb") {
      try {
        const gamePk = await findMlbGamePk(eventId, summary);
        if (!gamePk) return json(buildMlbEspnFallback(summary, "Could not match ESPN event to MLB gamePk"));
        const live = await fetchJson(`${MLB_STATSAPI}/game/${gamePk}/feed/live`);
        return json(buildMlbLivePayload(live, summary, gamePk));
      } catch (err: any) {
        return json(buildMlbEspnFallback(summary, err?.message || "MLB live feed unavailable"));
      }
    }

    if (league === "nfl") return json(buildFootballPayload(summary));
    if (league === "nhl") return json(buildHockeyPayload(summary));

    return json({ league, source: "none", message: "No gamecast visualization for this league yet." });
  } catch (err: any) {
    return json({ error: err?.message || "Fetch failed" }, 500);
  }
}
