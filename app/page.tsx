"use client";

import { useState } from "react";
import useSWR from "swr";
import TopNav, { ViewId } from "@/components/TopNav";
import HomeDashboard from "@/components/HomeDashboard";
import LeaguesView from "@/components/LeaguesView";
import TeamSelector from "@/components/TeamSelector";
import TeamHeader from "@/components/TeamHeader";
import Tabs, { TabId } from "@/components/Tabs";
import Schedule from "@/components/Schedule";
import Roster from "@/components/Roster";
import Stats from "@/components/Stats";
import LiveGame from "@/components/LiveGame";
import { TEAMS } from "@/lib/teams";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [view, setView] = useState<ViewId>("home");
  const [activeTeam, setActiveTeam] = useState("orioles");
  const [activeTab, setActiveTab] = useState<TabId>("schedule");

  const team = TEAMS[activeTeam];

  const { data: scheduleData } = useSWR(
    view === "teams" ? `/api/scoreboard?team=${activeTeam}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const hasLive = scheduleData?.events?.some((e: any) => e.status?.state === "in") || false;

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">My Sports</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Live games, scores, and stats
          </p>
        </header>

        <TopNav active={view} onChange={setView} />

        {view === "home" && (
          <HomeDashboard
            onTeamClick={(key) => {
              setActiveTeam(key);
              setView("teams");
              setActiveTab("schedule");
            }}
          />
        )}

        {view === "teams" && (
          <>
            <div className="mb-6">
              <TeamSelector
                active={activeTeam}
                onSelect={(key) => {
                  setActiveTeam(key);
                  setActiveTab("schedule");
                }}
              />
            </div>
            <TeamHeader team={team} />
            <Tabs team={team} active={activeTab} onChange={setActiveTab} hasLive={hasLive} />
            <div>
              {activeTab === "live" && <LiveGame team={team} />}
              {activeTab === "schedule" && <Schedule team={team} />}
              {activeTab === "roster" && <Roster team={team} />}
              {activeTab === "stats" && <Stats team={team} />}
            </div>
          </>
        )}

        {view === "leagues" && <LeaguesView />}

        <footer className="mt-12 pt-6 text-xs text-center"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
          Data from ESPN's public API. Live games refresh every 15 seconds.
        </footer>
      </div>
    </main>
  );
}
