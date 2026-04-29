"use client";

import { TeamConfig } from "@/lib/teams";

export type TabId = "live" | "schedule" | "roster" | "stats";

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
  ];

  return (
    <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const showDot = tab.id === "live" && hasLive;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: isActive ? team.primary : "transparent",
              color: isActive ? team.textOnPrimary : "var(--text-2)",
            }}
          >
            {showDot && (
              <span
                className="w-2 h-2 rounded-full live-dot"
                style={{ background: isActive ? team.textOnPrimary : "var(--danger)" }}
              />
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
