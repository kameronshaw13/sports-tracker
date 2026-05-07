"use client";

import { useId } from "react";
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
  const rawId = useId();
  if (!src) return null;
  const filterId = `logo-outline-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <span className={`score-team-logo-wrap espn-team-logo-wrap ${className}`} style={{ width: size, height: size }}>
      <svg className="team-logo-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={team?.abbr || team?.name || "Team logo"}>
        <defs>
          <filter id={filterId} x="-4" y="-4" width={size + 8} height={size + 8} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="0.9" result="expanded" />
            <feFlood floodColor="#fff" floodOpacity="1" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <image href={src} width={size} height={size} preserveAspectRatio="xMidYMid meet" filter={`url(#${filterId})`} />
      </svg>
    </span>
  );
}
