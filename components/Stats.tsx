"use client";

import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function Stats({ team }: Props) {
  const { data: teamData } = useSWR(`/api/team?team=${team.key}`, fetcher);
  const { data: scheduleData } = useSWR(`/api/scoreboard?team=${team.key}`, fetcher);

  const events = scheduleData?.events || [];
  const completed = events.filter((e: any) => e.status?.state === "post");
  const wins = completed.filter((e: any) => e.us?.winner).length;
  const losses = completed.length - wins;

  const last10 = completed.slice(-10);
  const last10Wins = last10.filter((e: any) => e.us?.winner).length;
  const last10Losses = last10.length - last10Wins;

  // Compute current streak
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

  // Avg points scored / allowed
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

  const homeGames = completed.filter((e: any) => e.home);
  const awayGames = completed.filter((e: any) => !e.home);
  const homeWins = homeGames.filter((e: any) => e.us?.winner).length;
  const awayWins = awayGames.filter((e: any) => e.us?.winner).length;

  const stats = [
    { label: "Overall", value: teamData?.record || `${wins}–${losses}` },
    { label: "Last 10", value: `${last10Wins}–${last10Losses}` },
    { label: "Streak", value: streak.count > 0 ? `${streak.type} ${streak.count}` : "—" },
    { label: "Standing", value: teamData?.standingSummary?.split(",")[0] || "—" },
    { label: "Home", value: homeGames.length ? `${homeWins}–${homeGames.length - homeWins}` : "—" },
    { label: "Away", value: awayGames.length ? `${awayWins}–${awayGames.length - awayWins}` : "—" },
    { label: "Avg scored", value: avgFor },
    { label: "Avg allowed", value: avgAgainst },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="px-4 py-3 rounded-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-3)" }}>
              {s.label}
            </div>
            <div className="text-xl font-bold mt-1 tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        Stats are computed from this season's completed games. Live data from ESPN, refreshed every minute.
      </div>
    </div>
  );
}
