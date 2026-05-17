"use client";

import Image from "next/image";
import { useLayoutEffect, useState } from "react";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import Boxscore from "./Boxscore";
import Gamecast from "./Gamecast";
import GameLineup from "./GameLineup";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onClose?: () => void;
  onTeamClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }, returnTab?: ReturnableGameTab) => void;
  initialTab?: ReturnableGameTab;
};

type TabId = "main" | "lineup" | "boxscore" | "odds";
type ReturnableGameTab = "main" | "lineup" | "boxscore";

export default function GameDetail({ league, eventId, onClose, onTeamClick, onPlayerClick, initialTab = "main" }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(`/api/summary?league=${league}&event=${eventId}&_t=${freshKey}`, fetcher, { refreshInterval: 15_000 });
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useLayoutEffect(() => {
    setActiveTab(initialTab);
  }, [eventId, initialTab]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const snapTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    snapTop();
    let frameTwo = 0;
    const frameOne = window.requestAnimationFrame(() => {
      snapTop();
      frameTwo = window.requestAnimationFrame(snapTop);
    });
    const timeout = window.setTimeout(snapTop, 80);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.clearTimeout(timeout);
      if (frameTwo) window.cancelAnimationFrame(frameTwo);
    };
  }, [league, eventId, initialTab]);

  if (isLoading) return <div className="space-y-3"><div className="h-12 animate-pulse" style={{ background: "var(--surface)" }} /><div className="h-44 animate-pulse" style={{ background: "var(--surface)" }} /></div>;
  if (error || !data) return <div className="space-y-3"><GameTopBar title="Game" onClose={onClose} /><div className="p-6 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Couldn't load this game.</div></div>;

  const { home, away, status, situation, odds } = data;
  const isLive = status?.state === "in";
  const isPregame = status?.state === "pre";
  const showLineupTab = league === "mlb" && isPregame;
  const showOddsTab = hasOdds(odds);
  const visibleTab: TabId =
    activeTab === "lineup" && !showLineupTab ? "main" :
    activeTab === "odds" && !showOddsTab ? "main" :
    activeTab;
  const statusName = String(status?.statusName || "").toUpperCase();
  const isNonPlayed = /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(statusName);

  return (
    <div className="retro-page -mx-4 sm:mx-0 cbs-game-page game-detail-page">
      <div className="game-detail-sticky-shell">
        <GameTopBar title={`${away?.abbr || ""} @ ${home?.abbr || ""}`} onClose={onClose} />
        <ScoreboardHero league={league} home={home} away={away} status={status} situation={situation} odds={odds} eventId={eventId} gameDate={data?.date} onTeamClick={onTeamClick} />
        <div className="game-detail-tabs" role="tablist">
          <div className="flex overflow-x-auto no-scrollbar px-4 gap-7">
            <TabBtn label="GameTracker" isActive={visibleTab === "main"} onClick={() => setActiveTab("main")} />
            {showLineupTab && <TabBtn label="Lineup" isActive={visibleTab === "lineup"} onClick={() => setActiveTab("lineup")} />}
            <TabBtn label="Box Score" isActive={visibleTab === "boxscore"} onClick={() => setActiveTab("boxscore")} />
            {showOddsTab && <TabBtn label="Odds" isActive={visibleTab === "odds"} onClick={() => setActiveTab("odds")} />}
          </div>
        </div>
      </div>
      <div className="game-detail-content">
        {visibleTab === "main" && !isNonPlayed && <Gamecast league={league} eventId={eventId} isLive={isLive} situation={situation} onPlayerClick={onPlayerClick ? (p) => onPlayerClick(p, "main") : undefined} />}
        {visibleTab === "main" && isNonPlayed && <div className="m-4 p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>This game was {nonPlayedLabel(statusName).toLowerCase()}.</div>}
        {visibleTab === "lineup" && showLineupTab && <GameLineup league={league} eventId={eventId} />}
        {visibleTab === "boxscore" && <Boxscore league={league} eventId={eventId} isLive={isLive} onPlayerClick={onPlayerClick ? (p) => onPlayerClick(p, "boxscore") : undefined} />}
        {visibleTab === "odds" && showOddsTab && <OddsPanel league={league} odds={odds} away={away} home={home} />}
      </div>
    </div>
  );
}

