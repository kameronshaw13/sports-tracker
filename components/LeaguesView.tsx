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

const NCAA_LOGO = "https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png";

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
    const onScroll = () => setScrolled(window.scrollY > 28);
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
                <LeagueDaySection league={league} date={date} density={settings.density} onGameClick={(eventId) => setSelectedEvent({ league, eventId })} onStandingsClick={onStandingsClick} />
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
      <div className="sticky top-0 z-30 px-4 pt-2 pb-0" style={{ background: "var(--bg)", borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent" }}>
        <div className={`relative flex items-center py-2 transition-all duration-200 ${scrolled ? "justify-center" : "justify-start"}`}>
          <h1 className={`${scrolled ? "text-lg" : "text-3xl"} font-black tracking-tight transition-all duration-200`}>Scores</h1>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <AppSettingsButton />
          </div>
        </div>
        <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
      </div>

      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <FavoritesScores date={date} favoriteKeys={favoriteKeys} density={settings.density} onGameClick={(league, eventId) => setSelectedEvent({ league, eventId })} />
        {leagues.map((lg) => (
          <LeagueDaySection key={`${lg}-${date}`} league={lg} date={date} density={settings.density} onGameClick={(eventId) => setSelectedEvent({ league: lg, eventId })} onStandingsClick={onStandingsClick} />
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
          <Image src={LEAGUE_LOGOS[league]} alt={LEAGUE_LABELS[league]} width={68} height={68} className="object-contain" unoptimized />
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
    <div className="flex overflow-x-auto gap-3 px-0 pt-1 no-scrollbar">
      {days.map((d) => {
        const selected = dayOffset === d.offset;
        return (
          <button
            key={d.offset}
            ref={selected ? selectedRef : null}
            onClick={() => setDayOffset(d.offset)}
            className="relative pb-2.5 pt-1.5 min-w-[88px] text-center"
          >
            <div className="text-sm font-black whitespace-nowrap" style={{ color: selected ? "var(--text)" : "var(--text-2)" }}>{d.label}</div>
            {selected && <span className="absolute left-2 right-2 bottom-0 h-1" style={{ background: "var(--accent)" }} />}
          </button>
        );
      })}
    </div>
  );
}

function FavoritesScores({ date, favoriteKeys, density, onGameClick }: { date: string; favoriteKeys: Set<string>; density: ScoreDensity; onGameClick: (league: League, eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { settings } = useAppSettings();
  const requests = settings.sportOrder.map((league) => useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, { refreshInterval: 15_000, dedupingInterval: 4_000 }));
  const games = requests.flatMap((req, idx) => {
    const league = settings.sportOrder[idx];
    return (req.data?.events || []).filter((g: any) => gameMatchesFavorites(g, favoriteKeys, league)).map((g: any) => ({ ...g, league }));
  });

  if (!games.length) return null;
  return (
    <>
      <section className="border-b" style={{ borderColor: "var(--border)" }}>
        <SectionHeader title="Favorites" />
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {games.slice(0, 4).map((game: any) => <ScoreCard key={`${game.league}-${game.id}`} league={game.league} game={game} density={density} onClick={() => onGameClick(game.league, game.id)} />)}
        </div>
      </section>
    </>
  );
}

function LeagueDaySection({ league, date, density, onGameClick, onStandingsClick }: { league: League; date: string; density: ScoreDensity; onGameClick: (eventId: string) => void; onStandingsClick?: (league: League) => void }) {
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
    <div className="h-2 border-y" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
    <section className="border-b" style={{ borderColor: "var(--border)" }}>
      <SectionHeader
        title={LEAGUE_LABELS[league]}
        logo={LEAGUE_LOGOS[league]}
        sticky
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onStandingsClick={onStandingsClick ? () => onStandingsClick(league) : undefined}
      />
      {!collapsed && (isLoading ? (
        <div className={compactGrid ? "grid grid-cols-2" : "grid grid-cols-1 sm:grid-cols-2"}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse border-t" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />)}
        </div>
      ) : (
        <div className={compactGrid ? "grid grid-cols-2" : "grid grid-cols-1 sm:grid-cols-2"}>
          {events.map((game: any) => <ScoreCard key={game.id} league={league} game={game} density={density} onClick={() => onGameClick(game.id)} />)}
        </div>
      ))}
    </section>
    </>
  );
}

function SectionHeader({ title, logo, sticky = false, collapsed = false, onToggle, onStandingsClick }: { title: string; logo?: string; sticky?: boolean; collapsed?: boolean; onToggle?: () => void; onStandingsClick?: () => void }) {
  return (
    <div
      className={`px-4 py-2 flex items-center justify-between ${sticky ? "sticky z-20" : ""}`}
      style={{ background: "var(--surface)", top: sticky ? 84 : undefined, borderTop: sticky ? "1px solid var(--border)" : undefined, borderBottom: sticky ? "1px solid var(--border)" : undefined }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {logo && <Image src={logo} alt={title} width={22} height={22} className="object-contain" unoptimized />}
        <h2 className="text-base font-black tracking-wide truncate">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {onStandingsClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStandingsClick(); }}
            className="rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-wide"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            STANDINGS
          </button>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
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

function ScoreCard({ league, game, density, onClick }: { league: League; game: any; density: ScoreDensity; onClick: () => void }) {
  const state = game.status?.state;
  const isLive = state === "in";
  const compact = density === "compact";
  return (
    <button
      onClick={onClick}
      className="min-h-[84px] p-2.5 text-left border-t sm:odd:border-r active:scale-[0.99]"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[11px] font-extrabold tracking-tight truncate" style={{ color: "var(--accent)" }}>{gameTimeLabel(game)}</div>
          {league === "mlb" && isLive && game.situation && <BasesDiamondMini situation={game.situation} />}
        </div>
      </div>
      <TeamLine team={game.away} league={league} compact={compact} />
      <TeamLine team={game.home} league={league} compact={compact} />
      <ScoreCardSubline league={league} game={game} />
    </button>
  );
}

function TeamLine({ team, league, compact }: { team: any; league: League; compact: boolean }) {
  if (!team) return null;
  const img = team.logo || (team.abbr ? logoUrl({ league, abbr: team.abbr }) : null);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">{img && <Image src={img} alt={team.abbr || team.name} width={20} height={20} className="object-contain" unoptimized />}</div>
      <div className="flex-1 flex items-baseline gap-1.5 min-w-0">
        <span className="text-sm leading-none truncate font-black tracking-tight">{team.abbr || team.name}</span>
        {team.record && <span className="text-[10px] font-bold tracking-tight" style={{ color: "var(--text-2)" }}>{team.record}</span>}
      </div>
      <span className="text-sm font-black tabular-nums">{team.score ?? ""}</span>
    </div>
  );
}

function ScoreCardSubline({ league, game }: { league: League; game: any }) {
  if (league === "mlb" && game.status?.state === "in" && game.situation) {
    const balls = game.situation.balls ?? 0;
    const strikes = game.situation.strikes ?? 0;
    const outs = game.situation.outs ?? 0;
    const outLabel = outs === 1 ? "1 Out" : `${outs} Outs`;
    return (
      <div className="mt-1.5 text-[11px] font-extrabold tracking-tight tabular-nums" style={{ color: "var(--text-2)" }}>
        {balls}-{strikes}, {outLabel}
      </div>
    );
  }

  const subline = sublineForGame(league, game);
  if (!subline) return null;
  return <div className="mt-1.5 text-[11px] font-bold tracking-tight truncate" style={{ color: "var(--text-2)" }}>{subline}</div>;
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

function gameMatchesFavorites(game: any, favoriteKeys: Set<string>, league: League) {
  const teams = [game.away, game.home].filter(Boolean);
  return teams.some((t: any) => {
    const abbr = String(t.abbr || "").toLowerCase();
    return favoriteKeys.has(`${league}-${abbr}`);
  });
}

function sublineForGame(league: League, game: any) {
  if (game.status?.state === "post") return game.status?.detail || "Final";
  if (league === "mlb" && game.pitchers) return game.pitchers;
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

function formatDate(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }
function dateBarLabel(offset: number) { if (offset === 0) return "Today"; const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function gameTimeLabel(game: any) {
  if (game.status?.state === "pre") return formatCentralTime(game.date);
  return game.status?.detail || formatCentralTime(game.date);
}
function formatCentralTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).replace(" ", "");
}
