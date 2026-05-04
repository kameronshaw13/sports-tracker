"use client";

import { TeamConfig } from "@/lib/teams";

export type TabId = "live" | "schedule" | "roster" | "stats" | "standings";

type Props = {
  team: TeamConfig;
  active: TabId;
  onChange: (tab: TabId) => void;
  hasLive: boolean;
};

export default function Tabs({ team, active, onChange, hasLive }: Props) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "live", label: "Live" },
    { id: "schedule", label: "Schedule" },
    { id: "roster", label: "Roster" },
    { id: "stats", label: "Stats" },
    { id: "standings", label: "Standings" },
  ];

  return (
    <div className="grid grid-cols-5 gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const showDot = tab.id === "live" && hasLive;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[11px] sm:text-sm font-bold transition-all"
            style={{
              background: isActive ? team.primary : "transparent",
              color: isActive ? team.textOnPrimary : "var(--text-2)",
            }}
          >
            {showDot && (
              <span
                className="w-2 h-2 rounded-full live-dot flex-shrink-0"
                style={{ background: isActive ? team.textOnPrimary : "var(--danger)" }}
              />
            )}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
