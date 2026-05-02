import { NextRequest, NextResponse } from "next/server";
import { getTeamSchedule } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeSituation(situation: any) {
  if (!situation) return null;
  return {
    balls: typeof situation.balls === "number" ? situation.balls : null,
    strikes: typeof situation.strikes === "number" ? situation.strikes : null,
    outs: typeof situation.outs === "number" ? situation.outs : null,
    onFirst: !!situation.onFirst,
    onSecond: !!situation.onSecond,
    onThird: !!situation.onThird,
    batter: situation.batter || null,
    pitcher: situation.pitcher || null,
    lastPlay: situation.lastPlay?.text || situation.lastPlay || null,
    down: typeof situation.down === "number" ? situation.down : null,
    distance: typeof situation.distance === "number" ? situation.distance : null,
    yardLine: typeof situation.yardLine === "number" ? situation.yardLine : null,
    shortDownDistanceText: situation.shortDownDistanceText || null,
    possessionText: situation.possessionText || null,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamKey = searchParams.get("team");

  const parsed = parseTeamKey(teamKey);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid team key (expected format: league-abbr, e.g. mlb-bal)" },
      { status: 400 }
    );
  }

  try {
    const data = await getTeamSchedule(parsed.league, parsed.abbr);
    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const us = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() === parsed.abbr.toLowerCase()
      );
      const them = comp?.competitors?.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() !== parsed.abbr.toLowerCase()
      );
      const status = ev.status || comp?.status;
      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        weekText: ev.week?.text || ev.seasonType?.name || null,
        playoff: ev._isPlayoff || ev.seasonType?.id === "3" || false,
        status: {
          state: status?.type?.state,
          completed: status?.type?.completed,
          description: status?.type?.description,
          detail: status?.type?.shortDetail,
          statusName: status?.type?.name || null,
        },
        home: us?.homeAway === "home",
        opponent: {
          id: them?.id,
          name: them?.team?.displayName,
          abbr: them?.team?.abbreviation,
          logo: them?.team?.logos?.[0]?.href || them?.team?.logo,
          score: them?.score?.value ?? them?.score,
        },
        us: {
          score: us?.score?.value ?? us?.score,
          winner: us?.winner,
        },
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
        situation: normalizeSituation(comp?.situation || ev?.situation),
      };
    });

    return NextResponse.json({ team: parsed.abbr.toUpperCase(), events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
