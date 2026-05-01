// v20 /api/plays
//
// Dedicated endpoint for the Play-by-Play tab. Returns a richer payload
// than /api/summary's flattened plays so we can:
//   - Render a team color stripe on each play (need teamId per play)
//   - Group MLB plays by half-inning (top vs bottom)
//   - Group NFL plays by drive (need ESPN's drive-level structure)
//   - Group NBA/NHL plays by period (already worked in v19)
//
// /api/summary is left untouched — other components (GameDetail header,
// Boxscore, etc.) keep using the thinner shape they expect.

import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";
import { ensureHash } from "@/lib/teams";

export const revalidate = 15;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

type TeamMeta = {
  id: string;
  abbr: string;
  name: string;
  color: string;
  logo?: string;
};

type Play = {
  id: string;
  text: string;
  period: number;
  // For MLB: "top" | "bottom" derived from the period.type
  halfInning?: "top" | "bottom" | null;
  clock?: string | null;
  scoringPlay: boolean;
  awayScore?: number;
  homeScore?: number;
  // Team that performed the play. For MLB this is the batting team
  // (top half = away, bottom half = home). For NFL/NBA/NHL we read it
  // straight off the play. Null when ESPN doesn't tell us.
  teamId: string | null;
  homeAway: "home" | "away" | null;
  // NFL only — index into the drives[] array.
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

function readTeamColor(c: any): string {
  // ESPN sometimes uses 'color' (no hash), sometimes 'team.color'.
  return ensureHash(c?.team?.color || c?.color || "");
}

function buildTeamMeta(c: any): TeamMeta | null {
  if (!c) return null;
  return {
    id: String(c.id || c.team?.id || ""),
    abbr: String(c.team?.abbreviation || "").toUpperCase(),
    name: c.team?.displayName || c.team?.name || "",
    color: readTeamColor(c),
    logo: c.team?.logo || c.team?.logos?.[0]?.href,
  };
}

// MLB period.type is "Top" or "Bottom" (sometimes "End"/"Middle" between
// halves — treat those like the half they finished).
function readHalfInning(p: any): "top" | "bottom" | null {
  const raw = String(
    p?.period?.type ||
      p?.atBatPlayResult?.halfInning ||
      ""
  ).toLowerCase();
  if (raw.startsWith("top") || raw === "middle") return "top";
  if (raw.startsWith("bot") || raw === "end") return "bottom";
  return null;
}

function readPlayTeamId(league: string, p: any): string | null {
  // Most leagues — ESPN attaches team.id to plays.
  const direct =
    p?.team?.id || p?.team?.$ref?.match(/\/teams\/(\d+)/)?.[1] || null;
  if (direct) return String(direct);
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event");
  const league = searchParams.get("league");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  try {
    const data = await getGameSummary(league, eventId);

    const header = data?.header;
    const comp = header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const homeC = competitors.find((c: any) => c.homeAway === "home");
    const awayC = competitors.find((c: any) => c.homeAway === "away");

    const home = buildTeamMeta(homeC);
    const away = buildTeamMeta(awayC);

    const homeId = home?.id || "";
    const awayId = away?.id || "";

    // ---- Plays ----
    // Note: /api/summary slices plays in reverse-chronological order. Here
    // we keep them in NATURAL order so each section reads top-to-bottom.
    const rawPlays: any[] = Array.isArray(data?.plays) ? data.plays : [];

    const plays: Play[] = rawPlays.map((p: any) => {
      const period = Number(p?.period?.number || 0);
      const halfInning = league === "mlb" ? readHalfInning(p) : null;

      // Determine which team is responsible for this play.
      let teamId: string | null = readPlayTeamId(league, p);

      // For MLB, ESPN doesn't always attach team to the play. We can derive
      // it from the half-inning: top = away batting, bottom = home batting.
      if (!teamId && league === "mlb" && halfInning) {
        teamId = halfInning === "top" ? awayId : homeId;
      }

      const homeAway: "home" | "away" | null =
        teamId && teamId === homeId
          ? "home"
          : teamId && teamId === awayId
          ? "away"
          : null;

      return {
        id: String(p.id),
        text: String(p.text || ""),
        period,
        halfInning,
        clock: p.clock?.displayValue || null,
        scoringPlay: !!p.scoringPlay,
        awayScore: p.awayScore,
        homeScore: p.homeScore,
        teamId,
        homeAway,
      };
    });

    // ---- NFL drives ----
    // ESPN puts these under data.drives = { previous: [...], current: {...} }.
    // We flatten into a single ordered array, oldest first. Each drive's
    // plays are tagged with driveIndex so PlayByPlay can group.
    let drives: Drive[] = [];

    if (league === "nfl") {
      const previous: any[] = Array.isArray(data?.drives?.previous)
        ? data.drives.previous
        : [];
      const current = data?.drives?.current;
      const allDrives = current ? [...previous, current] : previous;

      drives = allDrives.map((d: any, idx: number) => {
        const tid = String(d?.team?.id || d?.team?.$ref?.match(/\/teams\/(\d+)/)?.[1] || "");
        const homeAway: "home" | "away" | null =
          tid && tid === homeId ? "home" : tid && tid === awayId ? "away" : null;
        return {
          index: idx,
          description: String(d?.description || ""),
          result: String(d?.displayResult || d?.result || ""),
          teamId: tid || null,
          homeAway,
          start: d?.start?.text,
          end: d?.end?.text,
        };
      });

      // Tag each play with its drive index by matching play ids inside drive.plays[].
      const playIdToDrive = new Map<string, number>();
      allDrives.forEach((d: any, idx: number) => {
        const dp = Array.isArray(d?.plays) ? d.plays : [];
        for (const pl of dp) {
          if (pl?.id) playIdToDrive.set(String(pl.id), idx);
        }
      });

      for (const p of plays) {
        const di = playIdToDrive.get(p.id);
        if (di != null) p.driveIndex = di;
      }
    }

    return NextResponse.json({
      league,
      eventId,
      status: {
        state: comp?.status?.type?.state,
        detail: comp?.status?.type?.shortDetail,
      },
      home,
      away,
      plays,
      drives, // empty for non-NFL
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed", plays: [], drives: [] },
      { status: 500 }
    );
  }
}
