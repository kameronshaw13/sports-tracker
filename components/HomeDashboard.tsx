"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const LEAGUE_SECTIONS = [
  { id: "mlb", label: "MLB" },
  { id: "nba", label: "NBA" },
  { id: "nhl", label: "NHL" },
  { id: "nfl", label: "NFL" },
];

type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onManage: () => void;
  onTeamLogoClick?: (league: string, abbr: string) => void;
  onViewLeague?: (league: string) => void;
};

export default function HomeDashboard({ onTeamClick, onManage, onTeamLogoClick, onViewLeague }: Props) {
  const [drillIn, setDrillIn] = useState<{ league: string; eventId: string } | null>(null);
  const { favorites } = useFavoriteTeams();

  if (drillIn) {
    return (
      <GameDetail
        league={drillIn.league}
        eventId={drillIn.eventId}
        onClose={() => setDrillIn(null)}
        onTeamClick={onTeamLogoClick}
      />
    );
  }

  if (!favorites) {
    return <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />;
  }

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            My Teams
          </h2>
          <button
            onClick={onManage}
            className="text-xs font-medium px-2.5 py-1 rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            Manage
          </button>
        </div>

        {favorites.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>You haven't picked any favorite teams yet.</p>
            <button onClick={onManage} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: "var(--text)", color: "var(--bg)" }}>
              + Pick your teams
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {favorites.map((team) => (
              <TeamCard key={team.key} team={team} onTeamClick={() => onTeamClick(team)} onGameClick={(eventId) => setDrillIn({ league: team.league, eventId })} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            Live Scores
          </h2>
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Updates automatically</span>
        </div>
        <div className="space-y-5">
          {LEAGUE_SECTIONS.map((league) => (
            <LeagueScoreStrip
              key={league.id}
              league={league.id}
              label={league.label}
              onViewAll={() => onViewLeague?.(league.id)}
              onGameClick={(eventId) => setDrillIn({ league: league.id, eventId })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function LeagueScoreStrip({ league, label, onViewAll, onGameClick }: { league: string; label: string; onViewAll: () => void; onGameClick: (eventId: string) => void }) {
  const freshKey = useFreshKey();
  const today = formatDateParam(new Date());
  const { data, isLoading } = useSWR(`/api/league?league=${league}&date=${today}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = data?.events || [];
  const sorted = [...events].sort((a: any, b: any) => statusRank(a) - statusRank(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
  const shown = sorted.slice(0, 4);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{label}</h3>
        <button onClick={onViewAll} className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>View all →</button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />)}
        </div>
      ) : shown.length === 0 ? (
        <button onClick={onViewAll} className="w-full text-left rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          No {label} games today. View league schedule →
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {shown.map((game: any) => <MiniGameCard key={game.id} game={game} onClick={() => onGameClick(game.id)} />)}
        </div>
      )}
    </div>
  );
}

function MiniGameCard({ game, onClick }: { game: any; onClick: () => void }) {
  const isLive = game.status?.state === "in";
  return (
    <button onClick={onClick} className="rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold" style={{ color: isLive ? "var(--danger)" : "var(--text-3)" }}>{game.status?.detail || formatTime(game.date)}</span>
        {isLive && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}
      </div>
      <MiniTeam team={game.away} />
      <MiniTeam team={game.home} />
    </button>
  );
}

function MiniTeam({ team }: { team: any }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-5 h-5 flex items-center justify-center">{team.logo && <Image src={team.logo} alt={team.abbr} width={18} height={18} className="object-contain" />}</div>
      <span className={`flex-1 text-xs truncate ${team.winner ? "font-bold" : "font-medium"}`}>{team.abbr || team.name}</span>
      <span className={`text-sm tabular-nums ${team.winner ? "font-bold" : "font-semibold"}`} style={{ color: "var(--text)" }}>{team.score ?? "—"}</span>
    </div>
  );
}

function TeamCard({ team, onTeamClick, onGameClick }: { team: TeamConfig; onTeamClick: () => void; onGameClick: (eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { data: scheduleData } = useSWR(`/api/scoreboard?team=${team.key}&_t=${freshKey}`, fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });
  const { data: teamData } = useSWR(`/api/team?team=${team.key}&_t=${freshKey}`, fetcher, { refreshInterval: 60_000, revalidateOnFocus: true });

  const events = scheduleData?.events || [];
  const liveEvent = events.find((e: any) => e.status?.state === "in");
  const nextEvent = events.find((e: any) => e.status?.state === "pre");
  const lastEvent = events.filter((e: any) => e.status?.state === "post").pop();
  const featured = liveEvent || nextEvent || lastEvent;
  const label = liveEvent ? "Live now" : nextEvent ? "Next game" : "Last game";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <button onClick={onTeamClick} className="w-full text-left px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90" style={{ background: team.primary, color: team.textOnPrimary }}>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
          <Image src={logoUrl(team)} alt={team.short} width={32} height={32} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{team.short}</div>
          <div className="text-xs opacity-85 truncate">{teamData?.record || team.league}{teamData?.standingSummary ? ` · ${teamData.standingSummary.split(",")[0]}` : ""}</div>
        </div>
        <span className="text-xs opacity-75">→</span>
      </button>

      <button onClick={() => featured?.id && onGameClick(featured.id)} disabled={!featured} className="w-full text-left p-4 transition-colors hover:bg-[var(--surface-2)] disabled:cursor-default">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5" style={{ color: liveEvent ? "var(--danger)" : "var(--text-3)" }}>
            {liveEvent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}{label}
          </span>
          {featured?.status?.detail && !liveEvent && <span className="text-xs" style={{ color: "var(--text-3)" }}>{featured.status.detail}</span>}
        </div>

        {featured ? (
          <div className="flex items-center gap-3">
            {featured.opponent?.logo && <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}><Image src={featured.opponent.logo} alt={featured.opponent.abbr} width={28} height={28} className="object-contain" /></div>}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate"><span style={{ color: "var(--text-3)" }}>{featured.home ? "vs" : "@"}</span> {featured.opponent?.name}</div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{featured.status?.state === "pre" ? formatTime(featured.date) : `${featured.us?.score ?? "—"} – ${featured.opponent?.score ?? "—"}`}</div>
            </div>
            {(featured.status?.state === "post" || featured.status?.state === "in") && <div className="text-base font-bold tabular-nums px-2" style={{ color: featured.us?.winner ? "var(--success)" : featured.status?.state === "post" ? "var(--danger)" : team.primary }}>{featured.status?.state === "in" ? featured.status.detail || "Live" : featured.us?.winner ? "W" : "L"}</div>}
          </div>
        ) : <div className="text-sm" style={{ color: "var(--text-3)" }}>No upcoming games</div>}
      </button>
    </div>
  );
}

function statusRank(game: any) {
  if (game.status?.state === "in") return 0;
  if (game.status?.state === "pre") return 1;
  return 2;
}

function formatDateParam(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