function GameTopBar({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="game-detail-topbar sticky top-0 z-40 flex items-center justify-center px-4">
      <button onClick={onClose} className="game-detail-close absolute left-4 h-10 w-10 flex items-center justify-center" aria-label="Close game">
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <h1 className="game-detail-title retro-title">{title}</h1>
    </div>
  );
}

function ScoreboardHero({ league, home, away, status, situation, odds, eventId, gameDate, onTeamClick }: any) {
  const showScore = scoreShouldShow(status);
  const isFinal = status?.state === "post";
  const awayScoreNum = Number(away?.score);
  const homeScoreNum = Number(home?.score);
  const hasFinalWinner = isFinal && Number.isFinite(awayScoreNum) && Number.isFinite(homeScoreNum) && awayScoreNum !== homeScoreNum;
  return (
    <section className={`game-score-hero game-score-hero-${league} relative overflow-hidden`}>
      <div className="game-score-field" aria-hidden="true" />
      <div className="game-score-layout">
          <TeamBlock team={away} league={league} eventId={eventId} onClick={onTeamClick} align="left" showScore={showScore} isWinner={hasFinalWinner && awayScoreNum > homeScoreNum} isLoser={hasFinalWinner && awayScoreNum < homeScoreNum} />
          <div className="game-score-center">
            <div className="game-score-center-row game-score-center-row-top">
              <div className="game-score-date">{formatGameDate(gameDate)}</div>
            </div>
            <div className="game-score-center-row game-score-center-row-main">
              <div className={`game-score-status ${status?.state === "in" ? "is-live" : status?.state === "pre" ? "is-pre" : "is-final"}`}>{formatGameStatus(status, gameDate)}</div>
            </div>
            <div className="game-score-center-row game-score-center-row-bottom">
              <GameOddsLine odds={odds} away={away} home={home} />
              {league === "mlb" && status?.state === "in" && hasBaseballSituation(situation) && <BaseballSituationBlock situation={situation} />}
            </div>
          </div>
          <TeamBlock team={home} league={league} eventId={eventId} onClick={onTeamClick} align="right" showScore={showScore} isWinner={hasFinalWinner && homeScoreNum > awayScoreNum} isLoser={hasFinalWinner && homeScoreNum < awayScoreNum} />
      </div>
    </section>
  );
}

function GameOddsLine({ odds, away, home }: { odds: any; away: any; home: any }) {
  if (!odds?.awayMoneyLine && !odds?.homeMoneyLine && !odds?.overUnder) return null;
  return (
    <div className="game-score-odds">
      {odds.awayMoneyLine && <span>{away?.abbr} {odds.awayMoneyLine}</span>}
      {odds.overUnder && <span>Total {odds.overUnder}</span>}
      {odds.homeMoneyLine && <span>{home?.abbr} {odds.homeMoneyLine}</span>}
    </div>
  );
}

function hasOdds(odds: any) {
  return !!(odds?.awayMoneyLine || odds?.homeMoneyLine || odds?.overUnder || odds?.awaySpread || odds?.homeSpread || odds?.details);
}

function OddsPanel({ league, odds, away, home }: { league: string; odds: any; away: any; home: any }) {
  const total = odds?.overUnder ? String(odds.overUnder).replace(/^o\/?u?/i, "").replace(/^o/i, "") : null;
  const showLine = /^(nba|wnba|nfl|cfb|cbb)$/i.test(league || "");
  const markets = [
    {
      title: "Moneyline",
      rows: [
        { key: "away", team: away, value: odds?.awayMoneyLine },
        { key: "home", team: home, value: odds?.homeMoneyLine },
      ],
    },
    showLine ? {
      title: "Line",
      rows: [
        { key: "away", team: away, value: odds?.awaySpread },
        { key: "home", team: home, value: odds?.homeSpread },
      ],
    } : null,
    total ? {
      title: "Total",
      rows: [
        { key: "over", label: "Over", value: `o${total}` },
        { key: "under", label: "Under", value: `u${total}` },
      ],
    } : null,
  ].filter((market: any) => market && market.rows.some((row: any) => row.value && row.value !== "—"));

  return (
    <div className="game-odds-panel">
      {markets.map((market: any) => (
        <div key={market.title} className="game-odds-card">
          <div className="game-odds-card-head">
            <span>{market.title}</span>
            <span>Current</span>
          </div>
          {market.rows.map((row: any) => (
            <div key={row.key} className="game-odds-card-row">
              <OddsTeamLabel team={row.team} label={row.label} />
              <strong>{row.value || "—"}</strong>
            </div>
          ))}
        </div>
      ))}
      {odds?.details && <div className="game-odds-note">{odds.details}</div>}
    </div>
  );
}

