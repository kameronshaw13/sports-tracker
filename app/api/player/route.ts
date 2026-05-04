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

const STAT_LABELS: Record<string, string[]> = {
  mlb_batting: ["gamesPlayed", "atBats", "runs", "hits", "homeRuns", "RBIs", "walks", "strikeouts", "avg", "onBasePct", "slugAvg", "OPS"],
  mlb_pitching: ["gamesPlayed", "gamesStarted", "wins", "losses", "saves", "innings", "hits", "earnedRuns", "walks", "strikeouts", "ERA", "WHIP"],
  nfl: ["gamesPlayed", "passingYards", "passingTouchdowns", "interceptions", "rushingYards", "rushingTouchdowns", "receivingYards", "receivingTouchdowns", "totalTackles", "sacks"],
  cfb: ["gamesPlayed", "passingYards", "passingTouchdowns", "interceptions", "rushingYards", "rushingTouchdowns", "receivingYards", "receivingTouchdowns", "totalTackles", "sacks"],
  nba: ["gamesPlayed", "avgMinutes", "pointsPerGame", "reboundsPerGame", "assistsPerGame", "stealsPerGame", "blocksPerGame", "fieldGoalPct", "threePointPct", "freeThrowPct"],
  cbb: ["gamesPlayed", "avgMinutes", "pointsPerGame", "reboundsPerGame", "assistsPerGame", "stealsPerGame", "blocksPerGame", "fieldGoalPct", "threePointPct", "freeThrowPct"],
  nhl: ["gamesPlayed", "goals", "assists", "points", "plusMinus", "shots", "hits", "blockedShots", "savePct", "goalsAgainstAverage"],
};

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  return res.json();
}
function espnPath(league: string) { const p = PATHS[league]; return `${p.sport}/${p.league}`; }
function corePath(league: string) { const p = PATHS[league]; return `${p.sport}/leagues/${p.league}`; }
function pretty(s: string) { return String(s).replace(/Pct$/," %").replace(/avg/i,"Avg ").replace(/([A-Z])/g," $1").replace(/^./,(c)=>c.toUpperCase()).trim(); }
function statValue(v: any) { return v?.displayValue ?? v?.value ?? v ?? "—"; }

function curateEspnStats(league: string, data: any) {
  const wanted = STAT_LABELS[league] || [];
  const found = new Map<string, any>();
  for (const cat of data?.splits?.categories || []) {
    for (const s of cat?.stats || []) {
      if (!s?.name) continue;
      found.set(s.name, s);
    }
  }
  const stats = wanted
    .map((key) => found.get(key) ? { label: pretty(key), value: statValue(found.get(key)) } : null)
    .filter(Boolean);
  return stats.length ? [{ name: "Season Stats", stats }] : [];
}

function curateMlbStats(data: any) {
  return (data?.stats || []).map((group: any) => {
    const groupName = String(group.group?.displayName || group.group?.displayName || group.type?.displayName || "Stats");
    const stat = group.splits?.[0]?.stat || {};
    const key = /pitch/i.test(groupName) ? "mlb_pitching" : "mlb_batting";
    const stats = (STAT_LABELS[key] || []).filter((k) => stat[k] != null).map((k) => ({ label: pretty(k), value: String(stat[k]) }));
    return { name: groupName, stats };
  }).filter((g: any) => g.stats.length);
}

function flattenEspnGameLog(league: string, data: any) {
  const wanted = STAT_LABELS[league] || [];
  const events = data?.events || data?.splits?.splits || [];
  if (!Array.isArray(events)) return [];
  return events.map((g: any) => {
    const raw = g.stats || g.stat || {};
    const stats = Array.isArray(raw)
      ? raw.slice(0, 7).map((x: any) => ({ label: pretty(x.name || x.displayName || "Stat"), value: statValue(x) }))
      : wanted.filter((k) => raw[k] != null).slice(0, 7).map((k) => ({ label: pretty(k), value: String(raw[k]) }));
    return {
      id: g.id || g.eventId || g.event?.id || `${g.date || ""}-${g.opponent?.id || ""}`,
      date: g.date || g.event?.date || g.gameDate,
      opponent: g.opponent?.abbreviation || g.opponent?.displayName || g.event?.shortName || "—",
      stats,
    };
  }).filter((r: any) => r.date && r.stats.length).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40);
}

function flattenMlbGameLog(data: any) {
  return (data?.stats || []).flatMap((group: any) => (group.splits || []).map((s: any) => {
    const stat = s.stat || {};
    const key = /pitch/i.test(group.group?.displayName || "") ? "mlb_pitching" : "mlb_batting";
    return {
      id: `${s.date}-${s.opponent?.id || ""}-${group.group?.displayName || ""}`,
      date: s.date,
      opponent: s.opponent?.name || s.opponent?.abbreviation || "—",
      stats: (STAT_LABELS[key] || []).filter((k) => stat[k] != null).slice(0, 7).map((k) => ({ label: pretty(k), value: String(stat[k]) })),
    };
  })).filter((r: any) => r.date && r.stats.length).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 40);
}

async function handleMlb(id: string, fallbackName: string) {
  const season = currentSeasonYear("mlb");
  const [personRes, seasonRes, gameLogRes] = await Promise.allSettled([
    fetchJson(`${MLB_STATSAPI}/people/${id}?hydrate=currentTeam`),
    fetchJson(`${MLB_STATSAPI}/people/${id}/stats?stats=season&group=hitting,pitching&season=${season}&gameType=R`),
    fetchJson(`${MLB_STATSAPI}/people/${id}/stats?stats=gameLog&group=hitting,pitching&season=${season}&gameType=R`),
  ]);
  const person = personRes.status === "fulfilled" ? personRes.value?.people?.[0] : null;
  const seasonData = seasonRes.status === "fulfilled" ? seasonRes.value : null;
  const gameLogData = gameLogRes.status === "fulfilled" ? gameLogRes.value : null;
  return { profile: {
    id,
    name: person?.fullName || fallbackName || `Player ${id}`,
    team: person?.currentTeam?.name || null,
    position: person?.primaryPosition?.abbreviation || person?.primaryPosition?.name || null,
    headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${id}/headshot/67/current`,
    bio: [person?.height, person?.weight ? `${person.weight} lbs` : null, person?.birthDate ? `Born ${person.birthDate}` : null].filter(Boolean).join(" · "),
  }, stats: curateMlbStats(seasonData), gameLog: flattenMlbGameLog(gameLogData) };
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
  return { profile: {
    id,
    name: athlete?.displayName || athlete?.fullName || athlete?.name || fallbackName || `Player ${id}`,
    team: athlete?.team?.displayName || athlete?.team?.name || null,
    position: athlete?.position?.abbreviation || athlete?.position?.displayName || null,
    headshot,
    bio: [athlete?.height, athlete?.weight, athlete?.age ? `Age ${athlete.age}` : null].filter(Boolean).join(" · "),
  }, stats: curateEspnStats(league, statsData), gameLog: flattenEspnGameLog(league, logData) };
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
