"use client";

import { League, logoUrl } from "@/lib/teams";
import OutlinedLogo from "./OutlinedLogo";

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

  return <OutlinedLogo src={src} alt={team?.abbr || team?.name || "Team logo"} size={size} className={`score-team-logo-wrap espn-team-logo-wrap ${className}`} />;
}
