"use client";

import { useState } from "react";
import { League, VALID_LEAGUES } from "@/lib/teams";
import Standings from "./Standings";

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "CFB",
  cbb: "CBB",
};

type StandingsMode = "division" | "conference" | "wildcard";

export default function StandingsPage({ initialLeague = "mlb" }: { initialLeague?: string }) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [league, setLeague] = useState<League>(safeInitial);
  const [mode, setMode] = useState<StandingsMode>("division");
  const [cfbSubdivision, setCfbSubdivision] = useState<"FBS" | "FCS">("FBS");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black leading-tight">Standings</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          Choose a league, then switch between the standings views ESPN provides.
        </p>
      </div>

      <div className="grid grid-cols-6 gap-1 p-1 rounded-2xl" style={{ background: "var(--surface-2)" }}>
        {VALID_LEAGUES.map((id) => {
          const selected = league === id;
          return (
            <button
              key={id}
              onClick={() => {
                setLeague(id);
                setMode("division");
              }}
              className="px-1 py-2 rounded-xl text-[11px] font-black transition-all"
              style={{ background: selected ? "var(--surface)" : "transparent", border: selected ? "1px solid var(--border)" : "1px solid transparent", color: selected ? "var(--text)" : "var(--text-2)" }}
            >
              {LEAGUE_LABELS[id]}
            </button>
          );
        })}
      </div>

      {league === "cfb" ? (
        <div className="rounded-2xl p-3 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="grid grid-cols-2 gap-2">
            {(["FBS", "FCS"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setCfbSubdivision(id)}
                className="px-3 py-2 rounded-xl text-sm font-black"
                style={{ background: cfbSubdivision === id ? "var(--text)" : "var(--surface-2)", color: cfbSubdivision === id ? "var(--bg)" : "var(--text-2)" }}
              >
                {id}
              </button>
            ))}
          </div>
          <Standings league={league} subdivision={cfbSubdivision} pageMode="conference" showHeader={false} showFilterControls />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl" style={{ background: "var(--surface-2)" }}>
            {([
              ["division", "Division"],
              ["conference", "Conference"],
              ["wildcard", "Wild Card"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className="px-2 py-2 rounded-xl text-xs font-black transition-all"
                style={{ background: mode === id ? "var(--surface)" : "transparent", border: mode === id ? "1px solid var(--border)" : "1px solid transparent", color: mode === id ? "var(--text)" : "var(--text-2)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <Standings league={league} pageMode={mode} showHeader={false} />
        </>
      )}
    </div>
  );
}
