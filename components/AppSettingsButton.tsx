"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { League } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";

const LABELS: Record<League, string> = { mlb: "MLB", nba: "NBA", nhl: "NHL", nfl: "NFL", cfb: "CFB", cbb: "CBB" };

export default function AppSettingsButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { settings, setDensity, setTheme, moveSport, resetSettings } = useAppSettings();

  useEffect(() => { setMounted(true); }, []);

  const menu = open && mounted ? createPortal(
    <>
      <button
        aria-label="Close settings"
        className="fixed inset-0 cursor-default"
        style={{ background: "transparent", opacity: 1, zIndex: 2147483000 }}
        onClick={() => setOpen(false)}
      />
      <div className="fixed right-3 top-14 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-4 shadow-2xl space-y-4" style={{ background: "var(--surface)", opacity: 1, border: "1px solid var(--border)", color: "var(--text)", boxShadow: "0 18px 60px rgba(0,0,0,.95)", backdropFilter: "none", zIndex: 2147483001 }}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-black">Settings</h3><button className="text-xs font-bold" style={{ color: "var(--text-3)" }} onClick={() => setOpen(false)}>Close</button></div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Score card view</div>
          <div className="grid grid-cols-2 gap-2">{(["compact", "expanded"] as const).map((d) => <button key={d} onClick={() => setDensity(d)} className="px-3 py-2 rounded-xl text-xs font-black capitalize" style={{ background: settings.density === d ? "var(--text)" : "var(--surface-2)", color: settings.density === d ? "var(--bg)" : "var(--text-2)", border: "1px solid var(--border)" }}>{d}</button>)}</div>
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Appearance</div>
          <div className="grid grid-cols-2 gap-2">{(["dark", "light"] as const).map((theme) => <button key={theme} onClick={() => setTheme(theme)} className="px-3 py-2 rounded-xl text-xs font-black capitalize" style={{ background: settings.theme === theme ? "var(--text)" : "var(--surface-2)", color: settings.theme === theme ? "var(--bg)" : "var(--text-2)", border: "1px solid var(--border)" }}>{theme}</button>)}</div>
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Sport order</div>
          <div className="space-y-1.5">{settings.sportOrder.map((league, idx) => <div key={league} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}><span className="flex-1 text-sm font-black">{LABELS[league]}</span><button disabled={idx === 0} onClick={() => moveSport(league, "up")} className="text-xs px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--surface)", color: "var(--text-2)" }}>↑</button><button disabled={idx === settings.sportOrder.length - 1} onClick={() => moveSport(league, "down")} className="text-xs px-2 py-1 rounded disabled:opacity-30" style={{ background: "var(--surface)", color: "var(--text-2)" }}>↓</button></div>)}</div>
        </div>
        <button onClick={resetSettings} className="w-full text-xs font-black rounded-xl py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Reset settings</button>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }} aria-label="Settings">⚙</button>
      {menu}
    </div>
  );
}
