"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { TeamConfig } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function Roster({ team }: Props) {
  const { data, error, isLoading } = useSWR(`/api/roster?team=${team.key}`, fetcher);
  const [filter, setFilter] = useState("");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
        ))}
      </div>
    );
  }

  if (error || !data?.players) {
    return (
      <div className="p-6 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        Couldn't load roster
      </div>
    );
  }

  const players = data.players.filter((p: any) =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.position?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <input
        type="text"
        placeholder="Search players..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-3 px-4 py-2 rounded-xl text-sm outline-none"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      <div className="text-xs mb-2" style={{ color: "var(--text-3)" }}>
        {players.length} player{players.length === 1 ? "" : "s"}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map((p: any) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: "var(--surface-2)" }}
            >
              {p.headshot ? (
                <Image src={p.headshot} alt={p.name} width={48} height={48} className="object-cover" />
              ) : (
                <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                  {(p.name || "")
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.name}</div>
              <div className="text-xs flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                {p.jersey && <span>#{p.jersey}</span>}
                {p.position && <span>· {p.position}</span>}
                {p.height && <span>· {p.height}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
