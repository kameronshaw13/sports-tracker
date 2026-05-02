import { NextRequest, NextResponse } from "next/server";
import { getScoreboard } from "@/lib/espn";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const date = searchParams.get("date");

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }

  try {
    const data = await getScoreboard(league, date || undefined);

    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");

      // v19 fix: ESPN's scoreboard payload sometimes returns competitor.team.logo
      // as a singular URL string and sometimes as a logos[] array. v18 only
      // checked the array path which is why logos disappeared on the league
      // view game cards. Fall through both.
      const formatTeam = (c: any) =>
        c && {
          id: c.id,
          name: c.team?.displayName,
          abbr: c.team?.abbreviation,
          logo: c.team?.logo || c.team?.logos?.[0]?.href || null,
          score: c.score,
          record: c.records?.[0]?.summary || c.record?.[0]?.summary,
          winner: c.winner,
        };

      // Pass through situation block for live games. Used by LeaguesView to
      // render bases/count/outs (MLB) and down/distance (NFL) inline with the
      // status header. Shape varies per sport — see notes in v18.
      const situation = comp?.situation || null;
      const normalizedSituation = situation
        ? {
            balls: typeof situation.balls === "number" ? situation.balls : null,
            strikes: typeof situation.strikes === "number" ? situation.strikes : null,
            outs: typeof situation.outs === "number" ? situation.outs : null,
            onFirst: !!situation.onFirst,
            onSecond: !!situation.onSecond,
            onThird: !!situation.onThird,
            down: typeof situation.down === "number" ? situation.down : null,
            distance: typeof situation.distance === "number" ? situation.distance : null,
            yardLine: typeof situation.yardLine === "number" ? situation.yardLine : null,
            possession: situation.possession || null,
            isRedZone: !!situation.isRedZone,
            shortDownDistanceText: situation.shortDownDistanceText || null,
            possessionText: situation.possessionText || null,
            lastPlay: situation.lastPlay?.text || null,
          }
        : null;

      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        status: {
          state: comp?.status?.type?.state,
          completed: comp?.status?.type?.completed,
          description: comp?.status?.type?.description,
          detail: comp?.status?.type?.shortDetail,
          statusName: comp?.status?.type?.name || null,
        },
        home: formatTeam(home),
        away: formatTeam(away),
        situation: normalizedSituation,
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
      };
    });

    return NextResponse.json({ league, date, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Fetch failed" },
      { status: 500 }
    );
  }
}
