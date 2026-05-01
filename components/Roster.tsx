"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

type InjuryView = {
  status: string;
  detail: string | null;
  longDetail: string | null;
  returnDate: string | null;
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

type PositionGroup = { id: string; label: string; players: Player[] };

// v21 Roster: Tab 1 (Active) → position-grouped sections, Tab 2 (Injured) →
// flat list with injury narrative. v21.1 adds freshKey for refresh-on-mount.
export default function Roster({ team }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    `/api/roster?team=${team.key}&_t=${freshKey}`,
    fetcher
  );
  const [tab, setTab] = useState<"active" | "injured">("active");
  const [filter, setFilter] = useState("");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-xl animate-pulse"
            style={{ background: "var(--surface)" }}
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="p-6 rounded-xl text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        Couldn't load roster
      </div>
    );
  }

  const positionGroups: PositionGroup[] = data.positionGroups || [];
  const active: Player[] = data.active || [];
  const injured: Player[] = data.injured || [];

  const filterText = filter.trim().toLowerCase();
  const matches = (p: Player) =>
    !filterText ||
    p.name.toLowerCase().includes(filterText) ||
    (p.position || "").toLowerCase().includes(filterText) ||
    (p.positionAbbr || "").toLowerCase().includes(filterText) ||
    (p.jersey || "").includes(filterText);

  const filteredGroups = positionGroups
    .map((g) => ({ ...g, players: g.players.filter(matches) }))
    .filter((g) => g.players.length > 0);

  const filteredInjured = injured.filter(matches);

  const showInjuredTab = injured.length > 0;

  if (tab === "injured" && !showInjuredTab) {
    Promise.resolve().then(() => setTab("active"));
  }

  return (
    <div>
      {showInjuredTab && (
        <div
          className="inline-flex p-1 rounded-xl mb-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          role="tablist"
        >
          <TabButton
            label={`Active (${active.length})`}
            isActive={tab === "active"}
            onClick={() => setTab("active")}
          />
          <TabButton
            label={`Injured (${injured.length})`}
            isActive={tab === "injured"}
            onClick={() => setTab("injured")}
          />
        </div>
      )}

      <input
        type="text"
        placeholder={`Search ${tab === "active" ? "players" : "injured players"}...`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-3 px-4 py-2 rounded-xl text-sm outline-none"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      />

      {tab === "active" && (
        <>
          {filteredGroups.length === 0 ? (
            <EmptyMessage filter={filter} kind="active" />
          ) : (
            <div className="space-y-5">
              {filteredGroups.map((group) => (
                <PositionSection
                  key={group.id}
                  label={group.label}
                  count={group.players.length}
                  showHeader={positionGroups.length > 1}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.players.map((p) => (
                      <ActivePlayerCard key={p.id} player={p} />
                    ))}
                  </div>
                </PositionSection>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "injured" && (
        <>
          {filteredInjured.length === 0 ? (
            <EmptyMessage filter={filter} kind="injured" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredInjured.map((p) => (
                <InjuredPlayerCard key={p.id} player={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
      style={{
        background: isActive ? "var(--text)" : "transparent",
        color: isActive ? "var(--bg)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );
}

function EmptyMessage({ filter, kind }: { filter: string; kind: "active" | "injured" }) {
  return (
    <div
      className="p-6 rounded-xl text-sm text-center"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      {filter
        ? `No ${kind} players match "${filter}"`
        : `No ${kind} players.`}
    </div>
  );
}

function PositionSection({
  label,
  count,
  showHeader,
  children,
}: {
  label: string;
  count: number;
  showHeader: boolean;
  children: React.ReactNode;
}) {
  if (!showHeader) return <>{children}</>;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <h4
          className="text-xs uppercase tracking-widest font-bold"
          style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
        >
          {label}
        </h4>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "var(--surface)", color: "var(--text-3)" }}
        >
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function ActivePlayerCard({ player }: { player: Player }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <Headshot player={player} size={48} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{player.name}</div>
        <div
          className="text-xs flex items-center gap-2 mt-0.5"
          style={{ color: "var(--text-3)" }}
        >
          {player.jersey && <span>#{player.jersey}</span>}
          {player.positionAbbr && <span>· {player.positionAbbr}</span>}
          {player.height && <span>· {player.height}</span>}
        </div>
      </div>
    </div>
  );
}

function InjuredPlayerCard({ player }: { player: Player }) {
  const inj = player.injury;
  const badgeLabel = inj?.ilDesignation || inj?.status || player.statusLabel || "Injured";
  const colors = severityFor(badgeLabel);

  const pieces: string[] = [];
  if (inj?.detail) pieces.push(inj.detail);
  if (inj?.returnDate) pieces.push(`Expected back ${formatReturnDate(inj.returnDate)}`);

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <Headshot player={player} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold truncate flex-1 min-w-0">
            {player.name}
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              background: colors.bg,
              color: colors.fg,
              border: `1px solid ${colors.border}`,
            }}
          >
            {badgeLabel}
          </span>
        </div>
        <div
          className="text-xs flex items-center gap-2 mt-0.5"
          style={{ color: "var(--text-3)" }}
        >
          {player.jersey && <span>#{player.jersey}</span>}
          {player.positionAbbr && <span>· {player.positionAbbr}</span>}
        </div>
        {pieces.length > 0 && (
          <div
            className="text-[12px] mt-1 leading-snug"
            style={{ color: "var(--text-2)" }}
          >
            {pieces.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function Headshot({ player, size }: { player: Player; size: number }) {
  const [failed, setFailed] = useState(false);
  const initials = player.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        background: "var(--surface-2)",
        width: size,
        height: size,
      }}
    >
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
        <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
          {initials}
        </span>
      )}
    </div>
  );
}

function severityFor(label: string): { bg: string; fg: string; border: string } {
  const l = label.toLowerCase();
  if (
    l.includes("out") ||
    l.includes("ir") ||
    l.includes("il") ||
    l.includes("injured reserve") ||
    l.includes("season") ||
    l.includes("suspend")
  ) {
    return {
      bg: "rgba(239, 68, 68, 0.12)",
      fg: "#dc2626",
      border: "rgba(239, 68, 68, 0.35)",
    };
  }
  if (l.includes("doubtful")) {
    return {
      bg: "rgba(249, 115, 22, 0.12)",
      fg: "#ea580c",
      border: "rgba(249, 115, 22, 0.35)",
    };
  }
  if (l.includes("day") || l.includes("questionable") || l.includes("probable")) {
    return {
      bg: "rgba(245, 158, 11, 0.12)",
      fg: "#b45309",
      border: "rgba(245, 158, 11, 0.35)",
    };
  }
  return {
    bg: "var(--surface-2)",
    fg: "var(--text-2)",
    border: "var(--border)",
  };
}

function formatReturnDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
