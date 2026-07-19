"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import OutlinedLogo from "./OutlinedLogo";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onPlayerClick?: (player: { id: string; name: string; league: string; teamKey?: string }) => void;
};

export default function GameLineup({ league, eventId, onPlayerClick }: Props) {
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/boxscore?league=${league}&event=${eventId}` : null,
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
  const teamKey = String(team?.team?.key || team?.team?.abbr || team?.team?.id || "").toLowerCase();

  return (
    <div className="game-lineup-wrap">
      <div className="game-lineup-toggle">
        {teams.map((t: any, index: number) => (
          <button
            key={t?.team?.id || t?.team?.abbr || index}
            type="button"
            className={`game-lineup-toggle-btn ${activeTeam === index ? "is-active" : ""}`}
            onClick={() => setActiveTeam(index)}
          >
            {t?.team?.logo && <OutlinedLogo src={t.team.logo} alt="" size={20} />}
            <span>{t?.team?.abbr || t?.team?.name || "Team"}</span>
          </button>
        ))}
      </div>

      <div className="game-lineup-shell">
        <div className="game-lineup-section-title">Starting Lineup</div>
        <div className="game-lineup-list">
          {players.length ? players.map((player: any, index: number) => {
            const playerId = String(player.id || player.uid || player.athlete?.id || "");
            const playerName = player.name || player.shortName || player.displayName || "Player";
            const isClickable = Boolean(onPlayerClick && playerId);
            const RowTag = isClickable ? "button" : "div";
            return (
            <RowTag
              key={`${playerId || playerName || index}-${index}`}
              type={isClickable ? "button" : undefined}
              className={`game-lineup-row ${isClickable ? "is-clickable" : ""}`}
              onClick={isClickable ? () => onPlayerClick?.({ id: playerId, name: playerName, league, teamKey }) : undefined}
            >
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
                <div className="game-lineup-name">
                  <span>{playerName}</span>
                  {player.position && <em>{player.position}</em>}
                </div>
              </div>
              <div className="game-lineup-avg tabular-nums">{lineupAverage(player)}</div>
            </RowTag>
          )}) : (
            <div className="game-lineup-empty">Lineup has not been posted yet.</div>
          )}
        </div>
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

function lineupAverage(player: any) {
  const stats = player?.stats || {};
  const direct = stats.AVG ?? stats.Avg ?? stats.avg ?? stats.BA ?? stats.BattingAverage ?? stats["Batting Average"];
  if (direct != null && direct !== "") return String(direct);
  for (const [key, value] of Object.entries(stats)) {
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if ((normalized === "avg" || normalized === "ba" || normalized === "battingaverage") && value != null && value !== "") {
      return String(value);
    }
  }
  return "—";
}

function initialsFor(name: string | null | undefined) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "–";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
