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
  onPlayerClick?: (player: {
    id: string;
    name: string;
    league: string;
    teamKey?: string;
  }) => void;
};

export default function Boxscore({
  league,
  eventId,
  isLive,
  onPlayerClick,
}: Props) {
  // v17 behavior preserved: live polling at 15s for parity with summary.
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId
      ? `/api/boxscore?league=${league}&event=${eventId}&_t=${freshKey}`
      : null,
    fetcher,
    { refreshInterval: isLive ? 15_000 : 0 },
  );

  const [activeView, setActiveView] = useState<number | "team">(0);

  if (isLoading) {
    return (
      <div
        className="h-32 rounded-xl animate-pulse"
        style={{ background: "var(--surface)" }}
      />
    );
  }
  if (error || !data?.teams || data.teams.length === 0) {
    return null;
  }

  const activeTeamIdx = activeView === "team" ? 0 : activeView;
  const team = data.teams[activeTeamIdx];

  return (
    <div className="space-y-4">
      {/* Top performers */}
      {data.leaders && data.leaders.length > 0 && (
        <div>
          <h3
            className="text-sm font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-2)" }}
          >
            Top performers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.leaders.flatMap((teamLeaders: any) =>
              teamLeaders.categories
                .slice(0, 2)
                .map((cat: any, i: number) => (
                  <LeaderCard
                    key={`${teamLeaders.team.abbr}-${i}`}
                    cat={cat}
                    teamLogo={teamLeaders.team.logo}
                    teamAbbr={teamLeaders.team.abbr}
                    league={league}
                    teamKey={
                      teamLeaders.team.abbr
                        ? `${league}-${String(teamLeaders.team.abbr).toLowerCase()}`
                        : undefined
                    }
                    onPlayerClick={onPlayerClick}
                  />
                )),
            )}
          </div>
        </div>
      )}

      {league === "mlb" && data.lineScore && (
        <MlbLineScore lineScore={data.lineScore} />
      )}

      {/* Boxscore */}
      <div>
        {/* Team toggle */}
        <div className="boxscore-team-toggle">
          {data.teams.map((t: any, i: number) => (
            <button
              key={t.team.id}
              onClick={() => setActiveView(i)}
              className={`boxscore-team-toggle-btn ${activeView === i ? "is-active" : ""}`}
            >
              {t.team.logo && (
                <Image
                  src={t.team.logo}
                  alt=""
                  width={20}
                  height={20}
                  className="object-contain logo-outline-dark"
                  unoptimized
                />
              )}
              {t.team.abbr}
            </button>
          )).flatMap((btn: any, i: number) =>
            i === 0
              ? [
                  btn,
                  <button
                    key="team-label"
                    type="button"
                    onClick={() => setActiveView("team")}
                    className={`boxscore-team-toggle-btn boxscore-team-toggle-mid ${activeView === "team" ? "is-active" : ""}`}
                  >
                    Team
                  </button>,
                ]
              : [btn],
          )}
        </div>

        {activeView === "team" ? (
          <TeamStatsView teams={data.teams} league={league} />
        ) : (
          <div className="space-y-3">
            {team.groups.map((group: any, gi: number) => (
              <StatGroup
                key={gi}
                group={group}
                league={league}
                groupIndex={gi}
                teamKey={
                  team?.team?.abbr
                    ? `${league}-${String(team.team.abbr).toLowerCase()}`
                    : undefined
                }
                onPlayerClick={onPlayerClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MlbLineScore({ lineScore }: { lineScore: any }) {
  const teams = [...(lineScore?.teams || [])].sort((a: any, b: any) =>
    a.homeAway === "away" ? -1 : b.homeAway === "away" ? 1 : 0,
  );
  if (!teams.length) return null;
  const innings = Number(lineScore.innings || 0);
  return (
    <div>
      <div className="boxscore-line-wrap">
        <table className="boxscore-line-table w-full text-[10px] sm:text-xs">
          <thead>
            <tr
              style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
            >
              <th className="text-left px-1.5 py-2 font-semibold">Team</th>
              {Array.from({ length: innings }).map((_, i) => (
                <th key={i} className="text-center px-1 py-2 font-semibold">
                  {i + 1}
                </th>
              ))}
              <th className="text-center px-1 py-2 font-black">R</th>
              <th className="text-center px-1 py-2 font-black">H</th>
              <th className="text-center px-1 py-2 font-black">E</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t: any) => (
              <tr
                key={t.id || t.abbr}
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <td className="px-1.5 py-2 font-bold">
                  <div className="boxscore-line-team">
                    {t.logo && (
                      <Image
                        src={t.logo}
                        alt=""
                        width={18}
                        height={18}
                        className="object-contain logo-outline-dark"
                        unoptimized
                      />
                    )}
                    <span>{t.abbr}</span>
                  </div>
                </td>
                {Array.from({ length: innings }).map((_, i) => (
                  <td key={i} className="text-center px-1 py-2 tabular-nums">
                    {t.innings?.[i] ?? "–"}
                  </td>
                ))}
                <td className="text-center px-1 py-2 font-black tabular-nums">
                  {t.runs ?? "–"}
                </td>
                <td className="text-center px-1 py-2 font-black tabular-nums">
                  {t.hits ?? "0"}
                </td>
                <td className="text-center px-1 py-2 font-black tabular-nums">
                  {t.errors ?? "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderCard({
  cat,
  teamLogo,
  teamAbbr,
  league,
  teamKey,
  onPlayerClick,
}: any) {
  const clickable = !!onPlayerClick && !!cat?.leader?.id;
  const Wrapper: any = clickable ? "button" : "div";
  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={
        clickable
          ? () =>
              onPlayerClick?.({
                id: cat.leader.id,
                name: cat.leader.name,
                league,
                teamKey,
              })
          : undefined
      }
      className="rounded-xl p-3 flex items-center gap-3 text-left"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
        style={{ background: "var(--surface-2)" }}
      >
        {cat.leader.headshot ? (
          <Image
            src={cat.leader.headshot}
            alt={cat.leader.name}
            width={48}
            height={48}
            className="object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xs font-semibold"
            style={{ color: "var(--text-3)" }}
          >
            {(cat.leader.name || "")
              .split(" ")
              .map((n: string) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5"
          style={{ color: "var(--text-3)" }}
        >
          {teamLogo && (
            <Image
              src={teamLogo}
              alt=""
              width={12}
              height={12}
              className="object-contain logo-outline-dark"
              unoptimized
            />
          )}
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

const NHL_SKATER_PREFERRED = [
  "G",
  "A",
  "SOG",
  "S",
  "TOI",
  "+/-",
  "PIM",
  "HT",
  "H",
  "BS",
];
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

  if (league === "mlb") {
    return mlbColumnKeys(allKeys);
  }

  // NFL: 6-column cap (pre-v17 behavior preserved)
  return allKeys.slice(0, 6);
}

function mlbColumnKeys(allKeys: string[]): string[] {
  const hasCombo = allKeys.some((k) => k === "H-AB" || k === "H_AB" || k === "H/AB");
  if (hasCombo) {
    const rest = allKeys.filter((k) => !["H-AB", "H_AB", "H/AB", "AB", "H", "HT"].includes(k));
    return ["AB", "H", ...rest].slice(0, 7);
  }
  return allKeys.map((k) => (k === "HT" ? "H" : k)).slice(0, 7);
}

function getBoxscoreStat(row: any, key: string): string | number {
  if (key === "AB") {
    const combo = row.stats?.["H-AB"] ?? row.stats?.["H_AB"] ?? row.stats?.["H/AB"];
    if (combo != null) {
      const parts = String(combo).split(/[\/-]/).map((x) => x.trim());
      if (parts.length >= 2) return parts[1] || "—";
    }
  }
  if (key === "H") {
    const direct = row.stats?.H ?? row.stats?.HT;
    if (direct != null) return direct;
    const combo = row.stats?.["H-AB"] ?? row.stats?.["H_AB"] ?? row.stats?.["H/AB"];
    if (combo != null) {
      const parts = String(combo).split(/[\/-]/).map((x) => x.trim());
      return parts[0] || "—";
    }
  }
  return row.stats?.[key] ?? "—";
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
  if (key === "HT" || key === "H") return "H";
  if (key === "H-AB" || key === "H_AB") return "H/AB";
  return key;
}


function TeamStatsView({ teams, league }: { teams: any[]; league: string }) {
  const rows = collectTeamStatRows(teams, league);
  if (!rows.length) {
    return (
      <div className="boxscore-team-stats-empty">
        Team stats are not available for this game yet.
      </div>
    );
  }
  const away = teams?.[0]?.team;
  const home = teams?.[1]?.team;
  return (
    <div className="boxscore-team-stats boxscore-team-stats-flat">
      <div className="boxscore-team-stats-head boxscore-team-stats-logo-head">
        <div />
        <div className="boxscore-team-stat-team">
          {away?.logo ? (
            <Image
              src={away.logo}
              alt={away?.abbr || "Away"}
              width={24}
              height={24}
              className="object-contain logo-outline-dark"
              unoptimized
            />
          ) : (
            away?.abbr || "Away"
          )}
        </div>
        <div className="boxscore-team-stat-team">
          {home?.logo ? (
            <Image
              src={home.logo}
              alt={home?.abbr || "Home"}
              width={24}
              height={24}
              className="object-contain logo-outline-dark"
              unoptimized
            />
          ) : (
            home?.abbr || "Home"
          )}
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="boxscore-team-stat-row">
          <div className="boxscore-team-stat-label">{row.label}</div>
          <div className="boxscore-team-stat-value tabular-nums">{row.away}</div>
          <div className="boxscore-team-stat-value tabular-nums">{row.home}</div>
        </div>
      ))}
    </div>
  );
}

type TeamStatRow = {
  key: string;
  label: string;
  away: string | number;
  home: string | number;
};

const TEAM_STAT_EXCLUDE = new Set(["IP", "#P", "P", "ER", "PC", "PC-ST", "P-ST"]);

const MLB_TEAM_STAT_ORDER = [
  "AB",
  "R",
  "H",
  "2B",
  "3B",
  "HR",
  "RBI",
  "TB",
  "BB",
  "HBP",
  "K",
  "SO",
  "LOB",
  "SB",
  "CS",
  "GIDP",
  "AVG",
  "OBP",
  "SLG",
  "OPS",
  "E",
];

const TEAM_STAT_LABELS: Record<string, string> = {
  AB: "At Bats",
  R: "Runs",
  H: "Hits",
  "2B": "Doubles",
  D: "Doubles",
  "3B": "Triples",
  T: "Triples",
  HR: "Home Runs",
  RBI: "RBIs",
  TB: "Total Bases",
  BB: "Walks",
  HBP: "Hit by Pitch",
  K: "Strikeouts",
  SO: "Strikeouts",
  LOB: "Left on Base",
  SB: "Stolen Bases",
  CS: "Caught Stealing",
  GIDP: "Grounded Into DP",
  AVG: "Batting Average",
  OBP: "On-base %",
  SLG: "Slugging %",
  OPS: "OPS",
  E: "Errors",
};

function normalizeTeamStatKey(key: string): string {
  const raw = canonicalLabel(String(key || "")).trim();
  if (raw === "H/AB" || raw === "H_AB" || raw === "H-AB") return "H/AB";
  if (raw === "D") return "2B";
  if (raw === "T") return "3B";
  if (raw === "HT") return "H";
  return raw;
}

function isMlbOffensiveTeamStatGroup(group: any): boolean {
  const name = String(group?.name || group?.displayName || "").toLowerCase();
  const keys = Array.isArray(group?.keys) ? group.keys.map((k: string) => normalizeTeamStatKey(k)) : [];

  // ESPN includes pitching totals in the boxscore groups; those are defensive
  // totals for the opponent. Team Stats should show each team's own offense.
  if (name.includes("pitch")) return false;
  if (keys.includes("IP") || keys.includes("ER") || keys.includes("PC") || keys.includes("PC-ST")) return false;
  return (
    name.includes("bat") ||
    name.includes("hit") ||
    keys.includes("AB") ||
    keys.includes("H/AB") ||
    keys.includes("RBI") ||
    keys.includes("HR") ||
    keys.includes("AVG")
  );
}

function collectTeamStatRows(teams: any[], league: string): TeamStatRow[] {
  const labels = new Set<string>();
  const totalsByTeam = teams.map((team) => {
    const totals: Record<string, string | number> = {};
    for (const group of team?.groups || []) {
      if (!group?.totals || !Array.isArray(group?.keys)) continue;
      if (league === "mlb" && !isMlbOffensiveTeamStatGroup(group)) continue;
      group.keys.forEach((key: string, idx: number) => {
        const statKey = normalizeTeamStatKey(key);
        const value = group.totals?.[idx] ?? group.totals?.[key];
        if (value == null || value === "" || value === "—") return;
        if (statKey === "H/AB") {
          const parts = String(value).split(/[\/-]/).map((x) => x.trim());
          if (parts.length >= 2) {
            totals.H = parts[0] || "—";
            totals.AB = parts[1] || "—";
            labels.add("H");
            labels.add("AB");
          }
          return;
        }
        if (TEAM_STAT_EXCLUDE.has(statKey)) return;
        totals[statKey] = value;
        labels.add(statKey);
      });
    }
    return totals;
  });

  const preferred = league === "mlb" ? MLB_TEAM_STAT_ORDER : Array.from(labels);
  const ordered = [...preferred, ...Array.from(labels).filter((label) => !preferred.includes(label))]
    .filter((label, idx, arr) => arr.indexOf(label) === idx)
    .filter((label) => labels.has(label) && !TEAM_STAT_EXCLUDE.has(label));

  return ordered.map((key) => ({
    key,
    label: TEAM_STAT_LABELS[key] || key,
    away: totalsByTeam[0]?.[key] ?? "—",
    home: totalsByTeam[1]?.[key] ?? "—",
  }));
}

function StatGroup({
  group,
  league,
  teamKey,
  onPlayerClick,
  groupIndex,
}: {
  group: any;
  league: string;
  teamKey?: string;
  groupIndex?: number;
  onPlayerClick?: (player: {
    id: string;
    name: string;
    league: string;
    teamKey?: string;
  }) => void;
}) {
  const visible = group.athletes;

  if (group.athletes.length === 0) return null;

  const columnKeys = pickColumnKeys(group, league);

  return (
    <div className="boxscore-stat-group">
      <div className="boxscore-stat-group-title">
        {displayGroupName(league, group, groupIndex)}
      </div>
      <div className="boxscore-stat-scroll overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--text-3)" }}>
              <th
                className="boxscore-player-stat-head text-left px-3 py-2 font-medium sticky left-0 z-10"
                style={{ background: "var(--surface)" }}
              >
                {league === "mlb" ? displayGroupName(league, group, groupIndex) : "Player"}
              </th>
              {columnKeys.map((k: string) => (
                <th
                  key={k}
                  className="text-right px-2 py-2 font-medium tabular-nums whitespace-nowrap"
                  title={describeKey(league, k)}
                >
                  {canonicalLabel(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withBasketballSeparators(visible, league).map(
              (row: any, idx: number) =>
                row.__separator ? (
                  <tr
                    key={`sep-${row.label}-${idx}`}
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <td
                      colSpan={columnKeys.length + 1}
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-2)" }}
                    >
                      {row.label}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={row.id || idx}
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <td
                      className="boxscore-player-name px-3 py-2 whitespace-nowrap sticky left-0"
                      style={{ background: "var(--surface)" }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onPlayerClick?.({
                            id: row.id,
                            name: row.name || row.shortName,
                            league,
                            teamKey,
                          })
                        }
                        disabled={!onPlayerClick || !row.id}
                        className="font-medium text-left hover:opacity-80"
                      >
                        {row.shortName || row.name}
                      </button>
                      {row.position && (
                        <span
                          className="text-[10px] block"
                          style={{ color: "var(--text-3)" }}
                        >
                          {row.position}
                        </span>
                      )}
                    </td>
                    {columnKeys.map((k: string) => (
                      <td
                        key={k}
                        className="text-right px-2 py-2 tabular-nums"
                        style={{ color: "var(--text-2)" }}
                      >
                        {getBoxscoreStat(row, k)}
                      </td>
                    ))}
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function displayGroupName(
  league: string,
  group: any,
  groupIndex?: number,
): string {
  const raw = String(group?.name || "Stats");
  if (league === "mlb") {
    const lower = raw.toLowerCase();
    if (lower.includes("bat") || lower.includes("hit")) return "Hitters";
    if (lower.includes("pitch")) return "Pitchers";
    if (groupIndex === 0) return "Hitters";
    if (groupIndex === 1) return "Pitchers";
  }
  return raw;
}

function withBasketballSeparators(players: any[], league: string): any[] {
  if (league !== "nba" && league !== "cbb") return players;
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter);
  if (!starters.length || !bench.length) return players;
  return [
    { __separator: true, label: "Starters" },
    ...starters,
    { __separator: true, label: "Bench" },
    ...bench,
  ];
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
