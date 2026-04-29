"use client";

import { useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const LEAGUES = [
  { id: "mlb", label: "MLB", color: "#003263" },
  { id: "nfl", label: "NFL", color: "#013369" },
  { id: "nba", label: "NBA", color: "#C9082A" },
  { id: "nhl", label: "NHL", color: "#000000" },
];

export default function LeaguesView() {
  const [activeLeague, setActiveLeague] = useState("mlb");
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const date = formatDate(dayOffset);
  const { data, error, isLoading } = useSWR(
    `/api/league?league=${activeLeague}&date=${date}`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  if (selectedEvent) {
    return (
      <GameDetail
        league={activeLeague}
        eventId={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    );
  }

  const events = data?.events || [];
  const live = events.filter((e: any) => e.status?.state === "in");
  const upcoming = events.filter((e: any) => e.status?.state === "pre");
  const final = events.filter((e: any) => e.status?.state === "post");

  return (
    <div className="space-y-4">
      {/* League pills */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {LEAGUES.map((l) => {
          const isActive = activeLeague === l.id;
          return (
            <button
              key={l.id}
              onClick={() => setActiveLeague(l.id)}
              className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                background: isActive ? l.color : "var(--surface)",
                border: `1px solid ${isActive ? l.color : "var(--border)"}`,
                color: isActive ? "#FFFFFF" : "var(--text)",
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {/* Date scrubber */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setDayOffset(dayOffset - 1)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          ← Prev
        </button>
        <div className="text-sm font-semibold">{prettyDate(dayOffset)}</div>
        <button
          onClick={() => setDayOffset(dayOffset + 1)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          Next →
        </button>
      </div>

      {dayOffset !== 0 && (
        <button onClick={() => setDayOffset(0)} className="text-xs underline" style={{ color: "var(--text-3)" }}>
          Jump to today
        </button>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
          ))}
        </div>
      ) : error ? (
        <ErrorState />
      ) : events.length === 0 ? (
        <Empty msg={`No ${LEAGUES.find((l) => l.id === activeLeague)?.label} games on this date.`} />
      ) : (
        <>
          {live.length > 0 && (
            <Section title="Live" accent="var(--danger)">
              {live.map((g: any) => (
                <GameCard key={g.id} game={g} variant="live" onClick={() => setSelectedEvent(g.id)} />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title={`Upcoming (${upcoming.length})`}>
              {upcoming.map((g: any) => (
                <GameCard key={g.id} game={g} variant="upcoming" onClick={() => setSelectedEvent(g.id)} />
              ))}
            </Section>
          )}
          {final.length > 0 && (
            <Section title="Final">
              {final.map((g: any) => (
                <GameCard key={g.id} game={g} variant="final" onClick={() => setSelectedEvent(g.id)} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children, accent }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {accent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: accent }} />}
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function GameCard({ game, variant, onClick }: { game: any; variant: "live" | "upcoming" | "final"; onClick: () => void }) {
  const { home, away, status } = game;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-semibold"
          style={{
            color:
              variant === "live"
                ? "var(--danger)"
                : variant === "final"
                ? "var(--text-3)"
                : "var(--text-2)",
          }}
        >
          {status?.detail || (variant === "upcoming" ? formatGameTime(game.date) : "")}
        </span>
        {game.broadcast && (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            {game.broadcast}
          </span>
        )}
      </div>
      <TeamLine t={away} highlight={variant === "final" && away?.winner} />
      <TeamLine t={home} highlight={variant === "final" && home?.winner} />
    </button>
  );
}

function TeamLine({ t, highlight }: { t: any; highlight: boolean }) {
  if (!t) return null;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
        {t.logo && <Image src={t.logo} alt={t.abbr} width={24} height={24} className="object-contain" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${highlight ? "font-bold" : "font-medium"}`}>{t.name}</span>
        {t.record && (
          <span className="text-xs ml-2" style={{ color: "var(--text-3)" }}>{t.record}</span>
        )}
      </div>
      <div
        className={`text-base tabular-nums ${highlight ? "font-bold" : "font-medium"}`}
        style={{ color: highlight ? "var(--text)" : "var(--text-2)" }}
      >
        {t.score ?? "—"}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="p-8 rounded-xl text-sm text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {msg}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="p-6 rounded-xl text-sm"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      Couldn't load games for this league.
    </div>
  );
}

function formatDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
