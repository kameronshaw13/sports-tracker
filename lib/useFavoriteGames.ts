"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "favoriteGamesByDate_v1";

type FavoriteGamesByDate = Record<string, string[]>;

let currentFavorites: FavoriteGamesByDate | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function readFromStorage(): FavoriteGamesByDate {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const cleaned: FavoriteGamesByDate = {};
    for (const [date, keys] of Object.entries(parsed)) {
      if (!/^\d{8}$/.test(date) || !Array.isArray(keys)) continue;
      const valid = keys.filter((key) => typeof key === "string" && key.includes(":"));
      if (valid.length) cleaned[date] = Array.from(new Set(valid));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeToStorage(next: FavoriteGamesByDate) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function ensureInit() {
  if (currentFavorites !== null) return;
  if (typeof window === "undefined") return;
  currentFavorites = readFromStorage();
}

function getSnapshot(): FavoriteGamesByDate {
  ensureInit();
  return currentFavorites || {};
}

function getServerSnapshot(): FavoriteGamesByDate {
  return {};
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    currentFavorites = readFromStorage();
    notify();
  });
}

export function favoriteGameKey(league: string, eventId: string) {
  return `${String(league || "").toLowerCase()}:${String(eventId || "")}`;
}

export function gameDateKey(value: string | Date | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export function useFavoriteGames() {
  const favoriteGames = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleGame = useCallback((dateKey: string, league: string, eventId: string) => {
    if (!dateKey || !eventId) return;
    const key = favoriteGameKey(league, eventId);
    const current = currentFavorites || readFromStorage();
    const dayGames = new Set(current[dateKey] || []);
    if (dayGames.has(key)) {
      dayGames.delete(key);
    } else {
      dayGames.add(key);
    }

    const next: FavoriteGamesByDate = { ...current };
    const list = Array.from(dayGames);
    if (list.length) {
      next[dateKey] = list;
    } else {
      delete next[dateKey];
    }

    currentFavorites = next;
    writeToStorage(next);
    notify();
  }, []);

  const isFavoriteGame = useCallback((dateKey: string, league: string, eventId: string) => {
    if (!dateKey || !eventId) return false;
    return Boolean((favoriteGames[dateKey] || []).includes(favoriteGameKey(league, eventId)));
  }, [favoriteGames]);

  return { favoriteGames, toggleGame, isFavoriteGame };
}
