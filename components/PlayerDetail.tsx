"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PlayerRef = { id: string; name: string; league: string; teamKey?: string };
type Props = { player: PlayerRef; onBack: () => void };

type Tab = "stats" | "gamelog";

export default function PlayerDetail({ player, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("stats");
  const { data, error, isLoading } = useSWR(
    `/api/player?league=${player.league}&id=${player.id}${player.teamKey ? `&team=${player.teamKey}` : ""}&name=${encodeURIComponent(player.name || "")}`,
    fetcher
  );

  if (isLoading) return <Loading onBack={onBack} />;
  if (error || data?.error) return <ErrorState onBack={onBack} />;

  const profile = data?.profile || { name: player.name };
  const stats = data?.stats || [];
  const gameLog = data?.gameLog || [];
  const displayName = profile.name || player.name;

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      <section className="rounded-2xl p-5 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="w-24 h-24 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
          {profile.headshot ? (
            <Image src={profile.headshot} alt={displayName} width={96} height={96} className="object-cover" unoptimized />
          ) : (
            <span className="text-2xl font-black" style={{ color: "var(--text-3)" }}>{initials(displayName)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{player.league.toUpperCase()}</div>
          <h1 className="text-3xl font-black leading-tight truncate">{displayName}</h1>
          <div className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
            {[profile.team, profile.position].filter(Boolean).join(" · ") || "Player profile"}
          </div>
          {profile.bio && <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{profile.bio}</div>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
        <TabButton label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
        <TabButton label="Game Log" active={tab === "gamelog"} onClick={() => setTab("gamelog")} />
      </div>

      {tab === "stats" && (stats.length ? <StatsRowTable stats={stats} /> : <Empty text="No current-season stats available yet." />)}
      {tab === "gamelog" && (gameLog.length ? <GameLogTable rows={gameLog} /> : <Empty text="No current-season game log available yet." />)}
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
  return <button onClick={onBack} className="text-sm font-semibold px-3 py-2 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>←</button>;
}
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: active ? "var(--surface)" : "transparent", border: active ? "1px solid var(--border)" : "1px solid transparent", color: active ? "var(--text)" : "var(--text-2)" }}>{label}</button>;
}
function StatsRowTable({ stats }: { stats: any[] }) {
  return (
    <div className="rounded-xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <table className="w-full min-w-[680px] text-xs">
        <thead>
          <tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
            {stats.map((s: any) => <th key={s.label} className="px-3 py-2 text-right whitespace-nowrap">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderTop: "1px solid var(--border)" }}>
            {stats.map((s: any) => <td key={s.label} className="px-3 py-3 text-right font-black tabular-nums whitespace-nowrap">{s.value}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function GameLogTable({ rows }: { rows: any[] }) {
  const statLabels = Array.from(new Set(rows.flatMap((r) => (r.stats || []).map((s: any) => s.label)))).slice(0, 8);
  return <div className="rounded-xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}><table className="w-full text-xs min-w-[720px]"><thead><tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Opp</th>{statLabels.map((l) => <th key={l} className="text-right px-2 py-2 whitespace-nowrap">{l}</th>)}</tr></thead><tbody>{rows.map((r: any) => <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}><td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td><td className="px-3 py-2 whitespace-nowrap">{r.opponent || "—"}</td>{statLabels.map((l) => <td key={l} className="text-right px-2 py-2 tabular-nums whitespace-nowrap">{(r.stats || []).find((s: any) => s.label === l)?.value ?? "—"}</td>)}</tr>)}</tbody></table></div>;
}
function Empty({ text }: { text: string }) { return <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>{text}</div>; }
function initials(name: string) { return String(name || "").split(" ").map((n) => n[0]).slice(0, 2).join(""); }
function formatDate(date?: string) { if (!date) return "—"; const d = new Date(date); return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
