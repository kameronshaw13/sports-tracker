import { NextRequest, NextResponse } from "next/server";
import { getScoreboard } from "@/lib/espn";

export const revalidate = 30;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get("league");
  const date = searchParams.get("date") || undefined;

  if (!league || !VALID_LEAGUES.includes(league)) {
    return NextResponse.json({ error: "Invalid league" }, { status: 400 });
  }

  try {
    const data = await getScoreboard(league, date);
    const events = (data?.events || []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      const status = ev.status || comp?.status;
      return {
        id: ev.id,
        date: ev.date,
        name: ev.name,
        shortName: ev.shortName,
        status: {
          state: status?.type?.state,
          completed: status?.type?.completed,
          description: status?.type?.description,
          detail: status?.type?.shortDetail,
          period: status?.period,
          clock: status?.displayClock,
        },
        home: home && {
          id: home.id,
          name: home.team?.displayName,
          abbr: home.team?.abbreviation,
          logo: home.team?.logos?.[0]?.href || home.team?.logo,
          score: home.score?.value ?? home.score,
          record: home.records?.[0]?.summary,
          winner: home.winner,
        },
        away: away && {
          id: away.id,
          name: away.team?.displayName,
          abbr: away.team?.abbreviation,
          logo: away.team?.logos?.[0]?.href || away.team?.logo,
          score: away.score?.value ?? away.score,
          record: away.records?.[0]?.summary,
          winner: away.winner,
        },
        broadcast: comp?.broadcasts?.[0]?.names?.[0] || null,
        venue: comp?.venue?.fullName || null,
      };
    });

    return NextResponse.json({ league, date: data?.day?.date || date, events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
