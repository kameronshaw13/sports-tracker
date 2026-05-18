import type { EspnGame, NormalizedOdds } from "@/lib/oddsApi";

type StoredOddsRow = {
  league: string;
  event_id: string;
  game_date?: string | null;
  commence_time?: string | null;
  home_abbr?: string | null;
  away_abbr?: string | null;
  snapshot_type: string;
  pulled_at?: string | null;
  locked?: boolean;
  odds: NormalizedOdds;
};

type RefreshRunRow = {
  league: string;
  slate_date: string;
  wave_key: string;
  pulled_at?: string;
  window_from: string;
  window_to: string;
  game_count: number;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function oddsStoreEnabled() {
  return !!supabaseConfig();
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config) return null;
  const headers = new Headers(init.headers);
  headers.set("apikey", config.key);
  headers.set("Authorization", `Bearer ${config.key}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase odds store failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function gameIds(games: EspnGame[]) {
  return games.map((game) => String(game?.id || "")).filter(Boolean);
}

function bestRows(rows: StoredOddsRow[]) {
  const out = new Map<string, NormalizedOdds>();
  const sorted = rows.slice().sort((a, b) => {
    if (!!a.locked !== !!b.locked) return a.locked ? -1 : 1;
    return new Date(String(b.pulled_at || 0)).getTime() - new Date(String(a.pulled_at || 0)).getTime();
  });
  for (const row of sorted) {
    if (!row.event_id || !row.odds || out.has(String(row.event_id))) continue;
    out.set(String(row.event_id), row.odds);
  }
  return out;
}

export async function getStoredOddsForGames(league: string, games: EspnGame[]) {
  const ids = gameIds(games);
  if (!oddsStoreEnabled() || !ids.length) return new Map<string, NormalizedOdds>();
  try {
    const rows = await supabaseFetch(
      `odds_snapshots?select=league,event_id,snapshot_type,pulled_at,locked,odds&league=eq.${encodeURIComponent(league)}&event_id=in.(${ids.map(encodeURIComponent).join(",")})&order=pulled_at.desc`
    );
    return bestRows(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.warn(err);
    return new Map<string, NormalizedOdds>();
  }
}

export async function getStoredOddsForEvent(league: string, eventId: string) {
  if (!oddsStoreEnabled() || !eventId) return null;
  const rows = await getStoredOddsForGames(league, [{ id: eventId }]);
  return rows.get(String(eventId)) || null;
}

export async function hasRefreshRun(league: string, slateDate: string, waveKey: string) {
  if (!oddsStoreEnabled()) return false;
  try {
    const rows = await supabaseFetch(
      `odds_refresh_runs?select=wave_key&league=eq.${encodeURIComponent(league)}&slate_date=eq.${encodeURIComponent(slateDate)}&wave_key=eq.${encodeURIComponent(waveKey)}&limit=1`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn(err);
    return false;
  }
}

export async function recordRefreshRun(row: RefreshRunRow) {
  if (!oddsStoreEnabled()) return;
  await supabaseFetch("odds_refresh_runs?on_conflict=league,slate_date,wave_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
}

export async function claimRefreshRun(row: RefreshRunRow) {
  if (!oddsStoreEnabled()) return false;
  const result = await supabaseFetch("odds_refresh_runs?on_conflict=league,slate_date,wave_key", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) && result.length > 0;
}

export async function upsertOddsSnapshots(rows: StoredOddsRow[]) {
  if (!oddsStoreEnabled() || !rows.length) return 0;
  await supabaseFetch("odds_snapshots?on_conflict=league,event_id,snapshot_type", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

export async function lockStartedGames(league: string, games: EspnGame[]) {
  if (!oddsStoreEnabled()) return;
  const now = Date.now();
  const startedIds = games
    .filter((game) => {
      if (!game?.id) return false;
      if (String(game?.status?.state || "") !== "pre") return true;
      const start = new Date(String(game?.date || "")).getTime();
      return Number.isFinite(start) && start <= now;
    })
    .map((game) => String(game.id));
  if (!startedIds.length) return;
  try {
    await supabaseFetch(
      `odds_snapshots?league=eq.${encodeURIComponent(league)}&event_id=in.(${startedIds.map(encodeURIComponent).join(",")})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ locked: true }),
      }
    );
  } catch (err) {
    console.warn(err);
  }
}
