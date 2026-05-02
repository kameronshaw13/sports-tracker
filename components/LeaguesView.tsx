"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import { League } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// v20.1 — uniform blue active state across all four leagues. Brand colors
// were producing a red NBA pill and a black NHL pill which read poorly on
// a dark UI. The deeper blue (blue-800) provides good contrast in both
// light and dark themes and visually unifies the picker.
const ACTIVE_PILL_BG = "#1E40AF";
const ACTIVE_PILL_BORDER = "#1E3A8A";

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "CFB",
  cbb: "CBB",
};

type Density = "compact" | "expanded";

type Props = {
  // Forwarded to GameDetail when the user drills into a game and taps a team
  // logo on the box score.
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
  initialLeague?: string;
};

export default function LeaguesView({ onTeamLogoClick, onPlayerClick, initialLeague = "mlb" }: Props) {
  const [activeLeague, setActiveLeague] = useState(initialLeague);
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  useEffect(() => {
    if (initialLeague && initialLeague !== activeLeague) {
      setActiveLeague(initialLeague);
      setDayOffset(0);
    }
  }, [initialLeague]);

  const { settings } = useAppSettings();
  const density = settings.density;

  // v21.1: freshKey appended so each mount of Scores busts the route cache.
  const freshKey = useFreshKey();
  const date = formatDate(dayOffset);
  const { data, error, isLoading } = useSWR(
    `/api/league?league=${activeLeague}&date=${date}&_t=${freshKey}`,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true, revalidateOnReconnect: true, dedupingInterval: 4_000 }
  );

  if (selectedEvent) {
    return (
      <GameDetail
        league={activeLeague}
        eventId={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  const events = data?.events || [];
  const live = events.filter((e: any) => e.status?.state === "in");
  const upcoming = events.filter((e: any) => e.status?.state === "pre");
  const final = events.filter((e: any) => e.status?.state === "post");

  return (
    <div className="space-y-4">
      {/* League pills — uniform blue active state */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {settings.sportOrder.map((leagueId) => {
          const isActive = activeLeague === leagueId;
          return (
            <button
              key={leagueId}
              onClick={() => setActiveLeague(leagueId)}
              className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                background: isActive ? ACTIVE_PILL_BG : "var(--surface)",
                border: `1px solid ${isActive ? ACTIVE_PILL_BORDER : "var(--border)"}`,
                color: isActive ? "#FFFFFF" : "var(--text)",
              }}
            >
              {LEAGUE_LABELS[leagueId]}
            </button>
          );
        })}
      </div>

      {/* Date scrubber */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setDayOffset(dayOffset - 1)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          ← Prev
        </button>
        <div className="text-sm font-semibold flex-1 text-center">{prettyDate(dayOffset)}</div>
        <button
          onClick={() => setDayOffset(dayOffset + 1)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          Next →
        </button>
      </div>

      {/* Jump-to-today lives here; compact/expanded + sport order now live in Settings. */}
      {dayOffset !== 0 && (
        <button
          onClick={() => setDayOffset(0)}
          className="text-xs underline"
          style={{ color: "var(--text-3)" }}
        >
          Jump to today
        </button>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl animate-pulse"
              style={{ background: "var(--surface)" }}
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState />
      ) : events.length === 0 ? (
        <Empty msg={`No ${LEAGUE_LABELS[activeLeague as League]} games on this date.`} />
      ) : (
        <>
          {live.length > 0 && (
            <Section title="Live" accent="var(--danger)">
              <GameGrid density={density}>
                {live.map((g: any) => (
                  <GameCard
                    key={g.id}
                    league={activeLeague}
                    game={g}
                    variant="live"
                    density={density}
                    onClick={() => setSelectedEvent(g.id)}
                  />
                ))}
              </GameGrid>
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title={`Upcoming (${upcoming.length})`}>
              <GameGrid density={density}>
                {upcoming.map((g: any) => (
                  <GameCard
                    key={g.id}
                    league={activeLeague}
                    game={g}
                    variant="upcoming"
                    density={density}
                    onClick={() => setSelectedEvent(g.id)}
                  />
                ))}
              </GameGrid>
            </Section>
          )}
          {final.length > 0 && (
            <Section title="Final">
              <GameGrid density={density}>
                {final.map((g: any) => (
                  <GameCard
                    key={g.id}
                    league={activeLeague}
                    game={g}
                    variant="final"
                    density={density}
                    onClick={() => setSelectedEvent(g.id)}
                  />
                ))}
              </GameGrid>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// -------- Density toggle --------

function DensityToggle({
  density,
  setDensity,
}: {
  density: Density;
  setDensity: (d: Density) => void;
}) {
  return (
    <div
      className="inline-flex p-0.5 rounded-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => setDensity("compact")}
        aria-label="Compact view"
        className="px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1"
        style={{
          background: density === "compact" ? "var(--text)" : "transparent",
          color: density === "compact" ? "var(--bg)" : "var(--text-2)",
        }}
      >
        <CompactIcon />
        <span>Compact</span>
      </button>
      <button
        type="button"
        onClick={() => setDensity("expanded")}
        aria-label="Expanded view"
        className="px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1"
        style={{
          background: density === "expanded" ? "var(--text)" : "transparent",
          color: density === "expanded" ? "var(--bg)" : "var(--text-2)",
        }}
      >
        <ExpandedIcon />
        <span>Expanded</span>
      </button>
    </div>
  );
}

function CompactIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ExpandedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="7" width="10" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// -------- Grid + section wrappers --------

function GameGrid({ density, children }: { density: Density; children: React.ReactNode }) {
  if (density === "compact") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{children}</div>
    );
  }
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>;
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
      {children}
    </div>
  );
}

// -------- Game card (expanded + compact variants share status-row layout) --------

function GameCard({
  league,
  game,
  variant,
  density,
  onClick,
}: {
  league: string;
  game: any;
  variant: "live" | "upcoming" | "final";
  density: Density;
  onClick: () => void;
}) {
  const { home, away, status, situation } = game;
  const isLive = variant === "live";

  // Live-only situation indicator that sits next to the status text
  const statusRight =
    isLive && situation
      ? league === "mlb" && hasBaseballSituation(situation)
        ? <BaseballSituationInline situation={situation} />
        : league === "nfl" && hasFootballSituation(situation)
        ? <FootballSituationInline situation={situation} game={game} />
        : null
      : null;

  if (density === "compact") {
    return (
      <CompactGameCard
        game={game}
        variant={variant}
        statusRight={statusRight}
        onClick={onClick}
      />
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <span
          className="text-xs font-semibold flex-shrink-0"
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
        <div className="flex items-center gap-2 min-w-0">
          {statusRight}
          {game.broadcast && (
            <span className="text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>
              {game.broadcast}
            </span>
          )}
        </div>
      </div>
      <TeamLine t={away} highlight={variant === "final" && away?.winner} />
      <TeamLine t={home} highlight={variant === "final" && home?.winner} />
    </button>
  );
}

function CompactGameCard({
  game,
  variant,
  statusRight,
  onClick,
}: {
  game: any;
  variant: "live" | "upcoming" | "final";
  statusRight: React.ReactNode;
  onClick: () => void;
}) {
  const { home, away, status } = game;
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className="text-[11px] font-semibold flex-shrink-0 truncate"
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
        {statusRight && <div className="flex-shrink-0">{statusRight}</div>}
      </div>
      <CompactTeamRow t={away} highlight={variant === "final" && away?.winner} />
      <CompactTeamRow t={home} highlight={variant === "final" && home?.winner} />
    </button>
  );
}

function TeamLine({ t, highlight }: { t: any; highlight: boolean }) {
  if (!t) return null;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
        {t.logo && (
          <Image src={t.logo} alt={t.abbr} width={24} height={24} className="object-contain" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${highlight ? "font-bold" : "font-medium"}`}>{t.name}</span>
        {t.record && (
          <span className="text-xs ml-2" style={{ color: "var(--text-3)" }}>
            {t.record}
          </span>
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

function CompactTeamRow({ t, highlight }: { t: any; highlight: boolean }) {
  if (!t) return null;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        {t.logo && (
          <Image src={t.logo} alt={t.abbr} width={18} height={18} className="object-contain" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-xs ${highlight ? "font-bold" : "font-medium"}`}>{t.abbr}</span>
      </div>
      <div
        className={`text-sm tabular-nums ${highlight ? "font-bold" : "font-medium"}`}
        style={{ color: highlight ? "var(--text)" : "var(--text-2)" }}
      >
        {t.score ?? "—"}
      </div>
    </div>
  );
}

// -------- MLB situation (inline, next to status) --------

function hasBaseballSituation(s: any): boolean {
  return s && (typeof s.balls === "number" || typeof s.outs === "number");
}

function BaseballSituationInline({ situation }: { situation: any }) {
  const balls = situation.balls ?? 0;
  const strikes = situation.strikes ?? 0;
  const outs = situation.outs ?? 0;
  return (
    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-2)" }}>
      <BasesDiamond
        onFirst={!!situation.onFirst}
        onSecond={!!situation.onSecond}
        onThird={!!situation.onThird}
      />
      <span className="font-semibold tabular-nums">
        {balls}-{strikes}
      </span>
      <span className="font-semibold tabular-nums">
        {outs} {outs === 1 ? "out" : "outs"}
      </span>
    </div>
  );
}

function BasesDiamond({
  onFirst,
  onSecond,
  onThird,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
}) {
  const filled = "var(--text)";
  const empty = "var(--surface-2)";
  const stroke = "var(--text-3)";
  return (
    <svg
      width="22"
      height="18"
      viewBox="0 0 22 18"
      aria-label={`Runners: ${runnerLabel(onFirst, onSecond, onThird)}`}
    >
      <g transform="translate(11 5) rotate(45)">
        <rect x="-3" y="-3" width="6" height="6" fill={onSecond ? filled : empty} stroke={stroke} strokeWidth="0.8" />
      </g>
      <g transform="translate(17 11) rotate(45)">
        <rect x="-3" y="-3" width="6" height="6" fill={onFirst ? filled : empty} stroke={stroke} strokeWidth="0.8" />
      </g>
      <g transform="translate(5 11) rotate(45)">
        <rect x="-3" y="-3" width="6" height="6" fill={onThird ? filled : empty} stroke={stroke} strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function runnerLabel(f: boolean, s: boolean, t: boolean): string {
  const on: string[] = [];
  if (f) on.push("1st");
  if (s) on.push("2nd");
  if (t) on.push("3rd");
  return on.length === 0 ? "bases empty" : on.join(", ");
}

// -------- NFL situation (inline) --------

function hasFootballSituation(s: any): boolean {
  if (!s) return false;
  return (
    !!s.shortDownDistanceText ||
    typeof s.down === "number" ||
    !!s.possessionText
  );
}

function FootballSituationInline({ situation, game }: { situation: any; game: any }) {
  const downDistance =
    situation.shortDownDistanceText ||
    (typeof situation.down === "number" && typeof situation.distance === "number"
      ? `${ordinal(situation.down)} & ${situation.distance}`
      : null);

  const possessingAbbr = findPossessingTeamAbbr(situation, game);
  const fieldText =
    situation.possessionText ||
    (possessingAbbr && typeof situation.yardLine === "number"
      ? `${possessingAbbr} ${situation.yardLine}`
      : null);

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] font-semibold"
      style={{ color: "var(--text-2)" }}
    >
      {downDistance && <span>{downDistance}</span>}
      {fieldText && (
        <>
          {downDistance && <span style={{ color: "var(--text-3)" }}>·</span>}
          <span>{fieldText}</span>
        </>
      )}
      {situation.isRedZone && (
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded"
          style={{ background: "rgba(239, 68, 68, 0.15)", color: "#dc2626" }}
        >
          Red Zone
        </span>
      )}
    </div>
  );
}

function findPossessingTeamAbbr(situation: any, game: any): string | null {
  const id = situation.possession;
  if (!id) return null;
  if (game.home?.id === id) return game.home?.abbr;
  if (game.away?.id === id) return game.away?.abbr;
  return null;
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// -------- Empty / error helpers --------

function Empty({ msg }: { msg: string }) {
  return (
    <div
      className="p-8 rounded-xl text-sm text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
      {msg}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      className="p-6 rounded-xl text-sm"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
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
