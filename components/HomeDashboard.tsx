"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  onTeamClick: (team: TeamConfig) => void;
  onManage: () => void;
  onTeamLogoClick?: (league: string, abbr: string) => void;
};

export default function HomeDashboard({ onTeamClick, onManage, onTeamLogoClick }: Props) {
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

  if (favorites.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
          You haven't picked any favorite teams yet.
        </p>
        <button
          onClick={onManage}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          + Pick your teams
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          Your teams
        </h2>
        <button
          onClick={onManage}
          className="text-xs font-medium px-2.5 py-1 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          Manage
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {favorites.map((team) => (
          <TeamCard
            key={team.key}
            team={team}
            onTeamClick={() => onTeamClick(team)}
            onGameClick={(eventId) => setDrillIn({ league: team.league, eventId })}
          />
        ))}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  onTeamClick,
  onGameClick,
}: {
  team: TeamConfig;
  onTeamClick: () => void;
  onGameClick: (eventId: string) => void;
}) {
  // v21.1: freshKey appended to URLs so each mount busts the route cache.
  const freshKey = useFreshKey();
  const { data: scheduleData } = useSWR(
    `/api/scoreboard?team=${team.key}&_t=${freshKey}`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: teamData } = useSWR(
    `/api/team?team=${team.key}&_t=${freshKey}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const events = scheduleData?.events || [];
  const liveEvent = events.find((e: any) => e.status?.state === "in");
  const nextEvent = events.find((e: any) => e.status?.state === "pre");
  const lastEvent = events.filter((e: any) => e.status?.state === "post").pop();
  const featured = liveEvent || nextEvent || lastEvent;

  const label = liveEvent ? "Live now" : nextEvent ? "Next game" : "Last game";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <button
        onClick={onTeamClick}
        className="w-full text-left px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90"
        style={{ background: team.primary, color: team.textOnPrimary }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <Image src={logoUrl(team)} alt={team.short} width={32} height={32} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{team.short}</div>
          <div className="text-xs opacity-85 truncate">
            {teamData?.record || team.league}
            {teamData?.standingSummary ? ` · ${teamData.standingSummary.split(",")[0]}` : ""}
          </div>
        </div>
        <span className="text-xs opacity-75">→</span>
      </button>

      <button
        onClick={() => featured?.id && onGameClick(featured.id)}
        disabled={!featured}
        className="w-full text-left p-4 transition-colors hover:bg-[var(--surface-2)] disabled:cursor-default"
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5"
            style={{ color: liveEvent ? "var(--danger)" : "var(--text-3)" }}
          >
            {liveEvent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}
            {label}
          </span>
          {featured?.status?.detail && !liveEvent && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {featured.status.detail}
            </span>
          )}
        </div>

        {featured ? (
          <div className="flex items-center gap-3">
            {featured.opponent?.logo && (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--surface-2)" }}>
                <Image src={featured.opponent.logo} alt={featured.opponent.abbr} width={28} height={28} className="object-contain" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                <span style={{ color: "var(--text-3)" }}>{featured.home ? "vs" : "@"}</span>{" "}
                {featured.opponent?.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                {featured.status?.state === "pre"
                  ? formatTime(featured.date)
                  : `${featured.us?.score ?? "—"} – ${featured.opponent?.score ?? "—"}`}
              </div>
            </div>
            {(featured.status?.state === "post" || featured.status?.state === "in") && (
              <div
                className="text-base font-bold tabular-nums px-2"
                style={{
                  color: featured.us?.winner
                    ? "var(--success)"
                    : featured.status?.state === "post"
                    ? "var(--danger)"
                    : team.primary,
                }}
              >
                {featured.status?.state === "in" ? featured.status.detail || "Live" : featured.us?.winner ? "W" : "L"}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm" style={{ color: "var(--text-3)" }}>No upcoming games</div>
        )}
      </button>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
