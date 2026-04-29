// Formatting helpers for sports stats. The goal is consistent, readable output
// regardless of whether ESPN gave us a raw number or a pre-formatted string.
//
// Every function takes a value (number | string | null | undefined) and returns
// a display string. They never throw — they fall back to "—" for unusable input.

const DASH = "—";

function isNum(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toNum(v: any): number | null {
  if (isNum(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Baseball averages: .287 (no leading zero), .000 floor, three decimals.
export function fmtAvg(v: any): string {
  const n = toNum(v);
  if (n == null) return DASH;
  const fixed = n.toFixed(3);
  return fixed.startsWith("0") ? fixed.slice(1) : fixed;
}

// ERA / WHIP — two decimals, keep leading digit.
export function fmtRate2(v: any): string {
  const n = toNum(v);
  if (n == null) return DASH;
  return n.toFixed(2);
}

// Percentages: 45.2% (one decimal). Accepts 0–1 or 0–100 — auto-detects.
export function fmtPct(v: any): string {
  const n = toNum(v);
  if (n == null) return DASH;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

// Whole-number counts with thousands separators: 1,234
export function fmtCount(v: any): string {
  const n = toNum(v);
  if (n == null) return DASH;
  return Math.round(n).toLocaleString("en-US");
}

// One-decimal averages, e.g. 3.4 RBI/G
export function fmtDecimal1(v: any): string {
  const n = toNum(v);
  if (n == null) return DASH;
  return n.toFixed(1);
}

// Smart formatter: picks the right format based on a stat's machine name.
// This is the workhorse used by the Stats tab when we have a raw value but
// don't have a pre-formatted displayValue from ESPN.
export function fmtSmart(name: string, v: any): string {
  const k = (name || "").toLowerCase();

  // Baseball averages
  if (k === "avg" || k === "battingavg" || k.endsWith("avg") || k === "obp" || k === "slg" || k === "ops") {
    return fmtAvg(v);
  }
  // ERA / WHIP
  if (k === "era" || k === "whip") return fmtRate2(v);
  // Percentages
  if (k.endsWith("pct") || k.includes("percentage") || k.includes("percent")) return fmtPct(v);
  // Per-game rates
  if (k.includes("pergame") || k.endsWith("pg") || k.endsWith("/g")) return fmtDecimal1(v);

  // Default: integers get count formatting, fractions get 1-decimal.
  const n = toNum(v);
  if (n == null) return DASH;
  return Number.isInteger(n) ? fmtCount(n) : fmtDecimal1(n);
}

// Use ESPN's pre-formatted displayValue if present, otherwise fall back to fmtSmart.
// This is what most components will call.
export function fmtStatValue(stat: { name?: string; displayValue?: string; value?: any }): string {
  if (stat?.displayValue && stat.displayValue.trim() !== "") return stat.displayValue;
  return fmtSmart(stat?.name || "", stat?.value);
}

// Title-case a label that might be machine-formatted (e.g. "battingAvg" -> "Batting Avg").
// Only used as a fallback when ESPN gives us a name but no displayName.
export function humanizeName(name: string): string {
  if (!name) return "";
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
