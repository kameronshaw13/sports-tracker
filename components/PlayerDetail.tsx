"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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
  primaryPosition?: string;
  pitchingRole?: "SP" | "RP";
  headshot?: string;
  hasStats?: boolean;
  stats: Record<string, Stat>;
};
type PlayerRef = { id: string; name: string; league: string; teamKey?: string };
type Props = { player: PlayerRef; onBack: () => void };
type Tab = "stats" | "gamelog";

type Profile = {
  name?: string;
  team?: string | null;
  position?: string | null;
  headshot?: string | null;
  bio?: string | null;
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

  const teamPlayer = useMemo(
    () => findTeamPlayer(teamPlayersData?.players || [], player),
    [teamPlayersData?.players, player]
  );

  if (isLoading) return <Loading onBack={onBack} />;
  if (error || profileData?.error) return <ErrorState onBack={onBack} />;

  const profile: Profile = profileData?.profile || {};
  const displayName = teamPlayer?.name || profile.name || player.name;
  const headshot = espnHeadshot(player.league, player.id) || teamPlayer?.headshot || profile.headshot;
  const position = teamPlayer?.position || profile.position;

  // First choice: use the exact same /api/players stat row that powers the
  // team Stats tab. This keeps player cards consistent with the team page.
  const teamStatGroups = buildTeamStatGroups(player.league, teamPlayer);
  const fallbackStats = Array.isArray(profileData?.stats)
    ? [{ name: "Season Stats", stats: profileData.stats }]
    : [];
  const statGroups = teamStatGroups.length ? teamStatGroups : fallbackStats;
  const gameLog = profileData?.gameLog || [];

  const primaryGroup = statGroups[0]?.stats?.slice(0, 3) || [];

  return (
    <div className="-mx-4 sm:mx-0 player-detail-page">
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
              <Image src={headshot} alt={displayName} width={104} height={104} className="object-cover" unoptimized />
            ) : (
              <span>{initials(displayName)}</span>
            )}
          </div>
          <div className="player-detail-title-block">
            <h2>{displayName}</h2>
            <div>
              {[profile.team, position].filter(Boolean).join(" · ") || player.league.toUpperCase()}
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
          <TabButton label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
          <TabButton label="Game Log" active={tab === "gamelog"} onClick={() => setTab("gamelog")} />
        </div>
      </div>

      <div className="player-detail-body">
        {tab === "stats" && (statGroups.length ? <StatsRowTable groups={statGroups} /> : <Empty text="No current-season stats available yet." />)}
        {tab === "gamelog" && (gameLog.length ? <GameLogTable rows={gameLog} /> : <Empty text="No current-season game log available yet." />)}
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
function StatsRowTable({ groups }: { groups: { name: string; stats: { label: string; value: string }[] }[] }) {
  return (
    <div className="player-detail-stat-sections">
      {groups.map((group) => (
        <section key={group.name} className="player-detail-stat-section">
          <h3>{group.name}</h3>
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
function GameLogTable({ rows }: { rows: any[] }) {
  const statLabels = Array.from(new Set(rows.flatMap((r) => (r.stats || []).map((s: any) => s.label)))).slice(0, 6);
  return (
    <div className="player-game-log-list">
      {rows.map((r: any) => (
        <div key={r.id} className="player-game-log-row">
          <div className="player-game-log-meta">
            <strong>{formatDate(r.date)}</strong>
            <span>{r.opponent || "—"}</span>
          </div>
          <div className="player-game-log-stats">
            {statLabels.map((l) => (
              <div key={l}>
                <span>{l}</span>
                <strong>{(r.stats || []).find((s: any) => s.label === l)?.value ?? "—"}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div className="player-detail-empty">{text}</div>; }
function initials(name: string) { return String(name || "").split(" ").map((n) => n[0]).slice(0, 2).join(""); }
function formatDate(date?: string) { if (!date) return "—"; const d = new Date(date); return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function espnHeadshot(league: string, id: string) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const path = league === "mlb" ? "mlb" : league;
  return `https://a.espncdn.com/i/headshots/${path}/players/full/${id}.png`;
}
