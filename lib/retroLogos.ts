import { League } from "./teams";

export function teamLogoSlug(team: { name?: string; short?: string; displayName?: string; abbr?: string }) {
  const raw = String(team?.name || team?.displayName || team?.short || team?.abbr || "team")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || "team";
}

export function retroLogoPath(team: { name?: string; short?: string; displayName?: string; abbr?: string }, ext = "png") {
  return `/retro_images/${teamLogoSlug(team)}.${ext}`;
}

export type LogoStyle = "espn" | "retro";

export function pickTeamLogo(
  team: { logo?: string | null; name?: string; short?: string; displayName?: string; abbr?: string },
  fallback: string,
  style: LogoStyle = "espn"
) {
  if (style === "retro") return retroLogoPath(team);
  return team.logo || fallback;
}
