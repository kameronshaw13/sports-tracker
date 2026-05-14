"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import TopNav, { ViewId } from "@/components/TopNav";
import TeamSelector from "@/components/TeamSelector";
import TeamHeader from "@/components/TeamHeader";
import Tabs, { TabId } from "@/components/Tabs";
import PullToRefresh from "@/components/PullToRefresh";
import {
  TeamConfig,
  League,
  getSport,
  makeKey,
  VALID_LEAGUES,
} from "@/lib/teams";
import { useFavoriteTeams } from "@/lib/useFavorites";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const HomeDashboard = dynamic(() => import("@/components/HomeDashboard"));
const LeaguesView = dynamic(() => import("@/components/LeaguesView"));
const MoreView = dynamic(() => import("@/components/MoreView"));
const Schedule = dynamic(() => import("@/components/Schedule"));
const Roster = dynamic(() => import("@/components/Roster"));
const Stats = dynamic(() => import("@/components/Stats"));
const Standings = dynamic(() => import("@/components/Standings"));
const StandingsPage = dynamic(() => import("@/components/StandingsPage"));
const LiveGame = dynamic(() => import("@/components/LiveGame"));
const ManageTeams = dynamic(() => import("@/components/ManageTeams"));
const GameDetail = dynamic(() => import("@/components/GameDetail"));
const PlayerDetail = dynamic(() => import("@/components/PlayerDetail"));

