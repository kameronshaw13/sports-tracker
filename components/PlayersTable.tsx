"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Section } from "@/lib/playerColumns";
import { fmtAvg, fmtPct, fmtRate2, fmtDecimal1, fmtCount } from "@/lib/format";

type Stat = { value: number | null; displayValue: string };

export type Player = {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  primaryPosition?: string;
  pitchingRole?: "SP" | "RP";
  headshot?: string;
  hasStats: boolean;
  // v20: trade-in detection — set true for players who joined this team
  // mid-season. Adds an asterisk next to the name and a footnote.
  tradedIn?: boolean;
  tradedInDetail?: string; // e.g. "45 G with PHI"
  stats: Record<string, Stat>; // keyed by `${category}.${name}`
};

type Props = {
  section: Section;
  players: Player[];
};

function statKey(category: string, name: string): string {
  return `${category}.${name}`;
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

export default function PlayersTable({ section, players }: Props) {
  const eligible = useMemo(() => {
    const positionSet = section.positions
      ? new Set(section.positions.map((p) => p.toUpperCase()))
      : null;
    const qualifierKey = statKey(section.qualifier.category, section.qualifier.name);

    return players.filter((p) => {
      const s = p.stats[qualifierKey];
      if (!s || s.value == null || s.value <= 0) return false;

      if (positionSet) {
        // MLB has edge cases where a position player pitches in a blowout, or
        // a true two-way player has both hitting and pitching lines. Keep the
        // batting table driven by batting stats, while pitcher tables can use
        // a separate pitchingRole without overwriting the player's real spot.
        if (section.id === "batting") return true;

        const candidates = [p.position, p.primaryPosition, p.pitchingRole]
          .filter(Boolean)
          .map((x) => String(x).toUpperCase());
        if (!candidates.some((pos) => positionSet.has(pos))) return false;
      }

      return true;
    });
  }, [players, section.positions, section.qualifier.category, section.qualifier.name]);

  const [sortColName, setSortColName] = useState<string>(section.defaultSort.column);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(section.defaultSort.dir);

  const sortCol = useMemo(
    () => section.columns.find((c) => c.name === sortColName) || section.columns[0],
    [section.columns, sortColName]
  );

  const sorted = useMemo(() => {
    const copy = [...eligible];
    const sortKey = sortCol ? statKey(sortCol.category, sortCol.name) : "";
    copy.sort((a, b) => {
      const av = a.stats[sortKey]?.value;
      const bv = b.stats[sortKey]?.value;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [eligible, sortCol, sortDir]);

  // v20: collect any traded-in players that are visible so we can render a
  // footnote summarizing the asterisks at the bottom of the table.
  const asteriskNotes = useMemo(() => {
    return sorted
      .filter((p) => p.tradedIn)
      .map((p) => ({ name: p.name, detail: p.tradedInDetail }));
  }, [sorted]);

  function handleSortClick(colName: string) {
    if (colName === sortColName) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortColName(colName);
      setSortDir("desc");
    }
  }

  if (eligible.length === 0) {
    return (
      <div
        className="p-5 rounded-xl text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
        }}
      >
        No players have {section.label.toLowerCase()} stats yet.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "fit-content" }}>
          <thead>
            <tr
              className="text-left"
              style={{
                background: "var(--surface-2, var(--surface))",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th
                className="sticky left-0 z-10 px-3 py-2.5 font-semibold whitespace-nowrap"
                style={{
                  background: "var(--surface-2, var(--surface))",
                  color: "var(--text-2)",
                }}
              >
                Player
              </th>
              {section.columns.map((col) => {
                const isActive = sortColName === col.name;
                return (
                  <th
                    key={`${col.category}.${col.name}`}
                    className="px-2.5 py-2.5 font-semibold whitespace-nowrap text-right cursor-pointer select-none"
                    onClick={() => handleSortClick(col.name)}
                    style={{
                      color: isActive ? "var(--text)" : "var(--text-2)",
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <span
                        className="text-[10px] opacity-60"
                        style={{ visibility: isActive ? "visible" : "hidden" }}
                      >
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => (
              <tr
                key={p.id}
                style={{
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <td
                  className="sticky left-0 z-10 px-3 py-2 whitespace-nowrap"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <Headshot player={p} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate max-w-[140px] sm:max-w-[180px]">
                        {p.name}
                        {p.tradedIn && (
                          <span
                            className="ml-0.5"
                            style={{ color: "var(--text-2)" }}
                            title={p.tradedInDetail || "Played for another team this season"}
                          >
                            *
                          </span>
                        )}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                        {p.jersey && `#${p.jersey}`}
                        {p.jersey && p.position && " · "}
                        {p.position}
                      </div>
                    </div>
                  </div>
                </td>
                {section.columns.map((col) => {
                  const s = p.stats[statKey(col.category, col.name)];
                  return (
                    <td
                      key={`${col.category}.${col.name}`}
                      className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap"
                      style={{
                        color: sortColName === col.name ? "var(--text)" : "var(--text-2)",
                      }}
                    >
                      {s ? applyFormat(s.value, s.displayValue, col.format) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* v20 footnote — only renders when at least one player on this table
          was flagged as traded-in. */}
      {asteriskNotes.length > 0 && (
        <div
          className="px-3 py-2 text-[11px] leading-relaxed"
          style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}
        >
          <span style={{ fontWeight: 600 }}>* </span>
          {asteriskNotes
            .map((n) => (n.detail ? `${n.name} (${n.detail})` : n.name))
            .join(" · ")}
          {" — totals include games with prior team this season."}
        </div>
      )}

      <div
        className="px-3 py-2 text-[11px]"
        style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}
      >
        {sorted.length} player{sorted.length === 1 ? "" : "s"} · click any column to sort
      </div>
    </div>
  );
}

function Headshot({ player }: { player: Player }) {
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
        background: "var(--surface-2, var(--surface))",
        width: 32,
        height: 32,
        border: "1px solid var(--border)",
      }}
    >
      {player.headshot && !failed ? (
        <Image
          src={player.headshot}
          alt={player.name}
          width={32}
          height={32}
          className="object-cover"
          style={{ width: 32, height: 32 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[10px] font-semibold" style={{ color: "var(--text-3)" }}>
          {initials}
        </span>
      )}
    </div>
  );
}
