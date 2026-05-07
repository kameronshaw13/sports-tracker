"use client";

import RetroTeamLogo from "./RetroTeamLogo";
import type { CSSProperties } from "react";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig, displayTeamName } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onManage: () => void;
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onViewLeague?: (league: string) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
  onOpenGame?: (league: string, eventId: string) => void;
};

export default function HomeDashboard({ onTeamClick, onManage, onTeamLogoClick, onViewLeague, onPlayerClick, onOpenGame }: Props) {
  const [drillIn, setDrillIn] = useState<{ league: string; eventId: string } | null>(null);
  const { favorites } = useFavoriteTeams();

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

  return (
    <div className="retro-page home-teams-page">
      <section>
        <div className="home-section-head">
          <div>
            <h2 className="home-section-title">My Teams</h2>
            <div className="home-section-rule" />
          </div>
          <button
            onClick={onManage}
            className="retro-action-btn home-manage-btn text-[11px] font-black uppercase px-3 py-1"
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
          <div className="home-team-grid">
            {favorites.map((team) => (
              <TeamCard key={team.key} team={team} onTeamClick={() => onTeamClick(team)} onGameClick={(eventId) => onOpenGame ? onOpenGame(team.league, eventId) : setDrillIn({ league: team.league, eventId })} />
            ))}
          </div>
        )}
      </section>
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
  const teamStyle = {
    "--team-primary": team.primary,
    "--team-secondary": team.secondary,
    "--team-text": team.textOnPrimary,
  } as CSSProperties;

  return (
    <div className="retro-panel home-team-card overflow-hidden" style={teamStyle}>
      <button onClick={onTeamClick} className="home-team-main">
        <div className="home-team-logo-shell">
          <RetroTeamLogo team={team} league={team.league} size={74} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="home-team-kicker">{team.league.toUpperCase()}</div>
          <div className="home-team-name truncate">{team.league === "cfb" ? displayTeamName(team) : team.short}</div>
          <div className="home-team-meta truncate">{teamData?.record || (team.league === "cfb" ? "Record unavailable" : team.name)}{teamData?.standingSummary ? ` · ${teamData.standingSummary.split(",")[0]}` : ""}</div>
        </div>
        <span className="home-team-arrow">→</span>
      </button>

      <button onClick={() => featured?.id && onGameClick(featured.id)} disabled={!featured} className="home-team-game disabled:cursor-default">
        <div className="home-team-game-head">
          <span className="home-team-pill" data-live={liveEvent ? "true" : "false"}>
            {liveEvent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}{label}
          </span>
          {!liveEvent && <span className="home-team-game-status">{featured?.status?.state === "pre" ? formatDateShort(featured.date) : featured?.status?.detail}</span>}
        </div>

        {featured ? (
          <div className="flex items-center gap-3">
            {featured.opponent?.logo && <div className="home-team-opponent-logo"><RetroTeamLogo team={featured.opponent} league={team.league} size={50} /></div>}
            <div className="flex-1 min-w-0">
              <div className="home-team-matchup truncate"><span>{featured.home ? "vs" : "@"}</span> {featured.opponent?.name}</div>
              <div className="home-team-time">
                {featured.status?.state === "pre" ? formatClock(featured.date) : featured.status?.state === "in" && team.league === "mlb" ? liveStatus : featured.status?.detail || formatClock(featured.date)}
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
                <div className="retro-score home-team-score tabular-nums">{displayUsScore}<span> - </span>{displayOppScore}</div>
                <div className="home-team-result" style={{ color: featured.us?.winner ? "var(--success)" : featured.status?.state === "post" ? "var(--danger)" : team.primary }}>
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

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatClock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
