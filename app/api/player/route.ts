import { NextRequest, NextResponse } from "next/server";
import { currentSeasonYear } from "@/lib/espn";

export const revalidate = 900;

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

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 900 }, headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" } });
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  return res.json();
}

function espnPath(league: string) {
  const p = PATHS[league];
  return `${p.sport}/${p.league}`;
}
function corePath(league: string) {
  const p = PATHS[league];
  return `${p.sport}/leagues/${p.league}`;
}

function flattenStats(data: any) {
  const categories = data?.splits?.categories || [];
  return categories.map((cat: any) => ({
    name: cat.displayName || cat.name,
    stats: (cat.stats || []).map((s: any) => ({ label: s.displayName || s.shortDisplayName || s.name, value: s.displayValue ?? s.value ?? "—" })).filter((s: any) => s.value !== "—"),
  })).filter((c: any) => c.stats.length > 0);
}

function flattenGameLog(data: any) {
  const events = data?.events || data?.splits?.categories?.[0]?.events || data?.splits?.splits || [];
  if (!Array.isArray(events)) return [];
  return events.map((g: any) => ({
    id: g.id || g.eventId || g.event?.id || `${g.date || ""}-${g.opponent?.id || ""}`,
    date: g.date || g.event?.date || g.gameDate,
    opponent: g.opponent?.abbreviation || g.opponent?.displayName || g.team?.abbreviation || g.event?.shortName || "—",
    result: g.result || g.event?.competitions?.[0]?.status?.type?.shortDetail || "",
    stats: Object.entries(g.stats || g.stat || {}).slice(0, 8).map(([label, value]) => ({ label, value: String(value) })),
  })).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 25);
}

async function handleMlb(id: string) {
  const season = currentSeasonYear("mlb");
  const [personRes, seasonRes, gameLogRes] = await Promise.allSettled([
    fetchJson(`${MLB_STATSAPI}/people/${id}?hydrate=currentTeam`),
    fetchJson(`${MLB_STATSAPI}/people/${id}/stats?stats=season&group=hitting,pitching&season=${season}&gameType=R`),
    fetchJson(`${MLB_STATSAPI}/people/${id}/stats?stats=gameLog&group=hitting,pitching&season=${season}&gameType=R`),
  ]);
  const person = personRes.status === "fulfilled" ? personRes.value?.people?.[0] : null;
  const seasonData = seasonRes.status === "fulfilled" ? seasonRes.value : null;
  const gameLogData = gameLogRes.status === "fulfilled" ? gameLogRes.value : null;
  const stats = (seasonData?.stats || []).map((group: any) => ({
    name: group.group?.displayName || group.group?.displayName || group.type?.displayName || "Season",
    stats: Object.entries(group.splits?.[0]?.stat || {}).slice(0, 18).map(([label, value]) => ({ label, value: String(value) })),
  })).filter((g: any) => g.stats.length);
  const gameLog = (gameLogData?.stats || []).flatMap((group: any) => (group.splits || []).map((s: any) => ({
    id: `${s.date}-${s.opponent?.id || ""}-${group.group?.displayName || ""}`,
    date: s.date,
    opponent: s.opponent?.name || s.opponent?.abbreviation || "—",
    result: "",
    stats: Object.entries(s.stat || {}).slice(0, 8).map(([label, value]) => ({ label, value: String(value) })),
  }))).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 25);
  return { profile: {
    id,
    name: person?.fullName || `Player ${id}`,
    team: person?.currentTeam?.name || null,
    position: person?.primaryPosition?.abbreviation || person?.primaryPosition?.name || null,
    headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${id}/headshot/67/current`,
    bio: [person?.height, person?.weight ? `${person.weight} lbs` : null, person?.birthDate ? `Born ${person.birthDate}` : null].filter(Boolean).join(" · "),
  }, stats, gameLog };
}

async function handleEspn(league: string, id: string) {
  const season = currentSeasonYear(league);
  const [profileRes, statsRes, logRes] = await Promise.allSettled([
    fetchJson(`${SITE_WEB_API}/${espnPath(league)}/athletes/${id}`),
    fetchJson(`${CORE_API}/${corePath(league)}/seasons/${season}/types/2/athletes/${id}/statistics`),
    fetchJson(`${SITE_WEB_API}/${espnPath(league)}/athletes/${id}/gamelog?season=${season}`),
  ]);
  const athlete = profileRes.status === "fulfilled" ? (profileRes.value?.athlete || profileRes.value) : null;
  const statsData = statsRes.status === "fulfilled" ? statsRes.value : null;
  const logData = logRes.status === "fulfilled" ? logRes.value : null;
  return { profile: {
    id,
    name: athlete?.displayName || athlete?.fullName || athlete?.name || `Player ${id}`,
    team: athlete?.team?.displayName || athlete?.team?.name || null,
    position: athlete?.position?.abbreviation || athlete?.position?.displayName || null,
    headshot: athlete?.headshot?.href || athlete?.headshot || `https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png`,
    bio: [athlete?.height, athlete?.weight, athlete?.age ? `Age ${athlete.age}` : null].filter(Boolean).join(" · "),
  }, stats: flattenStats(statsData), gameLog: flattenGameLog(logData) };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league") || "";
  const id = searchParams.get("id") || "";
  if (!PATHS[league] || !id) return NextResponse.json({ error: "Missing league/id" }, { status: 400 });
  try {
    const data = league === "mlb" ? await handleMlb(id) : await handleEspn(league, id);
    return NextResponse.json({ league, id, ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Player fetch failed" }, { status: 500 });
  }
}
