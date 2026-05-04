"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
};

export default function Boxscore({ league, eventId, isLive, onPlayerClick }: Props) {
  // v17 behavior preserved: live polling at 15s for parity with summary.
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/boxscore?league=${league}&event=${eventId}&_t=${freshKey}` : null,
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
                <LeaderCard key={`${teamLeaders.team.abbr}-${i}`} cat={cat} teamLogo={teamLeaders.team.logo} teamAbbr={teamLeaders.team.abbr} league={league} teamKey={teamLeaders.team.abbr ? `${league}-${String(teamLeaders.team.abbr).toLowerCase()}` : undefined} onPlayerClick={onPlayerClick} />
              ))
            )}
          </div>
        </div>
      )}

      {league === "mlb" && data.lineScore && <MlbLineScore lineScore={data.lineScore} />}

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
            <StatGroup key={gi} group={group} league={league} teamKey={team?.team?.abbr ? `${league}-${String(team.team.abbr).toLowerCase()}` : undefined} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MlbLineScore({ lineScore }: { lineScore: any }) {
  const teams = [...(lineScore?.teams || [])].sort((a: any, b: any) => a.homeAway === "away" ? -1 : b.homeAway === "away" ? 1 : 0);
  if (!teams.length) return null;
  const innings = Number(lineScore.innings || 0);
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
        Line score
      </h3>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <table className="w-full text-[10px] sm:text-xs table-fixed">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
              <th className="text-left px-1.5 py-2 font-semibold">Team</th>
              {Array.from({ length: innings }).map((_, i) => <th key={i} className="text-center px-1 py-2 font-semibold">{i + 1}</th>)}
              <th className="text-center px-1 py-2 font-black">R</th>
              <th className="text-center px-1 py-2 font-black">H</th>
              <th className="text-center px-1 py-2 font-black">E</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t: any) => (
              <tr key={t.id || t.abbr} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-1.5 py-2 font-bold">{t.abbr}</td>
                {Array.from({ length: innings }).map((_, i) => <td key={i} className="text-center px-1 py-2 tabular-nums">{t.innings?.[i] ?? "–"}</td>)}
                <td className="text-center px-1 py-2 font-black tabular-nums">{t.runs ?? "–"}</td>
                <td className="text-center px-1 py-2 font-black tabular-nums">{t.hits ?? "0"}</td>
                <td className="text-center px-1 py-2 font-black tabular-nums">{t.errors ?? "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderCard({ cat, teamLogo, teamAbbr, league, teamKey, onPlayerClick }: any) {
  const clickable = !!onPlayerClick && !!cat?.leader?.id;
  const Wrapper: any = clickable ? "button" : "div";
  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onPlayerClick?.({ id: cat.leader.id, name: cat.leader.name, league, teamKey }) : undefined}
      className="rounded-xl p-3 flex items-center gap-3 text-left"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
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
    </Wrapper>
  );
}

// v18: per-league column behavior.
//
// - NHL skaters: ESPN dumps ~15 columns (G, A, +/-, S, HT, BS, GVA, TKA,
//   FOW, FOL, TOI, PIM, PPG, SHG, GWG). The user wanted Goals/Ast/SOG/TOI
//   first plus a small curated set after. We pick from a preferred order
//   and fall through to the remaining ESPN keys if any preferred ones are
//   missing — no silently-empty columns.
//
// - NHL goalies: keep clean SA/GA/SV/SV%/TOI ordering.
//
// - NBA: still show every column (matches v17). NBA boxscores are dense
//   in a useful way (PTS/REB/AST/STL/BLK/+−/etc.) and the user liked that.
//
// - MLB / NFL: keep the 6-column cap. Their boxscores have many sparsely
//   populated columns; showing them all just creates a wall of dashes.

const NHL_SKATER_PREFERRED = ["G", "A", "SOG", "S", "TOI", "+/-", "PIM", "HT", "H", "BS"];
const NHL_GOALIE_PREFERRED = ["SA", "GA", "SV", "SV%", "TOI", "PIM"];

// Pick which keys to show given the group and league. Preserves the "first
// match wins" ordering of the preferred list and dedupes (e.g. ESPN sometimes
// uses S vs SOG for shots — we accept either but only show one).
function pickColumnKeys(group: any, league: string): string[] {
  const allKeys: string[] = Array.isArray(group?.keys) ? group.keys : [];
  if (allKeys.length === 0) return [];

  if (league === "nhl") {
    const isGoalies = looksLikeGoalies(group, allKeys);
    const preferred = isGoalies ? NHL_GOALIE_PREFERRED : NHL_SKATER_PREFERRED;

    const out: string[] = [];
    const seenLabels = new Set<string>();

    // First pass: take preferred keys in order, skipping ones the data
    // doesn't have. We treat S and SOG as the same column conceptually so
    // we don't end up with both.
    for (const key of preferred) {
      if (!allKeys.includes(key)) continue;
      const label = canonicalLabel(key);
      if (seenLabels.has(label)) continue;
      out.push(key);
      seenLabels.add(label);
      // Skater cap: 8 columns total (G, A, SOG, TOI, +/-, PIM, HT/H, BS)
      // Goalie cap: 6 columns
      if (out.length >= (isGoalies ? 6 : 8)) break;
    }

    return out;
  }

  if (league === "nba") {
    // NBA: show every column (v17 behavior)
    return allKeys;
  }

  // MLB / NFL: 6-column cap (pre-v17 behavior preserved)
  return allKeys.slice(0, 6);
}

// NHL group-type detection. ESPN labels groups inconsistently — could be
// "Skaters" / "Goalies", or "Forwards" / "Defense" / "Goalies", or unlabeled.
// We match on the keys to be safe: SA + SV combo = goalies.
function looksLikeGoalies(group: any, keys: string[]): boolean {
  const name = String(group?.name || group?.displayName || "").toLowerCase();
  if (name.includes("goalie") || name === "g") return true;
  // Fallback: column signature
  return keys.includes("SA") && keys.includes("SV");
}

// Treat "S" and "SOG" as the same logical column — both mean "shots on goal"
// in ESPN's NHL boxscore.
function canonicalLabel(key: string): string {
  if (key === "S" || key === "SOG") return "SOG";
  if (key === "HT" || key === "H") return "HT";
  return key;
}

function StatGroup({ group, league, teamKey, onPlayerClick }: { group: any; league: string; teamKey?: string; onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.athletes : group.athletes.slice(0, 5);

  if (group.athletes.length === 0) return null;

  const columnKeys = pickColumnKeys(group, league);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
        {displayGroupName(league, group)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th
                className="text-left px-3 py-2 font-medium sticky left-0 z-10"
                style={{ background: "var(--surface)" }}
              >
                Player
              </th>
              {columnKeys.map((k: string) => (
                <th key={k} className="text-right px-2 py-2 font-medium tabular-nums whitespace-nowrap" title={describeKey(league, k)}>
                  {canonicalLabel(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withBasketballSeparators(visible, league).map((row: any, idx: number) =>
              row.__separator ? (
                <tr key={`sep-${row.label}-${idx}`} style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <td colSpan={columnKeys.length + 1} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{row.label}</td>
                </tr>
              ) : (
                <tr key={row.id || idx} style={{ borderTop: "1px solid var(--border)" }}>
                  <td
                    className="px-3 py-2 whitespace-nowrap sticky left-0"
                    style={{ background: "var(--surface)" }}
                  >
                    <button type="button" onClick={() => onPlayerClick?.({ id: row.id, name: row.name || row.shortName, league, teamKey })} disabled={!onPlayerClick || !row.id} className="font-medium text-left hover:opacity-80">{row.shortName || row.name}</button>
                    {row.position && (
                      <span className="text-[10px] block" style={{ color: "var(--text-3)" }}>{row.position}</span>
                    )}
                  </td>
                  {columnKeys.map((k: string) => (
                    <td key={k} className="text-right px-2 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>
                      {row.stats[k] ?? "—"}
                    </td>
                  ))}
                </tr>
              )
            )}
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

function displayGroupName(league: string, group: any): string {
  const raw = String(group?.name || "Stats");
  if (league === "mlb") {
    const lower = raw.toLowerCase();
    if (lower.includes("bat") || lower.includes("hit")) return "Hitting";
    if (lower.includes("pitch")) return "Pitching";
  }
  return raw;
}

function withBasketballSeparators(players: any[], league: string): any[] {
  if (league !== "nba" && league !== "cbb") return players;
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter);
  if (!starters.length || !bench.length) return players;
  return [{ __separator: true, label: "Starters" }, ...starters, { __separator: true, label: "Bench" }, ...bench];
}

// Hover/long-press tooltip text for short stat headers. ESPN's `descriptions`
// array would technically be the source of truth, but it's not always present
// per group, so we fall back to a small per-league dictionary.
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
    H: "Hits",
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
