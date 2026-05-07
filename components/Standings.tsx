"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { League } from "@/lib/teams";
import RetroTeamLogo from "./RetroTeamLogo";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StandingsMode = "division" | "conference" | "wildcard";
type Props = {
  league: League | string;
  teamKey?: string;
  compact?: boolean;
  pageMode?: StandingsMode;
  conferenceFilter?: string;
  subdivision?: "FBS" | "FCS";
  showHeader?: boolean;
  showFilterControls?: boolean;
  teamView?: boolean;
  onTeamClick?: (league: string, abbr: string) => void;
};

type TeamRow = Record<string, any>;
type Division = { name: string; teams: string[] };
type Conference = { name: string; divisions: Division[] };

type LeagueConfig = {
  conferences: Conference[];
  wildCardCount?: number;
  autoCount?: number;
  playInCount?: number;
};

const CONFIGS: Record<string, LeagueConfig> = {
  mlb: {
    wildCardCount: 3,
    conferences: [
      { name: "American League", divisions: [
        { name: "AL East", teams: ["NYY", "BOS", "TOR", "TB", "BAL"] },
        { name: "AL Central", teams: ["CLE", "DET", "KC", "MIN", "CWS", "CHW"] },
        { name: "AL West", teams: ["HOU", "SEA", "TEX", "LAA", "OAK", "ATH"] },
      ] },
      { name: "National League", divisions: [
        { name: "NL East", teams: ["ATL", "NYM", "PHI", "MIA", "WSH"] },
        { name: "NL Central", teams: ["CHC", "MIL", "STL", "CIN", "PIT"] },
        { name: "NL West", teams: ["LAD", "SD", "SF", "ARI", "COL"] },
      ] },
    ],
  },
  nfl: {
    wildCardCount: 3,
    conferences: [
      { name: "AFC", divisions: [
        { name: "AFC East", teams: ["BUF", "MIA", "NE", "NYJ"] },
        { name: "AFC North", teams: ["BAL", "CIN", "CLE", "PIT"] },
        { name: "AFC South", teams: ["HOU", "IND", "JAX", "TEN"] },
        { name: "AFC West", teams: ["DEN", "KC", "LV", "LAC"] },
      ] },
      { name: "NFC", divisions: [
        { name: "NFC East", teams: ["DAL", "NYG", "PHI", "WSH", "WAS"] },
        { name: "NFC North", teams: ["CHI", "DET", "GB", "MIN"] },
        { name: "NFC South", teams: ["ATL", "CAR", "NO", "TB"] },
        { name: "NFC West", teams: ["ARI", "LAR", "SF", "SEA"] },
      ] },
    ],
  },
  nba: {
    autoCount: 6,
    playInCount: 10,
    conferences: [
      { name: "Eastern Conference", divisions: [
        { name: "Atlantic", teams: ["BOS", "BKN", "NY", "NYK", "PHI", "TOR"] },
        { name: "Central", teams: ["CHI", "CLE", "DET", "IND", "MIL"] },
        { name: "Southeast", teams: ["ATL", "CHA", "MIA", "ORL", "WSH", "WAS"] },
      ] },
      { name: "Western Conference", divisions: [
        { name: "Northwest", teams: ["DEN", "MIN", "OKC", "POR", "UTA", "UTAH", "UT"] },
        { name: "Pacific", teams: ["GS", "GSW", "LAC", "LAL", "PHX", "SAC"] },
        { name: "Southwest", teams: ["DAL", "HOU", "MEM", "NO", "NOP", "SA", "SAS"] },
      ] },
    ],
  },
  nhl: {
    wildCardCount: 2,
    conferences: [
      { name: "Eastern Conference", divisions: [
        { name: "Atlantic", teams: ["BOS", "BUF", "DET", "FLA", "MTL", "OTT", "TB", "TOR"] },
        { name: "Metropolitan", teams: ["CAR", "CBJ", "NJ", "NJD", "NYI", "NYR", "PHI", "PIT", "WSH", "WAS"] },
      ] },
      { name: "Western Conference", divisions: [
        { name: "Central", teams: ["ARI", "UTA", "CHI", "COL", "DAL", "MIN", "NSH", "STL", "WPG"] },
        { name: "Pacific", teams: ["ANA", "CGY", "EDM", "LA", "LAK", "SEA", "SJ", "SJS", "VAN", "VGK"] },
      ] },
    ],
  },
};

