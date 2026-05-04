"use client";

import Image from "next/image";
import { League, TeamConfig, VALID_LEAGUES, displayTeamName, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "College Football",
  cbb: "College Basketball",
};

const LEAGUE_SUBTITLES: Record<League, string> = {
  mlb: "Scores, stats, standings",
  nfl: "Scores, stats, standings",
  nba: "Scores, stats, standings",
  nhl: "Scores, stats, standings",
  cfb: "FBS, FCS, conferences",
  cbb: "Division I scores and teams",
};

const LEAGUE_LOGOS: Record<League, string> = {
  mlb: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  nfl: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  nba: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  nhl: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  cfb: "https://a.espncdn.com/i/teamlogos/leagues/500/college-football.png",
  cbb: "https://a.espncdn.com/i/teamlogos/leagues/500/mens-college-basketball.png",
};

type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onLeagueClick: (league: League) => void;
  onManage: () => void;
};

export default function MoreView({ onTeamClick, onLeagueClick, onManage }: Props) {
  const { favorites } = useFavoriteTeams();

  return (
    <div className="space-y-7">
      <div className="pt-2">
        <h1 className="text-4xl font-black tracking-tight">More</h1>
        <div className="mt-4 rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: "#2b2b31", color: "var(--text-3)" }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <span className="text-base font-semibold">Search teams and leagues</span>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black">Favorite Teams</h2>
          <button onClick={onManage} className="text-sm font-black tracking-wide" style={{ color: "var(--accent)" }}>EDIT</button>
        </div>
        {!favorites ? (
          <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
        ) : favorites.length === 0 ? (
          <button onClick={onManage} className="w-full rounded-2xl p-6 text-center text-sm font-bold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            Pick your favorite teams
          </button>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
            {favorites.map((team) => (
              <button key={team.key} onClick={() => onTeamClick(team)} className="flex-shrink-0 text-center active:scale-[0.98]">
                <div className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center mb-2" style={{ background: team.primary || "var(--surface)", border: "1px solid var(--border)" }}>
                  <Image src={logoUrl(team)} alt={displayTeamName(team)} width={48} height={48} className="object-contain" unoptimized />
                </div>
                <div className="text-[11px] font-bold max-w-[74px] truncate" style={{ color: "var(--text-2)" }}>{team.league === "cfb" ? displayTeamName(team) : team.short}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-black">Sports</h2>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)", ['--tw-divide-opacity' as any]: 1 }}>
          {VALID_LEAGUES.map((league) => (
            <button key={league} onClick={() => onLeagueClick(league)} className="w-full py-4 flex items-center gap-4 text-left active:scale-[0.99]">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl" style={{ background: "var(--surface)" }}>
                <Image src={LEAGUE_LOGOS[league]} alt={LEAGUE_LABELS[league]} width={32} height={32} className="object-contain" unoptimized />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black truncate">{LEAGUE_LABELS[league]}</div>
                <div className="text-xs font-semibold truncate" style={{ color: "var(--text-3)" }}>{LEAGUE_SUBTITLES[league]}</div>
              </div>
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="var(--text-2)" strokeWidth="2.4" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
