"use client";

import Image from "next/image";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig; eventId: string | null };

export default function LiveGame({ team, eventId }: Props) {
  // Get the current/next event id if not passed in
  const { data: scheduleData } = useSWR(`/api/scoreboard?team=${team.key}`, fetcher);
  const events = scheduleData?.events || [];
  const liveEvent = events.find((e: any) => e.status?.state === "in");
  const nextEvent = events.find((e: any) => e.status?.state === "pre");
  const lastEvent = events.filter((e: any) => e.status?.state === "post").pop();
  const targetId = eventId || liveEvent?.id || nextEvent?.id || lastEvent?.id;
  const isLive = !!liveEvent;

  const { data, error, isLoading } = useSWR(
    targetId ? `/api/summary?team=${team.key}&event=${targetId}` : null,
    fetcher,
    { refreshInterval: isLive ? 15_000 : 60_000 }
  );

  if (!targetId) {
    return <EmptyState message="No game data available." />;
  }
  if (isLoading) return <LoadingState />;
  if (error || !data) return <EmptyState message="Couldn't load game data." />;

  const { home, away, status, plays } = data;
  const stateLabel = status?.state === "in" ? "Live" : status?.state === "post" ? "Final" : "Upcoming";

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {status?.state === "in" && (
              <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />
            )}
            <span
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: status?.state === "in" ? "var(--danger)" : "var(--text-2)" }}
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
          <div className="text-center">
            <div className="text-xs font-medium" style={{ color: "var(--text-3)" }}>vs</div>
          </div>
          <TeamBlock t={home} align="right" />
        </div>
      </div>

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
          <EmptyState message={status?.state === "pre" ? "Game hasn't started yet." : "No play-by-play available for this game."} />
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
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--surface-2)" }}
        >
          <Image src={t.logo} alt={t.abbr} width={44} height={44} className="object-contain" />
        </div>
      )}
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
          {t.abbr}
        </div>
        <div className="text-3xl font-bold tabular-nums">{t.score ?? "—"}</div>
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

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
      <div className="h-12 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      <div className="h-12 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      <div className="h-12 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="p-8 rounded-xl text-sm text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
      {message}
    </div>
  );
}
