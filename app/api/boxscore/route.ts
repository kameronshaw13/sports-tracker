import { NextRequest, NextResponse } from "next/server";
import { getGameSummary } from "@/lib/espn";

export const revalidate = 30;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

function readStatValue(stat: any): string | number | null {
  const value = stat?.displayValue ?? stat?.value ?? stat?.summary ?? stat?.text;
  if (value == null || value === "") return null;
  return value;
}

function normalizeStatName(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[%]/g, " percent")
    .replace(/[^a-z0-9]+/g, "");
}

function statCandidateNames(stat: any): string[] {
  return [
    stat?.name,
    stat?.displayName,
    stat?.shortDisplayName,
    stat?.abbreviation,
    stat?.label,
    stat?.description,
  ].filter(Boolean).map(normalizeStatName);
}

function indexTeamStats(source: any): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const lists = [
    source?.statistics,
    source?.stats,
    source?.team?.statistics,
    source?.team?.stats,
  ].flat().filter(Boolean);
  if (!Array.isArray(lists)) return out;
  for (const stat of lists) {
    const value = readStatValue(stat);
    if (value == null) continue;
    for (const name of statCandidateNames(stat)) {
      if (name) out[name] = value;
    }
  }
  return out;
}

function indexProbablePitcherStats(competitors: any[]) {
  const byTeam = new Map<string, { athleteId: string | null; stats: Record<string, string> }>();
  for (const competitor of competitors) {
    const probable = (competitor?.probables || []).find((item: any) =>
      /probable.*pitcher|starting.*pitcher|starter/i.test(String(item?.name || item?.displayName || item?.abbreviation || "")),
    );
    if (!probable) continue;
    const indexed: Record<string, string> = {};
    for (const stat of probable?.statistics?.splits?.categories || []) {
      const value = stat?.displayValue ?? stat?.value;
      if (value == null || value === "") continue;
      for (const key of [stat?.abbreviation, stat?.name, stat?.shortDisplayName].filter(Boolean)) {
        indexed[String(key).toUpperCase()] = String(value);
      }
    }
    const teamId = String(competitor?.team?.id || competitor?.id || "");
    if (teamId) {
      byTeam.set(teamId, {
        athleteId: probable?.athlete?.id ? String(probable.athlete.id) : probable?.playerId ? String(probable.playerId) : null,
        stats: indexed,
      });
    }
  }
  return byTeam;
}

function addMlbRateStats(stats: Record<string, string>) {
  const obp = Number(stats.OBP);
  const slg = Number(stats.SLG);
  if (!stats.OPS && Number.isFinite(obp) && Number.isFinite(slg)) {
    stats.OPS = (obp + slg).toFixed(3).replace(/^0/, "");
  }
}

