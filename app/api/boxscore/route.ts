import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";

export const revalidate = 30;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

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
    const data = await getGameSummary(league, eventId);
    const teams = (data?.boxscore?.players || []).map((teamBox: any) => {
      const teamInfo = teamBox.team;
      const groups = (teamBox.statistics || []).map((stat: any) => {
        const labels: string[] = stat.labels || [];
        const descriptions: string[] = stat.descriptions || [];
        const athletes = (stat.athletes || []).map((a: any) => {
          const stats: Record<string, string> = {};
          (a.stats || []).forEach((val: string, i: number) => {
            const key = labels[i] || `stat${i}`;
            stats[key] = val;
          });
          return {
            id: a.athlete?.id,
            name: a.athlete?.displayName,
            shortName: a.athlete?.shortName,
            position: a.athlete?.position?.abbreviation,
            jersey: a.athlete?.jersey,
            headshot: a.athlete?.headshot?.href || null,
            starter: a.starter,
            stats,
          };
        });
        return {
          name: stat.name || stat.text || "Stats",
          keys: labels,
          descriptions,
          athletes,
          totals: stat.totals || null,
        };
      });
      return {
        team: {
          id: teamInfo?.id,
          name: teamInfo?.displayName,
          abbr: teamInfo?.abbreviation,
          logo: teamInfo?.logos?.[0]?.href || teamInfo?.logo,
        },
        groups,
      };
    });

    const leaders = (data?.leaders || []).map((t: any) => ({
      team: {
        id: t.team?.id,
        abbr: t.team?.abbreviation,
        logo: t.team?.logos?.[0]?.href || t.team?.logo,
      },
      categories: (t.leaders || []).map((cat: any) => ({
        name: cat.displayName,
        shortName: cat.shortDisplayName,
        leader: cat.leaders?.[0] && {
          name: cat.leaders[0].athlete?.displayName,
          headshot: cat.leaders[0].athlete?.headshot?.href || null,
          jersey: cat.leaders[0].athlete?.jersey,
          position: cat.leaders[0].athlete?.position?.abbreviation,
          value: cat.leaders[0].displayValue,
        },
      })).filter((c: any) => c.leader),
    }));

    return NextResponse.json({ eventId, league, teams, leaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
