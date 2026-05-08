"use client";

import { TeamConfig } from "@/lib/teams";

export type TabId = "live" | "schedule" | "stats" | "roster" | "standings" | "injuries" | "transactions";

type Props = {
  team: TeamConfig;
  active: TabId;
  onChange: (tab: TabId) => void;
  hasLive: boolean;
};

export default function Tabs({ team, active, onChange, hasLive }: Props) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "schedule", label: "Schedule" },
    { id: "stats", label: "Stats" },
    { id: "roster", label: "Roster" },
    { id: "standings", label: "Standings" },
    { id: "injuries", label: "Injuries" },
    { id: "transactions", label: "Transactions" },
  ];

  return (
    <div className="cbs-tabs -mx-4 sm:mx-0 mb-0" role="tablist">
      <div className="flex overflow-x-auto no-scrollbar px-4 gap-7">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          const showDot = tab.id === "live" && hasLive;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="relative py-4 text-base font-black whitespace-nowrap tracking-tight"
              style={{ color: isActive ? "var(--text)" : "var(--text-2)" }}
            >
              <span className="inline-flex items-center gap-1.5">
                {showDot && <span className="w-2 h-2 rounded-full live-dot" style={{ background: "var(--danger)" }} />}
                {tab.label}
              </span>
              {isActive && <span className="absolute left-0 right-0 bottom-0 h-1" style={{ background: "var(--accent)" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
