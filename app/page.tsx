"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import TopNav, { ViewId } from "@/components/TopNav";
import HomeDashboard from "@/components/HomeDashboard";
import LeaguesView from "@/components/LeaguesView";
import MoreView from "@/components/MoreView";
import TeamSelector from "@/components/TeamSelector";
import TeamHeader from "@/components/TeamHeader";
import Tabs, { TabId } from "@/components/Tabs";
import Schedule from "@/components/Schedule";
import Roster from "@/components/Roster";
import Stats from "@/components/Stats";
import Standings from "@/components/Standings";
import StandingsPage from "@/components/StandingsPage";
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
  const [view, setView] = useState<ViewId>("scores");
  // activeTeam holds a full TeamConfig (not a key). This way we can view a
  // team that ISN'T in favorites — e.g. Astros after tapping their logo on an
  // Orioles boxscore — without auto-adding them. The `_transient` flag marks
  // a team that was navigated-to but isn't a saved favorite.
  const [activeTeam, setActiveTeam] = useState<TeamConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [manageOpen, setManageOpen] = useState(false);
  const [leagueInitial, setLeagueInitial] = useState<string>("mlb");
  const [standingsInitial, setStandingsInitial] = useState<string>("mlb");
  const [returnGame, setReturnGame] = useState<{ league: string; eventId: string } | null>(null);
  const [showReturnGame, setShowReturnGame] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; league: string; teamKey?: string } | null>(null);
  const [selectedGame, setSelectedGame] = useState<{ league: string; eventId: string } | null>(null);
  const [teamReturnView, setTeamReturnView] = useState<ViewId>("scores");

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
    view === "teamPage" && activeTeam ? `/api/scoreboard?team=${activeTeam.key}` : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true, revalidateOnReconnect: true }
  );
  const hasLive = scheduleData?.events?.some((e: any) => e.status?.state === "in") || false;

  const openManage = useCallback(() => {
    setManageOpen(true);
    setView("more");
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

      setTeamReturnView(sourceGame?.eventId ? "scores" : (view === "teamPage" ? "scores" : view));
      setSelectedGame(null);
      setSelectedPlayer(null);
      setView("teamPage");
      setActiveTab("schedule");
      setManageOpen(false);
    },
    [favorites, catalogData, view]
  );

  const renderActiveTeamPage = (showSelector: boolean) => (
    <>
      {showSelector && (
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
      )}
      {activeTeam ? (
        <div key={activeTeam.key}>
          <button
            onClick={() => {
              setReturnGame(null);
              setShowReturnGame(false);
              setView(teamReturnView || "scores");
            }}
            className="mb-2 -ml-2 h-10 px-2 flex items-center gap-1 text-base font-semibold"
            style={{ color: "var(--text)" }}
          >
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            Back
          </button>
          {returnGame && (
            <button
              onClick={() => setShowReturnGame(true)}
              className="mb-3 text-sm font-black px-3 py-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--accent)" }}
            >
              Back to game
            </button>
          )}
          <TeamHeader team={activeTeam} />
          <Tabs team={activeTeam} active={activeTab} onChange={setActiveTab} hasLive={hasLive} />
          <div>
            {activeTab === "live" && (
              <LiveGame team={activeTeam} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer({ ...p, teamKey: activeTeam.key })} />
            )}
            {activeTab === "schedule" && (
              <Schedule team={activeTeam} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer({ ...p, teamKey: activeTeam.key })} />
            )}
            {activeTab === "roster" && <Roster team={activeTeam} onPlayerClick={(p) => setSelectedPlayer(p)} />}
            {activeTab === "stats" && <Stats team={activeTeam} onPlayerClick={(p) => setSelectedPlayer(p)} />}
            {activeTab === "standings" && <Standings league={activeTeam.league} teamKey={activeTeam.key} />}
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
  );

  const usesFullTopHeader = !selectedPlayer && !selectedGame && !showReturnGame && (view === "home" || view === "scores");

  return (
    <main className={`retro-page min-h-screen pb-28 px-4 sm:px-6 ${usesFullTopHeader ? "pt-0" : "app-safe-top"}`}>
      <PullToRefresh>
      <div className="max-w-3xl mx-auto">
        {!selectedPlayer && !showReturnGame && !selectedGame && view === "home" && (
          <div className="home-topbar">
            <h1 className="home-topbar-title">Home</h1>
            <AppSettingsButton />
          </div>
        )}


        {selectedGame && !selectedPlayer && (
          <GameDetail
            league={selectedGame.league}
            eventId={selectedGame.eventId}
            onClose={() => setSelectedGame(null)}
            onTeamClick={handleTeamLogoClick}
            onPlayerClick={(p) => setSelectedPlayer(p)}
          />
        )}

        {selectedPlayer && (
          <PlayerDetail player={selectedPlayer} onBack={() => setSelectedPlayer(null)} />
        )}

        {!selectedPlayer && !selectedGame && showReturnGame && returnGame && (
          <GameDetail
            league={returnGame.league}
            eventId={returnGame.eventId}
            onClose={() => {
              setShowReturnGame(false);
              setReturnGame(null);
              setView("scores");
            }}
            onTeamClick={handleTeamLogoClick}
            onPlayerClick={(p) => setSelectedPlayer(p)}
          />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "home" && (
          <HomeDashboard
            onTeamClick={(team) => {
              setTeamReturnView("home");
              setActiveTeam(team);
              setSelectedGame(null);
              setView("teamPage");
              setActiveTab("schedule");
            }}
            onManage={openManage}
            onTeamLogoClick={handleTeamLogoClick}
            onViewLeague={(league) => {
              setLeagueInitial(league);
              setView("leaguePage");
              setManageOpen(false);
            }}
            onPlayerClick={(p) => setSelectedPlayer(p)}
            onOpenGame={(league, eventId) => setSelectedGame({ league, eventId })}
          />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "more" && manageOpen && (
          <ManageTeams onClose={() => setManageOpen(false)} />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "more" && !manageOpen && (
          <MoreView
            onTeamClick={(team) => {
              setTeamReturnView("home");
              setActiveTeam(team);
              setSelectedGame(null);
              setView("teamPage");
              setActiveTab("schedule");
            }}
            onLeagueClick={(league) => {
              setLeagueInitial(league);
              setView("leaguePage");
              setManageOpen(false);
            }}
            onManage={openManage}
          />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "teamPage" && renderActiveTeamPage(false)}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "scores" && <LeaguesView onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer(p)} onStandingsClick={(league) => { setStandingsInitial(league); setView("standings"); }} />}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "leaguePage" && (
          <LeaguesView
            initialLeague={leagueInitial}
            leaguePage
            onBack={() => setView("more")}
            onTeamLogoClick={handleTeamLogoClick}
            onPlayerClick={(p) => setSelectedPlayer(p)}
          />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "standings" && <StandingsPage initialLeague={standingsInitial} />}
      </div>
      </PullToRefresh>
      {!selectedPlayer && !selectedGame && !showReturnGame && view !== "teamPage" && (
        <TopNav
          active={view}
          onChange={(v) => {
            setSelectedPlayer(null);
            setShowReturnGame(false);
            if (v === "standings" && activeTeam?.league) setStandingsInitial(activeTeam.league);
            setView(v);
            setManageOpen(false);
          }}
        />
      )}
    </main>
  );
}
