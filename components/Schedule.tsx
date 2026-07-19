"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";
import { GameNavTarget, warmGameSummary } from "@/lib/gamePrefetch";
import GameDetail from "./GameDetail";
import OutlinedLogo from "./OutlinedLogo";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

type NonPlayedKind = "postponed" | "canceled" | "suspended" | null;

type Props = {
  team: TeamConfig;
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
  onOpenGame?: (game: { league: string; eventId: string }) => void;
  onWarmGame?: (game: { league: string; eventId: string }) => void;
};

export default function Schedule({ team, onTeamLogoClick, onPlayerClick, onOpenGame, onWarmGame }: Props) {
  const [selected, setSelected] = useState<GameNavTarget | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const freshKey = useFreshKey();
  const { mutate } = useSWRConfig();
  const useMonthPaging = team.league === "mlb" || team.league === "nba" || team.league === "nhl";
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

  const grouped: Record<string, any[]> = groupByMonth(events);
  const monthKeys = Object.keys(grouped);

  useEffect(() => {
    if (!useMonthPaging) return;
    if (monthKeys.length === 0) return;
    const currentMonth = monthKey(new Date());
    const upcoming = events.find((ev: any) => new Date(ev.date).getTime() >= Date.now());
    const nextMonth = upcoming ? monthKey(new Date(upcoming.date)) : null;
    const preferred = monthKeys.includes(currentMonth)
      ? currentMonth
      : nextMonth && monthKeys.includes(nextMonth)
        ? nextMonth
        : monthKeys[0];

    if (!selectedMonth || !monthKeys.includes(selectedMonth)) {
      setSelectedMonth(preferred);
    }
  }, [events, monthKeys, selectedMonth, useMonthPaging]);

  if (selected) {
    return (
      <GameDetail
        league={selected.league}
        eventId={selected.eventId}
        freshKeyOverride={selected.freshKey}
        onClose={() => setSelected(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  if (isLoading) return <SkeletonList />;
  if (error || !data?.events) return <ErrorBox message="Couldn't load schedule" />;

  const activeMonth = selectedMonth && grouped[selectedMonth] ? selectedMonth : monthKeys[0];
  const activeIndex = Math.max(0, monthKeys.indexOf(activeMonth));
  const activeList = useMonthPaging ? (activeMonth ? grouped[activeMonth] || [] : []) : events;
  const phaseGroups = groupBySeasonPhase(activeList);

  return (
    <div className="-mx-4 sm:mx-0 cbs-panel-list">
      {useMonthPaging && (
        <div className="team-month-toggle">
          <button
            onClick={() => setSelectedMonth(monthKeys[Math.max(0, activeIndex - 1)])}
            disabled={activeIndex <= 0}
            aria-label="Previous month"
          >
            ←
          </button>
          <div>{activeMonth || "Schedule"}</div>
          <button
            onClick={() => setSelectedMonth(monthKeys[Math.min(monthKeys.length - 1, activeIndex + 1)])}
            disabled={activeIndex >= monthKeys.length - 1}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      )}
      <section key={useMonthPaging ? activeMonth : "full-schedule"}>
        <div className="cbs-table-panel">
          {phaseGroups.map((phase) => (
            <Fragment key={phase.id}>
              <div className="team-schedule-phase-heading">{phase.label}</div>
              {phase.events.map((ev: any) => (
                <ScheduleRow
                  key={ev.id}
                  ev={ev}
                  team={team}
                  onWarm={() => onWarmGame?.({ league: team.league, eventId: ev.id })}
                  onClick={() => {
                    if (onOpenGame) {
                      onOpenGame({ league: team.league, eventId: ev.id });
                      return;
                    }
                    setSelected(warmGameSummary(mutate, { league: team.league, eventId: ev.id }));
                  }}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleRow({ ev, team, onClick, onWarm }: any) {
  const opp = ev.opponent;
  const opponentLabel = scheduleOpponentLabel(team?.league, opp);
  const state = ev.status?.state;
  const nonPlayed = classifyNonPlayed(ev.status);
  const isResult = state === "post";
  const isLive = state === "in";
  const statusLabel = nonPlayed ? nonPlayedLabel(nonPlayed) : isLive ? ev.status?.detail || "Live" : isResult ? "Final" : formatCentralTime(ev.date);
  const result = isResult && !nonPlayed ? (ev.us?.winner ? "W" : "L") : "";

  return (
    <button onClick={onClick} onPointerDown={onWarm} className="cbs-schedule-row team-schedule-row w-full text-left">
      <div className="team-schedule-date shrink-0 text-sm font-black leading-tight" style={{ color: "var(--text-2)" }}>
        <div>{weekday(ev.date)}</div>
        <div>{monthDay(ev.date)}</div>
      </div>
      <div className="team-schedule-at text-center font-black" style={{ color: "var(--text-2)" }}>{ev.home ? "vs" : "@"}</div>
      <div className="team-schedule-logo flex items-center justify-center shrink-0">
        {opp?.logo && <OutlinedLogo src={opp.logo} alt={opp.abbr || opp.name || ""} size={28} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="team-schedule-opponent font-black truncate">{opponentLabel}</div>
      </div>
      <div className="team-schedule-status text-right shrink-0">
        <div className="font-black" style={{ color: isLive ? "var(--danger)" : "var(--text-2)" }}>{statusLabel}</div>
        {isResult && !nonPlayed && (
          <div className="font-black tabular-nums">
            <span style={{ color: ev.us?.winner ? "var(--success)" : "var(--danger)" }}>{result}</span>{" "}{ev.us?.score ?? "—"} - {opp?.score ?? "—"}
          </div>
        )}
        {!isResult && !nonPlayed && ev.broadcast && <div className="text-xs font-bold" style={{ color: "var(--text-3)" }}>{ev.broadcast}</div>}
      </div>
    </button>
  );
}

function scheduleOpponentLabel(league: string, opponent: any) {
  if (!opponent) return "";
  const isCollege = league === "cfb" || league === "cbb";
  const shortName = cleanName(opponent.shortName);
  const nickname = cleanName(opponent.nickname);
  const location = cleanName(opponent.location);
  const fullName = cleanName(opponent.name);
  const abbr = cleanName(opponent.abbr);

  if (isCollege) {
    return shortName || location || stripCollegeNickname(fullName) || abbr;
  }

  return nickname || shortName || stripProLocation(fullName) || abbr;
}

function cleanName(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripCollegeNickname(name: string) {
  return cleanName(name)
    .replace(/\s+(Longhorns|Wildcats|Jayhawks|Sooners|Cowboys|Red Raiders|Bears|Horned Frogs|Cougars|Utes|Mountaineers|Sun Devils|Buffaloes|Cyclones|Knights)$/i, "")
    .replace(/\s+(Crimson Tide|Razorbacks|Tigers|Gators|Bulldogs|Aggies|Rebels|Gamecocks|Volunteers|Commodores|Wildcats|Sooners)$/i, "")
    .replace(/\s+(Buckeyes|Wolverines|Spartans|Nittany Lions|Hoosiers|Hawkeyes|Terrapins|Golden Gophers|Cornhuskers|Scarlet Knights|Badgers|Ducks|Huskies|Bruins|Trojans|Boilermakers|Fighting Illini)$/i, "")
    .replace(/\s+(Hurricanes|Seminoles|Cardinals|Blue Devils|Tar Heels|Wolfpack|Yellow Jackets|Panthers|Mustangs|Orange|Cavaliers|Hokies|Demon Deacons)$/i, "")
    .replace(/\s+(Fighting Irish|Runnin'? Rebels|Golden Eagles|Green Wave|Thundering Herd|Rainbow Warriors|Black Knights|Blue Hens|Roadrunners|Minutemen|Aztecs|Lobos|Rockets|Bobcats|Cardinals|Falcons|Chippewas|Broncos|Zips)$/i, "")
    .trim();
}

function stripProLocation(name: string) {
  const full = cleanName(name);
  if (!full) return "";
  const locations = [
    "Arizona", "Atlanta", "Baltimore", "Boston", "Brooklyn", "Buffalo", "Calgary", "Carolina", "Charlotte", "Chicago", "Cincinnati", "Cleveland", "Colorado", "Columbus", "Dallas", "Denver", "Detroit", "Edmonton", "Florida", "Golden State", "Green Bay", "Houston", "Indiana", "Indianapolis", "Jacksonville", "Kansas City", "Las Vegas", "Los Angeles", "Memphis", "Miami", "Milwaukee", "Minnesota", "Montreal", "Nashville", "New England", "New Jersey", "New Orleans", "New York", "Oklahoma City", "Orlando", "Ottawa", "Philadelphia", "Phoenix", "Pittsburgh", "Portland", "Sacramento", "San Antonio", "San Diego", "San Francisco", "San Jose", "Seattle", "St. Louis", "Tampa Bay", "Tennessee", "Texas", "Toronto", "Utah", "Vancouver", "Vegas", "Washington", "Winnipeg"
  ].sort((a, b) => b.length - a.length);
  const location = locations.find((item) => full.toLowerCase().startsWith(`${item.toLowerCase()} `));
  return location ? full.slice(location.length).trim() : full.split(/\s+/).slice(1).join(" ") || full;
}

function groupByMonth(events: any[]) {
  return events.reduce((acc: Record<string, any[]>, ev) => {
    const d = new Date(ev.date);
    const key = Number.isNaN(d.getTime()) ? "Schedule" : monthKey(d);
    (acc[key] ||= []).push(ev);
    return acc;
  }, {});
}

function groupBySeasonPhase(events: any[]) {
  const phases = [
    { id: "preseason", label: "Preseason", type: 1 },
    { id: "regular", label: "Regular Season", type: 2 },
    { id: "playoffs", label: "Playoffs", type: 3 },
  ];
  return phases
    .map((phase) => ({
      ...phase,
      events: events.filter((event) => Number(event?.seasonType || (event?.playoff ? 3 : 2)) === phase.type),
    }))
    .filter((phase) => phase.events.length > 0);
}

function monthKey(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();
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
