"use client";

import Image from "next/image";
import useSWR from "swr";
import { TeamConfig, logoUrl } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data, error } = useSWR(`/api/team?team=${team.key}`, fetcher, { refreshInterval: 60_000 });

  return (
    <div className="rounded-3xl p-6 sm:p-7 mb-4 relative overflow-hidden" style={{ background: team.primary, color: team.textOnPrimary }}>
      <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none"><Image src={logoUrl(team)} alt="" width={260} height={260} className="object-contain" /></div>
      <div className="relative flex items-center gap-5">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.14)" }}>
          <Image src={logoUrl(team)} alt={team.name} width={86} height={86} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest font-black opacity-80">{team.league}</div>
          <h1 className="text-3xl sm:text-4xl font-black leading-none mt-1 truncate">{team.name}</h1>
          <div className="text-sm opacity-85 mt-2 truncate">{data?.standingSummary || (error ? "Standings unavailable" : "Loading...")}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs uppercase tracking-widest font-black opacity-80">Record</div>
          <div className="text-3xl sm:text-4xl font-black mt-1">{data?.record || "—"}</div>
        </div>
      </div>
    </div>
  );
}
