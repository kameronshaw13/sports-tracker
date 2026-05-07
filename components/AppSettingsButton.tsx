"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { League } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";

const LABELS: Record<League, string> = { mlb: "MLB", nba: "NBA", nhl: "NHL", nfl: "NFL", cfb: "CFB", cbb: "CBB" };

export default function AppSettingsButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { settings, setDensity, setTheme, moveSport, resetSettings } = useAppSettings();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !menuRef.current) return;
      if (menuRef.current.contains(target)) return;
      if (target.closest('[aria-label="Settings"]')) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const menu = open && mounted ? createPortal(
    <div
      ref={menuRef}
      className="fixed right-3 top-14 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-4 shadow-2xl space-y-4"
      style={{
        background: "var(--surface)",
        opacity: 1,
        border: "1px solid var(--border)",
        color: "var(--text)",
        boxShadow: "0 18px 60px rgba(0,0,0,.95)",
        backdropFilter: "none",
        zIndex: 2147483001,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black">Settings</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="settings-close-btn"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>
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
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="h-9 w-9 flex items-center justify-center text-[1.35rem] leading-none font-bold transition-transform active:scale-[0.96]" style={{ background: "transparent", border: "none", color: "var(--text)" }} aria-label="Settings">⚙</button>
      {menu}
    </div>
  );
}
