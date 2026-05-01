import { NextRequest, NextResponse } from "next/server";
import { getGameSummary, getTeamSchedule } from "@/lib/espn";
import {
  buildRecap,
  RecapInput,
  RecapLeader,
  RecapPastGame,
  RecapTeam,
} from "@/lib/recap";

// Recaps are stable once the game is over — cache for 5 minutes server-side.
// This means the second person to view a recap gets it instantly, and the
// upstream cost (3 ESPN fetches per game) is paid at most once every 5 min.
export const revalidate = 300;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

function teamShortName(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  // "Baltimore Orioles" → "Orioles"; "Los Angeles Chargers" → "Chargers"
  const parts = name.split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

// ESPN summary returns leaders as
//   leaders: [
//     { team: {abbr,...}, leaders: [
//        { name: "passingYards", shortDisplayName: "PASS YDS",
//          leaders: [{ athlete: {displayName,...}, displayValue: "..." }] }
//     ] }
//   ]
function extractLeadersFor(summary: any, abbr: string): RecapLeader[] {
  const out: RecapLeader[] = [];
  const groups = Array.isArray(summary?.leaders) ? summary.leaders : [];
  const teamGroup = groups.find(
    (g: any) => g?.team?.abbreviation?.toLowerCase() === abbr.toLowerCase()
  );
  if (!teamGroup) return out;

  const cats = Array.isArray(teamGroup.leaders) ? teamGroup.leaders : [];
  for (const cat of cats) {
    const top = Array.isArray(cat?.leaders) ? cat.leaders[0] : null;
    if (!top?.athlete?.displayName) continue;
    out.push({
      category: cat?.name || "",
      shortName: cat?.shortDisplayName || cat?.displayName || cat?.name || "",
      player: top.athlete.displayName,
      position: top.athlete.position?.abbreviation,
      displayValue: String(top.displayValue || top.value || ""),
    });
  }
  return out;
}

// Convert a team schedule (from getTeamSchedule) into RecapPastGame[].
// Filters out future/postponed games — only completed regular & playoff
// games count toward streaks. Sorted oldest → newest.
function scheduleToRecent(events: any[], abbr: string): RecapPastGame[] {
  const completed = (events || []).filter((ev: any) => {
    const state = ev.status?.type?.state || ev.competitions?.[0]?.status?.type?.state;
    const name = ev.status?.type?.name || ev.competitions?.[0]?.status?.type?.name;
    if (state !== "post") return false;
    if (name && /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(name)) return false;
    return true;
  });

  return completed
    .map((ev: any) => {
      const comp = ev.competitions?.[0];
      const us = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() === abbr.toLowerCase()
      );
      const them = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() !== abbr.toLowerCase()
      );
      if (!us || !them) return null;
      const ourScore = Number(us?.score?.value ?? us?.score ?? 0);
      const theirScore = Number(them?.score?.value ?? them?.score ?? 0);
      return {
        won: !!us?.winner,
        ourScore: Number.isFinite(ourScore) ? ourScore : 0,
        theirScore: Number.isFinite(theirScore) ? theirScore : 0,
        date: ev.date,
      } as RecapPastGame;
    })
    .filter((g: RecapPastGame | null): g is RecapPastGame => g !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const eventId = searchParams.get("event");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  try {
    const summary = await getGameSummary(league, eventId);

    const header = summary?.header;
    const comp = header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const homeC = competitors.find((c: any) => c.homeAway === "home");
    const awayC = competitors.find((c: any) => c.homeAway === "away");

    const homeAbbr = String(homeC?.team?.abbreviation || "").toLowerCase();
    const awayAbbr = String(awayC?.team?.abbreviation || "").toLowerCase();

    if (!homeAbbr || !awayAbbr) {
      return NextResponse.json({ error: "Could not parse teams from summary" }, { status: 500 });
    }

    // Status — finished games only. The recap view should only render
    // completed games but we sanity check here too.
    const state = comp?.status?.type?.state;
    if (state !== "post") {
      return NextResponse.json(
        { error: "Game has not finished yet" },
        { status: 409 }
      );
    }
    const statusDetail = comp?.status?.type?.shortDetail || "Final";
    const isOT = /OT|SO|F\/OT|F\/SO/i.test(statusDetail);

    const homeName = homeC?.team?.displayName || homeAbbr.toUpperCase();
    const awayName = awayC?.team?.displayName || awayAbbr.toUpperCase();

    const home: RecapTeam = {
      abbr: homeAbbr,
      name: homeName,
      short: teamShortName(homeName, homeAbbr.toUpperCase()),
      score: Number(homeC?.score ?? 0),
    };
    const away: RecapTeam = {
      abbr: awayAbbr,
      name: awayName,
      short: teamShortName(awayName, awayAbbr.toUpperCase()),
      score: Number(awayC?.score ?? 0),
    };

    const homeLeaders = extractLeadersFor(summary, homeAbbr);
    const awayLeaders = extractLeadersFor(summary, awayAbbr);

    // Fetch each team's schedule in parallel for streak/trend math. Both are
    // cached for 5 minutes upstream so this is cheap on warm calls.
    const [awaySchedule, homeSchedule] = await Promise.allSettled([
      getTeamSchedule(league, awayAbbr),
      getTeamSchedule(league, homeAbbr),
    ]);

    const awayRecent =
      awaySchedule.status === "fulfilled"
        ? scheduleToRecent(awaySchedule.value?.events || [], awayAbbr)
        : [];
    const homeRecent =
      homeSchedule.status === "fulfilled"
        ? scheduleToRecent(homeSchedule.value?.events || [], homeAbbr)
        : [];

    const recapInput: RecapInput = {
      league,
      status: { detail: statusDetail, isOT },
      away,
      home,
      awayLeaders,
      homeLeaders,
      awayRecent,
      homeRecent,
    };

    const recap = buildRecap(recapInput);

    return NextResponse.json({
      eventId,
      league,
      status: { detail: statusDetail, isOT },
      home,
      away,
      paragraphs: recap.paragraphs,
      awayTrend: recap.awayTrend,
      homeTrend: recap.homeTrend,
      // Surface the raw leaders for the UI to render player headshots etc.
      awayLeaders,
      homeLeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Recap fetch failed" },
      { status: 500 }
    );
  }
}
