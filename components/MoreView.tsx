"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import RetroTeamLogo from "./RetroTeamLogo";
import { League, TeamConfig } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const NCAA_LOGO = "/ncaa-logo.png";

const LEAGUES: { id: League; label: string; logo: string }[] = [
  { id: "mlb", label: "MLB", logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },
  { id: "nfl", label: "NFL", logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
  { id: "nba", label: "NBA", logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
  { id: "nhl", label: "NHL", logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png" },
  { id: "cfb", label: "College Football", logo: NCAA_LOGO },
  { id: "cbb", label: "College Basketball", logo: NCAA_LOGO },
];

const NCAA_LOGO_OVERRIDES: Record<string, string> = {
  texas: "https://a.espncdn.com/i/teamlogos/ncaa/500/251.png",
  utsa: "https://a.espncdn.com/i/teamlogos/ncaa/500/2636.png",
  illinois: "https://a.espncdn.com/i/teamlogos/ncaa/500/356.png",
  miami: "https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png",
  appalachian: "https://a.espncdn.com/i/teamlogos/ncaa/500/2026.png",
  appalachianst: "https://a.espncdn.com/i/teamlogos/ncaa/500/2026.png",
  ulm: "https://a.espncdn.com/i/teamlogos/ncaa/500/2433.png",
  albany: "https://a.espncdn.com/i/teamlogos/ncaa/500/399.png",
  grambling: "https://a.espncdn.com/i/teamlogos/ncaa/500/2755.png",
  gramblingst: "https://a.espncdn.com/i/teamlogos/ncaa/500/2755.png",
  kansasstate: "https://a.espncdn.com/i/teamlogos/ncaa/500/2306.png",
  kansasst: "https://a.espncdn.com/i/teamlogos/ncaa/500/2306.png",
};

const COLOR_OVERRIDES: Record<string, string> = {
  texas: "#BF5700",
  utsa: "#0C2340",
  illinois: "#13294B",
  kansasstate: "#512888",
  kansasst: "#512888",
};


type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onLeagueClick: (league: League) => void;
  onManage: () => void;
};

export default function MoreView({ onTeamClick, onLeagueClick, onManage }: Props) {
  const { favorites } = useFavoriteTeams();
  const { data } = useSWR<{ teams: TeamConfig[] }>("/api/all-teams", fetcher, { revalidateOnFocus: false });
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const leagueResults = useMemo(() => {
    if (!q) return [];
    return LEAGUES.filter((l) => l.label.toLowerCase().includes(q) || l.id.includes(q));
  }, [q]);

  const teamResults = useMemo(() => {
    if (!q) return [];
    return (data?.teams || [])
      .filter((t) => `${t.name} ${t.short} ${t.abbr} ${t.league}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [q, data?.teams]);

  return (
    <div className="retro-page more-page -mx-4 sm:mx-0 pb-8">
      <div className="more-topbar">
        <div>
          <h1 className="retro-page-title more-page-title">More</h1>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Teams and Leagues"
            className="more-search-input w-full rounded-xl pl-9 pr-3 py-3 text-base font-semibold outline-none retro-panel"
          />
        </div>
      </div>

      {q ? (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {leagueResults.length > 0 && <SearchGroup title="Leagues">{leagueResults.map((l) => <LeagueRow key={l.id} league={l} onClick={() => onLeagueClick(l.id)} />)}</SearchGroup>}
          {teamResults.length > 0 && <SearchGroup title="Teams">{teamResults.map((t) => <TeamRow key={t.key} team={t} onClick={() => onTeamClick(t)} />)}</SearchGroup>}
          {!leagueResults.length && !teamResults.length && <div className="px-4 py-8 text-center text-sm font-semibold" style={{ color: "var(--text-2)" }}>No teams or leagues found.</div>}
        </div>
      ) : (
        <>
          <section className="more-section px-4 py-5">
            <div className="more-section-head flex items-center justify-between mb-4">
              <h2 className="retro-title text-xl">My Teams</h2>
              <button onClick={onManage} className="more-edit-btn text-sm font-black">EDIT</button>
            </div>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-1">
              {(favorites || []).map((stored) => {
                const team = data?.teams?.find((t) => t.key === stored.key) || stored;
                return (
                  <button key={team.key} onClick={() => onTeamClick(team)} className="more-favorite-team flex flex-col items-center gap-1.5 min-w-[70px]">
                    <div className="more-favorite-logo w-14 h-14 flex items-center justify-center retro-card" style={{ background: teamColor(team) }}>
                      {teamLogo(team) && <RetroTeamLogo team={{ ...team, logo: teamLogo(team) }} league={team.league} size={42} className="more-team-logo" />}
                    </div>
                    <span className="text-[10px] font-black truncate max-w-[72px]" style={{ color: "var(--text-2)" }}>{team.short || team.abbr.toUpperCase()}</span>
                    {(team.league === "cfb" || team.league === "cbb") && <span className="text-[9px] font-black uppercase leading-none" style={{ color: "var(--text-3)" }}>{team.league === "cfb" ? "NCAAF" : "NCAAB"}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="more-section mt-3">
            <div className="more-section-head px-4 py-4 flex items-center justify-between">
              <h2 className="retro-title text-xl">Sports</h2>
            </div>
            <div className="px-4 pb-2">
              {LEAGUES.map((l) => <LeagueRow key={l.id} league={l} onClick={() => onLeagueClick(l.id)} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b" style={{ borderColor: "var(--border)" }}>
      <h2 className="px-4 pt-4 pb-2 text-sm font-black uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{title}</h2>
      {children}
    </section>
  );
}

function LeagueRow({ league, onClick }: { league: { id: League; label: string; logo: string }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="more-league-row w-full px-4 py-4 flex items-center gap-4 text-left retro-card mb-2">
      <Image src={league.logo} alt={league.label} width={34} height={34} className="object-contain" unoptimized />
      <span className="flex-1 text-lg font-black">{league.label}</span>
      <span className="text-2xl" style={{ color: "var(--text-3)" }}>›</span>
    </button>
  );
}

function TeamRow({ team, onClick }: { team: TeamConfig; onClick: () => void }) {
  const logo = teamLogo(team);
  return (
    <button onClick={onClick} className="more-team-row w-full px-4 py-3 flex items-center gap-4 border-t text-left" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="more-team-row-logo w-10 h-10 flex items-center justify-center rounded-lg" style={{ background: "var(--surface-2)" }}>
        {logo && <RetroTeamLogo team={{ ...team, logo }} league={team.league} size={32} className="more-team-row-logo-img" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-black truncate">{team.name}</div>
        <div className="text-xs font-bold uppercase" style={{ color: "var(--text-3)" }}>{team.league}</div>
      </div>
    </button>
  );
}

function teamLogo(team: TeamConfig) {
  return team.logo || fallbackLogo(team);
}

function teamColor(team: TeamConfig) {
  const lookup = normalizedLookup(team);
  return COLOR_OVERRIDES[lookup] || team.primary || "var(--surface-2)";
}

function fallbackLogo(team: TeamConfig) {
  const lookup = normalizedLookup(team);
  if (team.league === "cfb" || team.league === "cbb") return NCAA_LOGO_OVERRIDES[lookup] || `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.abbr.toLowerCase()}.png`;
  return `https://a.espncdn.com/i/teamlogos/${team.league}/500/${team.abbr.toLowerCase()}.png`;
}

function normalizedLookup(team: TeamConfig) {
  return `${team.key || ""} ${team.name || ""} ${team.short || ""} ${team.abbr || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}
