export type GameNavTarget = {
  league: string;
  eventId: string;
  freshKey?: string;
};

export function makeGameFreshKey() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function gameSummaryUrl(league: string, eventId: string, freshKey: string) {
  const params = new URLSearchParams({ league, event: eventId, _t: freshKey });
  return `/api/summary?${params.toString()}`;
}

export const gameSummaryFetcher = (url: string) => fetch(url).then((r) => r.json());

export function warmGameSummary<T extends { league: string; eventId: string }>(
  mutate: (key: string, data?: any, opts?: any) => any,
  game: T
): T & { freshKey: string } {
  const freshKey = makeGameFreshKey();
  const url = gameSummaryUrl(game.league, game.eventId, freshKey);
  void mutate(url, gameSummaryFetcher(url), { populateCache: true, revalidate: false });
  return { ...game, freshKey };
}
