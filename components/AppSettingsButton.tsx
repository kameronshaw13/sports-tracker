"use client";

import { useState } from "react";
import { League } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";

const LABELS: Record<League, string> = { mlb: "MLB", nba: "NBA", nhl: "NHL", nfl: "NFL", cfb: "CFB", cbb: "CBB" };

export default function AppSettingsButton() {
  const [open, setOpen] = useState(false);
  const { settings, setDensity, setTheme, moveSport, resetSettings } = useAppSettings();
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }} aria-label="Settings">⚙</button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl p-4 shadow-xl space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Settings</h3><button className="text-xs" style={{ color: "var(--text-3)" }} onClick={() => setOpen(false)}>Close</button></div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Theme</div>
            <div className="grid grid-cols-2 gap-2">{(["dark", "light"] as const).map((theme) => <button key={theme} onClick={() => setTheme(theme)} className="px-3 py-2 rounded-xl text-xs font-semibold capitalize" style={{ background: settings.theme === theme ? "var(--text)" : "var(--surface-2)", color: settings.theme === theme ? "var(--bg)" : "var(--text-2)", border: "1px solid var(--border)" }}>{theme}</button>)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Score card view</div>
            <div className="grid grid-cols-2 gap-2">{(["compact", "expanded"] as const).map((d) => <button key={d} onClick={() => setDensity(d)} className="px-3 py-2 rounded-xl text-xs font-semibold capitalize" style={{ background: settings.density === d ? "var(--text)" : "var(--surface-2)", color: settings.density === d ? "var(--bg)" : "var(--text-2)", border: "1px solid var(--border)" }}>{d}</button>)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Sport order</div>
            <div className="space-y-1.5">{settings.sportOrder.map((league, idx) => <div key={league} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}><span className="flex-1 text-sm font-semibold">{LABELS[league]}</span><button disabled={idx === 0} onClick={() => moveSport(league, "up")} className="text-xs px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--surface)", color: "var(--text-2)" }}>↑</button><button disabled={idx === settings.sportOrder.length - 1} onClick={() => moveSport(league, "down")} className="text-xs px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--surface)", color: "var(--text-2)" }}>↓</button></div>)}</div>
          </div>
          <button onClick={resetSettings} className="w-full text-xs font-semibold rounded-xl py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Reset settings</button>
        </div>
      )}
    </div>
  );
}
