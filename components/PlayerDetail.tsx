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
  const headshot = teamPlayer?.headshot || profile.headshot;
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
    <div className="-mx-4 sm:mx-0 cbs-player-page">
      <div className="cbs-player-topbar">
        <BackButton onBack={onBack} />
        <h1 className="text-lg font-black truncate">{displayName}</h1>
        <div className="w-10" />
      </div>

      <section className="cbs-player-hero">
        <div className="flex items-center gap-4 px-5 pt-5">
          <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {headshot ? (
              <Image src={headshot} alt={displayName} width={96} height={96} className="object-cover" unoptimized />
            ) : (
              <span className="text-2xl font-black" style={{ color: "var(--text-3)" }}>{initials(displayName)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-3xl font-black leading-tight">{displayName}</h2>
            <div className="text-base font-black mt-1" style={{ color: "var(--text-2)" }}>
              {[profile.team, position].filter(Boolean).join(" · ") || player.league.toUpperCase()}
            </div>
          </div>
        </div>
        {primaryGroup.length > 0 && (
          <div className="grid grid-cols-3 mt-6 border-t" style={{ borderColor: "var(--border)" }}>
            {primaryGroup.map((s) => (
              <div key={s.label} className="py-4 text-center border-r last:border-r-0" style={{ borderColor: "var(--border)" }}>
                <div className="text-3xl font-black tabular-nums leading-none">{s.value}</div>
                <div className="text-sm font-black mt-1" style={{ color: "var(--text-2)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="cbs-tabs" role="tablist">
        <div className="flex gap-8 px-4">
          <TabButton label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
          <TabButton label="Game Log" active={tab === "gamelog"} onClick={() => setTab("gamelog")} />
        </div>
      </div>

      <div className="pt-4 px-4 sm:px-0">
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
  return <button onClick={onClick} className="relative py-4 text-base font-black" style={{ color: active ? "var(--text)" : "var(--text-2)" }}>{label}{active && <span className="absolute left-0 right-0 bottom-0 h-1" style={{ background: "var(--accent)" }} />}</button>;
}
function StatsRowTable({ groups }: { groups: { name: string; stats: { label: string; value: string }[] }[] }) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.name} className="rounded-xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{group.name}</div>
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
                {group.stats.map((s) => <th key={s.label} className="px-3 py-2 text-right whitespace-nowrap">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                {group.stats.map((s) => <td key={s.label} className="px-3 py-3 text-right font-black tabular-nums whitespace-nowrap">{s.value}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
function GameLogTable({ rows }: { rows: any[] }) {
  const statLabels = Array.from(new Set(rows.flatMap((r) => (r.stats || []).map((s: any) => s.label)))).slice(0, 10);
  return <div className="rounded-xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><table className="w-full text-xs min-w-[760px]"><thead><tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Opp</th>{statLabels.map((l) => <th key={l} className="text-right px-2 py-2 whitespace-nowrap">{l}</th>)}</tr></thead><tbody>{rows.map((r: any) => <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}><td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td><td className="px-3 py-2 whitespace-nowrap">{r.opponent || "—"}</td>{statLabels.map((l) => <td key={l} className="text-right px-2 py-2 tabular-nums whitespace-nowrap">{(r.stats || []).find((s: any) => s.label === l)?.value ?? "—"}</td>)}</tr>)}</tbody></table></div>;
}
function Empty({ text }: { text: string }) { return <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>{text}</div>; }
function initials(name: string) { return String(name || "").split(" ").map((n) => n[0]).slice(0, 2).join(""); }
function formatDate(date?: string) { if (!date) return "—"; const d = new Date(date); return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
