"use client";

import Image from "next/image";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PlayerRef = { id: string; name: string; league: string; teamKey?: string };

type Props = {
  player: PlayerRef;
  onBack: () => void;
};

export default function PlayerDetail({ player, onBack }: Props) {
  const { data, error, isLoading } = useSWR(
    `/api/player?league=${player.league}&id=${player.id}${player.teamKey ? `&team=${player.teamKey}` : ""}`,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div className="p-6 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          Could not load this player yet.
        </div>
      </div>
    );
  }

  const profile = data?.profile || { name: player.name };
  const stats = data?.stats || [];
  const gameLog = data?.gameLog || [];

  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />

      <section className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
          {profile.headshot ? (
            <Image src={profile.headshot} alt={profile.name} width={80} height={80} className="object-cover" />
          ) : (
            <span className="text-xl font-black" style={{ color: "var(--text-3)" }}>{initials(profile.name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{player.league.toUpperCase()}</div>
          <h1 className="text-2xl font-black truncate">{profile.name || player.name}</h1>
          <div className="text-sm" style={{ color: "var(--text-2)" }}>
            {[profile.team, profile.position].filter(Boolean).join(" · ") || "Player profile"}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Bio" />
        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          {profile.bio || "Bio details are not available from ESPN yet."}
        </div>
      </section>

      <section>
        <SectionTitle title="Season stats" />
        {stats.length ? <StatsGrid groups={stats} /> : <Empty text="No season stats available yet." />}
      </section>

      <section>
        <SectionTitle title="Game log" subtitle="Most recent games first" />
        {gameLog.length ? <GameLogTable rows={gameLog} /> : <Empty text="No game log available yet." />}
      </section>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="text-sm font-semibold px-3 py-2 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      ← Back
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{title}</h2>
      {subtitle && <p className="text-xs" style={{ color: "var(--text-3)" }}>{subtitle}</p>}
    </div>
  );
}

function StatsGrid({ groups }: { groups: any[] }) {
  return (
    <div className="space-y-3">
      {groups.map((g, idx) => (
        <div key={`${g.name}-${idx}`} className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{g.name || "Stats"}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-px" style={{ background: "var(--border)" }}>
            {(g.stats || []).slice(0, 24).map((s: any) => (
              <div key={s.label} className="p-3" style={{ background: "var(--surface)" }}>
                <div className="text-[10px] font-bold uppercase" style={{ color: "var(--text-3)" }}>{pretty(s.label)}</div>
                <div className="text-base font-black tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GameLogTable({ rows }: { rows: any[] }) {
  const statLabels = Array.from(new Set(rows.flatMap((r) => (r.stats || []).slice(0, 5).map((s: any) => s.label)))).slice(0, 5);
  return (
    <div className="rounded-xl overflow-x-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <table className="w-full text-xs min-w-[520px]">
        <thead>
          <tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Opp</th>
            {statLabels.map((l) => <th key={l} className="text-right px-2 py-2">{pretty(l)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.opponent || "—"}</td>
              {statLabels.map((l) => <td key={l} className="text-right px-2 py-2 tabular-nums">{(r.stats || []).find((s: any) => s.label === l)?.value ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>{text}</div>;
}
function initials(name: string) { return String(name || "").split(" ").map((n) => n[0]).slice(0, 2).join(""); }
function pretty(s: string) { return String(s).replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()); }
function formatDate(date?: string) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
