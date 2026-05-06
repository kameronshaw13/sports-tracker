"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
  initialLeague?: string;
  leaguePage?: boolean;
  onBack?: () => void;
  onStandingsClick?: (league: League) => void;
};

type LeagueTab = "scores" | "stats" | "standings";

export default function LeaguesView({ onTeamLogoClick, onPlayerClick, initialLeague = "mlb", leaguePage = false, onBack, onStandingsClick }: Props) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [dayOffset, setDayOffset] = useState(0);
  const [league] = useState<League>(safeInitial);
  const [tab, setTab] = useState<LeagueTab>("scores");
  const [selectedEvent, setSelectedEvent] = useState<{ league: string; eventId: string } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { settings } = useAppSettings();
  const { favorites } = useFavoriteTeams();
  const date = formatDate(dayOffset);

  useEffect(() => {
    if (leaguePage) return;
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [leaguePage]);

  if (selectedEvent) {
    return (
      <GameDetail
        league={selectedEvent.league}
        eventId={selectedEvent.eventId}
        onClose={() => setSelectedEvent(null)}
        onTeamClick={onTeamLogoClick}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  if (leaguePage) {
    return (
      <div className="-mx-4 sm:mx-0">
        <LeagueHeader league={league} onBack={onBack} tab={tab} setTab={setTab} />
        <div className="px-4 sm:px-0 pt-3">
          {tab === "scores" && (
            <>
              <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
              <div className="mt-3">
                <LeagueDaySection league={league} date={date} density={settings.density} onGameClick={(eventId) => setSelectedEvent({ league, eventId })} onStandingsClick={onStandingsClick} stickyTop={0} />
              </div>
            </>
          )}
          {tab === "standings" && <Standings league={league} showHeader={false} pageMode={league === "cfb" ? "conference" : "division"} showFilterControls={league === "cfb"} />}
          {tab === "stats" && <LeagueStatsPlaceholder league={league} />}
        </div>
      </div>
    );
  }

  const leagues = settings.sportOrder;
  const favoriteKeys = new Set((favorites || []).map((t) => t.key));

  return (
    <div className="-mx-4 sm:mx-0">
      <div className="sticky top-0 z-40 px-4 pb-2 scores-sticky-header" style={{ background: "var(--bg)", borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent" }}>
        <div className="relative flex min-h-[4.05rem] items-center justify-between">
          <h1
            className={`absolute top-1/2 -translate-y-1/2 retro-title scores-page-heading transition-[left,transform,font-size,letter-spacing] duration-500 ease-[cubic-bezier(.22,.9,.28,1)] ${scrolled ? "left-1/2 -translate-x-1/2 text-[1.16rem] tracking-[.04em]" : "left-0 translate-x-0 text-[2.55rem] tracking-[.02em]"}`}
          >
            Scores
          </h1>
          <div className="ml-auto flex items-center">
            <AppSettingsButton />
          </div>
        </div>
        <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
      </div>

      <div>
        <FavoritesScores date={date} favoriteKeys={favoriteKeys} onGameClick={(league, eventId) => setSelectedEvent({ league, eventId })} />
        {leagues.map((lg) => (
          <LeagueDaySection key={`${lg}-${date}`} league={lg} date={date} density={settings.density} onGameClick={(eventId) => setSelectedEvent({ league: lg, eventId })} onStandingsClick={onStandingsClick} stickyTop={118} />
        ))}
      </div>
    </div>
  );
}

function LeagueHeader({ league, onBack, tab, setTab }: { league: League; onBack?: () => void; tab: LeagueTab; setTab: (tab: LeagueTab) => void }) {
  return (
    <div className="overflow-hidden" style={{ background: leagueHeaderColor(league) }}>
      <div className="px-4 pt-3 pb-4">
        <div className="relative flex items-center justify-center min-h-[36px]">
          <button onClick={onBack} className="absolute left-0 flex items-center gap-1 text-base font-semibold">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            More
          </button>
          <h1 className="text-lg font-black">{LEAGUE_LABELS[league]}</h1>
        </div>
        <div className="mt-3 flex justify-center">
          <Image src={LEAGUE_LOGOS[league]} alt={LEAGUE_LABELS[league]} width={68} height={68} className="object-contain logo-outline-dark" unoptimized />
        </div>
      </div>
      <div className="flex gap-7 overflow-x-auto px-4" style={{ background: "color-mix(in srgb, black 8%, transparent)" }}>
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

  useEffect(() => {
    const id = window.setTimeout(() => selectedRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 50);
    return () => window.clearTimeout(id);
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

function FavoritesScores({ date, favoriteKeys, onGameClick }: { date: string; favoriteKeys: Set<string>; onGameClick: (league: League, eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { settings } = useAppSettings();
  const requests = settings.sportOrder.map((league) => useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, { refreshInterval: 15_000, dedupingInterval: 4_000 }));
  const games = requests.flatMap((req, idx) => {
    const league = settings.sportOrder[idx];
    return (req.data?.events || [])
      .map((g: any) => ({ ...g, league, favoriteSide: favoriteSideForGame(g, favoriteKeys, league) }))
      .filter((g: any) => Boolean(g.favoriteSide));
  });

  if (!games.length) return null;
  return (
    <>
      <section className="mt-3 border-b" style={{ borderColor: "var(--border)" }}>
        <SectionHeader title="Favorites" sticky stickyTop={118} />
        <div className="grid grid-cols-1">
          {games.slice(0, 4).map((game: any) => <ScoreCard key={`${game.league}-${game.id}`} league={game.league} game={game} density="expanded" favorite favoriteSide={game.favoriteSide} onClick={() => onGameClick(game.league, game.id)} />)}
        </div>
      </section>
    </>
  );
}

function LeagueDaySection({ league, date, density, onGameClick, onStandingsClick, stickyTop = 118 }: { league: League; date: string; density: ScoreDensity; onGameClick: (eventId: string) => void; onStandingsClick?: (league: League) => void; stickyTop?: number }) {
  const freshKey = useFreshKey();
  const [collapsed, setCollapsed] = useState(false);
  const { data, error, isLoading } = useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = [...(data?.events || [])].sort((a: any, b: any) => statusRank(a) - statusRank(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
  if (!isLoading && (!events.length || error)) return null;
  const compactGrid = density === "compact";

  return (
    <>
    <section className="mt-3 border-b" style={{ borderColor: "var(--border)" }}>
      <SectionHeader
        title={LEAGUE_LABELS[league]}
        logo={LEAGUE_LOGOS[league]}
        sticky
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onStandingsClick={onStandingsClick ? () => onStandingsClick(league) : undefined}
        stickyTop={stickyTop}
      />
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

function SectionHeader({ title, logo, sticky = false, collapsed = false, onToggle, onStandingsClick, stickyTop = 118 }: { title: string; logo?: string; sticky?: boolean; collapsed?: boolean; onToggle?: () => void; onStandingsClick?: () => void; stickyTop?: number }) {
  return (
    <div
      className={`retro-league-head px-4 py-2.5 flex items-center justify-between ${sticky ? "sticky z-20" : ""}`}
      style={{ top: sticky ? stickyTop : undefined }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {logo && <Image src={logo} alt={title} width={22} height={22} className="object-contain logo-outline-dark" unoptimized />}
        <h2 className="text-base font-black tracking-[.11em] uppercase truncate">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {onStandingsClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStandingsClick(); }}
            className="rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-wide"
            style={{ background: "rgba(0,0,0,.16)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            STANDINGS
          </button>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="h-8 w-8 rounded-lg flex items-center justify-center"
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


function slugLogoName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function retroLogoCandidates(team: any, league: League) {
  const fallback = team?.logo || (team?.abbr ? logoUrl({ league, abbr: team.abbr }) : "");
  const nickname = favoriteTeamLabel(team, league);
  const names = [nickname, team?.short, team?.name, team?.displayName, team?.abbr]
    .map((v) => slugLogoName(String(v || "")))
    .filter(Boolean);
  const unique = Array.from(new Set(names));
  return [...unique.map((slug) => `/retro_images/${slug}.png`), fallback].filter(Boolean);
}

function ScoreTeamLogo({ team, league, size }: { team: any; league: League; size: number }) {
  const sources = useMemo(() => retroLogoCandidates(team, league), [team, league]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [sources.join("|")]);

  const src = sources[index] || "";
  if (!src) return null;

  return (
    <span className="score-team-logo-wrap logo-outline-dark" style={{ width: size, height: size }}>
      <Image
        src={src}
        alt={team?.abbr || team?.name || "Team logo"}
        fill
        sizes={`${size}px`}
        className="object-contain"
        unoptimized
        onError={() => setIndex((current) => Math.min(current + 1, sources.length - 1))}
      />
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
          <div className="favorite-score-meta text-[10.5px] font-black uppercase tracking-[.07em] mb-2.5 cbs-blue-label">{gameTimeLabel(game)}</div>
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
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[10.5px] font-black uppercase tracking-[.07em] truncate" style={{ color: "var(--accent)" }}>{gameTimeLabel(game)}</div>
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
  return (
    <div className={`score-team-row flex items-center ${showLogo ? "gap-2.5" : "gap-0"} py-0.5`}>
      {showLogo && <div className="score-team-logo-cell">{img && <ScoreTeamLogo team={team} league={league} size={favorite ? 30 : 30} />}</div>}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <span className={`${favorite ? "text-[20px] uppercase" : "text-[18px]"} score-team-name truncate font-black tracking-tight`}>{label}</span>
        {recordText && <span className="text-[11px] font-medium tracking-tight score-card-meta" style={{ color: "var(--score-meta)" }}>{recordText}</span>}
      </div>
      {showScore && <span className={`score-card-number ${favorite ? "text-[20px]" : "text-[18px]"} score-team-name font-black tracking-tight ${team.winner ? "opacity-100" : "opacity-90"}`} style={{ color: "var(--text)" }}>{team.score}</span>}
    </div>
  );
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
      <div className="mt-2 text-[11px] font-medium tracking-tight tabular-nums score-card-subline" style={{ color: "var(--score-meta)" }}>
        {balls}-{strikes}, {outLabel}
      </div>
    );
  }

  const subline = sublineForGame(league, game, density);
  if (!subline) return null;
  return <div className="mt-2 text-[10.5px] font-medium tracking-tight truncate score-card-subline" style={{ color: "var(--score-meta)" }}>{subline}</div>;
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

function LeagueStatsPlaceholder({ league }: { league: League }) {
  return (
    <div className="rounded-none sm:rounded-2xl p-7 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-xl font-black mb-2">{LEAGUE_FULL_LABELS[league]} Stats</h2>
      <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Team and player stat leaders will live here in the next phase.</p>
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
  if (league === "mlb") {
    const withInitial = density === "expanded";
    if (game.status?.state === "pre") return pitcherNameMatchup(game.pitchers || "TBD vs TBD", withInitial);
    if (game.pitchers) return pitcherNameMatchup(game.pitchers, withInitial);
  }
  if ((league === "nba" || league === "nhl" || league === "mlb") && game.isPlayoff) {
    return game.seriesGame || game.seriesSummary || "";
  }
  if (game.status?.state === "post") return game.status?.detail || "Final";
  if (game.note) return game.note;
  return game.status?.type?.shortDetail || game.status?.detail || "";
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
