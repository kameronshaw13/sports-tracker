"use client";

import type { CSSProperties } from "react";
import { League, logoUrl } from "@/lib/teams";

type TeamLike = {
  league?: League | string;
  abbr?: string | null;
  name?: string | null;
  short?: string | null;
  displayName?: string | null;
  logo?: string | null;
};

function espnLogo(team: TeamLike, league?: League | string) {
  const lg = (league || team?.league || "mlb") as League;
  return team?.logo || (team?.abbr ? logoUrl({ league: lg, abbr: String(team.abbr), logo: null }) : "");
}

export default function RetroTeamLogo({
  team,
  league,
  size = 30,
  className = "",
}: {
  team: TeamLike;
  league?: League | string;
  size?: number;
  className?: string;
}) {
  const src = espnLogo(team, league);
  if (!src) return null;
  const outlineSize = Math.max(0.5, Math.min(1.08, size * 0.023));
  const style = {
    width: size,
    height: size,
    "--logo-outline-size": `${outlineSize}px`,
  } as CSSProperties;

  return (
    <span className={`score-team-logo-wrap espn-team-logo-wrap ${className}`} style={style}>
      <img
        src={src}
        alt={team?.abbr || team?.name || "Team logo"}
        width={size}
        height={size}
        className="team-logo-svg object-contain logo-outline-dark"
      />
    </span>
  );
}
