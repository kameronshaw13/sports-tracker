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
import PullToRefresh from "@/components/PullToRefresh";
import GameDetail from "@/components/GameDetail";
import AppSettingsButton from "@/components/AppSettingsButton";
import PlayerDetail from "@/components/PlayerDetail";
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
  const [leagueInitial, setLeagueInitial] = useState<string>("mlb");
  const [returnGame, setReturnGame] = useState<{ league: string; eventId: string } | null>(null);
  const [showReturnGame, setShowReturnGame] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; league: string; teamKey?: string } | null>(null);

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
    { refreshInterval: 15_000, revalidateOnFocus: true, revalidateOnReconnect: true }
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
    (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => {
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

      if (sourceGame?.eventId) {
        setReturnGame(sourceGame);
        setShowReturnGame(false);
      }

      setView("teams");
      setActiveTab("schedule");
      setManageOpen(false);
    },
    [favorites, catalogData]
  );

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <PullToRefresh>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-2 mb-6">
          <div className="flex-1">
            <TopNav
              active={view}
              onChange={(v) => {
                setSelectedPlayer(null);
                setShowReturnGame(false);
                setView(v);
                setManageOpen(false);
              }}
            />
          </div>
          <AppSettingsButton />
        </div>


        {selectedPlayer && (
          <PlayerDetail player={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
        )}

        {!selectedPlayer && showReturnGame && returnGame && (
          <GameDetail
            league={returnGame.league}
            eventId={returnGame.eventId}
            onClose={() => setShowReturnGame(false)}
            onTeamClick={handleTeamLogoClick}
            onPlayerClick={(p) => setSelectedPlayer(p)}
          />
        )}

        {!selectedPlayer && !showReturnGame && view === "home" && (
          <HomeDashboard
            onTeamClick={(team) => {
              setActiveTeam(team);
              setView("teams");
              setActiveTab("schedule");
            }}
            onManage={openManage}
            onTeamLogoClick={handleTeamLogoClick}
            onViewLeague={(league) => {
              setLeagueInitial(league);
              setView("leagues");
              setManageOpen(false);
            }}
            onPlayerClick={(p) => setSelectedPlayer(p)}
          />
        )}

        {!selectedPlayer && !showReturnGame && view === "teams" && manageOpen && (
          <ManageTeams onClose={() => setManageOpen(false)} />
        )}

        {!selectedPlayer && !showReturnGame && view === "teams" && !manageOpen && (
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
                {returnGame && (
                  <button
                    onClick={() => setShowReturnGame(true)}
                    className="mb-3 text-sm font-semibold px-3 py-2 rounded-xl"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                  >
                    ← Back to box score
                  </button>
                )}
                <TeamHeader team={activeTeam} />
                <Tabs team={activeTeam} active={activeTab} onChange={setActiveTab} hasLive={hasLive} />
                <div>
                  {activeTab === "live" && (
                    <LiveGame team={activeTeam} onTeamLogoClick={handleTeamLogoClick} />
                  )}
                  {activeTab === "schedule" && (
                    <Schedule team={activeTeam} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer({ ...p, teamKey: activeTeam.key })} />
                  )}
                  {activeTab === "roster" && <Roster team={activeTeam} onPlayerClick={(p) => setSelectedPlayer(p)} />}
                  {activeTab === "stats" && <Stats team={activeTeam} onPlayerClick={(p) => setSelectedPlayer(p)} />}
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

        {!selectedPlayer && !showReturnGame && view === "leagues" && <LeaguesView initialLeague={leagueInitial} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer(p)} />}

        <footer
          className="mt-12 pt-6 text-xs text-center"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}
        >
          Data from ESPN's public API. Live games refresh every 15 seconds.
        </footer>
      </div>
      </PullToRefresh>
    </main>
  );
}
