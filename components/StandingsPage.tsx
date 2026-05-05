"use client";

import Image from "next/image";
import { useState } from "react";
import { League, VALID_LEAGUES } from "@/lib/teams";
import Standings from "./Standings";

const NCAA_LOGO = "/ncaa-logo.png";
const LEAGUE_LABELS: Record<League, string> = { mlb: "MLB", nfl: "NFL", nba: "NBA", nhl: "NHL", cfb: "CFB", cbb: "CBB" };
const LEAGUE_LOGOS: Record<League, string> = {
  mlb: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  nfl: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  nba: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  nhl: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  cfb: NCAA_LOGO,
  cbb: NCAA_LOGO,
};

type StandingsMode = "division" | "conference" | "wildcard";

export default function StandingsPage({ initialLeague = "mlb" }: { initialLeague?: string }) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [league, setLeague] = useState<League>(safeInitial);
  const [mode, setMode] = useState<StandingsMode>("division");
  const [cfbSubdivision, setCfbSubdivision] = useState<"FBS" | "FCS">("FBS");

  return (
    <div className="-mx-4 sm:mx-0">
      <header className="px-4 pt-8 pb-4" style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-4xl font-black tracking-tight">Standings</h1>
      </header>
      <div className="flex overflow-x-auto no-scrollbar gap-2 px-4 py-3" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        {VALID_LEAGUES.map((id) => {
          const selected = league === id;
          return (
            <button
              key={id}
              onClick={() => { setLeague(id); setMode("division"); }}
              className="min-w-[76px] px-3 py-2 flex flex-col items-center gap-1 text-xs font-black"
              style={{ color: selected ? "var(--text)" : "var(--text-2)" }}
            >
              <Image src={LEAGUE_LOGOS[id]} alt={LEAGUE_LABELS[id]} width={26} height={26} className="object-contain logo-outline-dark" unoptimized />
              <span>{LEAGUE_LABELS[id]}</span>
              {selected && <span className="h-1 w-full" style={{ background: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3" style={{ background: "var(--surface)" }}>
        {league === "cfb" ? (
          <div className="grid grid-cols-2 gap-2">
            {(["FBS", "FCS"] as const).map((id) => (
              <button key={id} onClick={() => setCfbSubdivision(id)} className="py-2 text-sm font-black" style={{ background: cfbSubdivision === id ? "var(--surface-2)" : "transparent", color: cfbSubdivision === id ? "var(--text)" : "var(--text-2)", border: "1px solid var(--border)" }}>{id}</button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {([ ["division", "Division"], ["conference", "Conference"], ["wildcard", "Wild Card"] ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)} className="py-2 text-xs font-black" style={{ background: mode === id ? "var(--surface-2)" : "transparent", color: mode === id ? "var(--text)" : "var(--text-2)", border: "1px solid var(--border)" }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="px-0">
        {league === "cfb" ? <Standings league={league} subdivision={cfbSubdivision} pageMode="conference" showHeader={false} showFilterControls /> : <Standings league={league} pageMode={mode} showHeader={false} />}
      </div>
    </div>
  );
}
