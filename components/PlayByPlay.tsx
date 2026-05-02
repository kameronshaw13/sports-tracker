"use client";

import Image from "next/image";
import useSWR from "swr";
import { useFreshKey } from "@/lib/freshKey";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
  homeAbbr?: string;
  awayAbbr?: string;
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

type Play = {
  id: string;
  text: string;
  period: number;
  halfInning?: "top" | "bottom" | null;
  clock?: string | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  driveIndex?: number;
};

type Drive = {
  index: number;
  description: string;
  result: string;
  teamId: string | null;
  homeAway: "home" | "away" | null;
  start?: string;
  end?: string;
};

export default function PlayByPlay({ league, eventId, isLive }: Props) {
  const freshKey = useFreshKey();
  const { data, error, isLoading } = useSWR(
    eventId ? `/api/plays?league=${league}&event=${eventId}&_t=${freshKey}` : null,
    fetcher,
    { refreshInterval: isLive ? 10_000 : 0 }
  );

  const home: TeamMeta | undefined = data?.home;
  const away: TeamMeta | undefined = data?.away;
  const plays: Play[] = data?.plays || [];
  const drives: Drive[] = data?.drives || [];

  if (isLoading) return <LoadingRows />;

  if (error || !data || data.error) {
    return <EmptyCard text="Play-by-play data is not available for this game yet." />;
  }

  if (league === "mlb") {
    const atBats: MlbAtBat[] = data?.mlb?.atBats || [];
    if (!atBats.length) return <EmptyCard text="No ESPN play-by-play data has posted yet." />;
    return <MlbPlayByPlay atBats={atBats} home={home} away={away} />;
  }

  if (plays.length === 0) return <EmptyCard text="No plays yet." />;

  if (league === "nfl") {
    return <NflDriveView drives={drives} plays={plays} home={home} away={away} />;
  }

  return <PeriodView league={league} plays={plays} home={home} away={away} />;
}

