"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import { League, VALID_LEAGUES } from "@/lib/teams";
import { useAppSettings } from "@/lib/useAppSettings";
import { useFavoriteTeams } from "@/lib/useFavorites";
import GameDetail from "./GameDetail";
import Standings from "./Standings";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  cfb: "https://a.espncdn.com/i/teamlogos/leagues/500/college-football.png",
  cbb: "https://a.espncdn.com/i/teamlogos/leagues/500/mens-college-basketball.png",
};

type Props = {
  onTeamLogoClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
  initialLeague?: string;
  leaguePage?: boolean;
  onBack?: () => void;
};

type LeagueTab = "scores" | "stats" | "standings";

export default function LeaguesView({ onTeamLogoClick, onPlayerClick, initialLeague = "mlb", leaguePage = false, onBack }: Props) {
  const safeInitial = VALID_LEAGUES.includes(initialLeague as League) ? (initialLeague as League) : "mlb";
  const [dayOffset, setDayOffset] = useState(0);
  const [league, setLeague] = useState<League>(safeInitial);
  const [tab, setTab] = useState<LeagueTab>("scores");
  const [selectedEvent, setSelectedEvent] = useState<{ league: string; eventId: string } | null>(null);
  const { settings } = useAppSettings();
  const { favorites } = useFavoriteTeams();
  const date = formatDate(dayOffset);

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
        <div className="px-4 sm:px-0 pt-4">
          {tab === "scores" && (
            <>
              <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
              <div className="mt-4">
                <LeagueDaySection league={league} date={date} onGameClick={(eventId) => setSelectedEvent({ league, eventId })} />
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
      <div className="sticky top-0 z-20 px-4 pt-2 pb-0" style={{ background: "var(--bg)" }}>
        <div className="relative flex items-center justify-center py-3">
          <h1 className="text-xl font-black">Scores</h1>
        </div>
        <CbsDateBar dayOffset={dayOffset} setDayOffset={setDayOffset} />
      </div>

      <div className="border-t" style={{ borderColor: "var(--border)" }}>
        <FavoritesScores date={date} favoriteKeys={favoriteKeys} onGameClick={(league, eventId) => setSelectedEvent({ league, eventId })} />
        {leagues.map((lg) => (
          <LeagueDaySection key={`${lg}-${date}`} league={lg} date={date} onGameClick={(eventId) => setSelectedEvent({ league: lg, eventId })} />
        ))}
      </div>
    </div>
  );
}

function LeagueHeader({ league, onBack, tab, setTab }: { league: League; onBack?: () => void; tab: LeagueTab; setTab: (tab: LeagueTab) => void }) {
  return (
    <div className="overflow-hidden" style={{ background: leagueHeaderColor(league) }}>
      <div className="px-4 pt-3 pb-5">
        <div className="relative flex items-center justify-center min-h-[36px]">
          <button onClick={onBack} className="absolute left-0 flex items-center gap-1 text-lg font-semibold">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            More
          </button>
          <h1 className="text-xl font-black">{LEAGUE_LABELS[league]}</h1>
        </div>
        <div className="mt-4 flex justify-center">
          <Image src={LEAGUE_LOGOS[league]} alt={LEAGUE_LABELS[league]} width={76} height={76} className="object-contain" unoptimized />
        </div>
      </div>
      <div className="flex gap-8 overflow-x-auto px-4" style={{ background: "color-mix(in srgb, black 8%, transparent)" }}>
        {(["scores", "stats", "standings"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)} className="py-3 relative text-lg font-black whitespace-nowrap" style={{ color: tab === id ? "#fff" : "rgba(255,255,255,0.72)" }}>
            {id === "scores" ? "Scores" : id === "stats" ? "Stats" : "Standings"}
            {tab === id && <span className="absolute left-0 right-0 -bottom-px h-1" style={{ background: "#fff" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function CbsDateBar({ dayOffset, setDayOffset }: { dayOffset: number; setDayOffset: (offset: number) => void }) {
  const days = useMemo(() => [-2, -1, 0, 1, 2].map((offset) => ({ offset, label: prettyDate(offset), sub: dateSmall(offset) })), []);
  return (
    <div className="flex overflow-x-auto gap-6 px-0 pt-1">
      {days.map((d) => {
        const selected = dayOffset === d.offset;
        return (
          <button key={d.offset} onClick={() => setDayOffset(d.offset)} className="relative pb-3 pt-2 min-w-[82px] text-center">
            <div className="text-lg font-black whitespace-nowrap" style={{ color: selected ? "var(--text)" : "var(--text-2)" }}>{d.label}</div>
            <div className="text-[11px] font-semibold" style={{ color: selected ? "var(--text-2)" : "var(--text-3)" }}>{d.sub}</div>
            {selected && <span className="absolute left-2 right-2 bottom-0 h-1" style={{ background: "var(--accent)" }} />}
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
    return (req.data?.events || []).filter((g: any) => gameMatchesFavorites(g, favoriteKeys, league)).map((g: any) => ({ ...g, league }));
  });

  if (!games.length) return null;
  return (
    <section className="border-b" style={{ borderColor: "var(--border)" }}>
      <SectionHeader title="Favorites" />
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {games.slice(0, 4).map((game: any) => <ScoreCard key={`${game.league}-${game.id}`} league={game.league} game={game} onClick={() => onGameClick(game.league, game.id)} />)}
      </div>
    </section>
  );
}

function LeagueDaySection({ league, date, onGameClick }: { league: League; date: string; onGameClick: (eventId: string) => void }) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(`/api/league?league=${league}&date=${date}&_t=${freshKey}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 4_000,
  });

  const events = [...(data?.events || [])].sort((a: any, b: any) => statusRank(a) - statusRank(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
  if (!isLoading && (!events.length || error)) return null;

  return (
    <section className="border-b" style={{ borderColor: "var(--border)" }}>
      <SectionHeader title={LEAGUE_LABELS[league]} logo={LEAGUE_LOGOS[league]} count={isLoading ? undefined : events.length} />
      {isLoading ? (
        <div className="grid grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse border-t" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {events.map((game: any) => <ScoreCard key={game.id} league={league} game={game} onClick={() => onGameClick(game.id)} />)}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, logo, count }: { title: string; logo?: string; count?: number }) {
  return (
    <div className="px-4 py-4 flex items-center justify-between" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-3">
        {logo && <Image src={logo} alt={title} width={24} height={24} className="object-contain" unoptimized />}
        <h2 className="text-xl font-black tracking-wide">{title}</h2>
      </div>
      {typeof count === "number" && <span className="text-xs font-bold" style={{ color: "var(--text-3)" }}>{count} game{count === 1 ? "" : "s"}</span>}
    </div>
  );
}

function ScoreCard({ league, game, onClick }: { league: League; game: any; onClick: () => void }) {
  const state = game.status?.state;
  const isLive = state === "in";
  return (
    <button onClick={onClick} className="min-h-[128px] p-4 text-left border-t sm:odd:border-r active:scale-[0.99]" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="text-sm font-black" style={{ color: isLive ? "var(--danger)" : "var(--text-2)" }}>{game.status?.detail || formatTime(game.date)}</div>
        <div className="text-xs font-black" style={{ color: "var(--text-2)" }}>{game.broadcast || game.network || ""}</div>
      </div>
      <TeamLine team={game.away} />
      <TeamLine team={game.home} />
      <div className="mt-3 text-sm font-semibold truncate" style={{ color: "var(--text-2)" }}>{sublineForGame(league, game)}</div>
    </button>
  );
}

function TeamLine({ team }: { team: any }) {
  if (!team) return null;
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">{team.logo && <Image src={team.logo} alt={team.abbr || team.name} width={26} height={26} className="object-contain" unoptimized />}</div>
      <div className="flex-1 flex items-baseline gap-2 min-w-0">
        <span className={`text-xl leading-none truncate ${team.winner ? "font-black" : "font-black"}`}>{team.abbr || team.name}</span>
        {team.record && <span className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>{team.record}</span>}
      </div>
      <span className="text-xl font-black tabular-nums">{team.score ?? ""}</span>
    </div>
  );
}

function LeagueStatsPlaceholder({ league }: { league: League }) {
  return (
    <div className="rounded-none sm:rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h2 className="text-2xl font-black mb-2">{LEAGUE_FULL_LABELS[league]} Stats</h2>
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
  if (game.shortName) return game.shortName;
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
function prettyDate(offset: number) { if (offset === 0) return "Today"; const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString(undefined, { weekday: "short" }); }
function dateSmall(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatTime(iso: string) { const d = new Date(iso); return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" }); }
