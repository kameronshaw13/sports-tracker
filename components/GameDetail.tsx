"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useFreshKey } from "@/lib/freshKey";
import Boxscore from "./Boxscore";
import Gamecast from "./Gamecast";
import GameRecap from "./GameRecap";
import PlayByPlay from "./PlayByPlay";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onClose?: () => void;
  // When provided, home/away team blocks become clickable and call this with
  // the team's league + abbr — used to navigate from a box score to that
  // team's page. e.g. tap Astros logo while viewing Orioles vs Astros → Astros.
  onTeamClick?: (league: string, abbr: string) => void;
};

// v19: Game detail is now tab-based.
//
// Tabs depend on game state:
//   - Live or pre-game: [Gamecast] [Box Score] [Play-by-Play]
//   - Final:            [Recap]    [Box Score] [Play-by-Play]
//
// "Gamecast" becomes "Recap" for finished games — same tab slot, different
// content. Gamecast hosts the live visualizations (strike zone, shot map,
// field position) which are stubbed in v19 and built in v20. Recap is
// available immediately as a template-generated summary.

type TabId = "main" | "boxscore" | "plays";

export default function GameDetail({ league, eventId, onClose, onTeamClick }: Props) {
  // v21.1: freshKey busts route cache per mount. The keys are still stable
  // for the lifetime of THIS GameDetail instance, so SWR's manual mutate
  // (used by the Refresh button) keeps working.
  const freshKey = useFreshKey();
  const summaryKey = `/api/summary?league=${league}&event=${eventId}&_t=${freshKey}`;
  const boxscoreKey = `/api/boxscore?league=${league}&event=${eventId}&_t=${freshKey}`;
  const recapKey = `/api/recap?league=${league}&event=${eventId}&_t=${freshKey}`;

  const { data, error, isLoading } = useSWR(summaryKey, fetcher, {
    refreshInterval: 15_000,
  });

  const { mutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("main");

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // v19: also invalidate the recap cache when the user manually refreshes
      // — covers the case where someone refreshes right after a final whistle.
      await Promise.all([mutate(summaryKey), mutate(boxscoreKey), mutate(recapKey)]);
    } catch {}
    setTimeout(() => setRefreshing(false), 500);
  }, [refreshing, mutate, summaryKey, boxscoreKey, recapKey]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-32 rounded animate-pulse" style={{ background: "var(--surface)" }} />
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <BackButton onClose={onClose} />
        <div
          className="p-6 rounded-xl text-sm"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          Couldn't load this game.
        </div>
      </div>
    );
  }

  const { home, away, status, situation } = data;
  const isLive = status?.state === "in";
  const isFinal = status?.state === "post";
  const isPre = status?.state === "pre";

  // Detect non-played games. We hide the Recap tab for these — there's
  // nothing meaningful to recap if the game was postponed.
  const statusName = String(status?.statusName || "").toUpperCase();
  const isNonPlayed = /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(statusName);

  const mainTabLabel = isFinal && !isNonPlayed ? "Recap" : "Gamecast";

  return (
    <div className="space-y-4">
      {/* Top row: back / refresh */}
      <div className="flex items-center justify-between">
        <BackButton onClose={onClose} />
        <RefreshButton refreshing={refreshing} onClick={handleRefresh} />
      </div>

      {/* Scoreboard header */}
      <ScoreboardHeader
        league={league}
        home={home}
        away={away}
        status={status}
        onTeamClick={onTeamClick}
      />

      {/* Tabs */}
      <div
        className="flex p-1 rounded-xl"
        style={{ background: "var(--surface-2)" }}
        role="tablist"
      >
        <TabBtn
          label={mainTabLabel}
          isActive={activeTab === "main"}
          onClick={() => setActiveTab("main")}
        />
        <TabBtn
          label="Box Score"
          isActive={activeTab === "boxscore"}
          onClick={() => setActiveTab("boxscore")}
        />
        <TabBtn
          label="Play-by-Play"
          isActive={activeTab === "plays"}
          onClick={() => setActiveTab("plays")}
        />
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "main" && (
          <>
            {isFinal && !isNonPlayed && (
              <GameRecap league={league} eventId={eventId} />
            )}
            {(isLive || isPre) && (
              <Gamecast
                league={league}
                eventId={eventId}
                isLive={isLive}
                situation={situation}
              />
            )}
            {isNonPlayed && (
              <div
                className="p-6 rounded-xl text-sm text-center"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                }}
              >
                This game was {nonPlayedLabel(statusName).toLowerCase()}.
              </div>
            )}
          </>
        )}

        {activeTab === "boxscore" && (
          <Boxscore league={league} eventId={eventId} isLive={isLive} />
        )}

        {activeTab === "plays" && (
          <PlayByPlay
            league={league}
            eventId={eventId}
            isLive={isLive}
            homeAbbr={home?.abbr}
            awayAbbr={away?.abbr}
          />
        )}
      </div>
    </div>
  );
}

