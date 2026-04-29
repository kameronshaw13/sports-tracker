"use client";

import useSWR from "swr";
import { TEAMS, TEAM_ORDER } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DebugStat = {
  source: string;
  name: string;
  displayName: string;
  shortDisplayName?: string;
  description?: string;
  value?: number;
  displayValue: string;
  rank?: number;
  category?: string;
};

export default function DebugStatsPage() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Stats debug</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Every stat ESPN returns for each of your teams. Tell Claude which ones to keep
            (by displayName or machine name) and v7 will wire them up properly. Throwaway page —
            will be removed in v7.
          </p>
        </header>

        <div className="space-y-8">
          {TEAM_ORDER.map((key) => (
            <TeamDump key={key} teamKey={key} />
          ))}
        </div>
      </div>
    </main>
  );
}

function TeamDump({ teamKey }: { teamKey: string }) {
  const team = TEAMS[teamKey];
  const { data, error } = useSWR(`/api/debug-stats?team=${teamKey}`, fetcher);

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <header
        className="px-4 py-3"
        style={{ background: team.primary, color: team.textOnPrimary }}
      >
        <div className="text-xs uppercase tracking-widest font-semibold opacity-80">
          {team.league}
        </div>
        <h2 className="text-lg font-bold">{team.name}</h2>
        {data?.record && (
          <div className="text-sm opacity-90">
            {data.record}
            {data.standingSummary ? ` · ${data.standingSummary}` : ""}
          </div>
        )}
      </header>

      <div className="p-4">
        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>Failed to load.</p>}
        {!data && !error && <p className="text-sm" style={{ color: "var(--text-2)" }}>Loading…</p>}
        {data && data.totalStats === 0 && (
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            ESPN returned no stats for this team right now (likely offseason).
          </p>
        )}
        {data && data.totalStats > 0 && (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>
              {data.totalStats} stats found across {Object.keys(data.groupedBySource).length} source(s)
            </p>
            {Object.entries(data.groupedBySource).map(([source, stats]) => (
              <SourceGroup key={source} source={source} stats={stats as DebugStat[]} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function SourceGroup({ source, stats }: { source: string; stats: DebugStat[] }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--text-3)" }}>
        {source}
      </h3>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-2)" }}>Display name</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-2)" }}>Value</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-2)" }}>Machine name</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--text-2)" }}>Rank</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={`${s.name}-${i}`} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                <td className="px-3 py-2 font-medium">{s.displayName}</td>
                <td className="px-3 py-2 tabular-nums">{s.displayValue}</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-3)", fontFamily: "monospace" }}>
                  {s.name}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                  {s.rank ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
