import { NextRequest, NextResponse } from "next/server";
import { getMlbTeamId } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 1800;

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_WEB_API = "https://site.web.api.espn.com/apis/site/v2/sports";
const MLB_STATSAPI = "https://statsapi.mlb.com/api/v1";

const PATHS: Record<string, { sport: string; league: string }> = {
  mlb: { sport: "baseball", league: "mlb" },
  nfl: { sport: "football", league: "nfl" },
  nba: { sport: "basketball", league: "nba" },
  nhl: { sport: "hockey", league: "nhl" },
  cfb: { sport: "football", league: "college-football" },
  cbb: { sport: "basketball", league: "mens-college-basketball" },
};

type Transaction = {
  id: string;
  date?: string | null;
  playerName: string;
  playerId?: string | null;
  position?: string | null;
  headshot?: string | null;
  text: string;
  type?: string | null;
};

const TRANSACTION_LOOKBACK_DAYS = 24;

function path(league: string): string {
  const p = PATHS[league];
  if (!p) throw new Error(`Unknown league: ${league}`);
  return `${p.sport}/${p.league}`;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      headers: { "User-Agent": "Mozilla/5.0 SportsTracker/1.0" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalizeNameKey(value: any): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAthletes(data: any): any[] {
  const top = data?.athletes || data?.team?.athletes;
  if (!Array.isArray(top)) return [];
  if (top.length > 0 && Array.isArray(top[0]?.items)) {
    return top.flatMap((group: any) => Array.isArray(group?.items) ? group.items : []);
  }
  return top;
}

function readEspnHeadshot(profile: any, league: string): string | null {
  const id = profile?.id ? String(profile.id) : null;
  return (
    profile?.headshot?.href ||
    (typeof profile?.headshot === "string" ? profile.headshot : null) ||
    (id ? `https://a.espncdn.com/i/headshots/${league}/players/full/${id}.png` : null)
  );
}

function readTransactionAthlete(item: any): any {
  return (
    item?.athlete ||
    item?.player ||
    item?.person ||
    item?.participant?.athlete ||
    item?.participants?.[0]?.athlete ||
    item?.athletes?.[0] ||
    {}
  );
}

function readInjuryAthlete(item: any): any {
  return item?.athlete || item?.player || item?.person || {};
}

function getByName<T>(map: Map<string, T>, name: string): T | undefined {
  const key = normalizeNameKey(name);
  if (map.has(key)) return map.get(key);
  const parts = key.split(" ").filter(Boolean);
  if (parts.length < 2) return undefined;
  const last = parts[parts.length - 1];
  const first = parts[0];
  for (const [candidate, value] of map.entries()) {
    if (candidate.endsWith(` ${last}`) && candidate.startsWith(first)) return value;
  }
  return undefined;
}

async function getMlbEspnProfilesByName(abbr: string): Promise<Map<string, any>> {
  const p = path("mlb");
  const urls = [
    `${SITE_API}/${p}/teams/${abbr}/roster`,
    `${SITE_WEB_API}/${p}/teams/${abbr}/roster`,
    `${SITE_API}/${p}/teams/${abbr}?enable=roster,injuries,transactions`,
    `${SITE_WEB_API}/${p}/teams/${abbr}?enable=roster,injuries,transactions`,
    `${SITE_API}/${p}/teams/${abbr}?enable=injuries`,
    `${SITE_WEB_API}/${p}/teams/${abbr}?enable=injuries`,
    `${SITE_API}/${p}/teams/${abbr}?enable=transactions`,
    `${SITE_WEB_API}/${p}/teams/${abbr}?enable=transactions`,
    `${SITE_API}/${p}/teams/${abbr}?enable=roster`,
    `${SITE_WEB_API}/${p}/teams/${abbr}?enable=roster`,
  ];

  const map = new Map<string, any>();
  for (const url of urls) {
    const data = await fetchJson(url);
    for (const athlete of parseAthletes(data)) {
      const key = normalizeNameKey(athlete?.fullName || athlete?.displayName || athlete?.name);
      if (key) map.set(key, athlete);
    }
    const injuries = data?.team?.injuries || data?.injuries || [];
    if (Array.isArray(injuries)) {
      for (const injury of injuries) {
        const athlete = readInjuryAthlete(injury);
        const key = normalizeNameKey(athlete?.fullName || athlete?.displayName || athlete?.name);
        if (key && athlete) map.set(key, athlete);
      }
    }
    for (const tx of extractTransactions(data)) {
      const athlete = readTransactionAthlete(tx);
      const key = normalizeNameKey(athlete?.fullName || athlete?.displayName || athlete?.name);
      if (key && athlete) map.set(key, athlete);
    }
  }
  return map;
}

async function getMlbTransactions(abbr: string): Promise<Transaction[]> {
  const teamId = getMlbTeamId(abbr);
  if (!teamId) return [];

  const startDate = todayMinus(TRANSACTION_LOOKBACK_DAYS);
  const endDate = new Date().toISOString().slice(0, 10);
  const [data, espnByName, espnTransactions] = await Promise.all([
    fetchJson(`${MLB_STATSAPI}/transactions?teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`),
    getMlbEspnProfilesByName(abbr),
    getEspnTransactions("mlb", abbr),
  ]);
  const espnTxByName = new Map(
    espnTransactions
      .filter((tx) => tx.headshot)
      .map((tx) => [normalizeNameKey(tx.playerName), tx])
  );
  const cutoffTime = new Date(startDate).getTime();
  const items: any[] = data?.transactions || [];

  return items
    .filter((tx) => {
      const time = new Date(tx?.date || tx?.effectiveDate || 0).getTime();
      return Number.isFinite(time) && time >= cutoffTime;
    })
    .map((tx, index) => {
      const person = tx?.person || tx?.player || {};
      const playerId = person?.id ? String(person.id) : null;
      const playerName = person?.fullName || person?.displayName || person?.name || tx?.player || "Team Transaction";
      const type = tx?.typeDesc || tx?.typeCode || tx?.description || "Transaction";
      const text = cleanupTransactionText(tx?.description || tx?.typeDesc || type, String(playerName));
      const espnProfile = getByName(espnByName, playerName);
      const espnTx = getByName(espnTxByName, playerName);
      return {
        id: String(tx?.id || `${playerId || playerName}-${tx?.date || index}-${index}`),
        date: tx?.date || tx?.effectiveDate || null,
        playerName: String(playerName),
        playerId,
        position: tx?.position || person?.primaryPosition?.abbreviation || null,
        headshot: readEspnHeadshot(espnProfile, "mlb") || espnTx?.headshot || null,
        text,
        type: String(type),
      };
    })
    .filter((tx) => tx.playerName && tx.text)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 40);
}

async function getEspnTransactions(league: string, abbr: string): Promise<Transaction[]> {
  const p = path(league);
  const urls = [
    `${SITE_API}/${p}/teams/${abbr}/transactions`,
    `${SITE_WEB_API}/${p}/teams/${abbr}/transactions`,
    `${SITE_API}/${p}/teams/${abbr}?enable=transactions`,
    `${SITE_WEB_API}/${p}/teams/${abbr}?enable=transactions`,
  ];

  const collected: Transaction[] = [];
  for (const url of urls) {
    const data = await fetchJson(url);
    const raw = extractTransactions(data);
    for (const item of raw) {
      const tx = normalizeEspnTransaction(item, league, collected.length);
      if (tx) collected.push(tx);
    }
    if (collected.length > 0) break;
  }

  const seen = new Set<string>();
  return collected
    .filter((tx) => {
      const key = `${tx.date || ""}-${tx.playerName}-${tx.text}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 60);
}

function extractTransactions(data: any): any[] {
  if (!data) return [];
  const direct = data?.transactions || data?.team?.transactions || data?.items || data?.events;
  if (Array.isArray(direct)) return direct;

  const found: any[] = [];
  const visited = new Set<any>();
  const walk = (value: any, depth: number) => {
    if (!value || depth > 5 || visited.has(value)) return;
    if (typeof value !== "object") return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (/transactions?/i.test(key) && Array.isArray(child)) {
        found.push(...child);
      } else if (child && typeof child === "object") {
        walk(child, depth + 1);
      }
    }
  };
  walk(data, 0);
  return found;
}

function normalizeEspnTransaction(item: any, league: string, index: number): Transaction | null {
  if (!item || typeof item !== "object") return null;
  const athlete = readTransactionAthlete(item);
  const playerId = athlete?.id ? String(athlete.id) : item?.athleteId ? String(item.athleteId) : null;
  const playerName =
    athlete?.fullName ||
    athlete?.displayName ||
    athlete?.name ||
    item?.playerName ||
    item?.name ||
    item?.headline ||
    "Team Transaction";
  const rawText =
    item?.description ||
    item?.shortDescription ||
    item?.text ||
    item?.headline ||
    item?.type?.description ||
    item?.type?.text ||
    item?.type ||
    "Transaction";
  const text = cleanupTransactionText(rawText, String(playerName));
  if (!playerName || !text) return null;

  return {
    id: String(item?.id || `${playerId || playerName}-${item?.date || index}-${index}`),
    date: item?.date || item?.transactionDate || item?.effectiveDate || item?.timestamp || null,
    playerName: String(playerName),
    playerId,
    position: athlete?.position?.abbreviation || athlete?.position?.abbr || item?.position || null,
    headshot: athlete?.headshot?.href || (typeof athlete?.headshot === "string" ? athlete.headshot : null) || (playerId ? `https://a.espncdn.com/i/headshots/${league}/players/full/${playerId}.png` : null),
    text,
    type: typeof item?.type === "string" ? item.type : item?.type?.description || null,
  };
}

function cleanupTransactionText(value: any, playerName: string): string {
  let text = String(value || "Transaction")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
  if (!text) text = "Transaction";

  const escapedName = playerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^${escapedName}\s*:?\s*`, "i"), "").trim();
  text = text.replace(/^was\s+/i, "").trim();
  if (text) text = text[0].toUpperCase() + text.slice(1);
  return text || "Transaction";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");
  const parsed = parseTeamKey(teamKey);
  if (!parsed) {
    return NextResponse.json({ error: "Missing or invalid team" }, { status: 400 });
  }

  const transactions = parsed.league === "mlb"
    ? await getMlbTransactions(parsed.abbr)
    : await getEspnTransactions(parsed.league, parsed.abbr);

  return NextResponse.json({ team: parsed.abbr.toUpperCase(), league: parsed.league, transactions });
}