function clean(v: any) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function num(v: any, fallback = 0) { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : fallback; }
function pct(row: TeamRow) { return num(row.pct, num(row.wins) / Math.max(1, num(row.wins) + num(row.losses))); }
function isCollege(league: League | string) { return league === "cfb" || league === "cbb"; }
function teamAbbrFromKey(teamKey?: string) { return teamKey?.split("-").slice(1).join("-").toUpperCase(); }
function parseRecord(value: any) {
  const match = String(value || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  return match ? { wins: Number(match[1]), losses: Number(match[2]) } : { wins: null, losses: null };
}

function rowOverallRecord(row: TeamRow) {
  return parseRecord(row.overallRecord || row.record || row.records?.overall || row.summary || "");
}

function flattenRows(sections: any[]) {
  const byKey = new Map<string, TeamRow>();
  for (const section of sections || []) {
    for (const row of section.rows || []) {
      const key = clean(row.abbr || row.name || row.id);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { ...row, sourceSection: section.label });
    }
  }
  return [...byKey.values()];
}

function sortRows(rows: TeamRow[], league: League | string) {
  return [...rows].sort((a, b) => {
    if (isCollege(league)) {
      const cw = num(b.confWinsDisplay, -1) - num(a.confWinsDisplay, -1);
      if (cw) return cw;
      const cl = num(a.confLossesDisplay, 99) - num(b.confLossesDisplay, 99);
      if (cl) return cl;
    }
    if (league === "nhl") {
      const pts = num(b.points ?? b.pts) - num(a.points ?? a.pts);
      if (pts) return pts;
    }
    const p = pct(b) - pct(a);
    if (p) return p;
    const w = num(b.wins) - num(a.wins);
    if (w) return w;
    return num(a.losses) - num(b.losses);
  });
}

function rowsForDivision(rows: TeamRow[], division: Division, league: League | string) {
  const wanted = new Set(division.teams.map(clean));
  return sortRows(rows.filter((r) => wanted.has(clean(r.abbr))), league);
}

function rowsForConference(rows: TeamRow[], conf: Conference, league: League | string) {
  const wanted = new Set(conf.divisions.flatMap((d) => d.teams).map(clean));
  return sortRows(rows.filter((r) => wanted.has(clean(r.abbr))), league);
}

function conferenceForTeam(config: LeagueConfig | undefined, teamAbbr?: string) {
  const abbr = clean(teamAbbr);
  if (!config || !abbr) return null;
  return config.conferences.find((conf) => conf.divisions.some((division) => division.teams.map(clean).includes(abbr))) || null;
}

function divisionForTeam(config: LeagueConfig | undefined, teamAbbr?: string) {
  const abbr = clean(teamAbbr);
  if (!config || !abbr) return null;
  for (const conf of config.conferences) {
    const division = conf.divisions.find((d) => d.teams.map(clean).includes(abbr));
    if (division) return division;
  }
  return null;
}

function divisionLeaders(rows: TeamRow[], conf: Conference, league: League | string) {
  return conf.divisions.map((d) => rowsForDivision(rows, d, league)[0]).filter(Boolean);
}

function wildCardRows(rows: TeamRow[], conf: Conference, league: League | string) {
  const leaders = new Set(divisionLeaders(rows, conf, league).map((r) => clean(r.abbr)));
  return rowsForConference(rows, conf, league).filter((r) => !leaders.has(clean(r.abbr)));
}

function gamesBackFrom(target: TeamRow, row: TeamRow) {
  return ((num(target.wins) - num(row.wins)) + (num(row.losses) - num(target.losses))) / 2;
}

