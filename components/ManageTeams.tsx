"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { League, TeamConfig, logoUrl, VALID_LEAGUES } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

function scoreSearch(t: TeamConfig, q: string): number {
  const name = t.name.toLowerCase();
  const short = t.short.toLowerCase();
  const abbr = t.abbr.toLowerCase();
  if (abbr === q || short === q || name === q) return 100;
  if (abbr.startsWith(q) || short.startsWith(q) || name.startsWith(q)) return 50;
  if (name.includes(` ${q}`)) return 25;
  return 1;
}

const LEAGUE_LABEL: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "CFB",
  cbb: "CBB",
};

type Props = { onClose: () => void };

export default function ManageTeams({ onClose }: Props) {
  const { favorites, addTeam, removeTeam, moveTeam, reset } = useFavoriteTeams();
  const { data, isLoading } = useSWR<{ teams: TeamConfig[] }>(`/api/all-teams?v=20`, fetcher);
  const [leagueFilter, setLeagueFilter] = useState<"all" | League>("all");
  const [search, setSearch] = useState("");

  const allTeams = data?.teams || [];
  const favSet = useMemo(() => new Set((favorites || []).map((f) => f.key)), [favorites]);

  const filtered = useMemo(() => {
    let list = allTeams;
    if (leagueFilter !== "all") list = list.filter((t) => t.league === leagueFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.abbr.includes(q) ||
          t.short.toLowerCase().includes(q)
      );
      // Search results should put exact/strong matches at the top instead of
      // leaving the user to scroll through hundreds of college teams.
      list = [...list].sort((a, b) => scoreSearch(b, q) - scoreSearch(a, q) || a.name.localeCompare(b.name));
    }
    return list.slice(0, q ? 80 : 220);
  }, [allTeams, leagueFilter, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Manage your teams</h2>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Pick any teams across MLB, NFL, NBA, NHL, CFB, and CBB.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Done
        </button>
      </div>

      {/* Current favorites with reorder + remove */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
          Your teams ({favorites?.length ?? 0})
        </h3>
        {favorites && favorites.length > 0 ? (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            {favorites.map((t, idx) => (
              <div
                key={t.key}
                className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--surface-2)" }}>
                  <Image src={logoUrl(t)} alt="" width={28} height={28} className="object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{t.name}</div>
                  <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                    {LEAGUE_LABEL[t.league]}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveTeam(t.key, "up")}
                    disabled={idx === 0}
                    className="w-8 h-8 rounded-lg text-sm disabled:opacity-30"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                    aria-label="Move up"
                  >↑</button>
                  <button
                    onClick={() => moveTeam(t.key, "down")}
                    disabled={idx === favorites.length - 1}
                    className="w-8 h-8 rounded-lg text-sm disabled:opacity-30"
                    style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                    aria-label="Move down"
                  >↓</button>
                  <button
                    onClick={() => removeTeam(t.key)}
                    className="w-8 h-8 rounded-lg text-sm font-bold"
                    style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger)" }}
                    aria-label="Remove team"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            No favorites yet. Add some below.
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button onClick={reset} className="text-xs underline" style={{ color: "var(--text-3)" }}>
            Reset to defaults
          </button>
        </div>
      </div>

      {/* Browse */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>
          Browse all teams
        </h3>

        <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: "var(--surface-2)" }}>
          {(["all", ...VALID_LEAGUES] as const).map((id) => {
            const isActive = leagueFilter === id;
            return (
              <button
                key={id}
                onClick={() => setLeagueFilter(id as any)}
                className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: isActive ? "var(--surface)" : "transparent",
                  color: isActive ? "var(--text)" : "var(--text-2)",
                  border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                {id === "all" ? "All" : LEAGUE_LABEL[id as League]}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 px-4 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        />

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((t) => {
              const isFav = favSet.has(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => (isFav ? removeTeam(t.key) : addTeam(t))}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all"
                  style={{
                    background: isFav ? t.primary : "var(--surface)",
                    border: `1px solid ${isFav ? t.primary : "var(--border)"}`,
                    color: isFav ? t.textOnPrimary : "var(--text)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isFav ? "rgba(255,255,255,0.15)" : "var(--surface-2)" }}
                  >
                    <Image src={logoUrl(t)} alt="" width={28} height={28} className="object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{t.name}</div>
                    <div className="text-[11px] uppercase tracking-wide" style={{ opacity: 0.75 }}>
                      {LEAGUE_LABEL[t.league]}{t.subdivision ? ` · ${t.subdivision}` : ""}
                    </div>
                  </div>
                  <div className="text-lg flex-shrink-0">{isFav ? "★" : "☆"}</div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full p-6 rounded-xl text-sm text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                No teams match.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
