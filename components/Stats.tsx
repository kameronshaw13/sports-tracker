"use client";

import { useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { SECTIONS_BY_LEAGUE, Section } from "@/lib/playerColumns";
import PlayersTable, { Player } from "@/components/PlayersTable";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function Stats({ team }: Props) {
  // v21.1: every mount of the Stats tab now busts the route cache, so the
  // user sees fresh data each time they navigate here.
  const freshKey = useFreshKey();
  const { data: teamData } = useSWR(
    `/api/team?team=${team.key}&_t=${freshKey}`,
    fetcher
  );
  const { data: scheduleData } = useSWR(
    `/api/scoreboard?team=${team.key}&_t=${freshKey}`,
    fetcher
  );
  const { data: playersData, isLoading: playersLoading } = useSWR(
    `/api/players?team=${team.key}&_t=${freshKey}`,
    fetcher
  );

  const events = scheduleData?.events || [];
  const completed = events.filter((e: any) => e.status?.state === "post");
  const wins = completed.filter((e: any) => e.us?.winner).length;
  const losses = completed.length - wins;
  const last10 = completed.slice(-10);
  const last10W = last10.filter((e: any) => e.us?.winner).length;
  const last10L = last10.length - last10W;

  let streak = { type: "—", count: 0 };
  if (completed.length > 0) {
    const reversed = [...completed].reverse();
    const first = reversed[0].us?.winner;
    let count = 0;
    for (const g of reversed) {
      if (g.us?.winner === first) count++;
      else break;
    }
    streak = { type: first ? "W" : "L", count };
  }

  const homeGames = completed.filter((e: any) => e.home);
  const awayGames = completed.filter((e: any) => !e.home);
  const homeW = homeGames.filter((e: any) => e.us?.winner).length;
  const awayW = awayGames.filter((e: any) => e.us?.winner).length;

  const totals = completed.reduce(
    (acc: any, e: any) => {
      const us = Number(e.us?.score) || 0;
      const them = Number(e.opponent?.score) || 0;
      return { for: acc.for + us, against: acc.against + them };
    },
    { for: 0, against: 0 }
  );
  const avgFor = completed.length ? (totals.for / completed.length).toFixed(1) : "—";
  const avgAgainst = completed.length ? (totals.against / completed.length).toFixed(1) : "—";

  const summaryStats = [
    { label: "Record", value: teamData?.record || `${wins}–${losses}` },
    { label: "Last 10", value: completed.length ? `${last10W}–${last10L}` : "—" },
    { label: "Streak", value: streak.count > 0 ? `${streak.type}${streak.count}` : "—" },
    { label: "Standing", value: teamData?.standingSummary?.split(",")[0] || "—" },
    { label: "Home", value: homeGames.length ? `${homeW}–${homeGames.length - homeW}` : "—" },
    { label: "Away", value: awayGames.length ? `${awayW}–${awayGames.length - awayW}` : "—" },
    { label: scoredLabel(team.league), value: avgFor },
    { label: allowedLabel(team.league), value: avgAgainst },
  ];

  const sections = SECTIONS_BY_LEAGUE[team.league] || [];
  const players: Player[] = playersData?.players || [];

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader
          title="Team Summary"
          subtitle="Season-to-date team performance"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summaryStats.map((s) => (
            <SummaryCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Player Stats"
          subtitle={
            playersData?.total != null
              ? `${playersData.total} players on roster · only those with relevant stats shown`
              : "Per-player stats for the active roster"
          }
        />

        {playersLoading || !playersData ? (
          <PlayersLoading />
        ) : team.league === "mlb" ? (
          <MlbBattingPitching sections={sections} players={players} />
        ) : (
          <StackedSections sections={sections} players={players} />
        )}
      </section>

      <p className="text-xs px-1" style={{ color: "var(--text-3)" }}>
        Data from ESPN, refreshed hourly. Click any column header to sort. Player stats may take a few seconds to load on first visit.
      </p>
    </div>
  );
}

function MlbBattingPitching({ sections, players }: { sections: Section[]; players: Player[] }) {
  const battingSection = sections.find((s) => s.id === "batting");
  const startersSection = sections.find((s) => s.id === "starters");
  const relieversSection = sections.find((s) => s.id === "relievers");

  const [active, setActive] = useState<"batting" | "pitching">("batting");

  return (
    <div>
      <div
        className="inline-flex p-1 rounded-xl mb-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        role="tablist"
      >
        {(["batting", "pitching"] as const).map((id) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(id)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize"
              style={{
                background: isActive ? "var(--text)" : "transparent",
                color: isActive ? "var(--bg)" : "var(--text-2)",
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {active === "batting" && battingSection && (
        <PlayersTable section={battingSection} players={players} />
      )}

      {active === "pitching" && (
        <div className="space-y-6">
          {startersSection && (
            <div>
              <h4
                className="text-xs uppercase tracking-widest font-bold mb-2.5 px-1"
                style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
              >
                {startersSection.label}
              </h4>
              <PlayersTable section={startersSection} players={players} />
            </div>
          )}
          {relieversSection && (
            <div>
              <h4
                className="text-xs uppercase tracking-widest font-bold mb-2.5 px-1"
                style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
              >
                {relieversSection.label}
              </h4>
              <PlayersTable section={relieversSection} players={players} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StackedSections({ sections, players }: { sections: Section[]; players: Player[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id}>
          {sections.length > 1 && (
            <h4
              className="text-xs uppercase tracking-widest font-bold mb-2.5 px-1"
              style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
            >
              {section.label}
            </h4>
          )}
          <PlayersTable section={section} players={players} />
        </div>
      ))}
    </div>
  );
}

function PlayersLoading() {
  return (
    <div className="space-y-3">
      <div
        className="h-12 rounded-xl animate-pulse"
        style={{ background: "var(--surface)" }}
      />
      <div
        className="h-64 rounded-xl animate-pulse"
        style={{ background: "var(--surface)" }}
      />
    </div>
  );
}

function scoredLabel(league: string): string {
  if (league === "mlb") return "Runs/G";
  if (league === "nhl") return "Goals/G";
  return "Pts/G";
}
function allowedLabel(league: string): string {
  if (league === "mlb") return "RA/G";
  if (league === "nhl") return "GA/G";
  return "Opp Pts/G";
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-3">
      <h3 className="text-base font-bold tracking-tight">{title}</h3>
      {subtitle && (
        <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-3 rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-[11px] uppercase tracking-wider font-semibold mb-1.5 truncate"
        style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}
