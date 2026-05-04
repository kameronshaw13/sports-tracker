"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { League } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StandingsMode = "division" | "conference" | "wildcard";
type Props = {
  league: League | string;
  teamKey?: string;
  compact?: boolean;
  pageMode?: StandingsMode;
  subdivision?: "FBS" | "FCS";
  showHeader?: boolean;
  showFilterControls?: boolean;
};

function lower(v: any) {
  return String(v || "").toLowerCase();
}

function sectionKind(label: string): StandingsMode {
  const l = lower(label);
  if (l.includes("wild") || l.includes("playoff")) return "wildcard";
  if (l.includes("conference") || l === "afc" || l === "nfc" || l.includes("eastern") || l.includes("western")) return "conference";
  return "division";
}

function shouldShowSection(label: string, mode?: StandingsMode) {
  if (!mode) return true;
  const l = lower(label);
  if (mode === "wildcard") return l.includes("wild") || l.includes("playoff");
  if (mode === "conference") return sectionKind(label) === "conference";
  return sectionKind(label) === "division";
}

function isCollegeFootball(league: League | string) {
  return league === "cfb";
}

export default function Standings({ league, teamKey, compact = false, pageMode, subdivision, showHeader = true, showFilterControls = false }: Props) {
  const [selectedCollegeSection, setSelectedCollegeSection] = useState<string>("all");
  const qs = new URLSearchParams({ league: String(league) });
  if (subdivision) qs.set("subdivision", subdivision);
  const { data, isLoading } = useSWR(`/api/standings?${qs.toString()}`, fetcher, { revalidateOnFocus: false, refreshInterval: 300_000 });
  const teamAbbr = teamKey?.split("-").slice(1).join("-").toUpperCase();
  const sections = data?.sections || [];

  const collegeLabels = useMemo(() => {
    if (!isCollegeFootball(league)) return [];
    return Array.from(new Set<string>(sections.map((s: any) => String(s.label || "")).filter(Boolean))).sort();
  }, [league, sections]);

  const visibleSections = useMemo(() => {
    let list = sections;
    if (isCollegeFootball(league)) {
      if (selectedCollegeSection !== "all") list = list.filter((s: any) => s.label === selectedCollegeSection);
    } else if (pageMode) {
      list = list.filter((s: any) => shouldShowSection(s.label, pageMode));
      if (!list.length && pageMode !== "wildcard") list = sections;
    }
    return list;
  }, [league, sections, pageMode, selectedCollegeSection]);

  if (isLoading) return <div className="h-40 rounded-2xl animate-pulse" style={{ background: "var(--surface)" }} />;
  if (!sections.length) {
    return <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Standings are not available yet.</div>;
  }

  return (
    <section className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && showHeader && (
        <div>
          <h2 className="text-lg font-black">Standings</h2>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>Division, conference, and wildcard standings when ESPN exposes them.</p>
        </div>
      )}

      {showFilterControls && isCollegeFootball(league) && collegeLabels.length > 1 && (
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider font-black mb-1" style={{ color: "var(--text-3)" }}>Conference</span>
          <select
            value={selectedCollegeSection}
            onChange={(e) => setSelectedCollegeSection(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <option value="all">All conferences</option>
            {collegeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </label>
      )}

      {!visibleSections.length && (
        <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          This standings view is not available from ESPN for this league right now.
        </div>
      )}

      <div className="space-y-4">
        {visibleSections.map((section: any, idx: number) => (
          <div key={`${section.label}-${idx}`} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-3 py-2 text-xs font-black uppercase tracking-wider" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{section.label}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr style={{ color: "var(--text-3)" }}>
                    <th className="text-left px-3 py-2">Team</th>
                    <th className="text-right px-2 py-2">W</th>
                    <th className="text-right px-2 py-2">L</th>
                    <th className="text-right px-2 py-2">T</th>
                    <th className="text-right px-2 py-2">PCT</th>
                    <th className="text-right px-2 py-2">GB</th>
                    <th className="text-right px-3 py-2">STRK</th>
                  </tr>
                </thead>
                <tbody>
                  {(section.rows || []).map((row: any) => {
                    const selected = teamAbbr && String(row.abbr || "").toUpperCase() === teamAbbr;
                    return (
                      <tr key={row.id || row.abbr || row.name} style={{ borderTop: "1px solid var(--border)", background: selected ? "color-mix(in srgb, var(--text) 8%, transparent)" : "transparent" }}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {row.logo && <Image src={row.logo} alt="" width={18} height={18} className="object-contain flex-shrink-0" unoptimized />}
                            <span className="font-bold whitespace-normal leading-tight">{row.name}</span>
                          </div>
                        </td>
                        <td className="text-right px-2 py-2 tabular-nums">{row.wins}</td>
                        <td className="text-right px-2 py-2 tabular-nums">{row.losses}</td>
                        <td className="text-right px-2 py-2 tabular-nums">{row.ties || "—"}</td>
                        <td className="text-right px-2 py-2 tabular-nums">{row.pct}</td>
                        <td className="text-right px-2 py-2 tabular-nums">{row.gb}</td>
                        <td className="text-right px-3 py-2 tabular-nums">{row.streak}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
