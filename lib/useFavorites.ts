"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { TeamConfig, DEFAULT_FAVORITES } from "./teams";

const STORAGE_KEY = "favoriteTeams_v1";

// --- Module-level singleton store ---
// Previously each useFavoriteTeams() call had its own useState, so when one
// component (e.g. ManageTeams) added a team, other components (page.tsx,
// HomeDashboard, TeamSelector) didn't see the change until a remount. This
// caused the bug where adding a team via "Manage" wouldn't update the active
// team in page.tsx, so it kept resetting to Orioles. A single shared store
// + subscription model fixes that — every hook instance reads the same data.

let currentFavorites: TeamConfig[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function readFromStorage(): TeamConfig[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(
      (t: any) => t && typeof t.key === "string" && t.league && t.abbr && t.name && t.primary
    );
    return valid.length > 0 ? (valid as TeamConfig[]) : null;
  } catch {
    return null;
  }
}

function writeToStorage(teams: TeamConfig[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {}
}

function setStore(next: TeamConfig[]) {
  currentFavorites = next;
  writeToStorage(next);
  notify();
}

// Lazy-init from localStorage on first read in the browser
function ensureInit() {
  if (currentFavorites !== null) return;
  if (typeof window === "undefined") return;
  currentFavorites = readFromStorage() ?? DEFAULT_FAVORITES;
}

// Listen for changes from other tabs so favorites stay in sync if the user
// opens the app in two tabs at once.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    currentFavorites = readFromStorage() ?? DEFAULT_FAVORITES;
    notify();
  });
}

// useSyncExternalStore is the React-correct way to subscribe to external
// stores. The third arg returns null on the server so SSR doesn't read
// localStorage and trigger hydration mismatches; the client-side getSnapshot
// inits lazily on first call.
function getSnapshot(): TeamConfig[] | null {
  ensureInit();
  return currentFavorites;
}
function getServerSnapshot(): TeamConfig[] | null {
  return null;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFavoriteTeams() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setFavorites = useCallback((next: TeamConfig[]) => setStore(next), []);

  const addTeam = useCallback((t: TeamConfig) => {
    const cur = currentFavorites ?? DEFAULT_FAVORITES;
    if (cur.some((f) => f.key === t.key)) return;
    setStore([...cur, t]);
  }, []);

  const removeTeam = useCallback((key: string) => {
    const cur = currentFavorites ?? DEFAULT_FAVORITES;
    setStore(cur.filter((f) => f.key !== key));
  }, []);

  const moveTeam = useCallback((key: string, direction: "up" | "down") => {
    const cur = currentFavorites ?? DEFAULT_FAVORITES;
    const idx = cur.findIndex((f) => f.key === key);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= cur.length) return;
    const next = [...cur];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setStore(next);
  }, []);

  const reset = useCallback(() => setStore(DEFAULT_FAVORITES), []);

  return { favorites, setFavorites, addTeam, removeTeam, moveTeam, reset };
}
