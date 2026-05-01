"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// v18: detect non-played results.
type NonPlayedKind = "postponed" | "canceled" | "suspended" | null;

function classifyNonPlayed(status: any): NonPlayedKind {
  const name = String(status?.statusName || "").toUpperCase();
  if (name === "STATUS_POSTPONED") return "postponed";
  if (name === "STATUS_CANCELED" || name === "STATUS_CANCELLED") return "canceled";
  if (name === "STATUS_SUSPENDED") return "suspended";
  const text = `${status?.description || ""} ${status?.detail || ""}`.toLowerCase();
  if (text.includes("postpon")) return "postponed";
  if (text.includes("cancel")) return "canceled";
  if (text.includes("suspend")) return "suspended";
  return null;
}

function nonPlayedLabel(kind: NonPlayedKind): string {
  switch (kind) {
    case "postponed": return "Postponed";
    case "canceled": return "Canceled";
    case "suspended": return "Suspended";
    default: return "";
  }
}

type Props = {
  team: TeamConfig;
  onTeamLogoClick?: (league: string, abbr: string) => void;
};

// v21.1: freshKey appended to URL so each mount busts the route cache.
export default function Schedule({ team, onTeamLogoClick }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    `/api/scoreboard?team=${team.key}&_t=${freshKey}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  if (selected) {
    return (
      <GameDetail
        league={team.league}
        eventId={selected}
        onClose={() => setSelected(null)}
        onTeamClick={onTeamLogoClick}
      />
    );
  }

  if (isLoading) return <SkeletonList />;
  if (error || !data?.events) return <ErrorBox message="Couldn't load schedule" />;

  const events = data.events;
  const inProgress = events.filter((e: any) => e.status?.state === "in");
  const upcoming = events.filter((e: any) => e.status?.state === "pre");
  const completed = events.filter((e: any) => e.status?.state === "post").reverse();

  return (
    <div className="space-y-6">
      {inProgress.length > 0 && (
        <Section title="Live now" accent={team.primary}>
          {inProgress.map((ev: any) => (
            <GameRow key={ev.id} ev={ev} team={team} variant="live" onClick={() => setSelected(ev.id)} />
          ))}
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title={`Upcoming (${upcoming.length})`}>
          {upcoming.slice(0, 12).map((ev: any) => (
            <GameRow key={ev.id} ev={ev} team={team} variant="upcoming" onClick={() => setSelected(ev.id)} />
          ))}
        </Section>
      )}
      {completed.length > 0 && (
        <Section title="Recent results">
          {completed.slice(0, 25).map((ev: any) => (
            <GameRow key={ev.id} ev={ev} team={team} variant="result" onClick={() => setSelected(ev.id)} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, accent }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {accent && <span className="w-2 h-2 rounded-full live-dot" style={{ background: accent }} />}
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          {title}
        </h2>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function GameRow({ ev, team, variant, onClick }: any) {
  const opp = ev.opponent;
  const won = ev.us?.winner;
  const nonPlayed: NonPlayedKind = variant === "result" ? classifyNonPlayed(ev.status) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
        {opp?.logo && <Image src={opp.logo} alt={opp.abbr} width={28} height={28} className="object-contain" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <span style={{ color: "var(--text-3)" }}>{ev.home ? "vs" : "@"}</span>
          <span className="truncate">{opp?.name}</span>
          {ev.playoff && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: team.primary, color: team.textOnPrimary }}>
              Playoffs
            </span>
          )}
        </div>
        <div className="text-xs" style={{ color: "var(--text-3)" }}>
          {formatDate(ev.date)}
          {variant === "upcoming" && ` · ${formatTime(ev.date)}`}
          {ev.broadcast && ` · ${ev.broadcast}`}
          {ev.weekText && ` · ${ev.weekText}`}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        {variant === "live" && (
          <>
            <div className="text-base font-bold tabular-nums">
              {ev.us?.score ?? 0}<span style={{ color: "var(--text-3)" }}> – </span>{opp?.score ?? 0}
            </div>
            <div className="text-xs font-semibold" style={{ color: team.primary }}>
              {ev.status?.detail || "Live"}
            </div>
          </>
        )}
        {variant === "result" && nonPlayed && (
          <span
            className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md inline-block"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
            }}
          >
            {nonPlayedLabel(nonPlayed)}
          </span>
        )}
        {variant === "result" && !nonPlayed && (
          <>
            <div className="text-base font-bold tabular-nums">
              {ev.us?.score ?? "—"}<span style={{ color: "var(--text-3)" }}> – </span>{opp?.score ?? "—"}
            </div>
            <div className="text-xs font-semibold" style={{ color: won ? "var(--success)" : "var(--danger)" }}>
              {won ? "W" : "L"}
            </div>
          </>
        )}
        {variant === "upcoming" && (
          <div className="text-xs font-medium px-2 py-1 rounded-md" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
            {formatTime(ev.date)}
          </div>
        )}
      </div>
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      ))}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {message}
    </div>
  );
}
