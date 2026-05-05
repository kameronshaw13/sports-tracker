"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

type NonPlayedKind = "postponed" | "canceled" | "suspended" | null;

type Props = {
  team: TeamConfig;
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
};

export default function Schedule({ team, onTeamLogoClick, onPlayerClick }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(`/api/scoreboard?team=${team.key}&_t=${freshKey}`, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5_000,
  });

  const events = useMemo(() => {
    const list = [...(data?.events || [])];
    list.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return list;
  }, [data?.events]);

  if (selected) {
    return (
      <GameDetail
        league={team.league}
        eventId={selected}
        onClose={() => setSelected(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  if (isLoading) return <SkeletonList />;
  if (error || !data?.events) return <ErrorBox message="Couldn't load schedule" />;

  const grouped: Record<string, any[]> = groupByMonth(events);

  return (
    <div className="-mx-4 sm:mx-0 cbs-panel-list">
      {Object.entries(grouped).map(([month, list]: [string, any[]]) => (
        <section key={month}>
          <div className="cbs-month-bar">
            <span>{month}</span>
          </div>
          <div className="cbs-table-panel">
            {list.map((ev: any) => (
              <ScheduleRow key={ev.id} ev={ev} team={team} onClick={() => setSelected(ev.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScheduleRow({ ev, team, onClick }: any) {
  const opp = ev.opponent;
  const state = ev.status?.state;
  const nonPlayed = classifyNonPlayed(ev.status);
  const isResult = state === "post";
  const isLive = state === "in";
  const statusLabel = nonPlayed ? nonPlayedLabel(nonPlayed) : isLive ? ev.status?.detail || "Live" : isResult ? "Final" : formatCentralTime(ev.date);
  const result = isResult && !nonPlayed ? (ev.us?.winner ? "W" : "L") : "";

  return (
    <button onClick={onClick} className="cbs-schedule-row w-full text-left">
      <div className="w-14 shrink-0 text-sm font-black leading-tight" style={{ color: "var(--text-2)" }}>
        <div>{weekday(ev.date)}</div>
        <div>{monthDay(ev.date)}</div>
      </div>
      <div className="w-7 text-center text-xl font-black" style={{ color: "var(--text-2)" }}>{ev.home ? "vs" : "@"}</div>
      <div className="w-10 h-10 flex items-center justify-center shrink-0">
        {opp?.logo && <Image src={opp.logo} alt={opp.abbr || opp.name || ""} width={36} height={36} className="object-contain logo-outline-dark" unoptimized />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-black truncate">{opp?.name || opp?.abbr}</div>
        {ev.weekText && <div className="text-xs font-bold truncate" style={{ color: "var(--text-3)" }}>{ev.weekText}</div>}
      </div>
      <div className="text-right shrink-0 min-w-[68px]">
        <div className="text-base font-black" style={{ color: isLive ? "var(--danger)" : "var(--text-2)" }}>{statusLabel}</div>
        {isResult && !nonPlayed && (
          <div className="text-sm font-black tabular-nums">
            <span style={{ color: ev.us?.winner ? "var(--success)" : "var(--danger)" }}>{result}</span>{" "}{ev.us?.score ?? "—"} - {opp?.score ?? "—"}
          </div>
        )}
        {!isResult && !nonPlayed && ev.broadcast && <div className="text-xs font-bold" style={{ color: "var(--text-3)" }}>{ev.broadcast}</div>}
      </div>
    </button>
  );
}

function groupByMonth(events: any[]) {
  return events.reduce((acc: Record<string, any[]>, ev) => {
    const d = new Date(ev.date);
    const key = Number.isNaN(d.getTime()) ? "Schedule" : d.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();
    (acc[key] ||= []).push(ev);
    return acc;
  }, {});
}

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
function nonPlayedLabel(kind: NonPlayedKind): string { return kind === "postponed" ? "Postponed" : kind === "canceled" ? "Canceled" : kind === "suspended" ? "Suspended" : ""; }
function weekday(iso: string) { const d = new Date(iso); return d.toLocaleDateString(undefined, { weekday: "short" }); }
function monthDay(iso: string) { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }); }
function formatCentralTime(iso: string) { const d = new Date(iso); return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).replace(" ", ""); }
function SkeletonList() { return <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }} />)}</div>; }
function ErrorBox({ message }: { message: string }) { return <div className="p-6 text-sm text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>{message}</div>; }
