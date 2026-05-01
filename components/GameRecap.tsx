"use client";

import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
};

// GameRecap renders the post-game writeup. It replaces the Gamecast tab
// once a game is final — so the user doesn't see "Strike zone coming soon"
// on a game that ended hours ago. Sections:
//
//   1. The recap paragraphs (built server-side in /api/recap)
//   2. Top performers grid (one card per leader category, like the boxscore
//      top performers but bigger and with the team logo behind the player)
//
// We keep this lightweight — no headers, no badges, just the paragraphs as
// plain prose. This matches the "auto-summary" feel the user wanted: read
// it like an article, not a scoreboard.
export default function GameRecap({ league, eventId }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/recap?league=${league}&event=${eventId}&_t=${freshKey}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-4 rounded animate-pulse"
            style={{ background: "var(--surface)", width: i === 2 ? "70%" : "100%" }}
          />
        ))}
      </div>
    );
  }

  if (error || !data || data.error || !Array.isArray(data.paragraphs)) {
    return (
      <div
        className="p-5 rounded-xl text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        Recap not available for this game yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Recap paragraphs */}
      <div className="space-y-3">
        {data.paragraphs.map((p: string, i: number) => (
          <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            {p}
          </p>
        ))}
      </div>

      {/* Top performers grid — both teams */}
      <PerformersBlock
        teamLabel={data.away?.short || data.away?.abbr}
        teamAbbr={data.away?.abbr}
        leaders={data.awayLeaders || []}
      />
      <PerformersBlock
        teamLabel={data.home?.short || data.home?.abbr}
        teamAbbr={data.home?.abbr}
        leaders={data.homeLeaders || []}
      />
    </div>
  );
}

function PerformersBlock({
  teamLabel,
  teamAbbr,
  leaders,
}: {
  teamLabel: string;
  teamAbbr: string;
  leaders: any[];
}) {
  if (!leaders || leaders.length === 0) return null;

  return (
    <div>
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--text-2)" }}
      >
        {teamLabel} top performers
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {leaders.slice(0, 3).map((l: any, i: number) => (
          <div
            key={i}
            className="rounded-xl px-3 py-2.5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
              style={{ color: "var(--text-3)" }}
            >
              {l.shortName || l.category}
            </div>
            <div className="text-sm font-semibold truncate">{l.player}</div>
            <div className="text-xs" style={{ color: "var(--text-2)" }}>
              {l.displayValue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