function MlbPlayByPlay({ atBats, home, away }: { atBats: MlbAtBat[]; home?: TeamMeta; away?: TeamMeta }) {
  const sections = buildMlbSections(atBats, home, away);

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <details
          key={`${section.period}-${section.half}`}
          open
          className="rounded-2xl overflow-hidden group"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <summary
            className="px-4 py-3 cursor-pointer list-none flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {section.team?.logo && <Image src={section.team.logo} alt={section.team.abbr} width={26} height={26} className="object-contain" />}
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">
                  {section.half === "bottom" ? "Bottom" : "Top"} of the {inningWord(section.period)} · {section.team?.abbr || "Team"}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text-3)" }}>
                  {section.pitcher ? `Pitching: ${section.pitcher}` : `${section.atBats.filter((x) => x.isAtBat).length} at-bats`}
                </div>
              </div>
            </div>
            <span className="text-xs font-bold transition-transform group-open:rotate-180" style={{ color: "var(--text-3)" }}>⌄</span>
          </summary>

          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {section.atBats.map((ab) =>
              ab.isMinor ? (
                <MinorEventRow key={ab.id} atBat={ab} />
              ) : (
                <AtBatDetails key={ab.id} atBat={ab} team={section.team} />
              )
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function AtBatDetails({ atBat, team }: { atBat: MlbAtBat; team?: TeamMeta }) {
  const batterName = atBat.batter?.displayName || atBat.batter?.name || atBat.batter?.shortName || inferBatterName(atBat.result);
  const pitchCount = atBat.pitches?.length || 0;
  const isLiveAtBat = atBat.isComplete === false;

  return (
    <details className="group/ab" open={false}>
      <summary className="px-4 py-3 cursor-pointer list-none hover:bg-[var(--surface-2)] transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: team?.color || "var(--surface-2)", color: "#fff" }}>
            <span className="text-[10px] font-black">{team?.abbr?.slice(0, 2) || "AB"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {batterName && <span className="text-sm font-bold">{batterName}</span>}
              {isLiveAtBat && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.12)", color: "var(--accent)" }}>LIVE</span>}
              {atBat.scoringPlay && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>SCORING</span>}
            </div>
            <div className="text-sm leading-snug mt-0.5" style={{ color: "var(--text-2)" }}>
              {atBat.result}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
              {pitchCount > 0 && <span>{pitchCount} pitch{pitchCount === 1 ? "" : "es"} · tap to view sequence</span>}
              {(atBat.awayScore != null || atBat.homeScore != null) && <span>{atBat.awayScore ?? ""}-{atBat.homeScore ?? ""}</span>}
            </div>
          </div>
          <span className="text-xs font-bold transition-transform group-open/ab:rotate-180 mt-1" style={{ color: "var(--text-3)" }}>⌄</span>
        </div>
      </summary>

      <div className="px-4 pb-4 pl-14">
        {atBat.pitches?.length ? (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {atBat.pitches.map((pitch, idx) => (
              <div key={`${atBat.id}-${idx}`} className="px-3 py-2 text-sm border-b last:border-b-0 flex items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{idx + 1}</span>
                <span>{pitch}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            ESPN has posted the at-bat result, but not a pitch-by-pitch sequence for this row.
          </div>
        )}
      </div>
    </details>
  );
}

function MinorEventRow({ atBat }: { atBat: MlbAtBat }) {
  return (
    <div className="px-4 py-2.5 flex items-center gap-2 text-xs" style={{ color: "var(--text-3)", background: "var(--surface)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-3)" }} />
      <span>{atBat.text}</span>
    </div>
  );
}

function buildMlbSections(atBats: MlbAtBat[], home?: TeamMeta, away?: TeamMeta) {
  type Section = {
    period: number;
    half: "top" | "bottom" | null;
    team?: TeamMeta;
    pitcher?: string | null;
    atBats: MlbAtBat[];
  };

  const map = new Map<string, Section>();
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
      // Main play-by-play should read newest first: current half-inning at the top,
      // beginning of the game at the bottom.
      if (a.period !== b.period) return b.period - a.period;
      if (a.half === b.half) return 0;
      return a.half === "bottom" ? -1 : 1;
    })
    .map((section) => ({
      ...section,
      // Inside a half-inning, show the first batter at the top and the most recent at the bottom.
      atBats: [...section.atBats].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    }));
}

function NflDriveView({ drives, plays, home, away }: { drives: Drive[]; plays: Play[]; home?: TeamMeta; away?: TeamMeta }) {
  if (drives.length === 0) return <PeriodView league="nfl" plays={plays} home={home} away={away} />;

  const playsByDrive = new Map<number, Play[]>();
  for (const p of plays) {
    if (p.driveIndex == null) continue;
    if (!playsByDrive.has(p.driveIndex)) playsByDrive.set(p.driveIndex, []);
    playsByDrive.get(p.driveIndex)!.push(p);
  }

  return (
    <div className="space-y-3">
      {[...drives].reverse().map((d) => {
        const team = d.homeAway === "home" ? home : d.homeAway === "away" ? away : undefined;
        const dp = playsByDrive.get(d.index) || [];
        return (
          <details key={d.index} open className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="text-sm font-bold">{team?.abbr || "Drive"} {d.result ? `— ${d.result}` : ""}</div>
                <div className="text-xs" style={{ color: "var(--text-3)" }}>{d.description || [d.start, d.end].filter(Boolean).join(" → ")}</div>
              </div>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>⌄</span>
            </summary>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {dp.map((p) => <PlayRow key={p.id} play={p} home={home} away={away} />)}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PeriodView({ league, plays, home, away }: { league: string; plays: Play[]; home?: TeamMeta; away?: TeamMeta }) {
  const grouped = new Map<number, Play[]>();
  for (const p of plays) {
    const period = p.period || 0;
    if (!grouped.has(period)) grouped.set(period, []);
    grouped.get(period)!.push(p);
  }

  return (
    <div className="space-y-3">
      {[...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([period, ps]) => (
        <details key={period} open className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <summary className="px-4 py-3 cursor-pointer list-none text-sm font-bold" style={{ borderBottom: "1px solid var(--border)" }}>
            {periodTitle(league, period)}
          </summary>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {ps.map((p) => <PlayRow key={p.id} play={p} home={home} away={away} />)}
          </div>
        </details>
      ))}
    </div>
  );
}

function PlayRow({ play, home, away }: { play: Play; home?: TeamMeta; away?: TeamMeta }) {
  const team = play.homeAway === "home" ? home : play.homeAway === "away" ? away : undefined;
  return (
    <div className="px-4 py-3 flex gap-3">
      <div className="w-1 rounded-full flex-shrink-0" style={{ background: team?.color || "var(--border)" }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{play.text}</div>
        <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          {play.clock || periodTitle("generic", play.period)}
          {(play.awayScore != null || play.homeScore != null) && ` · ${play.awayScore ?? ""}-${play.homeScore ?? ""}`}
        </div>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: "var(--surface)" }} />
      ))}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="p-5 rounded-xl text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {text}
    </div>
  );
}

function inferBatterName(text: string): string | null {
  return text.match(/^([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})\s+/)?.[1] || null;
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

function periodTitle(league: string, period: number): string {
  if (league === "nba") return `${ordinal(period)} Quarter`;
  if (league === "nhl") return `${ordinal(period)} Period`;
  if (league === "nfl") return `${ordinal(period)} Quarter`;
  return period ? `Period ${period}` : "Play";
}
