"use client";

import { useState } from "react";

// v21.1: A bust-token that's stable for the lifetime of the component
// and unique to each mount. Append to API URLs as `&_t=${freshKey}` so
// that every navigation/tab-switch produces a different URL, forcing
// Next.js's route-handler cache to MISS and recompute.
//
// Why we need this:
//   In v20.x the user complained that switching tabs showed stale data
//   for ~15s before SWR's refreshInterval kicked in. Root cause: the
//   route handlers cache their JSON responses (via `export const
//   revalidate = N`), so even when SWR re-fetched on mount it received
//   the cached response. Adding `_t` to the URL gives each mount its
//   own cache entry, guaranteeing fresh computation.
//
// Why this is safe (i.e. doesn't hammer ESPN):
//   The route handler still benefits from the underlying ESPN fetch
//   cache (15-3600s depending on data type). So the route reruns its
//   computation on every mount, but the upstream calls are deduped by
//   Next's internal fetch cache. Net effect: snappy UI, controlled
//   ESPN traffic.
//
// Usage:
//   const freshKey = useFreshKey();
//   useSWR(`/api/scoreboard?team=${k}&_t=${freshKey}`, fetcher);
export function useFreshKey(): string {
  const [t] = useState(() => Date.now().toString(36));
  return t;
}