function buildLineScore(league: string, competitors: any[], extractTotal: (c: any, names: string[], fallback?: string | number) => any) {
  const basePeriodCount = league === "nba"
    ? 4
    : league === "cbb"
      ? 2
    : league === "nhl"
      ? 3
      : 9;
  const actualPeriodCount = Math.max(
    0,
    ...competitors.map((c: any) => Array.isArray(c?.linescores) ? c.linescores.length : 0),
  );
  const periodCount = Math.max(basePeriodCount, actualPeriodCount);

  if (!periodCount) return null;

  const columns = Array.from({ length: periodCount }, (_, i) => {
    if (league === "nba" && i >= 4) return i === 4 ? "OT" : `${i - 3}OT`;
    if (league === "cbb" && i >= 2) return i === 2 ? "OT" : `${i - 1}OT`;
    if (league === "nhl" && i >= 3) return i === 3 ? "OT" : `${i - 2}OT`;
    return String(i + 1);
  });

  return {
    league,
    columns,
    totalLabel: league === "mlb" ? "R" : "T",
    showHitsErrors: league === "mlb",
    teams: competitors.map((c: any) => ({
      id: c.id,
      homeAway: c.homeAway,
      abbr: c.team?.abbreviation,
      logo: c.team?.logos?.[0]?.href || c.team?.logo,
      total: c.score ?? "0",
      runs: c.score ?? "0",
      hits: extractTotal(c, ["hits", "h"], "0"),
      errors: extractTotal(c, ["errors", "error", "e"], "0"),
      innings: Array.from({ length: periodCount }, (_, i) => {
        const score = c.linescores?.[i]?.displayValue ?? c.linescores?.[i]?.value;
        return score == null || score === "" ? "–" : score;
      }),
    })),
  };
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
    const data = await getGameSummary(league, eventId);
    const comp = data?.header?.competitions?.[0];
    const competitors = comp?.competitors || [];

    const isPregame = comp?.status?.type?.state === "pre" || comp?.status?.state === "pre";
    const probablePitchers = league === "mlb" ? indexProbablePitcherStats(competitors) : new Map();
    const currentBatterId = data?.situation?.batter?.id ? String(data.situation.batter.id) : null;

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

    const lineScore = ["mlb", "nba", "cbb", "nhl"].includes(league)
      ? buildLineScore(league, competitors, extractTotal)
      : null;

    const teamStatSources = [
      ...(Array.isArray(data?.boxscore?.teams) ? data.boxscore.teams : []),
      ...(Array.isArray(data?.boxscore?.teamStats) ? data.boxscore.teamStats : []),
      ...competitors,
    ];
    const teamStatsById = new Map<string, Record<string, string | number>>();
    for (const source of teamStatSources) {
      const ids = [
        source?.id,
        source?.team?.id,
        source?.teamId,
        source?.team?.uid,
        source?.uid,
      ].filter(Boolean).map(String);
      const indexed = indexTeamStats(source);
      if (!ids.length || !Object.keys(indexed).length) continue;
      for (const id of ids) teamStatsById.set(id, indexed);
    }

    const teams = (data?.boxscore?.players || []).map((teamBox: any) => {
      const teamInfo = teamBox.team;
      const groups = (teamBox.statistics || []).map((stat: any) => {
        let labels: string[] = [...(stat.labels || [])];
        const descriptions: string[] = stat.descriptions || [];
        const isMlbPitching = league === "mlb" && labels.includes("IP");
        const isMlbHitting = league === "mlb" && !isMlbPitching && (labels.includes("AB") || labels.includes("H-AB"));
        const probable = probablePitchers.get(String(teamInfo?.id || ""));
        const athletes = (stat.athletes || []).map((a: any) => {
          const stats: Record<string, string> = {};
          (a.stats || []).forEach((val: string, i: number) => {
            const key = labels[i] || `stat${i}`;
            stats[key] = val;
          });
          if (isMlbHitting) addMlbRateStats(stats);
          if (isPregame && isMlbPitching && probable && (!probable.athleteId || probable.athleteId === String(a?.athlete?.id || ""))) {
            const wins = probable.stats.W ?? probable.stats.WINS;
            const losses = probable.stats.L ?? probable.stats.LOSSES;
            if (wins != null && losses != null) stats["W-L"] = `${wins}-${losses}`;
            if (probable.stats.ERA != null) stats.ERA = probable.stats.ERA;
            if (probable.stats.WHIP != null) stats.WHIP = probable.stats.WHIP;
            if (probable.stats.K != null || probable.stats.STRIKEOUTS != null) stats.K = probable.stats.K ?? probable.stats.STRIKEOUTS;
          }
          return {
            id: a.athlete?.id,
            name: a.athlete?.displayName,
            shortName: a.athlete?.shortName,
            position: a.position?.abbreviation || a.position?.shortDisplayName || a.athlete?.position?.abbreviation,
            listedPosition: a.athlete?.position?.abbreviation || null,
            jersey: a.athlete?.jersey,
            headshot: a.athlete?.headshot?.href || null,
            starter: a.starter,
            active: a.active,
            subbedIn: a.subbedIn,
            batOrder: a.batOrder,
            notes: a.notes || null,
            stats,
          };
        });
        if (isMlbHitting) {
          for (const key of ["AVG", "OBP", "SLG", "OPS"]) {
            if (!labels.includes(key) && athletes.some((athlete: any) => athlete.stats?.[key] != null)) labels.push(key);
          }
        }
        if (isPregame && isMlbPitching && athletes.some((athlete: any) => athlete.stats?.["W-L"] || athlete.stats?.WHIP)) {
          labels = ["W-L", "ERA", "WHIP", "K"];
        }
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
        teamStats: teamStatsById.get(String(teamInfo?.id || "")) || {},
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

    return NextResponse.json({ eventId, league, teams, leaders, lineScore, currentBatterId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
