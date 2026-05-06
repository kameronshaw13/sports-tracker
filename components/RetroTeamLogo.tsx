"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { League, logoUrl } from "@/lib/teams";

type TeamLike = {
  league?: League | string;
  abbr?: string | null;
  name?: string | null;
  short?: string | null;
  displayName?: string | null;
  logo?: string | null;
};

function slugLogoName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nicknameLabel(team: TeamLike) {
  const full = String(team?.name || team?.displayName || team?.short || team?.abbr || "").trim();
  const short = String(team?.short || full || team?.abbr || "").trim();
  const raw = short || full;
  return raw
    .replace(/^(Arizona|Atlanta|Baltimore|Boston|Buffalo|Calgary|Carolina|Charlotte|Chicago|Cincinnati|Cleveland|Colorado|Columbus|Dallas|Denver|Detroit|Golden State|Green Bay|Houston|Indiana|Jacksonville|Kansas City|Las Vegas|Los Angeles|LA|Memphis|Miami|Milwaukee|Minnesota|Montreal|Nashville|New England|New Jersey|New Orleans|New York|NY|Oakland|Oklahoma City|Orlando|Ottawa|Philadelphia|Phoenix|Pittsburgh|Portland|Sacramento|San Antonio|San Diego|San Francisco|Seattle|St\.? Louis|Tampa Bay|Texas|Toronto|Utah|Vancouver|Vegas|Washington)\s+/i, "")
    .trim() || raw;
}

function retroLogoCandidates(team: TeamLike, league?: League | string) {
  const lg = (league || team?.league || "mlb") as League;
  const fallback = team?.logo || (team?.abbr ? logoUrl({ league: lg, abbr: String(team.abbr), logo: null }) : "");
  const names = [
    nicknameLabel(team),
    team?.short,
    team?.name,
    team?.displayName,
    team?.abbr,
  ]
    .map((v) => slugLogoName(String(v || "")))
    .filter(Boolean);
  const unique = Array.from(new Set(names));
  return [...unique.map((slug) => `/retro_images/${slug}.png`), fallback].filter(Boolean);
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
  const sources = useMemo(() => retroLogoCandidates(team, league), [team, league]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [sources.join("|")]);

  const src = sources[index] || "";
  if (!src) return null;

  return (
    <span className={`score-team-logo-wrap logo-outline-dark ${className}`} style={{ width: size, height: size }}>
      <Image
        src={src}
        alt={team?.abbr || team?.name || "Team logo"}
        fill
        sizes={`${size}px`}
        className="object-contain"
        unoptimized
        onError={() => setIndex((current) => Math.min(current + 1, sources.length - 1))}
      />
    </span>
  );
}