function resetScrollTop() {
  if (typeof window === "undefined") return;
  const snapTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  snapTop();
  window.requestAnimationFrame(() => {
    snapTop();
    window.requestAnimationFrame(snapTop);
  });
  window.setTimeout(snapTop, 80);
}

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
  const [selectedGameTab, setSelectedGameTab] = useState<"main" | "boxscore">("main");
  const [teamReturnView, setTeamReturnView] = useState<ViewId>("scores");
  const lastScreenRef = useRef("");
  const gameReturnScrollRef = useRef(0);
  const pendingGameRestoreRef = useRef<number | null>(null);

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

  useEffect(() => {
    const screenKey = selectedPlayer
      ? `player:${selectedPlayer.id}`
      : selectedGame
        ? `game:${selectedGame.league}:${selectedGame.eventId}`
        : showReturnGame && returnGame
          ? `return-game:${returnGame.league}:${returnGame.eventId}`
          : `${view}:${activeTeam?.key || ""}:${activeTab}:${manageOpen}:${leagueInitial}:${standingsInitial}`;
    if (lastScreenRef.current === screenKey) return;
    lastScreenRef.current = screenKey;
    resetScrollTop();
  }, [view, activeTeam?.key, activeTab, manageOpen, leagueInitial, standingsInitial, selectedGame, selectedPlayer, showReturnGame, returnGame]);

  useEffect(() => {
    if (selectedGame || pendingGameRestoreRef.current == null) return;
    const y = pendingGameRestoreRef.current;
    pendingGameRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
    });
  }, [selectedGame, view]);

  const openManage = useCallback(() => {
    setManageOpen(true);
    setView("more");
  }, []);

  const openGame = useCallback((league: string, eventId: string, returnView: ViewId) => {
    gameReturnScrollRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setTeamReturnView(returnView);
    setSelectedGameTab("main");
    setReturnGame(null);
    setShowReturnGame(false);
    setSelectedGame({ league, eventId });
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

      setTeamReturnView(sourceGame?.eventId ? (view === "teamPage" ? teamReturnView : view) : (view === "teamPage" ? "scores" : view));
      setSelectedGame(null);
      setSelectedPlayer(null);
      setView("teamPage");
      setActiveTab("schedule");
      setManageOpen(false);
    },
    [favorites, catalogData, view, teamReturnView]
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
        <div key={activeTeam.key} className="team-page-shell">
          <div className="team-sticky-shell" style={{ ["--team-primary" as any]: activeTeam.primary, ["--team-secondary" as any]: activeTeam.secondary }}>
            <div className="team-header-actions -mx-4 sm:mx-0">
              <button
                onClick={() => {
                  if (returnGame) {
                    setShowReturnGame(true);
                    setSelectedGame(null);
                    resetScrollTop();
                    return;
                  }
                  setReturnGame(null);
                  setShowReturnGame(false);
                  setView(teamReturnView || "scores");
                  resetScrollTop();
                }}
                className="team-back-btn"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </div>
            <TeamHeader team={activeTeam} />
            <Tabs team={activeTeam} active={activeTab} onChange={setActiveTab} hasLive={hasLive} />
          </div>
          <div className="team-page-content">
            {activeTab === "live" && (
              <LiveGame team={activeTeam} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer({ ...p, teamKey: activeTeam.key })} />
            )}
            {activeTab === "schedule" && (
              <Schedule team={activeTeam} onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p) => setSelectedPlayer({ ...p, teamKey: activeTeam.key })} />
            )}
            {activeTab === "roster" && <Roster team={activeTeam} mode="active" onPlayerClick={(p) => setSelectedPlayer(p)} />}
            {activeTab === "stats" && <Stats team={activeTeam} onPlayerClick={(p) => setSelectedPlayer(p)} />}
            {activeTab === "standings" && <Standings league={activeTeam.league} teamKey={activeTeam.key} teamView onTeamClick={handleTeamLogoClick} />}
            {activeTab === "injuries" && <Roster team={activeTeam} mode="injured" onPlayerClick={(p) => setSelectedPlayer(p)} />}
            {activeTab === "transactions" && <Roster team={activeTeam} mode="transactions" onPlayerClick={(p) => setSelectedPlayer(p)} />}
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

  const gameDetailOpen = !selectedPlayer && Boolean(selectedGame || showReturnGame);
  const usesFullTopHeader = gameDetailOpen || (!selectedPlayer && !selectedGame && !showReturnGame && (view === "home" || view === "scores" || view === "standings" || view === "more" || view === "teamPage" || view === "leaguePage"));
  const pullRefreshDisabled = Boolean(
    selectedPlayer ||
    selectedGame ||
    showReturnGame ||
    manageOpen ||
    view === "teamPage" ||
    view === "leaguePage" ||
    view === "standings"
  );

  return (
    <main className={`retro-page view-${view} min-h-screen pb-28 px-4 sm:px-6 ${usesFullTopHeader ? "pt-0" : "app-safe-top"}`}>
      <PullToRefresh disabled={pullRefreshDisabled}>
      <div className="max-w-3xl mx-auto">
        {!selectedPlayer && !showReturnGame && !selectedGame && view === "home" && (
          <div className="home-topbar">
            <h1 className="home-topbar-title">Home</h1>
          </div>
        )}


        {selectedGame && !selectedPlayer && (
          <GameDetail
            league={selectedGame.league}
            eventId={selectedGame.eventId}
            initialTab={selectedGameTab}
            onClose={() => {
              pendingGameRestoreRef.current = gameReturnScrollRef.current;
              setSelectedGame(null);
            }}
            onTeamClick={handleTeamLogoClick}
            onPlayerClick={(p, returnTab = "main") => {
              setSelectedGameTab(returnTab);
              setSelectedPlayer(p);
            }}
          />
        )}

        {selectedPlayer && (
          <PlayerDetail player={selectedPlayer} onBack={() => {
            setSelectedPlayer(null);
            resetScrollTop();
          }} />
        )}

        {!selectedPlayer && !selectedGame && showReturnGame && returnGame && (
          <GameDetail
            league={returnGame.league}
            eventId={returnGame.eventId}
            initialTab={selectedGameTab}
            onClose={() => {
              setShowReturnGame(false);
              setReturnGame(null);
              setView(teamReturnView || "scores");
            }}
            onTeamClick={handleTeamLogoClick}
            onPlayerClick={(p, returnTab = "main") => {
              setSelectedGameTab(returnTab);
              setSelectedPlayer(p);
            }}
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
            onOpenGame={(league, eventId) => openGame(league, eventId, "home")}
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

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "scores" && <LeaguesView onTeamLogoClick={handleTeamLogoClick} onPlayerClick={(p, returnTab = "main") => { setSelectedGameTab(returnTab); setSelectedPlayer(p); }} onGameContext={(game, returnTab, scrollY) => { gameReturnScrollRef.current = scrollY; setSelectedGameTab(returnTab); setSelectedGame(game); }} onStandingsClick={(league) => { setStandingsInitial(league); setView("standings"); }} />}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "leaguePage" && (
          <LeaguesView
            initialLeague={leagueInitial}
            leaguePage
            onBack={() => setView("more")}
            onTeamLogoClick={handleTeamLogoClick}
            onPlayerClick={(p, returnTab = "main") => { setSelectedGameTab(returnTab); setSelectedPlayer(p); }}
            onGameContext={(game, returnTab, scrollY) => { gameReturnScrollRef.current = scrollY; setSelectedGameTab(returnTab); setSelectedGame(game); }}
          />
        )}

        {!selectedPlayer && !selectedGame && !showReturnGame && view === "standings" && <StandingsPage initialLeague={standingsInitial} onTeamClick={(league, abbr) => handleTeamLogoClick(league, abbr)} />}
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
