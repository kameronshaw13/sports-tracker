"use client";

import Image from "next/image";
import type React from "react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  team: TeamConfig;
  mode?: "active" | "injured" | "transactions";
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey: string }) => void;
};

type InjuryView = {
  status: string;
  detail: string | null;
  longDetail: string | null;
  returnDate: string | null;
  date?: string | null;
  ilDesignation?: string | null;
};

type Player = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  positionAbbr?: string;
  headshot?: string;
  height?: string;
  isInjured?: boolean;
  statusLabel?: string | null;
  injury?: InjuryView | null;
};

type Transaction = {
  id: string;
  date?: string | null;
  playerName: string;
  playerId?: string | null;
  position?: string | null;
  headshot?: string | null;
  text: string;
  type?: string | null;
};

export default function Roster({ team, mode = "active", onPlayerClick }: Props) {
  const rosterUrl = `/api/roster?team=${team.key}`;
  const transactionsUrl = `/api/transactions?team=${team.key}`;
  const staticFeedOptions = {
    dedupingInterval: 300_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  };

  const { data, error, isLoading } = useSWR(mode === "transactions" ? null : rosterUrl, fetcher, staticFeedOptions);
  const { data: transactionsData, error: txError, isLoading: txLoading } = useSWR(
    mode === "transactions" ? transactionsUrl : null,
    fetcher,
    staticFeedOptions
  );

  if (mode === "transactions") {
    if (txLoading) return <RowsSkeleton />;
    if (txError || !transactionsData) return <EmptyMessage label="Couldn't load transactions" />;
    const transactions: Transaction[] = transactionsData.transactions || [];
    if (transactions.length === 0) return <EmptyMessage label="No recent transactions." />;
    return <TransactionList transactions={transactions} team={team} onPlayerClick={onPlayerClick} />;
  }

  if (isLoading) return <RowsSkeleton />;
  if (error || !data) return <EmptyMessage label="Couldn't load roster" />;

  const active: Player[] = data.active || [];
  const injured: Player[] = data.injured || [];
  const isCollege = team.league === "cfb" || team.league === "cbb";
  const tab = mode === "injured" && !isCollege ? "injured" : "active";

  if (tab === "injured") {
    if (injured.length === 0) return <EmptyMessage label="No injured players." />;
    return <InjuryList players={injured} team={team} onPlayerClick={onPlayerClick} />;
  }

  if (active.length === 0) return <EmptyMessage label="No roster players." />;
  return <RosterTable players={active} team={team} onPlayerClick={onPlayerClick} />;
}

