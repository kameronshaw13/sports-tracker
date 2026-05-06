"use client";

import { useEffect, useState } from "react";
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
type StandingsControl = { id: string; label: string; mode: StandingsMode; conference?: string };

export default function StandingsPage({ initialLeague = "mlb" }: { initialLeague?: string }) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [league, setLeague] = useState<League>(safeInitial);
  const [view, setView] = useState<string>(defaultViewForLeague(safeInitial));
  const controls = controlsForLeague(league);
  const active = controls.find((c) => c.id === view) || controls[0];

  useEffect(() => {
    setView(defaultViewForLeague(league));
  }, [league]);

  return (
    <div className="retro-page -mx-4 sm:mx-0">
      <header className="px-4 pt-3 pb-4">
        <h1 className="text-3xl retro-title text-center">Standings</h1>
      </header>
      <div className="retro-datebar flex overflow-x-auto no-scrollbar gap-2 mx-4 px-2 py-2">
        {VALID_LEAGUES.map((id) => {
          const selected = league === id;
          return (
            <button
              key={id}
              onClick={() => setLeague(id)}
              className="min-w-[76px] px-3 py-2 flex flex-col items-center gap-1 text-xs font-black uppercase tracking-wider"
              style={{ color: selected ? "var(--text)" : "var(--text-2)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LEAGUE_LOGOS[id]} alt={LEAGUE_LABELS[id]} width={26} height={26} className="object-contain logo-outline-dark" />
              <span>{LEAGUE_LABELS[id]}</span>
              {selected && <span className="h-1 w-full" style={{ background: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>

      {controls.length > 0 && (
        <div className="px-4 py-3">
          <div className={`grid gap-2 ${controls.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {controls.map((control) => (
              <button key={control.id} onClick={() => setView(control.id)} className="py-2 text-xs font-black" style={{ background: view === control.id ? "var(--surface-2)" : "transparent", color: view === control.id ? "var(--text)" : "var(--text-2)", border: "1px solid var(--border)" }}>{control.label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-0">
        <Standings league={league} pageMode={league === "cbb" || league === "cfb" ? "conference" : active?.mode || "division"} conferenceFilter={active?.conference} showHeader={false} showFilterControls={league === "cbb" || league === "cfb"} />
      </div>
    </div>
  );
}

function controlsForLeague(league: League): StandingsControl[] {
  if (league === "cfb" || league === "cbb") return [];
  if (league === "mlb") return [
    { id: "american", label: "American", mode: "division", conference: "American League" },
    { id: "national", label: "National", mode: "division", conference: "National League" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
  if (league === "nfl") return [
    { id: "afc", label: "AFC", mode: "division", conference: "AFC" },
    { id: "nfc", label: "NFC", mode: "division", conference: "NFC" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
  if (league === "nhl") return [
    { id: "east", label: "Eastern", mode: "division", conference: "Eastern Conference" },
    { id: "west", label: "Western", mode: "division", conference: "Western Conference" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
  if (league === "nba") return [
    { id: "east", label: "Eastern", mode: "conference", conference: "Eastern Conference" },
    { id: "west", label: "Western", mode: "conference", conference: "Western Conference" },
    { id: "playin", label: "Play-In", mode: "wildcard" },
  ];
  return [
    { id: "division", label: "Division", mode: "division" },
    { id: "conference", label: "Conference", mode: "conference" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
}

function defaultViewForLeague(league: League) {
  if (league === "mlb") return "american";
  if (league === "nfl") return "afc";
  if (league === "nhl" || league === "nba") return "east";
  return "division";
}