function formatGames(value: number) {
  const abs = Math.abs(value);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return formatted;
}

function withWildCardGb(rows: TeamRow[], cutoffCount: number) {
  const cutoff = rows[Math.max(0, cutoffCount - 1)];
  if (!cutoff) return rows;
  return rows.map((row, idx) => {
    if (idx === cutoffCount - 1) return { ...row, gb: "-" };
    const gb = gamesBackFrom(cutoff, row);
    if (idx < cutoffCount - 1) return { ...row, gb: `+${formatGames(gb)}` };
    return { ...row, gb: formatGames(gb) };
  });
}

function withLeaderGb(rows: TeamRow[]) {
  const leader = rows[0];
  if (!leader) return rows;
  return rows.map((row, idx) => idx === 0 ? { ...row, gb: "-" } : { ...row, gb: formatGames(gamesBackFrom(leader, row)) });
}

function withCollegeGb(rows: TeamRow[]) {
  const sorted = sortRows(rows, "cfb");
  const leader = sorted[0];
  if (!leader) return sorted;
  return sorted.map((row, idx) => {
    if (idx === 0) return { ...row, confGb: "-" };
    const target = { wins: leader.confWinsDisplay, losses: leader.confLossesDisplay };
    const current = { wins: row.confWinsDisplay, losses: row.confLossesDisplay };
    return { ...row, confGb: formatGames(gamesBackFrom(target, current)) };
  });
}

function columnsForLeague(league: League | string) {
  if (league === "nhl") return ["gp", "wins", "losses", "otl", "points"];
  if (isCollege(league)) return ["wins", "losses", "confWinsDisplay", "confLossesDisplay", "confGb"];
  return ["wins", "losses", "pct", "gb"];
}

function colLabel(key: string) {
  const labels: Record<string, string> = { gp: "GP", wins: "W", losses: "L", otl: "OTL", points: "PTS", pct: "PCT", gb: "GB", confGb: "GB", streak: "STRK", confWinsDisplay: "W", confLossesDisplay: "L" };
  return labels[key] || key.toUpperCase();
}

function cell(row: TeamRow, key: string) {
  if (key === "gp") return row.gamesPlayed || row.gp || "—";
  if (key === "points") return row.points || row.pts || "—";
  if (key === "gb") return row.gb || "-";
  return row[key] || "—";
}

