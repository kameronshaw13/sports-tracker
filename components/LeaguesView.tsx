"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import { League, VALID_LEAGUES, logoUrl } from "@/lib/teams";
import { useAppSettings, ScoreDensity } from "@/lib/useAppSettings";
import { useFavoriteTeams } from "@/lib/useFavorites";
import AppSettingsButton from "./AppSettingsButton";
import GameDetail from "./GameDetail";
import Standings from "./Standings";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const NCAA_LOGO = "/ncaa-logo.png";

const LEAGUE_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "CFB",
  cbb: "CBB",
};

const LEAGUE_FULL_LABELS: Record<League, string> = {
  mlb: "MLB",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  cfb: "College Football",
  cbb: "College Basketball",
};

const LEAGUE_LOGOS: Record<League, string> = {
  mlb: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  nfl: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  nba: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  nhl: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  cfb: NCAA_LOGO,
  cbb: NCAA_LOGO,
};

type Props = {
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }, returnTab?: "main" | "lineup" | "boxscore") => void;
  onGameContext?: (game: { league: string; eventId: string }, returnTab: "main" | "lineup" | "boxscore", scrollY: number) => void;
  initialLeague?: string;
  leaguePage?: boolean;
  onBack?: () => void;
  onStandingsClick?: (league: League) => void;
};

type LeagueTab = "scores" | "stats" | "standings";
type LeagueLeader = { id: string; name: string; displayValue: string; team?: string; rank: number };
type LeagueLeaderCategory = { name: string; displayName: string; leaders: LeagueLeader[] };
type StandingsMode = "division" | "conference" | "wildcard";
type StandingsControl = { id: string; label: string; mode: StandingsMode; conference?: string };