function OddsTeamLabel({ team, label }: { team?: any; label?: string }) {
  return (
    <div className="game-odds-team">
      {team?.logo && <Image src={team.logo} alt="" width={30} height={30} className="object-contain logo-outline-dark" unoptimized />}
      <span>{label || team?.abbr || team?.name || "Team"}</span>
    </div>
  );
}

function TeamBlock({ team, league, eventId, onClick, align, showScore, isWinner, isLoser }: any) {
  if (!team) return null;
  const Comp: any = onClick && team.abbr ? "button" : "div";
  const resultClass = isWinner ? " is-final-winner" : isLoser ? " is-final-loser" : "";
  return (
    <Comp onClick={onClick && team.abbr ? () => onClick(league, String(team.abbr).toLowerCase(), { league, eventId }) : undefined} className={`game-score-team ${align === "right" ? "game-score-team-home" : "game-score-team-away"}${resultClass}`}>
      <div className="game-score-record">{team.seriesRecord || team.record || ""}</div>
      <div className="game-score-team-main">
        <div className="game-score-logo-wrap">{team.logo && <Image src={team.logo} alt={team.abbr || team.name || ""} width={84} height={84} className="game-score-logo object-contain logo-outline-dark" unoptimized />}</div>
        <div className="game-score-score retro-score tabular-nums">{showScore ? team.score ?? "—" : ""}</div>
      </div>
    </Comp>
  );
}

function TabBtn({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={isActive} onClick={onClick} className="game-detail-tab relative whitespace-nowrap">{label}{isActive && <span className="game-detail-tab-line absolute left-0 right-0 bottom-0" />}</button>;
}

function formatGameStatus(status: any, gameDate?: string | null): string {
  if (status?.state === "pre") {
    const raw = gameDate || status?.type?.detail || status?.detail || status?.shortDetail || "";
    const d = raw ? new Date(raw) : null;
    if (d && !isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Chicago",
      });
    }
    return String(status?.detail || status?.shortDetail || "")
      .replace(/^\s*\d{1,2}\/\d{1,2}\s*-\s*/i, "")
      .replace(/\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST)$/i, "")
      .trim();
  }
  return status?.detail || "";
}

function scoreShouldShow(status: any) {
  const state = status?.state;
  const detail = `${status?.detail || ""} ${status?.type?.description || ""} ${status?.type?.shortDetail || ""}`.toLowerCase();
  if (/postponed|canceled|cancelled|ppd/.test(detail)) return false;
  return state === "in" || state === "post";
}
function nonPlayedLabel(statusName: string): string { if (statusName.includes("POSTPONED")) return "Postponed"; if (statusName.includes("CANCEL")) return "Canceled"; if (statusName.includes("SUSPENDED")) return "Suspended"; return "Not played"; }
function hasBaseballSituation(s: any): boolean { return s && (typeof s.balls === "number" || typeof s.strikes === "number" || typeof s.outs === "number"); }
function BaseballSituationBlock({ situation }: { situation: any }) {
  const balls = situation.balls ?? 0; const strikes = situation.strikes ?? 0; const outs = situation.outs ?? 0;
  return <div className="game-score-situation flex flex-col items-center gap-1"><BasesDiamond onFirst={!!situation.onFirst} onSecond={!!situation.onSecond} onThird={!!situation.onThird} /><div className="game-score-count text-xs font-black tabular-nums" style={{ color: "var(--text-2)" }}>{balls}-{strikes}, {outs} {outs === 1 ? "Out" : "Outs"}</div></div>;
}
function BasesDiamond({ onFirst, onSecond, onThird }: { onFirst: boolean; onSecond: boolean; onThird: boolean }) {
  const filled = "var(--accent)"; const empty = "var(--surface-2)"; const stroke = "var(--text-3)";
  return <svg width="44" height="36" viewBox="0 0 34 28" aria-label="Bases"><g transform="translate(17 7) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onSecond ? filled : empty} stroke={stroke} strokeWidth="1.1" /></g><g transform="translate(26 17) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onFirst ? filled : empty} stroke={stroke} strokeWidth="1.1" /></g><g transform="translate(8 17) rotate(45)"><rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onThird ? filled : empty} stroke={stroke} strokeWidth="1.1" /></g></svg>;
}

function formatGameDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
