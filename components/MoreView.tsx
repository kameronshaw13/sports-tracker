"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import AppSettingsButton from "./AppSettingsButton";
import { League, TeamConfig, VALID_LEAGUES } from "@/lib/teams";
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
    <div className="-mx-4 sm:mx-0 pb-8">
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-4xl font-black tracking-tight">More</h1>
          <AppSettingsButton />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Teams and Leagues"
            className="w-full rounded-xl pl-9 pr-3 py-3 text-base font-semibold outline-none"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
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
          <section className="border-t border-b px-4 py-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black">Favorite Teams</h2>
              <button onClick={onManage} className="text-sm font-black" style={{ color: "var(--accent)" }}>EDIT</button>
            </div>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-1">
              {(favorites || []).map((stored) => {
                const team = data?.teams?.find((t) => t.key === stored.key) || stored;
                return (
                  <button key={team.key} onClick={() => onTeamClick(team)} className="flex flex-col items-center gap-2 min-w-[68px]">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: team.primary || "var(--surface-2)" }}>
                      {(team.logo || fallbackLogo(team)) && <Image src={team.logo || fallbackLogo(team)} alt={team.name} width={42} height={42} className="object-contain logo-outline-dark" unoptimized />}
                    </div>
                    <span className="text-[10px] font-black truncate max-w-[72px]" style={{ color: "var(--text-2)" }}>{team.short || team.abbr.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-t mt-3" style={{ borderColor: "var(--border)" }}>
            <div className="px-4 py-4 flex items-center justify-between">
              <h2 className="text-lg font-black">Sports</h2>
            </div>
            <div>
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
    <button onClick={onClick} className="w-full px-4 py-4 flex items-center gap-4 border-t text-left" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <Image src={league.logo} alt={league.label} width={34} height={34} className="object-contain logo-outline-dark" unoptimized />
      <span className="flex-1 text-lg font-black">{league.label}</span>
      <span className="text-2xl" style={{ color: "var(--text-3)" }}>›</span>
    </button>
  );
}

function TeamRow({ team, onClick }: { team: TeamConfig; onClick: () => void }) {
  const logo = team.logo || fallbackLogo(team);
  return (
    <button onClick={onClick} className="w-full px-4 py-3 flex items-center gap-4 border-t text-left" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="w-10 h-10 flex items-center justify-center rounded-lg" style={{ background: "var(--surface-2)" }}>
        {logo && <Image src={logo} alt={team.name} width={32} height={32} className="object-contain logo-outline-dark" unoptimized />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-black truncate">{team.name}</div>
        <div className="text-xs font-bold uppercase" style={{ color: "var(--text-3)" }}>{team.league}</div>
      </div>
    </button>
  );
}

function fallbackLogo(team: TeamConfig) {
  if (team.league === "cfb" || team.league === "cbb") return `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.abbr.toLowerCase()}.png`;
  return `https://a.espncdn.com/i/teamlogos/${team.league}/500/${team.abbr.toLowerCase()}.png`;
}
