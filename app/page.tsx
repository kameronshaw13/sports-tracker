"use client";

import { useCallback, useEffect, useState } from "react";
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
import ManageTeams from "@/components/ManageTeams";
import {
  TeamConfig,
  League,
  getSport,
  makeKey,
  VALID_LEAGUES,
} from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [view, setView] = useState<ViewId>("home");
  // activeTeam holds a full TeamConfig (not a key). This way we can view a
  // team that ISN'T in favorites — e.g. Astros after tapping their logo on an
  // Orioles boxscore — without auto-adding them. The `_transient` flag marks
  // a team that was navigated-to but isn't a saved favorite.
  const [activeTeam, setActiveTeam] = useState<TeamConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [manageOpen, setManageOpen] = useState(false);

  const { favorites } = useFavoriteTeams();

  // Preload the team catalog once on mount so colors are ready when the user
  // taps a non-favorite team logo. Cached an hour by API + by SWR.
  const { data: catalogData } = useSWR<{ teams: TeamConfig[] }>(
    "/api/all-teams",
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  // Pick a default active team once favorites load. Also reset if the
  // currently-active favorite team got removed in Manage Teams. Don't touch
  // activeTeam if it's transient — that means the user is intentionally
  // viewing a non-favorite team.
  useEffect(() => {
    if (!favorites) return;
    if (!activeTeam) {
      if (favorites.length > 0) setActiveTeam(favorites[0]);
      return;
    }
    if (activeTeam._transient) return;
    const stillExists = favorites.find((t) => t.key === activeTeam.key);
    if (!stillExists) {
      setActiveTeam(favorites[0] || null);
    }
  }, [favorites, activeTeam]);

  const { data: scheduleData } = useSWR(
    view === "teams" && activeTeam ? `/api/scoreboard?team=${activeTeam.key}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
  const hasLive = scheduleData?.events?.some((e: any) => e.status?.state === "in") || false;

  const openManage = useCallback(() => {
    setManageOpen(true);
    setView("teams");
  }, []);

  // Navigate to a team's page WITHOUT auto-adding to favorites. If the team
  // isn't in favorites, mark it `_transient` so the favorites-sync useEffect
  // above leaves it alone.
  const handleTeamLogoClick = useCallback(
    (league: string, abbr: string) => {
      if (!VALID_LEAGUES.includes(league as League)) return;
      const key = makeKey(league as League, abbr);

      const existing = favorites?.find((t) => t.key === key);
      if (existing) {
        setActiveTeam(existing);
      } else {
        const fromCatalog = catalogData?.teams.find((t) => t.key === key);
        if (fromCatalog) {
          setActiveTeam({ ...fromCatalog, _transient: true });
        } else {
          // Catalog not loaded yet — minimal config with neutral colors.
          setActiveTeam({
            key,
            name: abbr.toUpperCase(),
            short: abbr.toUpperCase(),
            abbr: abbr.toLowerCase(),
            league: league as League,
            sport: getSport(league as League),
            primary: "#374151",
            secondary: "#9CA3AF",
            textOnPrimary: "#FFFFFF",
            _transient: true,
          });
        }
      }

      setView("teams");
      setActiveTab("schedule");
      setManageOpen(false);
    },
    [favorites, catalogData]
  );

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">My Sports</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Live games, scores, and stats
          </p>
        </header>

        <TopNav
          active={view}
          onChange={(v) => {
            setView(v);
            setManageOpen(false);
          }}
        />

        {view === "home" && (
          <HomeDashboard
            onTeamClick={(team) => {
              setActiveTeam(team);
              setView("teams");
              setActiveTab("schedule");
            }}
            onManage={openManage}
            onTeamLogoClick={handleTeamLogoClick}
          />
        )}

        {view === "teams" && manageOpen && (
          <ManageTeams onClose={() => setManageOpen(false)} />
        )}

        {view === "teams" && !manageOpen && (
          <>
            <div className="mb-6">
              <TeamSelector
                activeKey={activeTeam?.key ?? ""}
                onSelect={(team) => {
                  setActiveTeam(team);
                  setActiveTab("schedule");
                }}
                onManage={openManage}
              />
            </div>
            {activeTeam ? (
              // `key` forces a full remount whenever the active team changes,
              // so child components don't hold stale internal state.
              <div key={activeTeam.key}>
                {activeTeam._transient && <TransientBanner team={activeTeam} />}
                <TeamHeader team={activeTeam} />
                <Tabs team={activeTeam} active={activeTab} onChange={setActiveTab} hasLive={hasLive} />
                <div>
                  {activeTab === "live" && (
                    <LiveGame team={activeTeam} onTeamLogoClick={handleTeamLogoClick} />
                  )}
                  {activeTab === "schedule" && (
                    <Schedule team={activeTeam} onTeamLogoClick={handleTeamLogoClick} />
                  )}
                  {activeTab === "roster" && <Roster team={activeTeam} />}
                  {activeTab === "stats" && <Stats team={activeTeam} />}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
                  No teams selected.
                </p>
                <button
                  onClick={openManage}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--text)", color: "var(--bg)" }}
                >
                  + Pick your teams
                </button>
              </div>
            )}
          </>
        )}

        {view === "leagues" && <LeaguesView onTeamLogoClick={handleTeamLogoClick} />}

        <footer
          className="mt-12 pt-6 text-xs text-center"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}
        >
          Data from ESPN's public API. Live games refresh every 15 seconds.
        </footer>
      </div>
    </main>
  );
}

// Banner shown above a transient team's page. Calls useFavoriteTeams in its
// own scope — additions propagate via the global store so the team selector
// and home dashboard see them immediately.
function TransientBanner({ team }: { team: TeamConfig }) {
  const { addTeam } = useFavoriteTeams();
  const handleAdd = () => {
    const { _transient, ...rest } = team;
    addTeam(rest);
  };
  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-2)" }}>
        Viewing <span className="font-semibold" style={{ color: "var(--text)" }}>{team.name}</span> · not in your teams
      </div>
      <button
        onClick={handleAdd}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
        style={{ background: team.primary, color: team.textOnPrimary }}
      >
        + Add to my teams
      </button>
    </div>
  );
}
