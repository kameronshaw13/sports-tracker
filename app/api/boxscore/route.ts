import { NextRequest, NextResponse } from "next/server";
import { getGameSummary, getMlbFortyManRoster } from "@/lib/espn";

export const revalidate = 30;

const VALID_LEAGUES = ["mlb", "nfl", "nba", "nhl", "cfb", "cbb"];

// MLB statsapi uses different person IDs than ESPN's athlete IDs. To make
// player taps land on the correct profile, we build a name→MLB id lookup
// from the two teams' 40-man rosters and override `id` for MLB athletes.
// (ESPN-only sports — NFL/NBA/NHL/CFB/CBB — keep using ESPN athlete IDs.)
function nameKey(name: string | null | undefined): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildMlbIdLookup(competitors: any[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const abbrs: string[] = competitors
    .map((c) => c?.team?.abbreviation)
    .filter(Boolean)
    .map((a) => String(a).toLowerCase());
  await Promise.all(
    abbrs.map(async (abbr) => {
      try {
        const roster = await getMlbFortyManRoster(abbr);
        for (const p of roster || []) {
          if (!p?.mlbId || !p?.name) continue;
          const full = nameKey(p.name);
          if (full) map.set(full, p.mlbId);
          const parts = full.split(" ").filter(Boolean);
          if (parts.length >= 2) {
            // ESPN sometimes returns short names like "C. Mullins" — index
            // first-initial-plus-last and just-last so those resolve too.
            map.set(`${parts[0]} ${parts[parts.length - 1]}`, p.mlbId);
            map.set(`${parts[0][0]} ${parts[parts.length - 1]}`, p.mlbId);
            map.set(parts[parts.length - 1], p.mlbId);
          }
        }
      } catch {
        // Roster enrichment is best-effort. If MLB statsapi is unreachable
        // the box score still renders; player taps just won't resolve.
      }
    })
  );
  return map;
}

function resolveMlbId(name: string | null | undefined, lookup: Map<string, number>): number | null {
  if (!name) return null;
  const full = nameKey(name);
  if (!full) return null;
  const direct = lookup.get(full);
  if (direct) return direct;
  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const fl = lookup.get(`${parts[0]} ${parts[parts.length - 1]}`);
    if (fl) return fl;
    const lastOnly = lookup.get(parts[parts.length - 1]);
    if (lastOnly) return lastOnly;
  }
  return null;
}

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

function buildLineScore(league: string, competitors: any[], extractTotal: (c: any, names: string[], fallback?: string | number) => any) {
  const periodCount = league === "nba" || league === "cbb"
    ? 4
    : league === "nhl"
      ? 3
      : Math.max(9, ...competitors.map((c: any) => Array.isArray(c?.linescores) ? c.linescores.length : 0));

  if (!periodCount) return null;

  return {
    league,
    columns: Array.from({ length: periodCount }, (_, i) => String(i + 1)),
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

    // Build the MLB ID lookup BEFORE constructing leaders/teams so the id
    // overrides apply uniformly.
    const mlbIdLookup = league === "mlb" ? await buildMlbIdLookup(competitors) : null;
    const idForAthlete = (athlete: any): string | null => {
      if (league === "mlb" && mlbIdLookup) {
        const mlbId = resolveMlbId(athlete?.displayName || athlete?.fullName || athlete?.shortName, mlbIdLookup);
        if (mlbId) return String(mlbId);
      }
      return athlete?.id ? String(athlete.id) : null;
    };

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

    return NextResponse.json({ eventId, league, teams, leaders, lineScore });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
