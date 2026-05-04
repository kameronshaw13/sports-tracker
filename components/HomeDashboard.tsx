"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { League, TeamConfig, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";
import { useFreshKey } from "@/lib/freshKey";
import { useAppSettings } from "@/lib/useAppSettings";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  nfl: "NFL",
  cfb: "CFB",
  cbb: "CBB",
};

type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onManage: () => void;
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onViewLeague?: (league: string) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
};

export default function HomeDashboard({ onTeamClick, onManage, onTeamLogoClick, onViewLeague, onPlayerClick }: Props) {
  const [drillIn, setDrillIn] = useState<{ league: string; eventId: string } | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const { favorites } = useFavoriteTeams();
  const { settings } = useAppSettings();

  if (drillIn) {
    return (
      <GameDetail
        league={drillIn.league}
        eventId={drillIn.eventId}
        onClose={() => setDrillIn(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  if (!favorites) {
    return <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />;
  }

  const date = formatDateParam(offsetDate(dayOffset));

  return (
    <div className="space-y-7">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-2)" }}>
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
        <div className="flex items-center justify-between mb-3 gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              Live Scores
            </h2>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Changing this date only affects the scores below.</p>
          </div>
          <span className="text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>Auto-updates</span>
        </div>

        <DateControls dayOffset={dayOffset} setDayOffset={setDayOffset} />

        <div className="space-y-5 mt-4">
          {settings.sportOrder.map((league) => (
            <LeagueScoreStrip
              key={`${league}-${date}`}
              league={league}
              label={LEAGUE_LABELS[league]}
              date={date}
              density={settings.density}
              onViewAll={() => onViewLeague?.(league)}
              onGameClick={(eventId) => setDrillIn({ league, eventId })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DateControls({ dayOffset, setDayOffset }: { dayOffset: number; setDayOffset: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl p-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <button onClick={() => setDayOffset(dayOffset - 1)} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>←</button>
      <button onClick={() => setDayOffset(0)} className="flex-1 text-center">
        <div className="text-sm font-bold">{prettyDate(dayOffset)}</div>
        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{offsetDate(dayOffset).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
      </button>
      <button onClick={() => setDayOffset(dayOffset + 1)} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>→</button>
    </div>
  );
}

function LeagueScoreStrip({ league, label, date, density, onViewAll, onGameClick }: { league: League; label: string; date: string; density: "compact" | "expanded"; onViewAll: () => void; onGameClick: (eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { data, isLoading } = useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = data?.events || [];
  const sorted = [...events].sort((a: any, b: any) => statusRank(a) - statusRank(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
  const shown = sorted.slice(0, density === "compact" ? 6 : 4);

  // Home should not output a sport section if there are no games for that sport/date.
  if (!isLoading && shown.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{label}</h3>
        <button onClick={onViewAll} className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>View all →</button>
      </div>
      {isLoading ? (
        <div className={density === "compact" ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
          {[...Array(density === "compact" ? 3 : 2)].map((_, i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />)}
        </div>
      ) : (
        <div className={density === "compact" ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
          {shown.map((game: any) => <MiniGameCard key={game.id} league={league} game={game} compact={density === "compact"} onClick={() => onGameClick(game.id)} />)}
        </div>
      )}
    </div>
  );
}

function MiniGameCard({ league, game, compact, onClick }: { league: League; game: any; compact: boolean; onClick: () => void }) {
  const isLive = game.status?.state === "in";
  return (
    <button onClick={onClick} className="rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[11px] font-bold truncate" style={{ color: isLive ? "var(--danger)" : "var(--text-3)" }}>{game.status?.detail || formatTime(game.date)}</span>
        {isLive && <span className="w-2 h-2 rounded-full live-dot flex-shrink-0" style={{ background: "var(--danger)" }} />}
      </div>
      <MiniTeam team={game.away} compact={compact} />
      <MiniTeam team={game.home} compact={compact} />
      {league === "mlb" && isLive && (
        <div className="mt-2 pt-2 flex items-center gap-2 text-[11px] font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
          <BasesMini situation={game.situation} />
          <span>{countText(game.situation)}</span>
          <span>{outsText(game.situation)}</span>
        </div>
      )}
    </button>
  );
}

function MiniTeam({ team, compact }: { team: any; compact: boolean }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-5 h-5 flex items-center justify-center">{team.logo && <Image src={team.logo} alt={team.abbr} width={18} height={18} className="object-contain" />}</div>
      <span className={`flex-1 text-xs truncate ${team.winner ? "font-bold" : "font-medium"}`}>{compact ? team.abbr : team.name || team.abbr}</span>
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
  const { data: liveSummary } = useSWR(
    featured?.status?.state === "in" ? `/api/summary?league=${team.league}&event=${featured.id}&_t=${freshKey}` : null,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true, revalidateOnReconnect: true }
  );
  const label = liveEvent ? "Live now" : nextEvent ? "Next game" : "Last game";
  const liveSituation = liveSummary?.situation || featured?.situation || null;
  const liveStatus = team.league === "mlb" && featured?.status?.state === "in"
    ? baseballSituationText({ ...featured, situation: liveSituation, status: liveSummary?.status || featured.status })
    : featured?.status?.detail || "Live";
  const summaryHome = liveSummary?.home;
  const summaryAway = liveSummary?.away;
  const summaryUs = [summaryHome, summaryAway].find((t: any) => String(t?.abbr || "").toLowerCase() === team.abbr.toLowerCase());
  const summaryOpp = [summaryHome, summaryAway].find((t: any) => String(t?.abbr || "").toLowerCase() !== team.abbr.toLowerCase());
  const displayUsScore = summaryUs?.score ?? featured?.us?.score ?? "—";
  const displayOppScore = summaryOpp?.score ?? featured?.opponent?.score ?? "—";

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
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                {featured.status?.state === "pre" ? formatTime(featured.date) : featured.status?.state === "in" && team.league === "mlb" ? liveStatus : featured.status?.detail || formatTime(featured.date)}
              </div>
              {featured.status?.state === "in" && team.league === "mlb" && (
                <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                  <BasesMini situation={liveSituation} />
                  <span>{countText(liveSituation)}</span>
                  <span>{outsText(liveSituation)}</span>
                </div>
              )}
            </div>
            {featured.status?.state !== "pre" && (
              <div className="text-right">
                <div className="text-base font-bold tabular-nums">{displayUsScore}<span style={{ color: "var(--text-3)" }}> – </span>{displayOppScore}</div>
                <div className="text-xs font-bold" style={{ color: featured.us?.winner ? "var(--success)" : featured.status?.state === "post" ? "var(--danger)" : team.primary }}>
                  {featured.status?.state === "in" ? (team.league === "mlb" ? inningStateText(featured) : featured.status.detail || "Live") : featured.us?.winner ? "W" : "L"}
                </div>
              </div>
            )}
          </div>
        ) : <div className="text-sm" style={{ color: "var(--text-3)" }}>No upcoming games</div>}
      </button>
    </div>
  );
}

function baseballSituationText(game: any) {
  const inning = inningStateText(game);
  const count = countText(game?.situation);
  return [inning, count].filter(Boolean).join(" · ") || game?.status?.detail || "Live";
}

function inningStateText(game: any) {
  const detail = String(game?.status?.detail || "").trim();
  if (detail) return detail;
  return "Live";
}

function countText(situation: any) {
  if (typeof situation?.balls !== "number" || typeof situation?.strikes !== "number") return "";
  return `${situation.balls}-${situation.strikes}`;
}

function outsText(situation: any) {
  if (typeof situation?.outs !== "number") return "";
  return `${situation.outs} ${situation.outs === 1 ? "out" : "outs"}`;
}

function BasesMini({ situation }: { situation: any }) {
  if (!situation) return null;
  const filled = "var(--text)";
  const empty = "transparent";
  const stroke = "var(--text-3)";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="7" y="1.5" width="4" height="4" transform="rotate(45 7 1.5)" fill={situation.onSecond ? filled : empty} stroke={stroke} strokeWidth="1" />
      <rect x="12.5" y="7" width="4" height="4" transform="rotate(45 12.5 7)" fill={situation.onFirst ? filled : empty} stroke={stroke} strokeWidth="1" />
      <rect x="1.5" y="7" width="4" height="4" transform="rotate(45 1.5 7)" fill={situation.onThird ? filled : empty} stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

function statusRank(game: any) {
  if (game.status?.state === "in") return 0;
  if (game.status?.state === "pre") return 1;
  return 2;
}

function offsetDate(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function formatDateParam(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function prettyDate(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  return offsetDate(offset).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
