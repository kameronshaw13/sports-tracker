"use client";

import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  team: TeamConfig;
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
};

export default function LiveGame({ team, onTeamLogoClick, onPlayerClick }: Props) {
  const freshKey = useFreshKey();
  const { data: scheduleData, isLoading } = useSWR(
    `/api/scoreboard?team=${team.key}&_t=${freshKey}`,
    fetcher
  );
  const events = scheduleData?.events || [];
  const liveEvent = events.find((e: any) => e.status?.state === "in");
  const nextEvent = events.find((e: any) => e.status?.state === "pre");
  const lastEvent = events.filter((e: any) => e.status?.state === "post").pop();
  const targetId = liveEvent?.id || nextEvent?.id || lastEvent?.id;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
      </div>
    );
  }

  if (!targetId) {
    return (
      <div className="p-8 rounded-xl text-sm text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        No game data available.
      </div>
    );
  }

  return (
    <GameDetail
      league={team.league}
      eventId={targetId}
      onTeamClick={onTeamLogoClick}
      onPlayerClick={onPlayerClick}
    />
  );
}
