import { NextRequest, NextResponse } from "next/server";
import { getTeamPage, getTeamSchedule } from "@/lib/espn";
import { parseTeamKey } from "@/lib/teams";

export const revalidate = 60;

function extractStats(team: any): { name: string; displayName: string; value: number; displayValue: string }[] {
  const out: any[] = [];
  const seen = new Set<string>();

  const push = (s: any) => {
    if (!s) return;
    const name = s.name || s.shortDisplayName;
    if (!name || seen.has(name)) return;
    const displayName = s.displayName || s.shortDisplayName || s.name;
    if (!displayName) return;
    seen.add(name);
    out.push({
      name,
      displayName,
      value: s.value ?? 0,
      displayValue: s.displayValue ?? String(s.value ?? "0"),
    });
  };

  if (Array.isArray(team?.statistics)) team.statistics.forEach(push);
  if (Array.isArray(team?.stats)) team.stats.forEach(push);

  const recordItems = team?.record?.items;
  if (Array.isArray(recordItems)) {
    recordItems.forEach((item: any) => {
      if (Array.isArray(item?.stats)) item.stats.forEach(push);
    });
  }

  const cats = team?.statistics?.splits?.categories;
  if (Array.isArray(cats)) {
    cats.forEach((cat: any) => {
      if (Array.isArray(cat?.stats)) cat.stats.forEach(push);
    });
  }

  return out;
}

function bestRecord(team: any): string | null {
  return (
    team?.record?.items?.[0]?.summary ||
    team?.recordSummary ||
    team?.standingSummary?.match(/\b\d+-\d+(?:-\d+)?\b/)?.[0] ||
    null
  );
}

function recordFromSchedule(events: any[], abbr: string): string | null {
  let wins = 0;
  let losses = 0;
  for (const ev of events || []) {
    const comp = ev?.competitions?.[0];
    const status = ev?.status || comp?.status;
    if (status?.type?.state !== "post") continue;
    const us = comp?.competitors?.find((c: any) => String(c?.team?.abbreviation || "").toLowerCase() === abbr.toLowerCase());
    const them = comp?.competitors?.find((c: any) => String(c?.team?.abbreviation || "").toLowerCase() !== abbr.toLowerCase());
    if (!us || !them) continue;
    const ourScore = Number(us?.score?.value ?? us?.score);
    const theirScore = Number(them?.score?.value ?? them?.score);
    if (!Number.isFinite(ourScore) || !Number.isFinite(theirScore) || ourScore === theirScore) continue;
    if (ourScore > theirScore) wins += 1;
    else losses += 1;
  }
  return wins + losses > 0 ? `${wins}-${losses}` : null;
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
    const data = await getTeamPage(parsed.league, parsed.abbr, ["stats"]);
    const t = data?.team;
    const stats = extractStats(t);
    let record = bestRecord(t);
    if (!record && (parsed.league === "cfb" || parsed.league === "cbb")) {
      try {
        const schedule = await getTeamSchedule(parsed.league, parsed.abbr);
        record = recordFromSchedule(schedule?.events || [], parsed.abbr);
      } catch {}
    }

    return NextResponse.json({
      id: t?.id,
      name: t?.displayName,
      abbreviation: t?.abbreviation,
      logo: t?.logos?.[0]?.href,
      colors: { primary: t?.color, alternate: t?.alternateColor },
      record,
      standingSummary: t?.standingSummary || null,
      stats,
      nextEvent: t?.nextEvent?.[0]
        ? {
            id: t.nextEvent[0].id,
            date: t.nextEvent[0].date,
            name: t.nextEvent[0].name,
            shortName: t.nextEvent[0].shortName,
            status: t.nextEvent[0].status?.type?.description,
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Fetch failed" }, { status: 500 });
  }
}
