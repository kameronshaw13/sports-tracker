"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { League } from "./teams";

export type ScoreDensity = "compact" | "expanded";
export type AppTheme = "dark" | "light";

export type AppSettings = {
  density: ScoreDensity;
  sportOrder: League[];
  theme: AppTheme;
};

const STORAGE_KEY = "sportsTracker_settings_v2";
export const DEFAULT_SPORT_ORDER: League[] = ["mlb", "nba", "nhl", "nfl", "cfb", "cbb"];
const DEFAULT_SETTINGS: AppSettings = { density: "expanded", sportOrder: DEFAULT_SPORT_ORDER, theme: "dark" };

let currentSettings: AppSettings | null = null;
const listeners = new Set<() => void>();

function normalize(raw: any): AppSettings {
  const density: ScoreDensity = raw?.density === "compact" ? "compact" : "expanded";
  const theme: AppTheme = raw?.theme === "light" ? "light" : "dark";
  const inputOrder = Array.isArray(raw?.sportOrder) ? raw.sportOrder : [];
  const seen = new Set<string>();
  const cleaned = inputOrder.filter((l: any) => DEFAULT_SPORT_ORDER.includes(l) && !seen.has(l) && seen.add(l));
  const missing = DEFAULT_SPORT_ORDER.filter((l) => !seen.has(l));
  return { density, sportOrder: [...cleaned, ...missing], theme };
}

function readFromStorage(): AppSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem("sportsTracker_settings_v1");
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch { return null; }
}
function writeToStorage(settings: AppSettings) { if (typeof window !== "undefined") { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {} } }
function notify() { listeners.forEach((l) => l()); }
function setStore(next: AppSettings) { currentSettings = normalize(next); writeToStorage(currentSettings); notify(); }
function ensureInit() { if (currentSettings !== null) return; if (typeof window !== "undefined") currentSettings = readFromStorage() ?? DEFAULT_SETTINGS; }
function getSnapshot(): AppSettings | null { ensureInit(); return currentSettings; }
function getServerSnapshot(): AppSettings | null { return null; }
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY && e.key !== "sportsTracker_settings_v1") return;
    currentSettings = readFromStorage() ?? DEFAULT_SETTINGS;
    notify();
  });
}

export function useAppSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) ?? DEFAULT_SETTINGS;
  const setDensity = useCallback((density: ScoreDensity) => setStore({ ...settings, density }), [settings]);
  const setTheme = useCallback((theme: AppTheme) => setStore({ ...settings, theme }), [settings]);
  const moveSport = useCallback((league: League, direction: "up" | "down") => {
    const idx = settings.sportOrder.indexOf(league);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= settings.sportOrder.length) return;
    const next = [...settings.sportOrder];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setStore({ ...settings, sportOrder: next });
  }, [settings]);
  const resetSettings = useCallback(() => setStore(DEFAULT_SETTINGS), []);
  return { settings, setDensity, setTheme, moveSport, resetSettings };
}
