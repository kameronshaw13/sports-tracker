"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
};

export default function GameLineup({ league, eventId }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/boxscore?league=${league}&event=${eventId}&_t=${freshKey}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const teams = data?.teams || [];
  const [activeTeam, setActiveTeam] = useState(0);

  if (isLoading) {
    return <div className="game-lineup-loading" />;
  }

  if (error || !teams.length) {
    return (
      <div className="game-lineup-empty">
        Lineups are not available yet.
      </div>
    );
  }

  const team = teams[Math.min(activeTeam, teams.length - 1)];
  const players = lineupPlayers(team);

  return (
    <div className="game-lineup-shell">
      <div className="game-lineup-toggle">
        {teams.map((t: any, index: number) => (
          <button
            key={t?.team?.id || t?.team?.abbr || index}
            type="button"
            className={`game-lineup-toggle-btn ${activeTeam === index ? "is-active" : ""}`}
            onClick={() => setActiveTeam(index)}
          >
            {t?.team?.logo && (
              <Image
                src={t.team.logo}
                alt=""
                width={20}
                height={20}
                className="object-contain logo-outline-dark"
                unoptimized
              />
            )}
            <span>{t?.team?.abbr || t?.team?.name || "Team"}</span>
          </button>
        ))}
      </div>

      <div className="game-lineup-list">
        {players.length ? players.map((player: any, index: number) => (
          <div key={`${player.id || player.name || index}-${index}`} className="game-lineup-row">
            <div className="game-lineup-order tabular-nums">{index + 1}</div>
            <div className="game-lineup-headshot-wrap">
              {player.headshot ? (
                <Image
                  src={player.headshot}
                  alt=""
                  width={38}
                  height={38}
                  className="game-lineup-headshot"
                  unoptimized
                />
              ) : (
                <span>{initialsFor(player.name || player.shortName)}</span>
              )}
            </div>
            <div className="game-lineup-player">
              <div className="game-lineup-name">{player.name || player.shortName || "Player"}</div>
              <div className="game-lineup-meta">
                {[player.position, player.jersey ? `#${player.jersey}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        )) : (
          <div className="game-lineup-empty">Lineup has not been posted yet.</div>
        )}
      </div>
    </div>
  );
}

function lineupPlayers(team: any) {
  const groups = Array.isArray(team?.groups) ? team.groups : [];
  const hitters = groups.find((g: any) => /bat|hit|starter|lineup|skater|player/i.test(String(g?.name || ""))) || groups[0];
  const athletes = Array.isArray(hitters?.athletes) ? hitters.athletes : [];
  return [...athletes].sort((a: any, b: any) => {
    if (a?.starter !== b?.starter) return a?.starter ? -1 : 1;
    return 0;
  });
}

function initialsFor(name: string | null | undefined) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "–";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