function RowsSkeleton() {
  return (
    <div className="team-feed-panel -mx-4 sm:mx-0">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="team-feed-row animate-pulse">
          <div className="team-feed-avatar" style={{ background: "var(--surface-2)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 rounded" style={{ background: "var(--surface-2)" }} />
            <div className="h-3 w-52 rounded" style={{ background: "var(--surface-2)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyMessage({ label }: { label: string }) {
  return (
    <div className="team-feed-empty -mx-4 sm:mx-0">
      {label}
    </div>
  );
}

function RosterTable({ players, team, onPlayerClick }: { players: Player[]; team: TeamConfig; onPlayerClick?: Props["onPlayerClick"] }) {
  const sorted = useMemo(() => [...players].sort((a, b) => rosterSortName(a.name).localeCompare(rosterSortName(b.name))), [players]);

  return (
    <div className="team-roster-modern -mx-4 sm:mx-0">
      <div className="team-roster-table-head">
        <div>#</div>
        <div className="team-roster-player-head">PLAYER</div>
        <div>POSITION</div>
      </div>
      <div className="team-roster-table-body">
        {sorted.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={onPlayerClick ? () => onPlayerClick({ id: player.id, name: player.name, league: team.league, teamKey: team.key }) : undefined}
            className="team-roster-table-row"
          >
            <div className="team-roster-number">{player.jersey || "—"}</div>
            <div className="team-roster-player-cell">
              <Headshot player={player} size={36} />
              <span>{formatRosterName(player.name)}</span>
            </div>
            <div className="team-roster-position">{player.positionAbbr || player.position || "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InjuryList({ players, team, onPlayerClick }: { players: Player[]; team: TeamConfig; onPlayerClick?: Props["onPlayerClick"] }) {
  const grouped = groupByDate(players.map((player) => ({
    id: player.id,
    date: player.injury?.date || null,
    renderKey: player.id,
    node: (
      <button
        type="button"
        onClick={onPlayerClick ? () => onPlayerClick({ id: player.id, name: player.name, league: team.league, teamKey: team.key }) : undefined}
        className="team-feed-row team-injury-row"
      >
        <Headshot player={player} size={46} />
        <div className="min-w-0 flex-1">
          <div className="team-feed-title"><span>{player.name}</span>{(player.positionAbbr || player.position) && <em>{player.positionAbbr || player.position}</em>}</div>
          <div className="team-feed-subtitle">{injuryLine(player)}</div>
        </div>
      </button>
    ),
  })));

  return <DatedFeed groups={grouped} fallbackLabel="INJURIES" />;
}

function TransactionList({ transactions, team, onPlayerClick }: { transactions: Transaction[]; team: TeamConfig; onPlayerClick?: Props["onPlayerClick"] }) {
  const grouped = groupByDate(transactions.map((tx) => ({
    id: tx.id,
    date: tx.date || null,
    renderKey: tx.id,
    node: (
      <button
        type="button"
        onClick={onPlayerClick && tx.playerId ? () => onPlayerClick({ id: String(tx.playerId), name: tx.playerName, league: team.league, teamKey: team.key }) : undefined}
        className="team-feed-row team-transaction-row"
      >
        <Headshot player={{ id: tx.playerId || tx.id, name: tx.playerName, headshot: tx.headshot || undefined }} size={46} />
        <div className="min-w-0 flex-1">
          <div className="team-feed-title"><span>{tx.playerName}</span>{tx.position && <em>{tx.position}</em>}</div>
          <div className="team-feed-subtitle">{tx.text}</div>
        </div>
      </button>
    ),
  })));

  return <DatedFeed groups={grouped} fallbackLabel="TRANSACTIONS" />;
}

function DatedFeed({ groups, fallbackLabel }: { groups: { label: string; items: { renderKey: string; node: React.ReactNode }[] }[]; fallbackLabel: string }) {
  return (
    <div className="team-feed-list -mx-4 sm:mx-0">
      {groups.map((group) => (
        <section key={group.label}>
          <div className="team-feed-date">{group.label || fallbackLabel}</div>
          <div className="team-feed-panel">
            {group.items.map((item) => <div key={item.renderKey}>{item.node}</div>)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Headshot({ player, size }: { player: Pick<Player, "name" | "headshot" | "id">; size: number }) {
  const [failed, setFailed] = useState(false);
  const initials = player.name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="team-feed-avatar" style={{ width: size, height: size }}>
      {player.headshot && !failed ? (
        <Image
          src={player.headshot}
          alt={player.name}
          width={size}
          height={size}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials || "—"}</span>
      )}
    </div>
  );
}

function injuryLine(player: Player): string {
  const inj = player.injury;
  const status = cleanupSentence(inj?.ilDesignation || inj?.status || player.statusLabel || "Injured");
  const detail = cleanupInjuryDetail(inj?.detail || inj?.longDetail || "");

  return [detail, status].filter(Boolean).join(", ");
}

function cleanupInjuryDetail(value: string): string {
  let text = cleanupSentence(value);
  text = text
    .replace(/\b(expected|out)\b.*$/i, "")
    .replace(/\bwill\b.*$/i, "")
    .replace(/\bat least\b.*$/i, "")
    .replace(/\s*,\s*$/g, "")
    .trim();
  if (text.includes(",")) text = text.split(",")[0].trim();
  if (text.length > 28) {
    const short = text.match(/\b(shoulder|elbow|forearm|wrist|hand|finger|thumb|back|hip|groin|hamstring|quad|knee|ankle|foot|toe|calf|neck|oblique|concussion|illness)\b/i);
    if (short) text = short[0];
  }
  return cleanupSentence(text);
}

function cleanupSentence(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function groupByDate<T extends { date?: string | null; renderKey: string; node: React.ReactNode }>(items: T[]) {
  const map = new Map<string, { sortTime: number; rows: T[] }>();
  for (const item of items) {
    const label = dateHeader(item.date);
    const sortTime = dateSortTime(item.date);
    if (!map.has(label)) map.set(label, { sortTime, rows: [] });
    const group = map.get(label)!;
    group.sortTime = Math.max(group.sortTime, sortTime);
    group.rows.push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].sortTime - a[1].sortTime)
    .map(([label, group]) => ({ label, items: group.rows }));
}

function dateHeader(value?: string | null): string {
  if (!value) return "RECENT";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value).toUpperCase();
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function dateSortTime(value?: string | null): number {
  if (!value) return -Infinity;
  const d = new Date(value);
  return isNaN(d.getTime()) ? -Infinity : d.getTime();
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rosterSortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
}

function formatRosterName(name: string): string {
  if (name.includes(",")) return name;
  const suffixes = new Set(["Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV", "V"]);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  let suffix = "";
  if (suffixes.has(parts[parts.length - 1])) suffix = ` ${parts.pop()}`;
  const last = parts.pop();
  return `${last}, ${parts.join(" ")}${suffix}`;
}
