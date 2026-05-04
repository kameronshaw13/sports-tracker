"use client";

import { useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import { League } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "CFB",
  cbb: "CBB",
};

type Density = "compact" | "expanded";

type Props = {
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
  initialLeague?: string;
};

export default function LeaguesView({ onTeamLogoClick, onPlayerClick }: Props) {
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<{ league: string; eventId: string } | null>(null);
  const { settings } = useAppSettings();
  const density = settings.density;
  const date = formatDate(dayOffset);

  if (selectedEvent) {
    return (
      <GameDetail
        league={selectedEvent.league}
        eventId={selectedEvent.eventId}
        onClose={() => setSelectedEvent(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDayOffset(dayOffset - 1)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>← Prev</button>
        <div className="text-sm font-semibold flex-1 text-center">{prettyDate(dayOffset)}</div>
        <button onClick={() => setDayOffset(dayOffset + 1)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Next →</button>
      </div>

      {dayOffset !== 0 && <button onClick={() => setDayOffset(0)} className="text-xs underline" style={{ color: "var(--text-3)" }}>Jump to today</button>}

      <div className="space-y-7">
        {settings.sportOrder.map((league) => (
          <LeagueDaySection
            key={`${league}-${date}`}
            league={league}
            date={date}
            density={density}
            onGameClick={(eventId) => setSelectedEvent({ league, eventId })}
          />
        ))}
      </div>
    </div>
  );
}

function LeagueDaySection({ league, date, density, onGameClick }: { league: League; date: string; density: Density; onGameClick: (eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = data?.events || [];
  const live = events.filter((e: any) => e.status?.state === "in");
  const upcoming = events.filter((e: any) => e.status?.state === "pre");
  const final = events.filter((e: any) => e.status?.state === "post");
  if (!isLoading && (!events.length || error)) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{LEAGUE_LABELS[league]}</h2>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{isLoading ? "Loading…" : `${events.length} game${events.length === 1 ? "" : "s"}`}</span>
      </div>
      {isLoading ? <SkeletonGrid density={density} /> : (
        <div className="space-y-4">
          {live.length > 0 && <GameGroup title="Live" accent="var(--danger)" league={league} games={live} density={density} onGameClick={onGameClick} />}
          {upcoming.length > 0 && <GameGroup title="Upcoming" league={league} games={upcoming} density={density} onGameClick={onGameClick} />}
          {final.length > 0 && <GameGroup title="Final" league={league} games={final} density={density} onGameClick={onGameClick} />}
        </div>
      )}
    </section>
  );
}

function GameGroup({ title, accent, league, games, density, onGameClick }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {accent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: accent }} />}
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{title}</h3>
      </div>
      <GameGrid density={density}>{games.map((g: any) => <GameCard key={g.id} league={league} game={g} density={density} onClick={() => onGameClick(g.id)} />)}</GameGrid>
    </div>
  );
}

function GameGrid({ density, children }: { density: Density; children: React.ReactNode }) {
  return density === "compact" ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{children}</div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>;
}

function GameCard({ league, game, density, onClick }: { league: League; game: any; density: Density; onClick: () => void }) {
  const isLive = game.status?.state === "in";
  const compact = density === "compact";
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[11px] font-bold truncate" style={{ color: isLive ? "var(--danger)" : "var(--text-3)" }}>{game.status?.detail || formatTime(game.date)}</span>
        {isLive && <span className="w-2 h-2 rounded-full live-dot flex-shrink-0" style={{ background: "var(--danger)" }} />}
      </div>
      <TeamLine team={game.away} compact={compact} />
      <TeamLine team={game.home} compact={compact} />
      {isLive && league === "mlb" && game.situation && (
        <div className="mt-2 flex items-center gap-2 text-[11px] font-bold" style={{ color: "var(--text-2)" }}>
          <BasesMini situation={game.situation} />
          {typeof game.situation.balls === "number" && typeof game.situation.strikes === "number" && <span>{game.situation.balls}-{game.situation.strikes}</span>}
          {typeof game.situation.outs === "number" && <span>{game.situation.outs} {game.situation.outs === 1 ? "out" : "outs"}</span>}
        </div>
      )}
    </button>
  );
}

function TeamLine({ team, compact }: { team: any; compact: boolean }) {
  if (!team) return null;
  return <div className="flex items-center gap-2 py-0.5"><div className="w-5 h-5 flex items-center justify-center">{team.logo && <Image src={team.logo} alt={team.abbr} width={18} height={18} className="object-contain" unoptimized />}</div><span className={`flex-1 text-xs truncate ${team.winner ? "font-bold" : "font-medium"}`}>{compact ? team.abbr : team.name || team.abbr}</span><span className={`text-sm tabular-nums ${team.winner ? "font-bold" : "font-semibold"}`}>{team.score ?? "—"}</span></div>;
}

function BasesMini({ situation }: { situation: any }) {
  const filled = "var(--text)";
  const empty = "transparent";
  const stroke = "var(--text-3)";
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden><rect x="7" y="1.5" width="4" height="4" transform="rotate(45 7 1.5)" fill={situation.onSecond ? filled : empty} stroke={stroke} strokeWidth="1" /><rect x="12.5" y="7" width="4" height="4" transform="rotate(45 12.5 7)" fill={situation.onFirst ? filled : empty} stroke={stroke} strokeWidth="1" /><rect x="1.5" y="7" width="4" height="4" transform="rotate(45 1.5 7)" fill={situation.onThird ? filled : empty} stroke={stroke} strokeWidth="1" /></svg>;
}

function SkeletonGrid({ density }: { density: Density }) { return <GameGrid density={density}>{[...Array(density === "compact" ? 4 : 2)].map((_, i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />)}</GameGrid>; }
function formatDate(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }
function prettyDate(offset: number) { if (offset === 0) return "Today"; if (offset === -1) return "Yesterday"; if (offset === 1) return "Tomorrow"; const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function formatTime(iso: string) { const d = new Date(iso); return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" }); }
