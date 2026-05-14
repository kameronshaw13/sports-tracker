"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { Section } from "@/lib/playerColumns";
import { SECTIONS_BY_LEAGUE } from "@/lib/playerColumns";
import { fmtAvg, fmtPct, fmtRate2, fmtDecimal1, fmtCount } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Stat = { value: number | null; displayValue: string };
type PlayerRow = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  positionAbbr?: string;
  primaryPosition?: string;
  pitchingRole?: "SP" | "RP";
  headshot?: string;
  hasStats?: boolean;
  stats: Record<string, Stat>;
};
type PlayerRef = { id: string; name: string; league: string; teamKey?: string };
type Props = { player: PlayerRef; onBack: () => void };
type Tab = "bio" | "stats" | "gamelog";

type Profile = {
  id?: string | number | null;
  espnId?: string | number | null;
  name?: string;
  team?: string | null;
  position?: string | null;
  jersey?: string | number | null;
  headshot?: string | null;
  bio?: string | null;
  bioFields?: {
    height?: string | null;
    weight?: string | null;
    born?: string | null;
    school?: string | null;
    experience?: string | null;
    bats?: string | null;
    throws?: string | null;
  };
};

function statKey(category: string, name: string): string {
  return `${category}.${name}`;
}

function normalizeName(value: string | undefined | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyFormat(value: number | null, displayValue: string, format?: string): string {
  if (displayValue && displayValue !== "—") {
    if (format === "avg" && /^0?\.\d+$/.test(displayValue)) {
      return displayValue.startsWith("0") ? displayValue.slice(1) : displayValue;
    }
    return displayValue;
  }
  switch (format) {
    case "avg": return fmtAvg(value);
    case "pct": return fmtPct(value);
    case "rate2": return fmtRate2(value);
    case "decimal1": return fmtDecimal1(value);
    case "count": return fmtCount(value);
    default: return value != null ? String(value) : "—";
  }
}

function sectionMatchesPlayer(section: Section, p: PlayerRow): boolean {
  const qualifier = p.stats?.[statKey(section.qualifier.category, section.qualifier.name)];
  if (!qualifier || qualifier.value == null || qualifier.value <= 0) return false;

  if (!section.positions) return true;
  if (section.id === "batting") return true;

  const positionSet = new Set(section.positions.map((pos) => pos.toUpperCase()));
  const candidates = [p.position, p.primaryPosition, p.pitchingRole]
    .filter(Boolean)
    .map((x) => String(x).toUpperCase());

  return candidates.some((pos) => positionSet.has(pos));
}

function buildTeamStatGroups(league: string, p: PlayerRow | null): { name: string; stats: { label: string; value: string }[] }[] {
  if (!p) return [];
  const sections = SECTIONS_BY_LEAGUE[league] || [];
  return sections
    .filter((section) => sectionMatchesPlayer(section, p))
    .map((section) => ({
      name: section.label,
      stats: section.columns
        .map((col) => {
          const s = p.stats?.[statKey(col.category, col.name)];
          return {
            label: col.label,
            value: s ? applyFormat(s.value, s.displayValue, col.format) : "—",
          };
        })
        .filter((s) => s.value !== "—"),
    }))
    .filter((g) => g.stats.length > 0);
}

function findTeamPlayer(players: PlayerRow[], ref: PlayerRef): PlayerRow | null {
  if (!players?.length) return null;
  const exact = players.find((p) => String(p.id) === String(ref.id));
  if (exact) return exact;

  const target = normalizeName(ref.name);
  if (!target) return null;

  return (
    players.find((p) => normalizeName(p.name) === target) ||
    players.find((p) => normalizeName(p.name).endsWith(target) || target.endsWith(normalizeName(p.name))) ||
    null
  );
}

export default function PlayerDetail({ player, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("stats");

  const playerUrl = `/api/player?league=${player.league}&id=${player.id}${player.teamKey ? `&team=${player.teamKey}` : ""}&name=${encodeURIComponent(player.name || "")}`;
  const { data: profileData, error, isLoading } = useSWR(playerUrl, fetcher);
  const { data: teamPlayersData } = useSWR(player.teamKey ? `/api/players?team=${player.teamKey}` : null, fetcher);
  const { data: rosterData } = useSWR(player.teamKey ? `/api/roster?team=${player.teamKey}` : null, fetcher);

  const teamPlayer = useMemo(
    () => findTeamPlayer(teamPlayersData?.players || [], player),
    [teamPlayersData?.players, player]
  );
  const rosterPlayer = useMemo(
    () => findTeamPlayer([...(rosterData?.active || []), ...(rosterData?.injured || []), ...(rosterData?.players || [])], player),
    [rosterData?.active, rosterData?.injured, rosterData?.players, player]
  );
  const profile: Profile = profileData?.profile || {};
  const displayName = rosterPlayer?.name || teamPlayer?.name || profile.name || player.name;
  const position = rosterPlayer?.positionAbbr || rosterPlayer?.position || teamPlayer?.position || profile.position;
  const jersey = rosterPlayer?.jersey || teamPlayer?.jersey || profile.jersey;
  const headshotCandidates = useMemo(
    () => Array.from(new Set([
      rosterPlayer?.headshot,
      espnHeadshot(player.league, String(profile.espnId || "")),
      espnHeadshot(player.league, String(profile.id || "")),
      espnHeadshot(player.league, String(rosterPlayer?.id || "")),
      espnHeadshot(player.league, teamPlayer?.id || ""),
      espnHeadshot(player.league, player.id),
      teamPlayer?.headshot,
      profile.headshot,
    ].filter(isUsableHeadshot))) as string[],
    [player.league, rosterPlayer?.headshot, rosterPlayer?.id, profile.espnId, profile.id, teamPlayer?.id, player.id, teamPlayer?.headshot, profile.headshot]
  );
  const [headshotIndex, setHeadshotIndex] = useState(0);
  useEffect(() => setHeadshotIndex(0), [player.id, headshotCandidates.join("|")]);
  const headshot = headshotCandidates[headshotIndex] || null;

  if (isLoading) return <Loading onBack={onBack} />;
  if (error || profileData?.error) return <ErrorState onBack={onBack} />;

  // First choice: use the exact same /api/players stat row that powers the
  // team Stats tab. This keeps player cards consistent with the team page.
  const teamStatGroups = buildTeamStatGroups(player.league, teamPlayer);
  const fallbackStats = Array.isArray(profileData?.stats)
    ? [{ name: "Season Stats", stats: profileData.stats }]
    : [];
  const statGroups = teamStatGroups.length ? teamStatGroups : fallbackStats;
  const gameLog = profileData?.gameLog || [];

  const primaryGroup = buildHeaderStats(player.league, position || "", statGroups);

  return (
    <div className="-mx-4 sm:mx-0 player-detail-page">
      <div className="player-detail-sticky-shell">
        <div className="player-detail-topbar">
          <BackButton onBack={onBack} />
          <div className="player-detail-top-title">
            <span>{displayName}</span>
            {position && <em>{position}</em>}
          </div>
          <div className="player-detail-top-spacer" />
        </div>

        <section className="player-detail-hero">
          <div className="player-detail-hero-main">
            <div className="player-detail-headshot">
              {headshot ? (
                <Image
                  src={headshot}
                  alt={displayName}
                  width={104}
                  height={104}
                  className="object-cover"
                  unoptimized
                  onError={() => setHeadshotIndex((i) => i + 1)}
                />
              ) : (
                <span>{initials(displayName)}</span>
              )}
            </div>
            <div className="player-detail-title-block">
              <h2>{displayName}</h2>
              <div>
                {[jersey ? `#${jersey}` : null, position].filter(Boolean).join(" ") || profile.team || player.league.toUpperCase()}
              </div>
              {profile.bio && <p>{profile.bio}</p>}
            </div>
          </div>
          {primaryGroup.length > 0 && (
            <div className="player-detail-feature-stats">
              {primaryGroup.map((s) => (
                <div key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="player-detail-tabs" role="tablist">
          <div>
            <TabButton label="Bio" active={tab === "bio"} onClick={() => setTab("bio")} />
            <TabButton label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
            <TabButton label="Game Log" active={tab === "gamelog"} onClick={() => setTab("gamelog")} />
          </div>
        </div>
      </div>

      <div className="player-detail-body">
        {tab === "bio" && <BioPanel profile={profile} league={player.league} />}
        {tab === "stats" && (statGroups.length ? <StatsRowTable groups={statGroups} league={player.league} position={position || ""} /> : <Empty text="No current-season stats available yet." />)}
        {tab === "gamelog" && (gameLog.length ? <GameLogTable rows={gameLog} league={player.league} position={position || ""} /> : <Empty text="No current-season game log available yet." />)}
      </div>
    </div>
  );
}

function Loading({ onBack }: { onBack: () => void }) {
  return <div className="space-y-3"><BackButton onBack={onBack} /><div className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} /></div>;
}
function ErrorState({ onBack }: { onBack: () => void }) {
  return <div className="space-y-3"><BackButton onBack={onBack} /><Empty text="Could not load this player yet." /></div>;
}
function BackButton({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} className="h-10 w-10 flex items-center justify-center" style={{ color: "var(--text)" }} aria-label="Back"><svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg></button>;
}
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={active ? "is-active" : ""}>{label}</button>;
}
function StatsRowTable({ groups, league, position }: { groups: { name: string; stats: { label: string; value: string }[] }[]; league: string; position?: string }) {
  const displayGroups = groups.map((group) => ({ ...group, stats: formatStatsForDisplay(group.stats, league, position || "") }));
  return (
    <div className="player-detail-stat-sections">
      <h3 className="player-detail-season-heading">{new Date().getFullYear()} Season Stats</h3>
      {displayGroups.map((group) => (
        <section key={group.name} className="player-detail-stat-section">
          {groups.length > 1 && <h4>{group.name}</h4>}
          <div className="player-detail-stat-grid">
            {group.stats.map((s) => (
              <div key={s.label} className="player-detail-stat-item">
                <span>{s.label}</span>
                <strong>{s.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function GameLogTable({ rows, league, position }: { rows: any[]; league: string; position?: string }) {
  const statLabels = gameLogColumns(rows, league, position);
  const isPitcher = league === "mlb" && isMlbPitcherPosition(position || "");
  const gridTemplateColumns = isPitcher
    ? `2.72rem 3.22rem repeat(7, 1.56rem)`
    : `2.72rem 3.22rem 2.28rem repeat(5, 1.62rem)`;
  return (
    <div className={`player-game-log-list ${isPitcher ? "is-pitcher-log" : "is-hitter-log"}`}>
      <div className="player-game-log-header" style={{ gridTemplateColumns }}>
        <span>DATE</span>
        <span>OPP</span>
        {statLabels.map((l) => <span key={l}>{l}</span>)}
      </div>
      {rows.map((r: any) => (
        <div key={r.id} className="player-game-log-row" style={{ gridTemplateColumns }}>
          <span>{formatDate(r.date)}</span>
          <strong>{r.opponent || "—"}</strong>
          {statLabels.map((l) => <span key={l}>{gameLogValue(r, l)}</span>)}
        </div>
      ))}
    </div>
  );
}
function BioPanel({ profile, league }: { profile: Profile; league: string }) {
  const fields = profile.bioFields || {};
  const rows = [
    ["Height", fields.height],
    ["Weight", fields.weight],
    ["Born", fields.born],
    ["Experience", fields.experience],
    ["Bats", fields.bats],
    ["Throws", fields.throws],
  ].filter(([, value]) => value != null && value !== "");
  return (
    <div className="player-detail-bio-list">
      {rows.map(([label, value]) => (
        <div key={label}><span>{label}</span><strong>{value}</strong></div>
      ))}
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div className="player-detail-empty">{text}</div>; }
function initials(name: string) { return String(name || "").split(" ").map((n) => n[0]).slice(0, 2).join(""); }
function formatDate(date?: string) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function espnHeadshot(league: string, id: string) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const path = league === "mlb" ? "mlb" : league;
  return `https://a.espncdn.com/i/headshots/${path}/players/full/${id}.png`;
}
function isUsableHeadshot(value: string | null | undefined): value is string {
  if (!value) return false;
  return !/mlbstatic\.com|mlb-photos/i.test(String(value));
}
function normalizedStatMap(row: any) {
  const map = new Map<string, string>();
  for (const stat of row?.stats || []) {
    const label = String(stat?.label || "").toUpperCase();
    map.set(label, String(stat?.value ?? "—"));
  }
  return map;
}
function gameLogColumns(rows: any[], league: string, position?: string) {
  const pos = String(position || "").toUpperCase();
  const isMlbPitcher = league === "mlb" && /^(P|SP|RP|CP|CL)$/.test(pos);
  if (league === "mlb") return isMlbPitcher ? ["W", "L", "SV", "IP", "H", "ER", "K"] : ["H/AB", "R", "HR", "RBI", "K", "BB"];
  return Array.from(new Set(rows.flatMap((r) => (r.stats || []).map((s: any) => String(s.label || "").toUpperCase())))).slice(0, 5);
}
function gameLogValue(row: any, label: string) {
  const map = normalizedStatMap(row);
  if (label === "H/AB") {
    const h = map.get("H") || "—";
    const ab = map.get("AB") || "—";
    return h !== "—" || ab !== "—" ? `${h}/${ab}` : "—";
  }
  if (label === "K") return map.get("K") || map.get("SO") || "—";
  return map.get(label) || "—";
}
function buildHeaderStats(league: string, position: string, groups: { name: string; stats: { label: string; value: string }[] }[]) {
  const all = groups.flatMap((g) => g.stats);
  const byLabel = new Map(all.map((s) => [s.label.toUpperCase(), s]));
  if (league === "mlb" && isMlbPitcherPosition(position)) {
    const wins = byLabel.get("W")?.value;
    const losses = byLabel.get("L")?.value;
    const wl = wins != null || losses != null ? { label: "W-L", value: `${wins || "0"}-${losses || "0"}` } : null;
    return [wl, byLabel.get("ERA"), byLabel.get("K") || byLabel.get("SO")].filter(Boolean) as { label: string; value: string }[];
  }
  if (league === "mlb") {
    return ["AVG", "HR", "RBI"].map((label) => byLabel.get(label)).filter(Boolean) as { label: string; value: string }[];
  }
  return all.slice(0, 3);
}
function formatStatsForDisplay(stats: { label: string; value: string }[], league: string, position: string) {
  if (league !== "mlb") return stats;
  const byLabel = new Map(stats.map((s) => [s.label.toUpperCase(), s.value]));
  if (isMlbPitcherPosition(position)) {
    const wins = byLabel.get("W");
    const losses = byLabel.get("L");
    const record = wins != null || losses != null ? `${wins || "0"}-${losses || "0"}` : null;
    const order: [string, string, string[]][] = [
      ["G", "Games Pitched", ["G"]],
      ["GS", "Games Started", ["GS"]],
      ["ERA", "ERA", ["ERA"]],
      ["WHIP", "WHIP", ["WHIP"]],
      ["K", "Strikeouts", ["K", "SO"]],
      ["BB", "Walks", ["BB"]],
      ["IP", "Innings Pitched", ["IP"]],
      ["W-L", "Record", []],
      ["SV", "Saves", ["SV"]],
      ["BS", "Blown Saves", ["BS"]],
    ];
    return order
      .map(([, label, keys]) => {
        const value = label === "Record" ? record : keys.map((k) => byLabel.get(k)).find(Boolean);
        return value ? { label, value } : null;
      })
      .filter(Boolean) as { label: string; value: string }[];
  }
  const order: [string, string, string[]][] = [
    ["G", "Games Played", ["G"]],
    ["AVG", "Average", ["AVG"]],
    ["AB", "At Bats", ["AB"]],
    ["R", "Runs Scored", ["R"]],
    ["H", "Hits", ["H"]],
    ["HR", "Home Runs", ["HR"]],
    ["RBI", "RBIs", ["RBI", "RBIS"]],
    ["OPS", "OPS", ["OPS"]],
    ["OBP", "OBP", ["OBP"]],
    ["SLG", "Slugging %", ["SLG"]],
    ["SO", "Strikeouts", ["SO", "K"]],
    ["BB", "Walks", ["BB"]],
    ["SB", "Stolen Bases", ["SB"]],
  ];
  return order
    .map(([, label, keys]) => {
      const value = keys.map((k) => byLabel.get(k)).find(Boolean);
      return value ? { label, value } : null;
    })
    .filter(Boolean) as { label: string; value: string }[];
}
function isMlbPitcherPosition(position: string) {
  return /^(P|SP|RP|CP|CL)$/.test(String(position || "").toUpperCase());
}
