import { NextRequest, NextResponse } from "next/server";
import { getMlbHeadshotUrl, getMlbTeamId } from "@/lib/espn";
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

async function getMlbTransactions(abbr: string): Promise<Transaction[]> {
  const teamId = getMlbTeamId(abbr);
  if (!teamId) return [];

  const startDate = todayMinus(60);
  const endDate = new Date().toISOString().slice(0, 10);
  const data = await fetchJson(`${MLB_STATSAPI}/transactions?teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`);
  const items: any[] = data?.transactions || [];

  return items
    .map((tx, index) => {
      const person = tx?.person || tx?.player || {};
      const playerId = person?.id ? String(person.id) : null;
      const playerName = person?.fullName || person?.displayName || person?.name || tx?.player || "Team Transaction";
      const type = tx?.typeDesc || tx?.typeCode || tx?.description || "Transaction";
      const text = cleanupTransactionText(tx?.description || tx?.typeDesc || type, String(playerName));
      return {
        id: String(tx?.id || `${playerId || playerName}-${tx?.date || index}-${index}`),
        date: tx?.date || tx?.effectiveDate || null,
        playerName: String(playerName),
        playerId,
        position: tx?.position || person?.primaryPosition?.abbreviation || null,
        headshot: playerId ? getMlbHeadshotUrl(playerId) : null,
        text,
        type: String(type),
      };
    })
    .filter((tx) => tx.playerName && tx.text)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 60);
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
  const athlete = item?.athlete || item?.player || item?.person || item?.participants?.[0]?.athlete || {};
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
