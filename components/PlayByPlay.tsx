"use client";

import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import { useMemo, useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
  // homeAbbr / awayAbbr remain optional props for backwards compat with
  // GameDetail (v19 passes them) — but PlayByPlay now reads team meta from
  // its own /api/plays response, so these aren't strictly required.
  homeAbbr?: string;
  awayAbbr?: string;
};

type TeamMeta = {
  id: string;
  abbr: string;
  name: string;
  color: string;
  logo?: string;
};

type Play = {
  id: string;
  text: string;
  period: number;
  halfInning?: "top" | "bottom" | null;
  clock?: string | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  driveIndex?: number;
};

type Drive = {
  index: number;
  description: string;
  result: string;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  start?: string;
  end?: string;
};

// v20: Plays are grouped by sport-appropriate divisions. Each section is
// collapsible (open by default) — the user can tap the header to fold.
// Each play row gets a 3px team-color stripe on its left edge so you can
// see at a glance which team made the play.
//
// Grouping rules:
//   MLB → group by inning, with top/bot sub-sections inside each inning.
//   NFL → group by drive (ESPN exposes drives separately from plays).
//   NBA → group by quarter.
//   NHL → group by period.
//
// Section ordering: most recent FIRST (top of list) for live feel.
// Within a section, plays are oldest-first (chronological).
export default function PlayByPlay({ league, eventId, isLive }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/plays?league=${league}&event=${eventId}&_t=${freshKey}` : null,
    fetcher,
    { refreshInterval: isLive ? 15_000 : 0 }
  );

  const home: TeamMeta | undefined = data?.home;
  const away: TeamMeta | undefined = data?.away;
  const plays: Play[] = data?.plays || [];
  const drives: Drive[] = data?.drives || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl animate-pulse"
            style={{ background: "var(--surface)" }}
          />
        ))}
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div
        className="p-5 rounded-xl text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        Play-by-play data isn't available for this game.
      </div>
    );
  }

  if (plays.length === 0) {
    return (
      <div
        className="p-5 rounded-xl text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        No plays yet.
      </div>
    );
  }

  // Sport-specific grouping.
  if (league === "nfl") {
    return (
      <NflDriveView
        drives={drives}
        plays={plays}
        home={home}
        away={away}
      />
    );
  }

  if (league === "mlb") {
    return <MlbInningView plays={plays} home={home} away={away} />;
  }

  // NBA / NHL — grouped by period
  return <PeriodView league={league} plays={plays} home={home} away={away} />;
}

// =====================================================================
// MLB: grouped by inning, with top/bottom subsections
// =====================================================================

function MlbInningView({
  plays,
  home,
  away,
}: {
  plays: Play[];
  home?: TeamMeta;
  away?: TeamMeta;
}) {
  const grouped = useMemo(() => {
    type Half = { half: "top" | "bottom"; plays: Play[] };
    type Inning = { period: number; halves: Half[] };

    const map = new Map<number, { top: Play[]; bottom: Play[] }>();
    for (const p of plays) {
      const period = p.period || 0;
      if (!map.has(period)) map.set(period, { top: [], bottom: [] });
      const entry = map.get(period)!;
      if (p.halfInning === "top") entry.top.push(p);
      else if (p.halfInning === "bottom") entry.bottom.push(p);
      else {
        // Unknown half — bucket with bottom (rare)
        entry.bottom.push(p);
      }
    }

    const innings: Inning[] = [];
    Array.from(map.keys())
      .sort((a, b) => b - a) // newest inning first
      .forEach((period) => {
        const entry = map.get(period)!;
        const halves: Half[] = [];
        // Within an inning, top precedes bottom chronologically — but for
        // newest-first ordering of the half-inning sections, show bottom first
        // when both halves exist (since bottom happens later).
        if (entry.bottom.length) halves.push({ half: "bottom", plays: entry.bottom });
        if (entry.top.length) halves.push({ half: "top", plays: entry.top });
        innings.push({ period, halves });
      });

    return innings;
  }, [plays]);

  return (
    <div className="space-y-3">
      {grouped.map((inning) => (
        <CollapsibleSection
          key={inning.period}
          label={`${ordinal(inning.period)} Inning`}
        >
          <div className="space-y-3">
            {inning.halves.map((h) => (
              <div key={h.half}>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1"
                  style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}
                >
                  {h.half === "top" ? "Top" : "Bottom"} {ordinal(inning.period)}
                  {" — "}
                  {h.half === "top" ? away?.abbr || "Away" : home?.abbr || "Home"} batting
                </div>
                <div className="space-y-1.5">
                  {h.plays.map((p) => (
                    <PlayRow
                      key={p.id}
                      play={p}
                      home={home}
                      away={away}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

// =====================================================================
// NFL: grouped by drive
// =====================================================================

function NflDriveView({
  drives,
  plays,
  home,
  away,
}: {
  drives: Drive[];
  plays: Play[];
  home?: TeamMeta;
  away?: TeamMeta;
}) {
  // If we somehow don't have drives (very early in a game, or ESPN payload
  // shape changed), fall back to grouping by quarter.
  if (drives.length === 0) {
    return <PeriodView league="nfl" plays={plays} home={home} away={away} />;
  }

  // Build drive → plays map
  const playsByDrive = new Map<number, Play[]>();
  for (const p of plays) {
    if (p.driveIndex == null) continue;
    if (!playsByDrive.has(p.driveIndex)) playsByDrive.set(p.driveIndex, []);
    playsByDrive.get(p.driveIndex)!.push(p);
  }

  // Newest drive first
  const ordered = [...drives].sort((a, b) => b.index - a.index);

  return (
    <div className="space-y-3">
      {ordered.map((d) => {
        const dp = playsByDrive.get(d.index) || [];
        const teamMeta = d.homeAway === "home" ? home : d.homeAway === "away" ? away : undefined;
        return (
          <CollapsibleSection
            key={d.index}
            label={
              <DriveLabel
                drive={d}
                teamMeta={teamMeta}
                playCount={dp.length}
              />
            }
          >
            <div className="space-y-1.5">
              {dp.map((p) => (
                <PlayRow key={p.id} play={p} home={home} away={away} />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function DriveLabel({
  drive,
  teamMeta,
  playCount,
}: {
  drive: Drive;
  teamMeta?: TeamMeta;
  playCount: number;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ background: teamMeta?.color || "var(--text-3)" }}
        aria-hidden
      />
      <span className="font-bold uppercase tracking-wider text-xs flex-shrink-0">
        {teamMeta?.abbr || "—"} drive
      </span>
      {drive.result && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: "var(--surface)", color: "var(--text-3)" }}
        >
          {drive.result}
        </span>
      )}
      <span
        className="text-[11px] truncate"
        style={{ color: "var(--text-3)" }}
      >
        {drive.description}
      </span>
      <span
        className="text-[10px] flex-shrink-0 ml-auto pl-2"
        style={{ color: "var(--text-3)" }}
      >
        {playCount} plays
      </span>
    </div>
  );
}

// =====================================================================
// NBA / NHL: grouped by period (quarter or period)
// =====================================================================

function PeriodView({
  league,
  plays,
  home,
  away,
}: {
  league: string;
  plays: Play[];
  home?: TeamMeta;
  away?: TeamMeta;
}) {
  const grouped = useMemo(() => {
    const map = new Map<number, Play[]>();
    for (const p of plays) {
      const period = p.period || 0;
      if (!map.has(period)) map.set(period, []);
      map.get(period)!.push(p);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
    return sorted.map(([period, items]) => ({ period, plays: items }));
  }, [plays]);

  return (
    <div className="space-y-3">
      {grouped.map((g) => (
        <CollapsibleSection
          key={g.period}
          label={periodLabel(league, g.period)}
        >
          <div className="space-y-1.5">
            {g.plays.map((p) => (
              <PlayRow key={p.id} play={p} home={home} away={away} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

// =====================================================================
// Shared UI: collapsible section, play row with team color stripe
// =====================================================================

function CollapsibleSection({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{
          background: "var(--surface-2, var(--surface))",
          borderBottom: open ? "1px solid var(--border)" : "none",
        }}
      >
        <div className="flex-1 min-w-0 flex items-center">
          {typeof label === "string" ? (
            <h4
              className="text-xs uppercase tracking-widest font-bold"
              style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
            >
              {label}
            </h4>
          ) : (
            label
          )}
        </div>
        <span
          className="text-xs flex-shrink-0"
          style={{ color: "var(--text-3)" }}
          aria-hidden
        >
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && <div className="px-3 py-3">{children}</div>}
    </section>
  );
}

function PlayRow({
  play,
  home,
  away,
}: {
  play: Play;
  home?: TeamMeta;
  away?: TeamMeta;
}) {
  const teamMeta =
    play.homeAway === "home" ? home : play.homeAway === "away" ? away : undefined;
  const stripeColor = teamMeta?.color || "var(--text-3)";

  return (
    <div
      className="flex items-stretch rounded-lg overflow-hidden"
      style={{
        background: play.scoringPlay ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2, var(--surface))",
        border: `1px solid ${
          play.scoringPlay ? "rgba(16, 185, 129, 0.25)" : "var(--border)"
        }`,
      }}
    >
      {/* Team color stripe on the left edge */}
      <div
        className="flex-shrink-0"
        style={{ width: 4, background: stripeColor }}
        aria-hidden
      />

      <div className="flex items-start gap-3 px-3 py-2 flex-1 min-w-0">
        <div
          className="flex-shrink-0 w-12 text-xs tabular-nums"
          style={{ color: "var(--text-3)" }}
        >
          {play.clock && <div className="font-semibold">{play.clock}</div>}
          {teamMeta?.abbr && (
            <div className="font-bold" style={{ color: stripeColor }}>
              {teamMeta.abbr}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug">{play.text}</div>
          {play.scoringPlay && (
            <div
              className="text-[11px] font-semibold mt-1 flex items-center gap-2"
              style={{ color: "var(--success, #10B981)" }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "rgb(5, 150, 105)",
                }}
              >
                Score
              </span>
              {play.awayScore != null && play.homeScore != null && (
                <span style={{ color: "var(--text-2)" }} className="tabular-nums">
                  {away?.abbr || "AWAY"} {play.awayScore}
                  <span style={{ color: "var(--text-3)" }}> · </span>
                  {home?.abbr || "HOME"} {play.homeScore}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

function periodLabel(league: string, period: number): string {
  if (league === "mlb") return `${ordinal(period)} Inning`;
  if (league === "nhl") {
    if (period >= 5) return "Shootout";
    if (period === 4) return "Overtime";
    return `${ordinal(period)} Period`;
  }
  // NFL fallback / NBA — quarters with OT
  if (period >= 5) return `Overtime ${period - 4 > 1 ? period - 4 : ""}`.trim();
  return `${ordinal(period)} Quarter`;
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  if (n === 4) return "4th";
  return `${n}th`;
}
