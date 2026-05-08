"use client";

import { useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { SECTIONS_BY_LEAGUE, Section } from "@/lib/playerColumns";
import PlayersTable, { Player } from "@/components/PlayersTable";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig; onPlayerClick?: (player: { id: string; name: string; league: string; teamKey: string }) => void };
type StatRow = { label: string; value: string; rank?: number | null };
type TeamStatTab = { id: "overall" | "hitting" | "pitching"; label: string; rows: StatRow[] };

export default function Stats({ team, onPlayerClick }: Props) {
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
    { label: "Home", value: homeGames.length ? `${homeW}–${homeGames.length - homeW}` : "—" },
    { label: "Away", value: awayGames.length ? `${awayW}–${awayGames.length - awayW}` : "—" },
    { label: scoredLabel(team.league), value: avgFor },
    { label: allowedLabel(team.league), value: avgAgainst },
  ];

  const sections = SECTIONS_BY_LEAGUE[team.league] || [];
  const players: Player[] = playersData?.players || [];
  const [view, setView] = useState<"team" | "player">("team");
  const [teamStatView, setTeamStatView] = useState<"overall" | "hitting" | "pitching">("overall");
  const mlbTeamStats = teamData?.mlbTeamStats;
  const rawTeamStatTabs: TeamStatTab[] = [
    { id: "overall", label: "Overall", rows: summaryStats },
    { id: "hitting", label: "Hitting", rows: (mlbTeamStats?.hitting || []).map((s: any) => ({ label: s.label, value: s.displayValue, rank: s.rank })) },
    { id: "pitching", label: "Pitching", rows: (mlbTeamStats?.pitching || []).map((s: any) => ({ label: s.label, value: s.displayValue, rank: s.rank })) },
  ];
  const teamStatTabs = rawTeamStatTabs.filter((tab) => tab.id === "overall" || team.league === "mlb");
  const activeTeamStat = teamStatTabs.find((tab) => tab.id === teamStatView) || teamStatTabs[0];

  return (
    <div className="team-stats-page space-y-4">
      <div className="team-stats-toggle" role="tablist">
        <button type="button" className={view === "team" ? "is-active" : ""} onClick={() => setView("team")}>Team Stats</button>
        <button type="button" className={view === "player" ? "is-active" : ""} onClick={() => setView("player")}>Player Stats</button>
      </div>

      {view === "team" && (
        <section className="team-stat-panel">
          <SegmentTabs
            tabs={teamStatTabs}
            active={activeTeamStat.id}
            onChange={(id) => setTeamStatView(id as "overall" | "hitting" | "pitching")}
          />
          <TeamStatRows rows={activeTeamStat.rows} showRank={activeTeamStat.id !== "overall"} />
        </section>
      )}

      {view === "player" && (
        <section>
        {playersLoading || !playersData ? (
          <PlayersLoading />
        ) : team.league === "mlb" ? (
          <MlbBattingPitching sections={sections} players={players} onPlayerClick={onPlayerClick ? (p) => onPlayerClick({ id: p.id, name: p.name, league: team.league, teamKey: team.key }) : undefined} />
        ) : (
          <StackedSections sections={sections} players={players} onPlayerClick={onPlayerClick ? (p) => onPlayerClick({ id: p.id, name: p.name, league: team.league, teamKey: team.key }) : undefined} />
        )}
        </section>
      )}

    </div>
  );
}

function MlbBattingPitching({ sections, players, onPlayerClick }: { sections: Section[]; players: Player[]; onPlayerClick?: (p: Player) => void }) {
  const battingSection = sections.find((s) => s.id === "batting");
  const startersSection = sections.find((s) => s.id === "starters");
  const relieversSection = sections.find((s) => s.id === "relievers");
  const pitchingSections = [startersSection, relieversSection].filter(Boolean) as Section[];

  const [active, setActive] = useState<"batting" | "pitching">("batting");
  const playerTabs = [
    { id: "batting", label: "Batting" },
    { id: "pitching", label: "Pitching" },
  ];

  return (
    <div>
      <SegmentTabs tabs={playerTabs} active={active} onChange={(id) => setActive(id as "batting" | "pitching")} className="team-player-stat-tabs" />

      {active === "batting" && battingSection && (
        <PlayersTable section={battingSection} players={players} onPlayerClick={onPlayerClick} />
      )}

      {active === "pitching" && pitchingSections.length > 0 && (
        <StackedSections sections={pitchingSections} players={players} onPlayerClick={onPlayerClick} />
      )}
    </div>
  );
}

function StackedSections({ sections, players, onPlayerClick }: { sections: Section[]; players: Player[]; onPlayerClick?: (p: Player) => void }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id}>
          {sections.length > 1 && (
            <h4
              className="text-xs uppercase tracking-widest font-bold mt-1.5 mb-1 px-1"
              style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
            >
              {section.label}
            </h4>
          )}
          <PlayersTable section={section} players={players} onPlayerClick={onPlayerClick} />
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

function SegmentTabs({ tabs, active, onChange, className = "" }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={`stats-segment-tabs ${className}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TeamStatRows({ rows, showRank }: { rows: StatRow[]; showRank?: boolean }) {
  if (!rows.length) return <div className="team-stat-empty">No team stats available yet.</div>;
  return (
    <div className="team-stat-rows">
      {rows.map((row) => (
        <div className="team-stat-row" key={row.label}>
          <div className="team-stat-label">{row.label}</div>
          {showRank && <div className="team-stat-rank">{row.rank ? `MLB #${row.rank}` : "—"}</div>}
          <div className="team-stat-value">{row.value}</div>
        </div>
      ))}
    </div>
  );
}
