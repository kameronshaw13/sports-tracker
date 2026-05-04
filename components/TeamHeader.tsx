"use client";

import Image from "next/image";
import useSWR from "swr";
import { TeamConfig, logoUrl, displayTeamName } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data, error } = useSWR(`/api/team?team=${team.key}`, fetcher, { refreshInterval: 60_000 });

  return (
    <div className="rounded-2xl p-4 sm:p-6 mb-4 relative overflow-hidden" style={{ background: team.primary, color: team.textOnPrimary }}>
      <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none"><Image src={logoUrl(team)} alt="" width={210} height={210} className="object-contain" /></div>
      <div className="relative flex items-center gap-3 sm:gap-5">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.14)" }}>
          <Image src={logoUrl(team)} alt={team.name} width={58} height={58} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] sm:text-xs uppercase tracking-widest font-black opacity-80">{team.league}</div>
          <h1 className="text-xl sm:text-3xl font-black leading-tight mt-1">{displayTeamName(team)}</h1>
          <div className="text-xs sm:text-sm opacity-85 mt-1 sm:mt-2">{data?.standingSummary || (error ? "Standings unavailable" : "Loading...")}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] sm:text-xs uppercase tracking-widest font-black opacity-80">Record</div>
          <div className="text-xl sm:text-3xl font-black mt-1">{data?.record || "—"}</div>
        </div>
      </div>
    </div>
  );
}
