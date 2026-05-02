"use client";

import Image from "next/image";
import useSWR from "swr";
import { TeamConfig, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

type Props = { team: TeamConfig };

export default function TeamHeader({ team }: Props) {
  const { data, error } = useSWR(`/api/team?team=${team.key}`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const { favorites, addTeam, removeTeam } = useFavoriteTeams();
  const isFavorite = !!favorites?.some((t) => t.key === team.key);

  const toggleFavorite = () => {
    if (isFavorite) removeTeam(team.key);
    else {
      const { _transient, ...clean } = team;
      addTeam(clean);
    }
  };

  return (
    <div
      className="rounded-2xl p-6 mb-4 relative overflow-hidden"
      style={{ background: team.primary, color: team.textOnPrimary }}
    >
      <div className="absolute -right-8 -top-8 opacity-10 pointer-events-none">
        <Image src={logoUrl(team)} alt="" width={220} height={220} className="object-contain" />
      </div>

      <button
        type="button"
        onClick={toggleFavorite}
        aria-label={isFavorite ? `Remove ${team.name} from My Teams` : `Add ${team.name} to My Teams`}
        className="absolute right-4 top-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-transform active:scale-95"
        style={{ background: "rgba(255,255,255,0.18)", color: team.textOnPrimary, border: "1px solid rgba(255,255,255,0.25)" }}
      >
        {isFavorite ? "♥" : "♡"}
      </button>

      <div className="relative flex items-center gap-4 pr-10">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <Image src={logoUrl(team)} alt={team.name} width={64} height={64} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest font-semibold opacity-80">{team.league}</div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mt-1">{team.name}</h1>
          <div className="text-sm opacity-85 mt-1">
            {data?.standingSummary || (error ? "Standings unavailable" : "Loading...")}
          </div>
        </div>
        <div className="text-right hidden xs:block">
          <div className="text-xs uppercase tracking-widest font-semibold opacity-80">Record</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1">{data?.record || "—"}</div>
        </div>
      </div>
    </div>
  );
}