function renderRow(row: TeamRow, columns: string[], selected: boolean, marker?: "dash" | "solid", league?: League | string, onTeamClick?: (league: string, abbr: string) => void) {
  const canClick = Boolean(onTeamClick && row.abbr);
  const teamContent = (
    <div className="flex items-center gap-2 min-w-0">
      {row.logo && <RetroTeamLogo team={{ logo: row.logo, abbr: row.abbr, name: row.name }} league={row.league || league} size={20} className="standings-team-logo" />}
      <span className="standings-team-name font-bold leading-tight">{row.name}</span>
      {row.divisionLabel && <span className="ml-auto text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{row.divisionLabel}</span>}
    </div>
  );
  return (
    <tr key={`${row.id || row.abbr || row.name}-${marker || ""}`} className={`standings-row ${selected ? "is-selected" : ""} ${marker === "dash" ? "standings-cut-dash" : marker === "solid" ? "standings-cut-solid" : ""}`}>
      <td className="px-3 py-2">
        {canClick ? (
          <button type="button" className="standings-team-link w-full text-left" onClick={() => onTeamClick?.(String(league || row.league), String(row.abbr).toLowerCase())}>
            {teamContent}
          </button>
        ) : teamContent}
      </td>
      {columns.map((key, idx) => <td key={key} className={`text-right py-2 tabular-nums ${idx === columns.length - 1 ? "px-3" : "px-2"}`}>{cell(row, key)}</td>)}
    </tr>
  );
}

function StandingsTable({ title, rows, league, teamAbbr, markers = {}, gbMode = "leader", onTeamClick }: { title: string; rows: TeamRow[]; league: League | string; teamAbbr?: string; markers?: Record<number, "dash" | "solid">; gbMode?: "leader" | "preserve"; onTeamClick?: (league: string, abbr: string) => void }) {
  const columns = columnsForLeague(league);
  const normalizedRows = isCollege(league) ? withCollegeGb(rows.map((row) => {
    const parsed = parseRecord(row.conferenceRecord);
    const overall = rowOverallRecord(row);
    return {
      ...row,
      wins: row.wins ?? row.overallWins ?? overall.wins ?? "—",
      losses: row.losses ?? row.overallLosses ?? overall.losses ?? "—",
      confWinsDisplay: row.confWinsDisplay ?? row.confWins ?? parsed.wins ?? "—",
      confLossesDisplay: row.confLossesDisplay ?? (Number.isFinite(row.confLosses) && row.confLosses !== Number.POSITIVE_INFINITY ? row.confLosses : parsed.losses ?? "—"),
    };
  })) : rows;
  const displayRows = !isCollege(league) && columns.includes("gb") && gbMode === "leader" ? withLeaderGb(normalizedRows) : normalizedRows;
  const tableLeagueClass = `standings-table-${String(league)}`;
  return (
    <div className="standings-table-card overflow-hidden">
      <div className="standings-table-title px-3 py-2 text-xs font-black uppercase tracking-wider">{title}</div>
      <div className="overflow-x-auto">
        <table className={`standings-table ${tableLeagueClass} w-full text-xs`}>
          <colgroup>
            <col className="standings-team-col" />
            {columns.map((key) => <col key={key} className="standings-stat-col" />)}
          </colgroup>
          <thead>
            {isCollege(league) ? (
              <>
                <tr style={{ color: "var(--text-3)" }}>
                  <th className="text-left px-3 pt-2"></th>
                  <th colSpan={2} className="standings-colgroup standings-colgroup-overall text-center px-2 pt-2 uppercase tracking-wider">Overall</th>
                  <th colSpan={3} className="standings-colgroup standings-colgroup-conference text-center px-2 pt-2 uppercase tracking-wider">Conference</th>
                </tr>
                <tr style={{ color: "var(--text-3)" }}><th className="text-left px-3 py-2">Team</th>{columns.map((key, idx) => <th key={key} className={`text-right py-2 ${idx === columns.length - 1 ? "px-3" : "px-2"}`}>{colLabel(key)}</th>)}</tr>
              </>
            ) : (
              <tr style={{ color: "var(--text-3)" }}><th className="text-left px-3 py-2">Team</th>{columns.map((key, idx) => <th key={key} className={`text-right py-2 ${idx === columns.length - 1 ? "px-3" : "px-2"}`}>{colLabel(key)}</th>)}</tr>
            )}
          </thead>
          <tbody>{displayRows.map((row, idx) => renderRow(row, columns, clean(row.abbr) === clean(teamAbbr), markers[idx], league, onTeamClick))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function Standings({ league, teamKey, compact = false, pageMode = "division", conferenceFilter, subdivision, showHeader = true, showFilterControls = false, teamView = false, onTeamClick }: Props) {
  const [selectedCollegeSection, setSelectedCollegeSection] = useState<string>("auto");
  const [teamStandingsView, setTeamStandingsView] = useState<"division" | "secondary">("division");
  const qs = new URLSearchParams({ league: String(league) });
  if (subdivision) qs.set("subdivision", subdivision);
  const { data, isLoading } = useSWR(`/api/standings?${qs.toString()}`, fetcher, { revalidateOnFocus: false, refreshInterval: 300_000 });
  const sections = data?.sections || [];
  const teamAbbr = teamAbbrFromKey(teamKey);
  const allRows = useMemo(() => flattenRows(sections), [sections]);
  const config = CONFIGS[String(league)];
  const filteredConferences = config?.conferences.filter((conf) => !conferenceFilter || conf.name === conferenceFilter) || [];

  const collegeLabels = useMemo(() => {
    if (!isCollege(league)) return [];
    return Array.from(new Set<string>(sections.map((s: any) => String(s.label || "")).filter(Boolean))).sort();
  }, [league, sections]);

  useEffect(() => {
    if (!isCollege(league) || selectedCollegeSection !== "auto") return;
    if (teamAbbr) {
      const match = sections.find((section: any) => (section.rows || []).some((r: any) => clean(r.abbr) === clean(teamAbbr)));
      if (match?.label) setSelectedCollegeSection(match.label);
    }
  }, [league, sections, selectedCollegeSection, teamAbbr]);

  if (isLoading) return <div className="standings-loading h-40 rounded-xl animate-pulse" />;
  if (!sections.length) return <div className="standings-empty p-5 rounded-xl text-sm">Standings are not available yet.</div>;

  if (isCollege(league)) {
    const chosen = selectedCollegeSection === "auto" ? collegeLabels[0] : selectedCollegeSection;
    const visible = sections.filter((s: any) => s.label === chosen).slice(0, 1);
    return (
      <section className={compact ? "space-y-3" : "space-y-4"}>
        {showFilterControls && collegeLabels.length > 1 && (
          <label className="standings-college-filter block">
            <span className="block text-[11px] uppercase tracking-wider font-black mb-1" style={{ color: "var(--text-3)" }}>Conference</span>
            <select value={chosen || ""} onChange={(e) => setSelectedCollegeSection(e.target.value)} className="standings-college-select w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}>
              {collegeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
        )}
        {visible.map((section: any) => <StandingsTable key={section.label} title={section.label} rows={section.rows || []} league={league} teamAbbr={teamAbbr} onTeamClick={onTeamClick} />)}
      </section>
    );
  }

  if (!config) {
    return <section className="space-y-4">{sections.map((section: any) => <StandingsTable key={section.label} title={section.label} rows={section.rows || []} league={league} teamAbbr={teamAbbr} onTeamClick={onTeamClick} />)}</section>;
  }

  if (teamView && teamAbbr) {
    const teamConf = conferenceForTeam(config, teamAbbr);
    const teamDivision = divisionForTeam(config, teamAbbr);
    const secondaryLabel = league === "nba" ? "Conference" : "Wild Card";
    const controls = [
      { id: "division" as const, label: teamDivision?.name || "Division" },
      { id: "secondary" as const, label: secondaryLabel },
    ];

    return (
      <section className="team-standings-panel space-y-3">
        <div className="team-standings-toggle">
          {controls.map((control) => (
            <button key={control.id} type="button" className={teamStandingsView === control.id ? "is-active" : ""} onClick={() => setTeamStandingsView(control.id)}>
              {control.label}
            </button>
          ))}
        </div>
        {teamStandingsView === "division" && teamDivision && (
          <StandingsTable title={teamDivision.name} rows={rowsForDivision(allRows, teamDivision, league)} league={league} teamAbbr={teamAbbr} onTeamClick={onTeamClick} />
        )}
        {teamStandingsView === "secondary" && teamConf && league === "nba" && (
          <StandingsTable title={teamConf.name} rows={rowsForConference(allRows, teamConf, league)} league={league} teamAbbr={teamAbbr} markers={{ 6: "dash", 10: "solid" }} onTeamClick={onTeamClick} />
        )}
        {teamStandingsView === "secondary" && teamConf && league !== "nba" && league === "nhl" && (
          <StandingsTable title="Wild Card" rows={rowsForConference(allRows, teamConf, league).filter((row) => {
            const topThree = new Set(teamConf.divisions.flatMap((division) => rowsForDivision(allRows, division, league).slice(0, 3).map((r) => clean(r.abbr))));
            return !topThree.has(clean(row.abbr));
          })} league={league} teamAbbr={teamAbbr} markers={{ 2: "solid" }} onTeamClick={onTeamClick} />
        )}
        {teamStandingsView === "secondary" && teamConf && league !== "nba" && league !== "nhl" && (
          <StandingsTable title="Wild Card" rows={withWildCardGb(wildCardRows(allRows, teamConf, league), config.wildCardCount || 3)} league={league} teamAbbr={teamAbbr} markers={{ [config.wildCardCount || 3]: "solid" }} gbMode="preserve" onTeamClick={onTeamClick} />
        )}
        {teamStandingsView === "division" && !teamDivision && <div className="standings-empty p-5 rounded-xl text-sm">Division standings are not available yet.</div>}
      </section>
    );
  }

  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && showHeader && <h2 className="text-lg font-black">Standings</h2>}
      {pageMode === "division" && filteredConferences.map((conf) => (
        <div key={conf.name} className="space-y-3">
          {!conferenceFilter && <StandingsGroupTitle>{conf.name}</StandingsGroupTitle>}
          {conf.divisions.map((division) => <StandingsTable key={division.name} title={division.name} rows={rowsForDivision(allRows, division, league)} league={league} teamAbbr={teamAbbr} onTeamClick={onTeamClick} />)}
        </div>
      ))}
      {pageMode === "conference" && filteredConferences.map((conf) => {
        const rows = rowsForConference(allRows, conf, league);
        const markers: Record<number, "dash" | "solid"> = {};
        if (league === "nba") { markers[6] = "dash"; markers[10] = "solid"; }
        return <StandingsTable key={conf.name} title={conf.name} rows={rows} league={league} teamAbbr={teamAbbr} markers={markers} onTeamClick={onTeamClick} />;
      })}
      {pageMode === "wildcard" && filteredConferences.map((conf) => {
        const leaders = sortRows(divisionLeaders(allRows, conf, league), league).map((row) => ({ ...row, gb: "-" }));
        const cutoff = league === "nhl" ? 2 : (config.wildCardCount || 3);
        const wc = league === "nhl" ? wildCardRows(allRows, conf, league) : withWildCardGb(wildCardRows(allRows, conf, league), cutoff);
        const markers: Record<number, "solid"> = {};
        markers[cutoff] = "solid";
        if (league === "nba") {
          const rows = rowsForConference(allRows, conf, league);
          return <StandingsTable key={conf.name} title={conf.name} rows={rows} league={league} teamAbbr={teamAbbr} markers={{ 6: "dash", 10: "solid" }} />;
        }
        if (league === "nhl") {
          const topThree: TeamRow[] = conf.divisions.flatMap((division) => rowsForDivision(allRows, division, league).slice(0, 3).map((row) => ({ ...row, divisionLabel: division.name })));
          const topThreeKeys = new Set(topThree.map((row) => clean(row.abbr)));
          const nhlWildCardRows = rowsForConference(allRows, conf, league).filter((row) => !topThreeKeys.has(clean(row.abbr)));
          return (
            <div key={conf.name} className="space-y-3">
              <StandingsGroupTitle>{conf.name}</StandingsGroupTitle>
              {conf.divisions.map((division) => (
                <StandingsTable
                  key={`${conf.name}-${division.name}-leaders`}
                  title={`${division.name} Leaders`}
                  rows={rowsForDivision(allRows, division, league).slice(0, 3)}
                  league={league}
                  teamAbbr={teamAbbr}
                  onTeamClick={onTeamClick}
                />
              ))}
              <StandingsTable title="Wild Card" rows={nhlWildCardRows} league={league} teamAbbr={teamAbbr} markers={markers} onTeamClick={onTeamClick} />
            </div>
          );
        }
        return (
          <div key={conf.name} className="space-y-3">
            <StandingsGroupTitle>{conf.name}</StandingsGroupTitle>
            <StandingsTable title="Division Leaders" rows={leaders} league={league} teamAbbr={teamAbbr} gbMode="preserve" onTeamClick={onTeamClick} />
            <StandingsTable title="Wild Card" rows={wc} league={league} teamAbbr={teamAbbr} markers={markers} gbMode="preserve" onTeamClick={onTeamClick} />
          </div>
        );
      })}
    </section>
  );
}

function StandingsGroupTitle({ children }: { children: ReactNode }) {
  return <div className="standings-group-title px-1 text-sm font-black uppercase tracking-wider">{children}</div>;
}
