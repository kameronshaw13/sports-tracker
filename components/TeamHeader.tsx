"use client";

import Image from "next/image";
import RetroTeamLogo from "./RetroTeamLogo";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { TeamConfig, logoUrl, displayTeamName } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data } = useSWR(`/api/team?team=${team.key}`, fetcher, { refreshInterval: 60_000 });
  const [compact, setCompact] = useState(false);
  const record = data?.record || "—";
  const standing = team.league === "cfb" || team.league === "cbb"
    ? team.conference || data?.standingSummary || ""
    : data?.standingSummary || "";

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 88);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [team.key]);

  return (
    <section className={`team-page-hero cbs-team-hero -mx-4 sm:mx-0 mb-0 ${compact ? "is-compact" : ""}`} style={{ ["--team-primary" as any]: team.primary, ["--team-secondary" as any]: team.secondary }}>
      <div className="team-page-hero-inner relative px-4 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <Image src={logoUrl(team)} alt="" fill className="object-contain scale-150" unoptimized />
        </div>
        <div className="relative">
          <h1 className="team-page-name">{displayTeamName(team)}</h1>
          <p className="team-page-record">
            {record}{standing ? `, ${standing}` : ""}
          </p>
          <div className="team-page-logo-row">
            <div className="team-page-logo-box">
              <RetroTeamLogo team={team} league={team.league} size={82} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
