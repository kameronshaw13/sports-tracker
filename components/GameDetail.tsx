"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";
import Boxscore from "./Boxscore";
import Gamecast from "./Gamecast";
import GameRecap from "./GameRecap";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  onClose?: () => void;
  onTeamClick?: (league: string, abbr: string, sourceGame?: { league: string; eventId: string }) => void;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
};

type TabId = "recap" | "main" | "boxscore";

export default function GameDetail({ league, eventId, onClose, onTeamClick, onPlayerClick }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(`/api/summary?league=${league}&event=${eventId}&_t=${freshKey}`, fetcher, { refreshInterval: 15_000 });
  const [activeTab, setActiveTab] = useState<TabId>("main");

  if (isLoading) return <div className="space-y-3"><div className="h-12 animate-pulse" style={{ background: "var(--surface)" }} /><div className="h-44 animate-pulse" style={{ background: "var(--surface)" }} /></div>;
  if (error || !data) return <div className="space-y-3"><GameTopBar title="Game" onClose={onClose} /><div className="p-6 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>Couldn't load this game.</div></div>;

  const { home, away, status, situation } = data;
  const isLive = status?.state === "in";
  const isFinal = status?.state === "post";
  const statusName = String(status?.statusName || "").toUpperCase();
  const isNonPlayed = /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(statusName);

  return (
    <div className="retro-page -mx-4 sm:mx-0 cbs-game-page game-detail-page">
      <GameTopBar title={`${away?.abbr || ""} @ ${home?.abbr || ""}`} onClose={onClose} />
      <ScoreboardHero league={league} home={home} away={away} status={status} situation={situation} eventId={eventId} gameDate={data?.date} onTeamClick={onTeamClick} />
      <div className="game-detail-tabs" role="tablist">
        <div className="flex overflow-x-auto no-scrollbar px-4 gap-7">
          {isFinal && <TabBtn label="Recap" isActive={activeTab === "recap"} onClick={() => setActiveTab("recap")} />}
          <TabBtn label="GameTracker" isActive={activeTab === "main"} onClick={() => setActiveTab("main")} />
          <TabBtn label="Box Score" isActive={activeTab === "boxscore"} onClick={() => setActiveTab("boxscore")} />
        </div>
      </div>
      <div className="game-detail-content">
        {activeTab === "recap" && <GameRecap league={league} eventId={eventId} />}
        {activeTab === "main" && !isNonPlayed && <Gamecast league={league} eventId={eventId} isLive={isLive} situation={situation} onPlayerClick={onPlayerClick} />}
        {activeTab === "main" && isNonPlayed && <div className="m-4 p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>This game was {nonPlayedLabel(statusName).toLowerCase()}.</div>}
        {activeTab === "boxscore" && <Boxscore league={league} eventId={eventId} isLive={isLive} onPlayerClick={onPlayerClick} />}
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

function ScoreboardHero({ league, home, away, status, situation, eventId, gameDate, onTeamClick }: any) {
  const showScore = scoreShouldShow(status);
  return (
    <section className="game-score-hero relative overflow-hidden">
      <div className="game-score-field" aria-hidden="true" />
      <div className="game-score-rail game-score-rail-away" style={{ ["--team-color" as string]: away?.color || "#1d4ed8" } as any} />
      <div className="game-score-rail game-score-rail-home" style={{ ["--team-color" as string]: home?.color || "#7c2d12" } as any} />
      <div className="relative px-4 py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamBlock team={away} league={league} eventId={eventId} onClick={onTeamClick} align="left" showScore={showScore} />
          <div className="game-score-center text-center min-w-[82px]">
            <div className="game-score-date">{formatGameDate(gameDate)}</div>
            <div className="game-score-status">{status?.detail || ""}</div>
            {league === "mlb" && status?.state === "in" && hasBaseballSituation(situation) && <BaseballSituationBlock situation={situation} />}
            {status?.seriesGame && <div className="game-score-series">{status.seriesGame}</div>}
          </div>
          <TeamBlock team={home} league={league} eventId={eventId} onClick={onTeamClick} align="right" showScore={showScore} />
        </div>
      </div>
    </section>
  );
}

function TeamBlock({ team, league, eventId, onClick, align, showScore }: any) {
  if (!team) return null;
  const Comp: any = onClick && team.abbr ? "button" : "div";
  return (
    <Comp onClick={onClick && team.abbr ? () => onClick(league, String(team.abbr).toLowerCase(), { league, eventId }) : undefined} className={`game-score-team min-w-0 ${align === "right" ? "game-score-team-home text-right" : "game-score-team-away text-left"}`}>
      <div className="game-score-logo-wrap">{team.logo && <Image src={team.logo} alt={team.abbr || team.name || ""} width={72} height={72} className="game-score-logo object-contain logo-outline-dark" unoptimized />}</div>
      <div className="game-score-team-copy min-w-0">
        <div className="game-score-record">{team.seriesRecord || team.record || ""}</div>
        <div className="game-score-score retro-score tabular-nums">{showScore ? team.score ?? "—" : ""}</div>
        <div className="game-score-abbr truncate">{team.abbr}</div>
      </div>
    </Comp>
  );
}

function TabBtn({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={isActive} onClick={onClick} className="game-detail-tab relative whitespace-nowrap">{label}{isActive && <span className="game-detail-tab-line absolute left-0 right-0 bottom-0" />}</button>;
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
  return <div className="mt-2 flex flex-col items-center gap-1"><BasesDiamond onFirst={!!situation.onFirst} onSecond={!!situation.onSecond} onThird={!!situation.onThird} /><div className="text-xs font-black tabular-nums" style={{ color: "var(--text-2)" }}>{balls}-{strikes}, {outs} {outs === 1 ? "Out" : "Outs"}</div></div>;
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
