"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TEAMS, TEAM_ORDER, TeamConfig, logoUrl } from "@/lib/teams";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  onTeamClick: (teamKey: string) => void;
};

export default function HomeDashboard({ onTeamClick }: Props) {
  const [drillIn, setDrillIn] = useState<{ league: string; eventId: string } | null>(null);

  if (drillIn) {
    return <GameDetail league={drillIn.league} eventId={drillIn.eventId} onClose={() => setDrillIn(null)} />;
  }

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-2)" }}>
        Your teams
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEAM_ORDER.map((key) => (
          <TeamCard
            key={key}
            team={TEAMS[key]}
            onTeamClick={() => onTeamClick(key)}
            onGameClick={(eventId) => setDrillIn({ league: TEAMS[key].league, eventId })}
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
  const { data: scheduleData } = useSWR(`/api/scoreboard?team=${team.key}`, fetcher, {
    refreshInterval: 30_000,
  });
  const { data: teamData } = useSWR(`/api/team?team=${team.key}`, fetcher, {
    refreshInterval: 60_000,
  });

  const events = scheduleData?.events || [];
  const liveEvent = events.find((e: any) => e.status?.state === "in");
  const nextEvent = events.find((e: any) => e.status?.state === "pre");
  const lastEvent = events.filter((e: any) => e.status?.state === "post").pop();
  const featured = liveEvent || nextEvent || lastEvent;

  const label = liveEvent ? "Live now" : nextEvent ? "Next game" : "Last game";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {/* Header — tap to enter team */}
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

      {/* Game block — tap to drill into game */}
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