export default function LeaguesView({ onTeamLogoClick, onPlayerClick, onGameContext, initialLeague = "mlb", leaguePage = false, onBack, onStandingsClick }: Props) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [dayOffset, setDayOffset] = useState(0);
  const [league] = useState<League>(safeInitial);
  const [tab, setTab] = useState<LeagueTab>("scores");
  const [standingsView, setStandingsView] = useState<string>(defaultStandingsViewForLeague(safeInitial));
  const [selectedEvent, setSelectedEvent] = useState<{ league: string; eventId: string } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scoresHeaderRef = useRef<HTMLDivElement | null>(null);
  const returnScrollRef = useRef(0);
  const pendingRestoreRef = useRef<number | null>(null);
  const [scoresHeaderHeight, setScoresHeaderHeight] = useState(128);
  const { settings } = useAppSettings();
  const { favorites } = useFavoriteTeams();
  const date = formatDate(dayOffset);
  const standingsControls = useMemo(() => controlsForLeague(league), [league]);
  const activeStandingsControl = standingsControls.find((control) => control.id === standingsView) || standingsControls[0];

  const openEvent = (next: { league: string; eventId: string }) => {
    returnScrollRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    setSelectedEvent(next);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  const closeEvent = () => {
    pendingRestoreRef.current = returnScrollRef.current;
    setSelectedEvent(null);
  };

  useEffect(() => {
    if (selectedEvent || pendingRestoreRef.current == null) return;
    const y = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
    });
  }, [selectedEvent, date, settings.density]);

  useEffect(() => {
    if (leaguePage) return;
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [leaguePage]);

  useEffect(() => {
    if (leaguePage) return;
    const measure = () => {
      const height = scoresHeaderRef.current?.getBoundingClientRect().height;
      if (height) setScoresHeaderHeight(Math.ceil(height));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [leaguePage, dayOffset, settings.density]);

  if (selectedEvent) {
    return (
      <GameDetail
        league={selectedEvent.league}
        eventId={selectedEvent.eventId}
        onClose={closeEvent}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={(player, returnTab = "main") => {
          onGameContext?.(selectedEvent, returnTab, returnScrollRef.current);
          onPlayerClick?.(player, returnTab);
        }}
      />
    );
  }

  if (leaguePage) {
    return (
      <div className="league-page-shell -mx-4 sm:mx-0">
        <LeagueHeader league={league} onBack={onBack} tab={tab} setTab={setTab} />
        <div className="league-page-content px-0 sm:px-0 pt-0">
          {tab === "scores" && (
            <>
              <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
              <div className="mt-3">
                <LeagueDaySection league={league} date={date} density={settings.density} onGameClick={(eventId) => openEvent({ league, eventId })} onStandingsClick={onStandingsClick} stickyTop={0} hideHeader />
              </div>
            </>
          )}
          {tab === "standings" && (
            <div className="league-standings-page">
              {standingsControls.length > 0 && (
                <div className="standings-mode-wrap league-standings-mode-wrap px-2 py-3">
                  <div className={`standings-mode-grid grid gap-2 ${standingsControls.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {standingsControls.map((control) => (
                      <button key={control.id} type="button" onClick={() => setStandingsView(control.id)} className={`standings-mode-btn py-2 text-xs font-black ${standingsView === control.id ? "is-active" : ""}`}>
                        {control.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Standings
                league={league}
                showHeader={false}
                pageMode={league === "cbb" || league === "cfb" ? "conference" : activeStandingsControl?.mode || "division"}
                conferenceFilter={activeStandingsControl?.conference}
                showFilterControls={league === "cbb" || league === "cfb"}
                onTeamClick={onTeamLogoClick}
              />
            </div>
          )}
          {tab === "stats" && <LeagueStats league={league} />}
        </div>
      </div>
    );
  }

  const leagues = settings.sportOrder;
  const favoriteKeys = new Set((favorites || []).map((t) => t.key));
  const leagueStickyTop = Math.max(0, scoresHeaderHeight - 4);

  return (
    <div className="-mx-4 sm:mx-0">
      <div ref={scoresHeaderRef} className="sticky top-0 z-40 px-4 pb-2 scores-sticky-header" style={{ background: "var(--bg)" }}>
        <div className="relative flex min-h-[4.05rem] items-center justify-between">
          <h1 className="absolute left-0 top-1/2 -translate-y-1/2 retro-title scores-page-heading text-[2.42rem] tracking-[.02em]">
            Scores
          </h1>
          <div className="ml-auto flex items-center">
            <AppSettingsButton />
          </div>
        </div>
        <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
      </div>

      <div>
        <FavoritesScores date={date} favoriteKeys={favoriteKeys} stickyTop={leagueStickyTop} onGameClick={(league, eventId) => openEvent({ league, eventId })} />
        {leagues.map((lg) => (
          <LeagueDaySection key={`${lg}-${date}`} league={lg} date={date} density={settings.density} onGameClick={(eventId) => openEvent({ league: lg, eventId })} onStandingsClick={onStandingsClick} stickyTop={leagueStickyTop} />
        ))}
      </div>
    </div>
  );
}

function LeagueHeader({ league, onBack, tab, setTab }: { league: League; onBack?: () => void; tab: LeagueTab; setTab: (tab: LeagueTab) => void }) {
  return (
    <div className="league-page-header overflow-hidden" style={{ background: leagueHeaderColor(league) }}>
      <div className="px-4 pt-3 pb-4">
        <div className="relative flex items-center justify-center min-h-[36px]">
          <button onClick={onBack} className="league-page-back absolute left-0 flex items-center justify-center text-base font-semibold" aria-label="Back">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <h1 className="text-lg font-black">{LEAGUE_LABELS[league]}</h1>
        </div>
        <div className="mt-3 flex justify-center">
          <Image src={LEAGUE_LOGOS[league]} alt={LEAGUE_LABELS[league]} width={68} height={68} className="object-contain logo-outline-dark" unoptimized />
        </div>
      </div>
      <div className="league-page-tabs flex gap-7 overflow-x-auto px-4">
        {(["scores", "stats", "standings"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)} className="py-3 relative text-base font-black whitespace-nowrap" style={{ color: tab === id ? "#fff" : "rgba(255,255,255,0.72)" }}>
            {id === "scores" ? "Scores" : id === "stats" ? "Stats" : "Standings"}
            {tab === id && <span className="absolute left-0 right-0 -bottom-px h-1" style={{ background: "#fff" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function CbsDateBar({ dayOffset, setDayOffset }: { dayOffset: number; setDayOffset: (offset: number) => void }) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const days = useMemo(() => Array.from({ length: 15 }, (_, i) => i - 7).map((offset) => ({ offset, label: dateBarLabel(offset) })), []);

  useLayoutEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
  }, [dayOffset]);

  return (
    <div className="retro-datebar flex overflow-x-auto gap-2 px-0 py-1 no-scrollbar">
      {days.map((d) => {
        const selected = dayOffset === d.offset;
        return (
          <button
            key={d.offset}
            ref={selected ? selectedRef : null}
            onClick={() => setDayOffset(d.offset)}
            className={`relative min-w-[74px] px-2.5 py-1.5 text-center transition-all ${selected ? "active-date" : ""}`}
            style={{ color: selected ? "var(--text)" : "var(--text-2)" }}
          >
            <div className="text-[0.76rem] font-semibold whitespace-nowrap leading-[1.15]">{d.label}</div>
            
          </button>
        );
      })}
    </div>
  );
}

function controlsForLeague(league: League): StandingsControl[] {
  if (league === "cfb" || league === "cbb") return [];
  if (league === "mlb") return [
    { id: "american", label: "American", mode: "division", conference: "American League" },
    { id: "national", label: "National", mode: "division", conference: "National League" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
  if (league === "nfl") return [
    { id: "afc", label: "AFC", mode: "division", conference: "AFC" },
    { id: "nfc", label: "NFC", mode: "division", conference: "NFC" },
    { id: "conference", label: "Conference", mode: "wildcard" },
  ];
  if (league === "nhl") return [
    { id: "east", label: "Eastern", mode: "division", conference: "Eastern Conference" },
    { id: "west", label: "Western", mode: "division", conference: "Western Conference" },
    { id: "conference", label: "Conference", mode: "wildcard" },
  ];
  if (league === "nba") return [
    { id: "east", label: "Eastern", mode: "division", conference: "Eastern Conference" },
    { id: "west", label: "Western", mode: "division", conference: "Western Conference" },
    { id: "conference", label: "Conference", mode: "conference" },
  ];
  return [
    { id: "division", label: "Division", mode: "division" },
    { id: "conference", label: "Conference", mode: "conference" },
    { id: "wildcard", label: "Wild Card", mode: "wildcard" },
  ];
}

function defaultStandingsViewForLeague(league: League) {
  if (league === "mlb") return "american";
  if (league === "nfl") return "afc";
  if (league === "nhl" || league === "nba") return "east";
  return "division";
}

function FavoritesScores({ date, favoriteKeys, stickyTop, onGameClick }: { date: string; favoriteKeys: Set<string>; stickyTop: number | string; onGameClick: (league: League, eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { settings } = useAppSettings();
  const requests = settings.sportOrder.map((league) => useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, { refreshInterval: 15_000, dedupingInterval: 4_000 }));
  const games = requests.flatMap((req, idx) => {
    const league = settings.sportOrder[idx];
    return (req.data?.events || [])
      .map((g: any) => ({ ...g, league, favoriteSide: favoriteSideForGame(g, favoriteKeys, league) }))
      .filter((g: any) => Boolean(g.favoriteSide));
  });
  useEffect(() => {
    persistPregameOdds(games);
  }, [games]);

  if (!games.length) return null;
  return (
    <>
      <section className="mt-3 border-b" style={{ borderColor: "var(--border)" }}>
        <SectionHeader title="Favorites" sticky stickyTop={stickyTop} />
        <div className="grid grid-cols-1">
          {games.slice(0, 4).map((game: any) => <ScoreCard key={`${game.league}-${game.id}`} league={game.league} game={game} density="expanded" favorite favoriteSide={game.favoriteSide} onClick={() => onGameClick(game.league, game.id)} />)}
        </div>
      </section>
    </>
  );
}

function LeagueDaySection({ league, date, density, onGameClick, onStandingsClick, stickyTop = 124, hideHeader = false }: { league: League; date: string; density: ScoreDensity; onGameClick: (eventId: string) => void; onStandingsClick?: (league: League) => void; stickyTop?: number | string; hideHeader?: boolean }) {
  const freshKey = useFreshKey();
  const [collapsed, setCollapsed] = useState(false);
  const { data, error, isLoading } = useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = [...(data?.events || [])].sort((a: any, b: any) => statusRank(a) - statusRank(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
  useEffect(() => {
    persistPregameOdds(events.map((game: any) => ({ ...game, league })));
  }, [events, league]);

  if (!isLoading && (!events.length || error)) return null;
  const compactGrid = density === "compact";
  const hasOddCompactGrid = compactGrid && events.length % 2 === 1;

  return (
    <>
    <section className={`mt-3 ${hasOddCompactGrid ? "" : "border-b"}`} style={{ borderColor: "var(--border)" }}>
      {!hideHeader && (
        <SectionHeader
          title={LEAGUE_LABELS[league]}
          logo={LEAGUE_LOGOS[league]}
          sticky
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onStandingsClick={onStandingsClick ? () => onStandingsClick(league) : undefined}
          stickyTop={stickyTop}
        />
      )}
      {!collapsed && (isLoading ? (
        <div className={compactGrid ? "grid grid-cols-2" : "grid grid-cols-1"}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[112px] animate-pulse border-t" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />)}
        </div>
      ) : (
        <div className={compactGrid ? "grid grid-cols-2" : "grid grid-cols-1"}>
          {events.map((game: any) => <ScoreCard key={game.id} league={league} game={game} density={density} onClick={() => onGameClick(game.id)} />)}
        </div>
      ))}
    </section>
    </>
  );
}

function SectionHeader({ title, logo, sticky = false, collapsed = false, onToggle, onStandingsClick, stickyTop = 124 }: { title: string; logo?: string; sticky?: boolean; collapsed?: boolean; onToggle?: () => void; onStandingsClick?: () => void; stickyTop?: number | string }) {
  return (
    <div
      className={`retro-league-head px-4 py-1.5 flex items-center justify-between ${sticky ? "sticky z-20" : ""}`}
      style={{ top: sticky ? stickyTop : undefined }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {logo && <Image src={logo} alt={title} width={22} height={22} className="object-contain logo-outline-dark" unoptimized />}
        <h2 className="text-sm font-black tracking-[.1em] uppercase truncate leading-[1.25] pt-[2px]">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {onStandingsClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStandingsClick(); }}
            className="standings-header-btn rounded-lg px-2.5 py-0 text-[9px] font-black tracking-wide inline-flex items-center justify-center text-center"
            style={{ background: "rgba(0,0,0,.16)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            STANDINGS
          </button>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,0,0,.16)", color: "var(--accent)", border: "1px solid var(--border)" }}
            aria-label={collapsed ? `Show ${title} scores` : `Hide ${title} scores`}
          >
            <svg viewBox="0 0 24 24" className={`w-5 h-5 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function scoreShouldShow(game: any) {
  const state = game?.status?.state;
  const detail = `${game?.status?.detail || ""} ${game?.status?.type?.description || ""} ${game?.status?.type?.shortDetail || ""}`.toLowerCase();
  if (/postponed|canceled|cancelled|ppd/.test(detail)) return false;
  return state === "in" || state === "post";
}


function scoreTeamLogoSrc(team: any, league: League) {
  return team?.logo || (team?.abbr ? logoUrl({ league, abbr: team.abbr }) : "");
}

function ScoreTeamLogo({ team, league, size }: { team: any; league: League; size: number }) {
  const src = scoreTeamLogoSrc(team, league);
  const rawId = useId();
  if (!src) return null;

  const alt = team?.abbr || team?.name || "Team logo";
  const filterId = `score-logo-outline-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <span className="score-team-logo-wrap espn-team-logo-wrap" style={{ width: size, height: size }}>
      <svg className="team-logo-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={alt}>
        <defs>
          <filter id={filterId} x="-4" y="-4" width={size + 8} height={size + 8} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="0.9" result="expanded" />
            <feFlood floodColor="#fff" floodOpacity="1" result="white" />
            <feComposite in="white" in2="expanded" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <image href={src} width={size} height={size} preserveAspectRatio="xMidYMid meet" filter={`url(#${filterId})`} />
      </svg>
    </span>
  );
}

function favoriteAccent(team: any) {
  return team?.primary || team?.color || "#f97316";
}

function ScoreCard({ league, game, density, favorite = false, favoriteSide, onClick }: { league: League; game: any; density: ScoreDensity; favorite?: boolean; favoriteSide?: "away" | "home" | null; onClick: () => void }) {
  const state = game.status?.state;
  const isLive = state === "in";
  const compact = density === "compact" && !favorite;
  const favoriteTeam = favoriteSide === "home" ? game.home : game.away;

  if (favorite) {
    return (
      <button
        onClick={onClick}
        className="retro-score-card relative min-h-[150px] p-4 text-left border-t active:scale-[0.99] favorite-score-card"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="favorite-score-content pr-1">
          <div className="favorite-score-meta score-game-meta mb-1.5 flex items-start justify-between gap-2 text-[9.5px] font-black uppercase tracking-[.06em] cbs-blue-label">
            <span className="truncate block">{gameTimeLabel(game)}</span>
            {league === "mlb" && isLive && game.situation && <BasesDiamondMini situation={game.situation} />}
          </div>
          <TeamLine team={game.away} league={league} compact={false} favorite game={game} showLogo />
          <TeamLine team={game.home} league={league} compact={false} favorite game={game} showLogo />
          <ScoreCardSubline league={league} game={game} density={density} />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="retro-score-card min-h-[136px] p-3.5 text-left border-t sm:odd:border-r active:scale-[0.99]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="score-game-meta text-[9.5px] font-black uppercase tracking-[.06em] min-w-0" style={{ color: "var(--accent)" }}>
            <span className="block truncate">{gameTimeLabel(game)}</span>
          </div>
          {league === "mlb" && isLive && game.situation && <BasesDiamondMini situation={game.situation} />}
        </div>
      </div>
      <TeamLine team={game.away} league={league} compact={compact} game={game} />
      <TeamLine team={game.home} league={league} compact={compact} game={game} />
      <ScoreCardSubline league={league} game={game} density={density} />
    </button>
  );
}

function TeamLine({ team, league, compact, favorite, game, showLogo = true }: { team: any; league: League; compact: boolean; favorite?: boolean; game: any; showLogo?: boolean }) {
  if (!team) return null;
  const img = team.logo || (team.abbr ? logoUrl({ league, abbr: team.abbr }) : null);
  const recordText = seriesTeamRecord(game, team) || team.record;
  const label = compact ? team.abbr : favoriteTeamLabel(team, league);
  const showScore = scoreShouldShow(game) && team.score !== undefined && team.score !== null && team.score !== "";
  const oddsText = !showScore ? scoreOddsText(game, team) : null;
  const hasWinner = Boolean(game?.away?.winner || game?.home?.winner);
  const isWinner = Boolean(team?.winner);
  return (
    <div className={`score-team-row flex items-center ${showLogo ? "gap-2.5" : "gap-0"} py-0.5 ${hasWinner ? "has-winner-state" : ""} ${isWinner ? "winner-row" : hasWinner ? "loser-row" : ""}`}>
      {hasWinner && <span className={`winner-marker ${isWinner ? "is-visible" : ""}`} aria-hidden />}
      {showLogo && <div className="score-team-logo-cell">{img && <ScoreTeamLogo team={team} league={league} size={favorite ? 28 : 26} />}</div>}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <span className={`${favorite ? "text-[18px] uppercase" : "text-[16.5px]"} score-team-name truncate tracking-tight ${isWinner || !hasWinner ? "font-black" : "font-medium"}`}>{label}</span>
        {recordText && <span className={`text-[10px] tracking-tight score-card-meta ${isWinner ? "font-semibold" : "font-normal"}`} style={{ color: "var(--score-meta)" }}>{recordText}</span>}
      </div>
      {showScore && <span className={`score-card-number ${favorite ? "text-[18px]" : "text-[16.5px]"} score-team-name tracking-tight ${isWinner || !hasWinner ? "font-black opacity-100" : "font-medium opacity-60"}`} style={{ color: "var(--text)" }}>{team.score}</span>}
      {!showScore && oddsText && <span className="score-card-odds">{oddsText}</span>}
    </div>
  );
}

function scoreOddsText(game: any, team: any) {
  const odds = game?.odds;
  if (!odds) return null;
  const side = String(team?.homeAway || "").toLowerCase();
  if (side === "away") return odds.overUnder || null;
  if (side === "home") return cleanMoneyLineText(odds.homeMoneyLine || odds.details, team?.abbr);
  return null;
}

function favoriteTeamLabel(team: any, league: League) {
  const full = String(team?.name || team?.displayName || team?.short || team?.abbr || "").trim();
  const short = String(team?.short || full || team?.abbr || "").trim();
  const raw = short || full;
  const stripped = raw
    .replace(/^(Arizona|Atlanta|Baltimore|Boston|Buffalo|Calgary|Carolina|Charlotte|Chicago|Cincinnati|Cleveland|Colorado|Columbus|Dallas|Denver|Detroit|Golden State|Green Bay|Houston|Indiana|Jacksonville|Kansas City|Las Vegas|Los Angeles|LA|Memphis|Miami|Milwaukee|Minnesota|Montreal|Nashville|New England|New Jersey|New Orleans|New York|NY|Oakland|Oklahoma City|Orlando|Ottawa|Philadelphia|Phoenix|Pittsburgh|Portland|Sacramento|San Antonio|San Diego|San Francisco|Seattle|St\.? Louis|Tampa Bay|Texas|Toronto|Utah|Vancouver|Vegas|Washington)\s+/i, "")
    .replace(/^(University of|Univ\.? of|College of)\s+/i, "")
    .replace(/^(Texas|UTSA|Illinois|Kansas State|Kansas St\.?|Miami|Appalachian State|Appalachian St\.?|ULM|Albany|Grambling State|Grambling St\.?)\s+/i, "")
    .trim();
  return toTitleCase(stripped || raw || team?.abbr || "");
}

function seriesTeamRecord(game: any, team: any) {
  if (!game?.isPlayoff || !team) return null;
  return team.seriesRecord || null;
}

function ScoreCardSubline({ league, game, density }: { league: League; game: any; density: ScoreDensity }) {
  if (league === "mlb" && game.status?.state === "in" && game.situation) {
    const balls = game.situation.balls ?? 0;
    const strikes = game.situation.strikes ?? 0;
    const outs = game.situation.outs ?? 0;
    const outLabel = outs === 1 ? "1 Out" : `${outs} Outs`;
    return (
      <div className="mt-1 text-[10px] font-medium tracking-tight tabular-nums score-card-subline" style={{ color: "var(--score-meta)" }}>
        {balls}-{strikes}, {outLabel}
      </div>
    );
  }

  const subline = sublineForGame(league, game, density);
  if (!subline) return null;
  return <div className="mt-1 text-[10px] font-medium tracking-tight truncate score-card-subline" style={{ color: "var(--score-meta)" }}>{subline}</div>;
}

function BasesDiamondMini({ situation }: { situation: any }) {
  return (
    <svg width="24" height="19" viewBox="0 0 34 28" aria-label="Bases">
      <g transform="translate(17 7) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={situation.onSecond ? "var(--accent)" : "var(--surface-2)"} stroke="var(--text-3)" strokeWidth="1.1" /></g>
      <g transform="translate(26 17) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={situation.onFirst ? "var(--accent)" : "var(--surface-2)"} stroke="var(--text-3)" strokeWidth="1.1" /></g>
      <g transform="translate(8 17) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={situation.onThird ? "var(--accent)" : "var(--surface-2)"} stroke="var(--text-3)" strokeWidth="1.1" /></g>
    </svg>
  );
}

function LeagueStats({ league }: { league: League }) {
  const { data, isLoading } = useSWR<{ categories: LeagueLeaderCategory[] }>(`/api/league-leaders?league=${league}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const categories = data?.categories || [];
  if (isLoading) {
    return (
      <div className="league-leaders-grid">
        {[0, 1, 2].map((i) => <div key={i} className="league-leader-card h-44 animate-pulse" />)}
      </div>
    );
  }
  if (!categories.length) {
    return (
      <div className="league-leader-empty">
        League leaders are not available yet.
      </div>
    );
  }
  return (
    <div className="league-leaders-page">
      <div className="league-leaders-title">{LEAGUE_FULL_LABELS[league]} Leaders</div>
      <div className="league-leaders-grid">
        {categories.map((category) => (
          <section key={category.name} className="league-leader-card">
            <h2>{category.displayName}</h2>
            <div className="league-leader-list">
              {category.leaders.slice(0, 5).map((leader) => (
                <div key={`${category.name}-${leader.id}-${leader.rank}`} className="league-leader-row">
                  <div className="league-leader-rank">{leader.rank}</div>
                  <div className="league-leader-name">
                    <span>{leader.name}</span>
                    {leader.team && <em>{leader.team}</em>}
                  </div>
                  <div className="league-leader-value">{leader.displayValue}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function favoriteSideForGame(game: any, favoriteKeys: Set<string>, league: League): "away" | "home" | null {
  const awayAbbr = String(game?.away?.abbr || "").toLowerCase();
  const homeAbbr = String(game?.home?.abbr || "").toLowerCase();
  if (awayAbbr && favoriteKeys.has(`${league}-${awayAbbr}`)) return "away";
  if (homeAbbr && favoriteKeys.has(`${league}-${homeAbbr}`)) return "home";
  return null;
}

function pitcherNameMatchup(value: string | null | undefined, includeInitial = false) {
  const raw = String(value || "TBD vs TBD");
  const parts = raw.split(/\s+vs\s+/i);
  const clean = (name: string | undefined) => {
    const n = String(name || "").trim();
    if (!n || /probable|starting pitcher|starter|^tbd$/i.test(n)) return "TBD";
    const withoutParen = n.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const tokens = withoutParen.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] || "TBD";
    if (includeInitial && tokens.length > 1) return `${tokens[0][0]}. ${last}`;
    return last;
  };
  return `${clean(parts[0])} vs ${clean(parts[1])}`;
}

function gameMatchesFavorites(game: any, favoriteKeys: Set<string>, league: League) {
  const teams = [game.away, game.home].filter(Boolean);
  return teams.some((t: any) => {
    const abbr = String(t.abbr || "").toLowerCase();
    return favoriteKeys.has(`${league}-${abbr}`);
  });
}

function sublineForGame(league: League, game: any, density: ScoreDensity) {
  if (game.status?.state === "post") {
    if ((league === "nba" || league === "nhl") && game.isPlayoff) {
      return game.seriesGame || game.seriesSummary || "";
    }
    const oddsLine = completedOddsLine(game, league);
    if (oddsLine) return oddsLine;
    if (league === "mlb" && game.pitchers) return pitcherNameMatchup(game.pitchers, density === "expanded");
    return "";
  }
  if (league === "mlb") {
    const withInitial = density === "expanded";
    if (game.status?.state === "pre") return pitcherNameMatchup(game.pitchers || "TBD vs TBD", withInitial);
    if (game.pitchers) return pitcherNameMatchup(game.pitchers, withInitial);
  }
  if ((league === "nba" || league === "nhl" || league === "mlb") && game.isPlayoff) {
    return game.seriesGame || game.seriesSummary || "";
  }
  if (game.note) return game.note;
  return game.status?.type?.shortDetail || game.status?.detail || "";
}

function completedOddsLine(game: any, league: League): string | null {
  const odds = game?.odds || getCachedPregameOdds(league, game?.id);
  if (!odds) return null;

  const awayScore = Number(game?.away?.score);
  const homeScore = Number(game?.home?.score);
  const totalRuns = awayScore + homeScore;
  const hasScore = Number.isFinite(awayScore) && Number.isFinite(homeScore);

  const winner = hasScore && awayScore !== homeScore
    ? awayScore > homeScore
      ? { team: game.away, odds: odds.awayMoneyLine || moneyLineForTeam(odds.details, game.away) }
      : { team: game.home, odds: odds.homeMoneyLine || moneyLineForTeam(odds.details, game.home) }
    : null;

  const parts: string[] = [];
  if (winner?.team && winner.odds) {
    parts.push(`${favoriteTeamLabel(winner.team, league)} (${winner.odds})`);
  }

  const total = parseOverUnder(odds.overUnder || odds.details);
  if (hasScore && total != null) {
    const label = totalRuns > total ? "Over" : totalRuns < total ? "Under" : "Push";
    parts.push(`${label} ${formatTotal(total)}`);
  }

  return parts.length ? parts.join(", ") : null;
}

function persistPregameOdds(games: any[]) {
  if (typeof window === "undefined") return;
  for (const game of games || []) {
    if (!game?.id || !game?.league || !game?.odds) continue;
    const state = String(game?.status?.state || "");
    if (state === "post") continue;
    try {
      window.localStorage.setItem(pregameOddsKey(game.league, game.id), JSON.stringify(game.odds));
    } catch {}
  }
}

function getCachedPregameOdds(league: League, eventId: any) {
  if (typeof window === "undefined" || !eventId) return null;
  try {
    const raw = window.localStorage.getItem(pregameOddsKey(league, eventId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pregameOddsKey(league: string, eventId: any) {
  return `sportsTrackerPregameOdds:${league}:${eventId}`;
}

function cleanMoneyLineText(value: any, abbr?: string): string | null {
  const fromDetails = moneyLineFromDetails(value, abbr);
  if (fromDetails) return fromDetails;
  const match = String(value || "").match(/[+-]\d{2,4}/);
  return match ? match[0] : null;
}

function moneyLineForTeam(value: any, team: any): string | null {
  const candidates = [
    team?.abbr,
    team?.short,
    team?.name,
    team?.displayName,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const match = moneyLineFromDetails(value, candidate);
    if (match) return match;
  }
  return null;
}

function moneyLineFromDetails(value: any, abbr?: string): string | null {
  const text = String(value || "");
  const team = String(abbr || "").trim();
  if (team) {
    const escaped = team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const teamMatch = text.match(new RegExp(`\\b${escaped}\\b\\s*([+-]\\d{2,4})`, "i"));
    if (teamMatch) return teamMatch[1];
  }
  const first = text.match(/[+-]\d{2,4}/);
  return first ? first[0] : null;
}

function parseOverUnder(value: any): number | null {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const total = Number(match[0]);
  return Number.isFinite(total) ? total : null;
}

function formatTotal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function statusRank(game: any) {
  if (game.status?.state === "in") return 0;
  if (game.status?.state === "pre") return 1;
  return 2;
}

function leagueHeaderColor(league: League) {
  const colors: Record<League, string> = { mlb: "#12345c", nfl: "#06355f", nba: "#244a8f", nhl: "#1f2937", cfb: "#214a35", cbb: "#433061" };
  return colors[league];
}

function toTitleCase(value: string) { return String(value).toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()); }

function formatDate(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }
function dateBarLabel(offset: number) {
  if (offset === 0) return "Today";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${weekday} ${month} ${d.getDate()}`;
}
function gameTimeLabel(game: any) {
  if (game.status?.state === "pre") return formatCentralTime(game.date);
  return game.status?.detail || formatCentralTime(game.date);
}
function formatCentralTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).replace(" ", "");
}
