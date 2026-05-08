"use client";

import RetroTeamLogo from "./RetroTeamLogo";
import useSWR from "swr";
import { TeamConfig, displayTeamName } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data } = useSWR(`/api/team?team=${team.key}`, fetcher, { refreshInterval: 60_000 });
  const record = data?.record || "—";
  const standing = team.league === "cfb" || team.league === "cbb"
    ? team.conference || data?.standingSummary || ""
    : data?.standingSummary || "";

  return (
    <section className="team-page-hero cbs-team-hero -mx-4 sm:mx-0 mb-0" style={{ ["--team-primary" as any]: team.primary, ["--team-secondary" as any]: team.secondary }}>
      <div className="team-page-hero-inner px-4">
        <div className="team-page-logo-box">
          <RetroTeamLogo team={team} league={team.league} size={60} />
        </div>
        <div className="team-page-copy">
          <h1 className="team-page-name">{displayTeamName(team)}</h1>
          <p className="team-page-record">
            {record}{standing ? `, ${standing}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
