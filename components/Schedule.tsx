"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";
import GameDetail from "./GameDetail";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

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
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
};

export default function Schedule({ team, onTeamLogoClick, onPlayerClick }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const hasAutoScrolled = useRef(false);
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    `/api/scoreboard?team=${team.key}&_t=${freshKey}`,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5_000,
    }
  );

  const events = useMemo(() => {
    const list = [...(data?.events || [])];
    list.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return list;
  }, [data?.events]);

  const focusIndex = useMemo(() => {
    if (!events.length) return -1;
    const liveIdx = events.findIndex((e: any) => e.status?.state === "in");
    if (liveIdx >= 0) return liveIdx;
    const nextIdx = events.findIndex((e: any) => e.status?.state === "pre");
    if (nextIdx >= 0) return nextIdx;
    return events.length - 1;
  }, [events]);

  useEffect(() => {
    hasAutoScrolled.current = false;
  }, [team.key]);

  useEffect(() => {
    if (hasAutoScrolled.current || !focusRef.current || isLoading) return;
    hasAutoScrolled.current = true;
    setTimeout(() => {
      const box = scrollBoxRef.current;
      const focus = focusRef.current;
      if (!box || !focus) return;
      const targetTop = Math.max(0, focus.offsetTop - Math.min(220, Math.round(box.clientHeight * 0.35)));
      box.scrollTo({ top: targetTop, behavior: "smooth" });
    }, 150);
  }, [focusIndex, isLoading]);

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

  const pastCount = events.filter((e: any) => e.status?.state === "post").length;
  const futureCount = events.filter((e: any) => e.status?.state === "pre").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            Full schedule
          </h2>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Scroll up for past results · scroll down for the rest of the season
          </p>
        </div>
        <div className="text-xs text-right" style={{ color: "var(--text-3)" }}>
          {pastCount} results<br />{futureCount} upcoming
        </div>
      </div>

      <div ref={scrollBoxRef} className="rounded-xl overflow-y-auto overscroll-contain max-h-[64vh]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {events.map((ev: any, idx: number) => {
          const variant = ev.status?.state === "in" ? "live" : ev.status?.state === "post" ? "result" : "upcoming";
          const isFocus = idx === focusIndex;
          return (
            <div key={ev.id} ref={isFocus ? focusRef : undefined}>
              {isFocus && <FocusLabel variant={variant} />}
              <GameRow ev={ev} team={team} variant={variant} focused={isFocus} onClick={() => setSelected(ev.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FocusLabel({ variant }: { variant: "live" | "result" | "upcoming" }) {
  const label = variant === "live" ? "Live now" : variant === "upcoming" ? "Next game" : "Latest result";
  return (
    <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
      {label}
    </div>
  );
}

function GameRow({ ev, team, variant, focused, onClick }: any) {
  const opp = ev.opponent;
  const won = ev.us?.winner;
  const nonPlayed: NonPlayedKind = variant === "result" ? classifyNonPlayed(ev.status) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: "var(--border)", boxShadow: focused ? `inset 3px 0 0 ${team.primary}` : undefined }}
    >
      <div className="w-14 flex-shrink-0 text-xs font-semibold" style={{ color: "var(--text-3)" }}>
        <div>{formatDate(ev.date).split(",")[0]}</div>
        <div>{new Date(ev.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      </div>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
        {opp?.logo && <Image src={opp.logo} alt={opp.abbr} width={28} height={28} className="object-contain" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          <span style={{ color: "var(--text-3)" }}>{ev.home ? "vs" : "@"}</span>
          <span className="truncate">{opp?.name}</span>
          {ev.playoff && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: team.primary, color: team.textOnPrimary }}>
              Playoffs
            </span>
          )}
        </div>
        <div className="text-xs" style={{ color: "var(--text-3)" }}>
          {variant === "upcoming" ? formatTime(ev.date) : ev.status?.detail || formatTime(ev.date)}
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
            <div className="text-xs font-semibold" style={{ color: team.primary }}>{ev.status?.detail || "Live"}</div>
          </>
        )}
        {variant === "result" && nonPlayed && (
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md inline-block" style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
            {nonPlayedLabel(nonPlayed)}
          </span>
        )}
        {variant === "result" && !nonPlayed && (
          <>
            <div className="text-base font-bold tabular-nums">
              {ev.us?.score ?? "—"}<span style={{ color: "var(--text-3)" }}> – </span>{opp?.score ?? "—"}
            </div>
            <div className="text-xs font-semibold" style={{ color: won ? "var(--success)" : "var(--danger)" }}>{won ? "W" : "L"}</div>
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
      {[...Array(8)].map((_, i) => (
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
