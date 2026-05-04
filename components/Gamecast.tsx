"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
  situation?: any;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
};

type TeamMeta = {
  id: string;
  abbr: string;
  name: string;
  color: string;
  logo?: string;
};

type Person = {
  id?: string | null;
  name?: string | null;
  shortName?: string | null;
  displayName?: string | null;
  headshot?: string | null;
  mlbId?: number | string | null;
  stats?: Record<string, string | number | null>;
};

type MlbAtBat = {
  id: string;
  text: string;
  result: string;
  period: number;
  halfInning: "top" | "bottom" | null;
  homeAway: "home" | "away" | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  type?: string | null;
  batter?: Person | null;
  pitcher?: Person | null;
  pitches: string[];
  isAtBat: boolean;
  isMinor: boolean;
  isComplete?: boolean;
  sequence?: number;
};

type MlbSection = {
  period: number;
  half: "top" | "bottom" | null;
  team?: TeamMeta;
  pitcher?: string | null;
  atBats: MlbAtBat[];
};

export default function Gamecast({ league, eventId, isLive, situation: summarySituation, onPlayerClick }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/plays?league=${league}&event=${eventId}&_t=${freshKey}` : null,
    fetcher,
    { refreshInterval: isLive ? 5_000 : 0 }
  );

  if (league === "mlb") {
    return (
      <MlbLiveGamecast
        data={data}
        error={error}
        isLoading={isLoading}
        isLive={isLive}
        fallbackSituation={summarySituation}
        onPlayerClick={onPlayerClick}
      />
    );
  }

  if (league === "nfl") {
    return (
      <div className="space-y-3">
        {summarySituation ? <FieldPositionMini situation={summarySituation} /> : null}
        <GenericTabbedPlays data={data} error={error} isLoading={isLoading} emptyText="No football plays yet." />
      </div>
    );
  }

  return <GenericTabbedPlays data={data} error={error} isLoading={isLoading} emptyText={league === "nhl" ? "No hockey plays yet." : "No plays yet."} />;
}

function isWaitingForBattedBallResult(ab: MlbAtBat) {
  return ab.isComplete === false && ab.pitches?.some((pitch) => /ball\s+in\s+play|in\s+play/i.test(String(pitch || "")));
}

function MlbLiveGamecast({
  data,
  error,
  isLoading,
  isLive,
  fallbackSituation,
  onPlayerClick,
}: {
  data: any;
  error: any;
  isLoading: boolean;
  isLive: boolean;
  fallbackSituation?: any;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<"scoring" | "live" | "plays">("live");
  const home: TeamMeta | undefined = data?.home;
  const away: TeamMeta | undefined = data?.away;
  const atBats: MlbAtBat[] = data?.mlb?.atBats || [];
  const displayAtBats = atBats.filter((ab) => !isWaitingForBattedBallResult(ab));
  const espnSituation = data?.mlb?.situation || data?.situation || fallbackSituation || null;
  const currentHalf = currentHalfInning(displayAtBats.length ? displayAtBats : atBats, espnSituation);
  const halfAtBats = displayAtBats
    .filter((ab) => ab.period === currentHalf.period && ab.halfInning === currentHalf.half && (ab.isAtBat || ab.isMinor))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const halfAtBatRows = halfAtBats.filter((ab) => ab.isAtBat);
  const liveAtBat = [...halfAtBatRows].reverse().find((ab) => ab.isComplete === false) || null;
  const lastCompletedInHalf = [...halfAtBatRows].reverse().find((ab) => ab.isComplete !== false) || null;
  const currentOrLast = liveAtBat || lastCompletedInHalf;
  const battingTeam = currentHalf.half === "top" ? away : home;
  const sections = buildMlbSections(displayAtBats, home, away, "newest-first");
  const scoringSections = buildMlbSections(displayAtBats.filter((ab) => ab.scoringPlay), home, away, "chronological").filter((s) => s.atBats.length > 0);

  if (isLoading) return <LoadingStack />;

  if (error || data?.error) {
    return <UnavailableCard text="ESPN play-by-play data is not available for this game yet." />;
  }

  if (!data || atBats.length === 0) {
    return <UnavailableCard text="No ESPN play-by-play data has posted yet." />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)" }}>
        <GamecastTab label="Scoring" active={activeSubTab === "scoring"} onClick={() => setActiveSubTab("scoring")} />
        <GamecastTab label="Live" active={activeSubTab === "live"} onClick={() => setActiveSubTab("live")} />
        <GamecastTab label="Plays" active={activeSubTab === "plays"} onClick={() => setActiveSubTab("plays")} />
      </div>

      {activeSubTab === "live" && (
        <>
          <LiveAtBatCard
            isLive={isLive}
            situation={espnSituation}
            currentAtBat={currentOrLast}
            battingTeam={battingTeam}
            onPlayerClick={onPlayerClick}
          />

          <HalfInningCard
            team={battingTeam}
            half={currentHalf.half}
            period={currentHalf.period}
            pitcher={halfAtBats.find((ab) => ab.pitcher?.displayName || ab.pitcher?.name)?.pitcher?.displayName || halfAtBats.find((ab) => ab.pitcher?.displayName || ab.pitcher?.name)?.pitcher?.name || null}
            atBats={halfAtBats}
          />
        </>
      )}

      {activeSubTab === "scoring" && <ScoringPlaysView sections={scoringSections} />}
      {activeSubTab === "plays" && <MlbPlaysView sections={sections} />}
    </div>
  );
}

function GamecastTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-sm font-bold transition-all"
      style={{
        background: active ? "var(--surface)" : "transparent",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
        color: active ? "var(--text)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );
}

function LiveAtBatCard({
  isLive,
  situation,
  currentAtBat,
  battingTeam,
  onPlayerClick,
}: {
  isLive: boolean;
  situation: any;
  currentAtBat: MlbAtBat | null;
  battingTeam?: TeamMeta;
  onPlayerClick?: (player: { id: string; name: string; league: string }) => void;
}) {
  const hasLiveAtBat = currentAtBat?.isComplete === false;
  const title = hasLiveAtBat ? "Current At-bat" : currentAtBat ? "Last At-bat" : "Current At-bat";
  const batter = currentAtBat?.batter || (hasLiveAtBat ? situation?.batter : null) || null;
  const pitcher = currentAtBat?.pitcher || (hasLiveAtBat ? situation?.pitcher : null) || null;
  const count = hasLiveAtBat ? countText(situation) : null;
  const outs = hasLiveAtBat && typeof situation?.outs === "number" ? situation.outs : null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {battingTeam?.logo && <Image src={battingTeam.logo} alt={battingTeam.abbr} width={30} height={30} className="object-contain" />}
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isLive ? "var(--danger)" : "var(--text-3)" }}>
              {title}
            </div>
            <div className="text-sm font-bold truncate">
              {battingTeam?.abbr || "MLB"} batting
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-base md:text-lg font-black tabular-nums" style={{ color: "var(--text)" }}>
          <BasesDiamond
            onFirst={!!situation?.onFirst}
            onSecond={!!situation?.onSecond}
            onThird={!!situation?.onThird}
          />
          {count && <span>{count}</span>}
          {outs != null && <span>{outs} {outs === 1 ? "out" : "outs"}</span>}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
        <PlayerMiniCard label="Batter" person={batter} primaryStat={batterStatText(batter)} onClick={playerClickHandler(batter, onPlayerClick, "Batter")} />
        <div className="hidden md:flex items-center justify-center text-xs font-bold" style={{ color: "var(--text-3)" }}>vs</div>
        <PlayerMiniCard label="Pitcher" person={pitcher} primaryStat={pitcherStatText(pitcher)} onClick={playerClickHandler(pitcher, onPlayerClick, "Pitcher")} />
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="text-sm font-semibold">
            {currentAtBat?.result || (hasLiveAtBat ? situation?.lastPlay : null) || "Waiting for ESPN play update..."}
          </div>
          {currentAtBat?.pitches?.length ? <PitchSequence atBat={currentAtBat} compact /> : null}
        </div>
      </div>
    </div>
  );
}

function HalfInningCard({
  team,
  half,
  period,
  pitcher,
  atBats,
}: {
  team?: TeamMeta;
  half: "top" | "bottom" | null;
  period: number;
  pitcher?: string | null;
  atBats: MlbAtBat[];
}) {
  const visible = atBats.length ? atBats : [];
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {team?.logo && <Image src={team.logo} alt={team.abbr} width={24} height={24} className="object-contain" />}
          <div>
            <div className="text-sm font-bold">
              {half === "bottom" ? "Bottom" : "Top"} of the {inningWord(period)} · {team?.abbr || "Batting"}
            </div>
            {pitcher && (
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                Pitching: {pitcher}
              </div>
            )}
          </div>
        </div>
        <div className="text-xs font-bold tabular-nums" style={{ color: "var(--text-2)" }}>
          {visible.filter((x) => x.isAtBat).length} AB
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {visible.length === 0 ? (
          <div className="p-4 text-sm" style={{ color: "var(--text-2)" }}>No at-bats yet this half inning.</div>
        ) : (
          visible.map((ab) => <AtBatSummaryRow key={ab.id} atBat={ab} />)
        )}
      </div>
    </div>
  );
}

function MlbPlaysView({ sections }: { sections: MlbSection[] }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <HalfInningCard
          key={`${section.period}-${section.half}`}
          team={section.team}
          half={section.half}
          period={section.period}
          pitcher={section.pitcher}
          atBats={section.atBats}
        />
      ))}
    </div>
  );
}

function ScoringPlaysView({ sections }: { sections: MlbSection[] }) {
  if (!sections.length) return <UnavailableCard text="No scoring plays yet." />;
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={`${section.period}-${section.half}-scoring`} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
            {section.team?.logo && <Image src={section.team.logo} alt={section.team.abbr} width={24} height={24} className="object-contain" />}
            <div>
              <div className="text-sm font-bold">{section.half === "bottom" ? "Bottom" : "Top"} of the {inningWord(section.period)} · {section.team?.abbr || "Team"}</div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{section.atBats.length} scoring play{section.atBats.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {section.atBats.map((ab) => <AtBatSummaryRow key={ab.id} atBat={ab} forceOpen={false} mode="scoring" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function AtBatSummaryRow({ atBat, forceOpen = false, mode = "default" }: { atBat: MlbAtBat; forceOpen?: boolean; mode?: "default" | "scoring" }) {
  if (atBat.isMinor) {
    if (isHiddenMinorEvent(atBat.text)) return null;
    return (
      <div className="px-4 py-2 text-xs" style={{ color: "var(--text-3)", background: "var(--surface)" }}>
        {atBat.text}
      </div>
    );
  }

  const pitchCount = mode === "scoring" ? 0 : atBat.pitches?.length || 0;

  return (
    <details className="group/gcab" open={forceOpen}>
      <summary className="px-4 py-3 cursor-pointer list-none hover:bg-[var(--surface-2)] transition-colors">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {atBat.isComplete === false && <StatusPill label="LIVE" tone="live" />}
              {mode !== "scoring" && atBat.scoringPlay && <StatusPill label="SCORING" tone="scoring" />}
            </div>
            <div className={`text-sm leading-snug ${atBat.scoringPlay && mode !== "scoring" ? "font-black" : "font-bold"}`}>{cleanResultText(atBat.result)}</div>
          </div>
          {(atBat.awayScore != null || atBat.homeScore != null) && (
            <div className="text-xs font-black tabular-nums rounded-lg px-2 py-1" style={{ color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {atBat.awayScore ?? ""}-{atBat.homeScore ?? ""}
            </div>
          )}
          {pitchCount > 0 && <span className="text-xs font-bold transition-transform group-open/gcab:rotate-180 mt-1" style={{ color: "var(--text-3)" }}>⌄</span>}
        </div>
      </summary>

      {pitchCount > 0 && <PitchSequence atBat={atBat} />}
    </details>
  );
}

function PitchSequence({ atBat, compact = false }: { atBat: MlbAtBat; compact?: boolean }) {
  if (!atBat.pitches?.length) return null;
  return (
    <div className={compact ? "mt-3 rounded-lg overflow-hidden" : "px-4 pb-3 pl-4"}>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {atBat.pitches.map((pitch, idx) => {
          const parsed = formatPitch(pitch);
          return (
            <div key={`${atBat.id}-${idx}`} className="px-3 py-2 text-xs border-b last:border-b-0 flex items-center gap-2" style={{ borderColor: "var(--border)", background: compact ? "var(--surface)" : "var(--surface-2)", color: "var(--text-2)" }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: parsed.bg, color: parsed.color, border: parsed.border }}>{idx + 1}</span>
              <span className="font-semibold">{parsed.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "live" | "scoring" }) {
  return (
    <span
      className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-wide"
      style={
        tone === "scoring"
          ? { background: "rgba(239,68,68,0.14)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.25)" }
          : { background: "rgba(59,130,246,0.12)", color: "var(--accent)", border: "1px solid rgba(59,130,246,0.25)" }
      }
    >
      {label}
    </span>
  );
}

function formatPitch(raw: string) {
  const text = String(raw || "").replace(/^Pitch\s*\d+\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (/ball in play|in play/.test(lower)) return { label: "In-play ball", bg: "rgba(59,130,246,0.14)", color: "var(--accent)", border: "1px solid rgba(59,130,246,0.3)" };
  if (/foul|foul tip|bunt foul/.test(lower)) return { label: "Foul", bg: "rgba(148,163,184,0.18)", color: "var(--text-2)", border: "1px solid rgba(148,163,184,0.35)" };
  if (/swinging|missed bunt/.test(lower)) return { label: "Strike Swinging", bg: "rgba(239,68,68,0.14)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" };
  if (/called strike|strike looking|looking/.test(lower)) return { label: "Strike Looking", bg: "rgba(239,68,68,0.14)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" };
  if (/strike/.test(lower)) return { label: "Strike", bg: "rgba(239,68,68,0.14)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" };
  if (/ball|intent ball|automatic ball/.test(lower)) return { label: "Ball", bg: "rgba(34,197,94,0.14)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.3)" };
  return { label: text || "Pitch", bg: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--border)" };
}

function cleanResultText(text: string) {
  return String(text || "Play").replace(/^Pitch\s*\d+\s*:\s*/i, "").replace(/\s+/g, " ").trim();
}

function isHiddenMinorEvent(text: string) {
  const value = String(text || "").trim();
  return /^(top|bottom|middle|end) of the \d+(st|nd|rd|th)? inning\.?$/i.test(value) || /^(middle|end) of the/i.test(value) || /\bpitches to\b/i.test(value);
}

function playerClickHandler(person: Person | null | undefined, onPlayerClick: ((player: { id: string; name: string; league: string }) => void) | undefined, fallbackName: string) {
  const id = person?.mlbId || person?.id;
  const name = person?.displayName || person?.name || person?.shortName || fallbackName;
  if (!id || !onPlayerClick) return undefined;
  return () => onPlayerClick({ id: String(id), name, league: "mlb" });
}

function PlayerMiniCard({ label, person, primaryStat, onClick }: { label: string; person?: Person | null; primaryStat?: string | null; onClick?: () => void }) {
  const name = person?.displayName || person?.name || person?.shortName || "—";
  const hasPlayer = name !== "—";
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper type={onClick ? "button" : undefined} onClick={onClick} className="rounded-xl p-3 flex items-center gap-3 text-left" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "var(--surface)" }}>
        {person?.headshot ? (
          <Image src={person.headshot} alt={name} width={40} height={40} className="object-cover" />
        ) : (
          <span className="text-xs font-bold" style={{ color: "var(--text-3)" }}>{initials(name)}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{label}</div>
        <div className="text-sm font-bold truncate">{name}</div>
        {hasPlayer && primaryStat && <div className="text-xs" style={{ color: "var(--text-2)" }}>{primaryStat}</div>}
      </div>
    </Wrapper>
  );
}

function GenericTabbedPlays({ data, error, isLoading, emptyText }: { data: any; error: any; isLoading: boolean; emptyText: string }) {
  const [tab, setTab] = useState<"live" | "scoring" | "plays">("live");
  const plays = data?.plays || [];
  if (isLoading) return <LoadingStack />;
  if (error || data?.error) return <UnavailableCard text="Play data is not available for this game yet." />;
  if (!plays.length) return <UnavailableCard text={emptyText} />;

  const scoring = plays.filter((p: any) => p.scoringPlay);
  const recent = [...plays].slice(-8).reverse();
  const byPeriod = groupByPeriod(plays);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)" }}>
        <GamecastTab label="Live" active={tab === "live"} onClick={() => setTab("live")} />
        <GamecastTab label="Scoring" active={tab === "scoring"} onClick={() => setTab("scoring")} />
        <GamecastTab label="Plays" active={tab === "plays"} onClick={() => setTab("plays")} />
      </div>
      {tab === "live" && <GenericPlayList plays={recent} home={data?.home} away={data?.away} />}
      {tab === "scoring" && (scoring.length ? <GenericPeriodGroups sections={groupByPeriod(scoring)} home={data?.home} away={data?.away} /> : <UnavailableCard text="No scoring plays yet." />)}
      {tab === "plays" && (
        <div className="space-y-3">
          {byPeriod.map((section) => (
            <div key={section.period}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>{periodLabel(section.period)}</div>
              <GenericPlayList plays={section.plays} home={data?.home} away={data?.away} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByPeriod(plays: any[]) {
  const map = new Map<number, any[]>();
  for (const p of plays) {
    const period = Number(p.period || 0);
    if (!map.has(period)) map.set(period, []);
    map.get(period)!.push(p);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([period, sectionPlays]) => ({ period, plays: sectionPlays }));
}

function GenericPeriodGroups({ sections, home, away }: { sections: { period: number; plays: any[] }[]; home?: TeamMeta; away?: TeamMeta }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.period}>
          <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-2)" }}>{periodLabel(section.period)}</div>
          <GenericPlayList plays={section.plays} home={home} away={away} />
        </div>
      ))}
    </div>
  );
}

function GenericPlayList({ plays, home, away }: { plays: any[]; home?: TeamMeta; away?: TeamMeta }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {plays.map((p: any) => {
        const team = p.homeAway === "home" ? home : p.homeAway === "away" ? away : null;
        return (
          <div key={p.id} className="px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-2">
              {team?.logo ? <Image src={team.logo} alt={team.abbr} width={22} height={22} className="mt-0.5 object-contain flex-shrink-0" unoptimized /> : team ? <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: team.color || "var(--text-3)" }} /> : null}
              <div className="min-w-0">
                <div className="text-sm font-semibold">{p.text}</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{[p.clock, periodLabel(p.period), team?.abbr].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-base font-bold">{title}</h3>
      {subtitle && <p className="text-sm" style={{ color: "var(--text-2)" }}>{subtitle}</p>}
    </div>
  );
}

function LoadingStack() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      ))}
    </div>
  );
}

function UnavailableCard({ text }: { text: string }) {
  return (
    <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {text}
    </div>
  );
}

function buildMlbSections(atBats: MlbAtBat[], home?: TeamMeta, away?: TeamMeta, order: "newest-first" | "chronological" = "newest-first"): MlbSection[] {
  const map = new Map<string, MlbSection>();
  const ordered = [...atBats].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  for (const ab of ordered) {
    const period = ab.period || 0;
    const half = ab.halfInning || "bottom";
    const key = `${period}-${half}`;
    if (!map.has(key)) {
      map.set(key, {
        period,
        half,
        team: half === "top" ? away : home,
        pitcher: null,
        atBats: [],
      });
    }
    const section = map.get(key)!;
    section.atBats.push(ab);
    if (!section.pitcher && (ab.pitcher?.displayName || ab.pitcher?.name)) {
      section.pitcher = ab.pitcher?.displayName || ab.pitcher?.name || null;
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      if (a.period !== b.period) return order === "chronological" ? a.period - b.period : b.period - a.period;
      if (a.half === b.half) return 0;
      if (order === "chronological") return a.half === "top" ? -1 : 1;
      return a.half === "bottom" ? -1 : 1;
    })
    .map((section) => ({
      ...section,
      atBats: [...section.atBats].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    }));
}

function currentHalfInning(atBats: MlbAtBat[], situation: any): { period: number; half: "top" | "bottom" | null } {
  const last = [...atBats].reverse().find((ab) => ab.halfInning && ab.period) || null;
  return {
    period: Number(situation?.period || last?.period || 1),
    half: situation?.halfInning || last?.halfInning || "top",
  };
}

function getStat(person: Person | null | undefined, keys: string[]): string | number | null {
  const stats = person?.stats || {};
  for (const key of keys) {
    const value = stats[key];
    if (value != null && value !== "") return value;
  }
  return null;
}

function batterStatText(person: Person | null | undefined): string | null {
  const avg = getStat(person, ["AVG", "BA"]);
  const game = getStat(person, ["H_AB", "H-AB", "H/AB"]);
  if (game != null && avg != null) return `${game} today · ${avg} AVG`;
  if (game != null) return `${game} today`;
  if (avg != null) return `${avg} AVG`;
  return null;
}

function pitcherStatText(person: Person | null | undefined): string | null {
  const ip = getStat(person, ["IP"]);
  const er = getStat(person, ["ER"]);
  const k = getStat(person, ["K", "SO"]);
  const pitches = getStat(person, ["P", "PC", "#P", "Pitches"]);
  const parts = [];
  if (ip != null) parts.push(`${ip} IP`);
  if (er != null) parts.push(`${er} ER`);
  if (k != null) parts.push(`${k} K`);
  if (pitches != null) parts.push(`${pitches} P`);
  return parts.length ? parts.join(" · ") : null;
}

function countText(situation: any): string | null {
  if (typeof situation?.balls === "number" && typeof situation?.strikes === "number") return `${situation.balls}-${situation.strikes}`;
  return null;
}

function BasesDiamond({ onFirst, onSecond, onThird }: { onFirst: boolean; onSecond: boolean; onThird: boolean }) {
  const filled = "var(--text)";
  const empty = "var(--surface-2)";
  const stroke = "var(--text-3)";
  return (
    <svg width="44" height="36" viewBox="0 0 34 28" aria-label="Bases">
      <g transform="translate(17 7) rotate(45)">
        <rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onSecond ? filled : empty} stroke={stroke} strokeWidth="1.1" />
      </g>
      <g transform="translate(26 17) rotate(45)">
        <rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onFirst ? filled : empty} stroke={stroke} strokeWidth="1.1" />
      </g>
      <g transform="translate(8 17) rotate(45)">
        <rect x="-5" y="-5" width="10" height="10" rx="1.5" fill={onThird ? filled : empty} stroke={stroke} strokeWidth="1.1" />
      </g>
    </svg>
  );
}

function FieldPositionMini({ situation }: { situation: any }) {
  const yardLine = typeof situation?.yardLine === "number" ? situation.yardLine : null;
  const downText =
    situation?.shortDownDistanceText ||
    (typeof situation?.down === "number" && typeof situation?.distance === "number"
      ? `${ordinal(situation.down)} & ${situation.distance}`
      : null);
  const possText = situation?.possessionText || null;
  if (yardLine == null && !downText) return null;
  const x = yardLine != null ? Math.max(2, Math.min(98, yardLine)) : null;

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>Field position</span>
        {downText && <span className="text-sm font-bold tabular-nums">{downText}</span>}
      </div>
      <svg viewBox="0 0 100 18" className="w-full h-12" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="18" fill="var(--surface-2)" />
        <rect x="0" y="0" width="3" height="18" fill="rgba(0,0,0,0.15)" />
        <rect x="97" y="0" width="3" height="18" fill="rgba(0,0,0,0.15)" />
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <line key={yd} x1={yd} x2={yd} y1="2" y2="16" stroke="var(--border)" strokeWidth="0.3" />
        ))}
        <line x1="50" x2="50" y1="0" y2="18" stroke="var(--text-3)" strokeWidth="0.4" />
        {x != null && (
          <g>
            <line x1={x} x2={x} y1="0" y2="18" stroke="var(--danger)" strokeWidth="0.6" />
            <circle cx={x} cy="9" r="1.5" fill="var(--danger)" />
          </g>
        )}
      </svg>
      {possText && <div className="mt-2 text-xs text-center" style={{ color: "var(--text-2)" }}>{possText}</div>}
    </div>
  );
}

function inferBatterName(text: string): string | null {
  return text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+/)?.[1] || null;
}

function initials(name: string): string {
  if (!name || name === "—") return "--";
  return name.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
}

function inningWord(n: number): string {
  const words: Record<number, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh", 8: "Eighth", 9: "Ninth", 10: "Tenth", 11: "11th", 12: "12th" };
  return words[n] || ordinal(n);
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function periodLabel(period: number): string {
  return period ? `Period ${period}` : "Play";
}
