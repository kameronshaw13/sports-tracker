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
    const comp = data?.header?.competitions?.[0];
    const competitors = comp?.competitors || [];

    const extractTotal = (c: any, names: string[], fallback: string | number = "0") => {
      for (const name of names) {
        const direct = c?.[name] ?? c?.score?.[name];
        if (direct != null && direct !== "") return direct;
      }
      const stats = [c?.statistics, c?.stats, c?.team?.statistics, c?.team?.stats].flat().filter(Boolean);
      const found = Array.isArray(stats) ? stats.find((x: any) => names.includes(String(x?.name || x?.abbreviation || x?.displayName || x?.shortDisplayName || "").toLowerCase())) : null;
      if (found?.displayValue != null) return found.displayValue;
      if (found?.value != null) return found.value;
      // ESPN sometimes stores baseball totals as H/E on the competitor lineScore object.
      const lineTotals = c?.linescore || c?.lineScore || c?.lineScores;
      if (lineTotals) {
        for (const name of names) {
          const val = lineTotals?.[name] ?? lineTotals?.[name.toUpperCase()];
          if (val != null && val !== "") return val;
        }
      }
      return fallback;
    };

    const lineScore = league === "mlb" ? {
      innings: Math.max(0, ...competitors.map((c: any) => Array.isArray(c?.linescores) ? c.linescores.length : 0)),
      teams: competitors.map((c: any) => ({
        id: c.id,
        homeAway: c.homeAway,
        abbr: c.team?.abbreviation,
        logo: c.team?.logos?.[0]?.href || c.team?.logo,
        runs: c.score ?? "0",
        hits: extractTotal(c, ["hits", "h"], "0"),
        errors: extractTotal(c, ["errors", "error", "e"], "0"),
        innings: (c.linescores || []).map((x: any) => x.displayValue ?? x.value ?? "0"),
      })),
    } : null;

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
          id: cat.leaders[0].athlete?.id,
          name: cat.leaders[0].athlete?.displayName,
          headshot: cat.leaders[0].athlete?.headshot?.href || null,
          jersey: cat.leaders[0].athlete?.jersey,
          position: cat.leaders[0].athlete?.position?.abbreviation,
          value: cat.leaders[0].displayValue,
        },
      })).filter((c: any) => c.leader),
    }));

    return NextResponse.json({ eventId, league, teams, leaders, lineScore });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