function nonPlayedLabel(statusName: string): string {
  if (statusName.includes("POSTPONED")) return "Postponed";
  if (statusName.includes("CANCEL")) return "Canceled";
  if (statusName.includes("SUSPENDED")) return "Suspended";
  return "Not played";
}

function TabBtn({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
      style={{
        background: isActive ? "var(--surface)" : "transparent",
        color: isActive ? "var(--text)" : "var(--text-2)",
        border: isActive ? "1px solid var(--border)" : "1px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

function BackButton({ onClose }: { onClose?: () => void }) {
  if (!onClose) return <div />;
  return (
    <button
      onClick={onClose}
      className="text-sm font-medium px-3 py-1.5 rounded-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      ← Back
    </button>
  );
}

function RefreshButton({
  refreshing,
  onClick,
}: {
  refreshing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={refreshing}
      aria-label="Refresh"
      className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity disabled:opacity-60"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{
          animation: refreshing ? "spin 0.8s linear infinite" : undefined,
        }}
      >
        <path
          d="M3 8a5 5 0 0 1 8.5-3.5L13 6m0-3v3h-3M13 8a5 5 0 0 1-8.5 3.5L3 10m0 3v-3h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}

function ScoreboardHeader({
  league,
  home,
  away,
  status,
  onTeamClick,
}: {
  league: string;
  home: any;
  away: any;
  status: any;
  onTeamClick?: (league: string, abbr: string) => void;
}) {
  const isLive = status?.state === "in";
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-wider text-center mb-3"
        style={{ color: isLive ? "var(--danger)" : "var(--text-2)" }}
      >
        {status?.detail || ""}
      </div>
      <div className="flex items-center justify-center gap-4">
        <TeamBlock team={away} league={league} onClick={onTeamClick} />
        <div
          className="text-3xl font-bold tabular-nums"
          style={{ color: "var(--text-3)" }}
        >
          –
        </div>
        <TeamBlock team={home} league={league} onClick={onTeamClick} />
      </div>
    </div>
  );
}

function TeamBlock({
  team,
  league,
  onClick,
}: {
  team: any;
  league: string;
  onClick?: (league: string, abbr: string) => void;
}) {
  if (!team) return null;
  const inner = (
    <>
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-1"
        style={{ background: "var(--surface-2)" }}
      >
        {team.logo && (
          <Image src={team.logo} alt={team.abbr} width={44} height={44} className="object-contain" />
        )}
      </div>
      <div className="text-xs font-bold">{team.abbr}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{team.score ?? "—"}</div>
      {team.record && (
        <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
          {team.record}
        </div>
      )}
    </>
  );

  if (onClick && team.abbr) {
    return (
      <button
        onClick={() => onClick(league, String(team.abbr).toLowerCase())}
        className="flex-1 flex flex-col items-center text-center hover:opacity-80 transition-opacity"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex-1 flex flex-col items-center text-center">{inner}</div>;
}
