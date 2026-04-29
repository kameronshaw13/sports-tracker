"use client";

import Image from "next/image";
import useSWR from "swr";
import Boxscore from "./Boxscore";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onClose?: () => void;
};

export default function GameDetail({ league, eventId, onClose }: Props) {
  const { data, error, isLoading } = useSWR(
    `/api/summary?league=${league}&event=${eventId}`,
    fetcher,
    { refreshInterval: 15_000 }
  );

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
      <div className="p-8 rounded-xl text-sm text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        Couldn't load game data.
      </div>
    );
  }

  const { home, away, status, plays } = data;
  const isLive = status?.state === "in";
  const isFinal = status?.state === "post";
  const stateLabel = isLive ? "Live" : isFinal ? "Final" : "Upcoming";

  return (
    <div className="space-y-4">
      {/* Top bar with optional back button */}
      {onClose && (
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          ← Back
        </button>
      )}

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
          <TeamBlock t={away} align="left" />
          <div className="text-center text-xs font-medium" style={{ color: "var(--text-3)" }}>vs</div>
          <TeamBlock t={home} align="right" />
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

function TeamBlock({ t, align }: { t: any; align: "left" | "right" }) {
  if (!t) return <div />;
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
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
    </div>
  );
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
