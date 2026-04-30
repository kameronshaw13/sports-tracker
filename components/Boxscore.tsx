"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
};

export default function Boxscore({ league, eventId, isLive }: Props) {
  // v17: bumped live poll from 30s → 15s so it matches the GameDetail summary
  // poll. The manual refresh button on GameDetail also forces this hook to
  // refetch via SWR's global mutate, so users never have to wait.
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/boxscore?league=${league}&event=${eventId}` : null,
    fetcher,
    { refreshInterval: isLive ? 15_000 : 0 }
  );

  const [activeTeamIdx, setActiveTeamIdx] = useState(0);

  if (isLoading) {
    return <div className="h-32 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />;
  }
  if (error || !data?.teams || data.teams.length === 0) {
    return null;
  }

  const team = data.teams[activeTeamIdx];

  return (
    <div className="space-y-4">
      {/* Top performers */}
      {data.leaders && data.leaders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
            Top performers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.leaders.flatMap((teamLeaders: any) =>
              teamLeaders.categories.slice(0, 2).map((cat: any, i: number) => (
                <LeaderCard key={`${teamLeaders.team.abbr}-${i}`} cat={cat} teamLogo={teamLeaders.team.logo} teamAbbr={teamLeaders.team.abbr} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Boxscore */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
          Boxscore
        </h3>

        {/* Team toggle */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
          {data.teams.map((t: any, i: number) => (
            <button
              key={t.team.id}
              onClick={() => setActiveTeamIdx(i)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTeamIdx === i ? "var(--surface)" : "transparent",
                color: activeTeamIdx === i ? "var(--text)" : "var(--text-2)",
                border: activeTeamIdx === i ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {t.team.logo && (
                <Image src={t.team.logo} alt="" width={20} height={20} className="object-contain" />
              )}
              {t.team.abbr}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {team.groups.map((group: any, gi: number) => (
            <StatGroup key={gi} group={group} league={league} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LeaderCard({ cat, teamLogo, teamAbbr }: any) {
  return (
    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ background: "var(--surface-2)" }}>
        {cat.leader.headshot ? (
          <Image src={cat.leader.headshot} alt={cat.leader.name} width={48} height={48} className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-semibold" style={{ color: "var(--text-3)" }}>
            {(cat.leader.name || "").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
          {teamLogo && <Image src={teamLogo} alt="" width={12} height={12} className="object-contain" />}
          {cat.shortName || cat.name}
        </div>
        <div className="text-sm font-semibold truncate">{cat.leader.name}</div>
        <div className="text-xs" style={{ color: "var(--text-2)" }}>
          {cat.leader.value}
        </div>
      </div>
    </div>
  );
}

// v17: per-league column behavior.
// - NBA / NHL: show every stat ESPN returns. The user explicitly wants the
//   richer slate (NBA: AST/TOV/STL/BLK/+− alongside PTS; NHL: PTS/AST/SOG/etc).
//   Horizontal scroll handles overflow on narrow screens.
// - MLB / NFL: keep the original 6-column cap. Their box scores have many
//   sparsely-populated columns and showing them all makes the table feel
//   noisy without adding signal.
function StatGroup({ group, league }: { group: any; league: string }) {
  // Show top 5 athletes per group to keep it scannable; expand on click
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.athletes : group.athletes.slice(0, 5);

  if (group.athletes.length === 0) return null;

  const showAllColumns = league === "nba" || league === "nhl";
  const columnKeys: string[] = showAllColumns ? group.keys : group.keys.slice(0, 6);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
        {group.name}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: showAllColumns ? "fit-content" : undefined }}>
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th
                className="text-left px-3 py-2 font-medium sticky left-0 z-10"
                style={{ background: "var(--surface)" }}
                title="Player"
              >
                Player
              </th>
              {columnKeys.map((k) => (
                <th
                  key={k}
                  className="text-right px-2 py-2 font-medium tabular-nums whitespace-nowrap"
                  title={describeKey(league, k)}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((a: any) => (
              <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td
                  className="px-3 py-2 whitespace-nowrap sticky left-0 z-10"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="font-medium">{a.shortName || a.name}</div>
                  {a.position && (
                    <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{a.position}</span>
                  )}
                </td>
                {columnKeys.map((k) => (
                  <td key={k} className="text-right px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                    {a.stats[k] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {group.athletes.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 text-xs font-medium border-t"
          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          {expanded ? "Show less" : `Show all ${group.athletes.length}`}
        </button>
      )}
    </div>
  );
}

// Hover/long-press tooltip text for short stat headers. ESPN's `descriptions`
// array would technically be the source of truth, but it's not always present
// per group, so we fall back to a small per-league dictionary covering the
// common abbreviations the user is likely to ask about.
function describeKey(league: string, key: string): string {
  const all: Record<string, string> = {
    // NBA
    MIN: "Minutes",
    FG: "Field Goals",
    "3PT": "Three-pointers",
    FT: "Free Throws",
    OREB: "Offensive Rebounds",
    DREB: "Defensive Rebounds",
    REB: "Rebounds",
    AST: "Assists",
    STL: "Steals",
    BLK: "Blocks",
    TO: "Turnovers",
    PF: "Personal Fouls",
    "+/-": "Plus/Minus",
    PTS: "Points",
    // NHL skaters
    G: "Goals",
    A: "Assists",
    SOG: "Shots on Goal",
    S: "Shots",
    HT: "Hits",
    BS: "Blocked Shots",
    GVA: "Giveaways",
    TKA: "Takeaways",
    FOW: "Faceoffs Won",
    FOL: "Faceoffs Lost",
    TOI: "Time on Ice",
    PIM: "Penalty Minutes",
    PPG: "Power Play Goals",
    SHG: "Short-handed Goals",
    GWG: "Game Winning Goals",
    // NHL goalies
    SA: "Shots Against",
    GA: "Goals Against",
    SV: "Saves",
    "SV%": "Save Percentage",
    SO: "Shutouts",
  };
  return all[key] || key;
}
