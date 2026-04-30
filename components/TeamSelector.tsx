"use client";

import Image from "next/image";
import { TeamConfig, logoUrl } from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

type Props = {
  activeKey: string;
  onSelect: (team: TeamConfig) => void;
  onManage: () => void;
};

export default function TeamSelector({ activeKey, onSelect, onManage }: Props) {
  const { favorites } = useFavoriteTeams();

  // Reserve space while loading from localStorage to avoid layout jump
  if (!favorites) return <div className="h-[68px]" />;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      {favorites.map((team) => {
        const isActive = activeKey === team.key;
        return (
          <button
            key={team.key}
            onClick={() => onSelect(team)}
            className="flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{
              background: isActive ? team.primary : "var(--surface)",
              border: `1px solid ${isActive ? team.primary : "var(--border)"}`,
              color: isActive ? team.textOnPrimary : "var(--text)",
              minWidth: 160,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: isActive ? "rgba(255,255,255,0.12)" : "var(--surface-2)" }}
            >
              <Image
                src={logoUrl(team)}
                alt={team.short}
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div className="text-left">
              <div className="text-[11px] uppercase tracking-wide font-medium" style={{ opacity: 0.7 }}>
                {team.league}
              </div>
              <div className="text-sm font-semibold leading-tight">{team.short}</div>
            </div>
          </button>
        );
      })}

      {/* Manage chip */}
      <button
        onClick={onManage}
        className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-xl transition-all"
        style={{
          background: "transparent",
          border: "1px dashed var(--border)",
          color: "var(--text-2)",
          minWidth: 90,
        }}
      >
        <span className="text-xl leading-none">+</span>
        <span className="text-[11px] uppercase tracking-wide font-medium">Manage</span>
      </button>
    </div>
  );
}
