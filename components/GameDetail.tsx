"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import Boxscore from "./Boxscore";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onClose?: () => void;
  // When provided, home/away team blocks become clickable and call this with
  // the team's league + abbr — used to navigate from a box score to that
  // team's page. e.g. tap Astros logo while viewing Orioles vs Astros → Astros page.
  onTeamClick?: (league: string, abbr: string) => void;
};

export default function GameDetail({ league, eventId, onClose, onTeamClick }: Props) {
  const summaryKey = `/api/summary?league=${league}&event=${eventId}`;
  const boxscoreKey = `/api/boxscore?league=${league}&event=${eventId}`;

  const { data, error, isLoading } = useSWR(summaryKey, fetcher, {
    refreshInterval: 15_000,
  });

  // v17: manual refresh button. SWR's global mutate is used so we can refresh
  // BOTH the summary (scoreboard + plays) AND the boxscore (player stats)
  // in a single click — even though the boxscore lives in a child component
  // with its own SWR hook. Without this the boxscore would only update on its
  // own 15s timer regardless of when the user tapped.
  const { mutate } = useSWRConfig();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([mutate(summaryKey), mutate(boxscoreKey)]);
    } catch {
      // swallow — SWR will surface the error in `error` if a fetch fails
    }
    // Keep the spinner visible for ~500ms even if the network is fast, so the
    // user gets clear visual feedback that the tap registered.
    setTimeout(() => setRefreshing(false), 500);
  }, [mutate, summaryKey, boxscoreKey, refreshing]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
        <div className="h-12 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <TopBar onClose={onClose} onRefresh={handleRefresh} refreshing={refreshing} />
        <div className="p-8 rounded-xl text-sm text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          Couldn't load game data.
        </div>
      </div>
    );
  }

  const { home, away, status, plays } = data;
  const isLive = status?.state === "in";
  const isFinal = status?.state === "post";
  const stateLabel = isLive ? "Live" : isFinal ? "Final" : "Upcoming";

  // Build click handlers only when we have both a callback AND a valid abbr.
  // The handlers go through league + abbr (not numeric ESPN id) since that's
  // how the rest of the app keys teams.
  const onAwayClick = onTeamClick && away?.abbr ? () => onTeamClick(league, away.abbr) : undefined;
  const onHomeClick = onTeamClick && home?.abbr ? () => onTeamClick(league, home.abbr) : undefined;

  return (
    <div className="space-y-4">
      {/* Top bar: optional back button on the left, refresh always on the right */}
      <TopBar onClose={onClose} onRefresh={handleRefresh} refreshing={refreshing} />

      {/* Scoreboard */}
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isLive && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}
            <span
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: isLive ? "var(--danger)" : "var(--text-2)" }}
            >
              {stateLabel}
            </span>
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
            {status?.detail}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamBlock t={away} align="left" onClick={onAwayClick} />
          <div className="text-center text-xs font-medium" style={{ color: "var(--text-3)" }}>vs</div>
          <TeamBlock t={home} align="right" onClick={onHomeClick} />
        </div>

        {(data.venue || data.broadcast) && (
          <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
            <span>{data.venue}</span>
            {data.broadcast && <span>{data.broadcast}</span>}
          </div>
        )}
      </div>

      {/* Boxscore — only when game has started */}
      {(isLive || isFinal) && (
        <Boxscore league={league} eventId={eventId} isLive={isLive} />
      )}

      {/* Play by play */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
          Play by play
        </h2>
        {plays && plays.length > 0 ? (
          <div className="space-y-1.5">
            {plays.map((p: any) => (
              <PlayRow key={p.id} play={p} />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-xl text-sm text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            {status?.state === "pre" ? "Game hasn't started yet." : "No play-by-play available for this game."}
          </div>
        )}
      </div>
    </div>
  );
}

// Top bar holding the optional back button and the always-visible refresh
// button. We render an empty <div /> when there's no back button so the
// refresh button stays right-aligned via justify-between.
function TopBar({
  onClose,
  onRefresh,
  refreshing,
}: {
  onClose?: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      {onClose ? (
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          ← Back
        </button>
      ) : (
        <div />
      )}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh"
        className="flex items-center justify-center w-9 h-9 rounded-lg transition-opacity"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
          opacity: refreshing ? 0.6 : 1,
        }}
      >
        <RefreshIcon spinning={refreshing} />
      </button>
    </div>
  );
}

// Inline SVG to avoid pulling in an icon library. The `animate-spin` class is
// built into Tailwind so we just toggle it.
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

// Renders a team's block (logo + abbr + score + record). Becomes a button
// when an onClick is provided. We deliberately use a button (not a wrapping
// <a> or div with onClick) so it gets keyboard focus + accessible semantics
// for free.
function TeamBlock({
  t,
  align,
  onClick,
}: {
  t: any;
  align: "left" | "right";
  onClick?: () => void;
}) {
  if (!t) return <div />;

  const inner = (
    <>
      {t.logo && (
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
          <Image src={t.logo} alt={t.abbr} width={44} height={44} className="object-contain" />
        </div>
      )}
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{t.abbr}</div>
        <div className="text-3xl font-bold tabular-nums">{t.score ?? "—"}</div>
        {t.record && <div className="text-xs" style={{ color: "var(--text-3)" }}>{t.record}</div>}
      </div>
    </>
  );

  const className = `flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${className} rounded-lg -m-1 p-1 transition-colors hover:bg-[var(--surface-2)] cursor-pointer`}
        aria-label={`Go to ${t.abbr} page`}
      >
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

function PlayRow({ play }: { play: any }) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-2.5 rounded-lg"
      style={{
        background: play.scoringPlay ? "rgba(16, 185, 129, 0.08)" : "var(--surface)",
        border: `1px solid ${play.scoringPlay ? "rgba(16, 185, 129, 0.25)" : "var(--border)"}`,
      }}
    >
      <div className="flex-shrink-0 w-16 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
        {play.clock && <div className="font-semibold">{play.clock}</div>}
        {play.period && <div>{ordinal(play.period)}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug">{play.text}</div>
        {play.scoringPlay && play.awayScore != null && play.homeScore != null && (
          <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--success)" }}>
            Score: {play.awayScore} – {play.homeScore}
          </div>
        )}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
