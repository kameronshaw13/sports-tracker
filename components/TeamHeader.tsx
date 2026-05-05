"use client";

import Image from "next/image";
import useSWR from "swr";
import { TeamConfig, logoUrl, displayTeamName } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data } = useSWR(`/api/team?team=${team.key}`, fetcher, { refreshInterval: 60_000 });
  const record = data?.record || "—";
  const standing = data?.standingSummary || "";

  return (
    <section className="cbs-team-hero -mx-4 sm:mx-0 mb-0" style={{ ["--team-primary" as any]: team.primary }}>
      <div className="relative px-4 pt-2 pb-5 text-center overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: team.primary }} />
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
          <Image src={logoUrl(team)} alt="" fill className="object-contain scale-150" unoptimized />
        </div>
        <div className="relative">
          <h1 className="text-xl font-black leading-tight tracking-tight">{displayTeamName(team)}</h1>
          <p className="mt-0.5 text-sm font-black" style={{ color: "var(--text-2)" }}>
            {record}{standing ? `, ${standing}` : ""}
          </p>
          <div className="mt-5 flex justify-center">
            <div className="h-24 w-24 flex items-center justify-center">
              <Image src={logoUrl(team)} alt={team.name} width={92} height={92} className="object-contain logo-outline-dark" unoptimized />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
