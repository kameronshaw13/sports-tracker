"use client";

// (no React imports needed — pure presentational component)

type Props = {
  league: string;
  eventId: string;
  isLive: boolean;
  // For NFL we can show a basic field-position indicator using the situation
  // block that's already in summary data — passed in from GameDetail rather
  // than refetched here.
  situation?: any;
};

// v19: Gamecast is the tab that will host live visualizations in v20:
//   - MLB: strike zone (pitch coords from MLB official statsapi)
//   - NHL: rink shot map (x/y coords from NHL official api-web.nhle.com)
//   - NFL: field position visualizer (already-available ESPN play-by-play data)
//   - NBA: nothing (NBA shot data is paywalled — scoped out)
//
// For now we show a per-sport placeholder so the tab structure is in place
// and the user knows what's coming. The placeholders are deliberately low-key
// — no fake mockups or pretend data, just a clear "coming in the next update"
// message with a hint of what each sport will look like.
//
// Live games also get a "view the live ESPN gamecast" hint since that's the
// closest substitute today.
export default function Gamecast({ league, eventId, isLive, situation }: Props) {
  return (
    <div className="space-y-3">
      <PlaceholderCard league={league} isLive={isLive} />
      {league === "nfl" && situation && <FieldPositionMini situation={situation} />}
    </div>
  );
}

function PlaceholderCard({ league, isLive }: { league: string; isLive: boolean }) {
  const config = configFor(league);

  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-3 flex justify-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="text-2xl">{config.icon}</span>
        </div>
      </div>
      <h3 className="text-base font-bold mb-1">{config.title}</h3>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>
        {config.description}
      </p>
      <p className="text-xs mt-3" style={{ color: "var(--text-3)" }}>
        {isLive
          ? "Live visualizations are coming in the next update."
          : "Visualizations are coming in the next update."}
      </p>
    </div>
  );
}

function configFor(league: string): { icon: string; title: string; description: string } {
  switch (league) {
    case "mlb":
      return {
        icon: "⚾",
        title: "Strike Zone — Coming Soon",
        description:
          "Every pitch will be plotted on a strike zone with type, velocity, and outcome. Tap a pitch to see the at-bat.",
      };
    case "nhl":
      return {
        icon: "🏒",
        title: "Shot Map — Coming Soon",
        description:
          "Every shot will be plotted on the rink — colored by team, shaped by outcome (goal, save, missed, blocked).",
      };
    case "nfl":
      return {
        icon: "🏈",
        title: "Field Position — Coming Soon",
        description:
          "Drives will be visualized on the field with start/end yardlines, plus current down and distance.",
      };
    case "nba":
      return {
        icon: "🏀",
        title: "No Visualization for Basketball",
        description:
          "NBA shot data isn't available on free public APIs. The Box Score and Play-by-Play tabs have everything we can pull.",
      };
    default:
      return {
        icon: "📊",
        title: "Visualization Coming Soon",
        description: "More to come.",
      };
  }
}

// Minimal NFL field-position display. We have the data right now (down,
// distance, yardLine) so we render a tiny SVG football field with a marker
// where the line of scrimmage is. Not the full v20 drive viz — just a
// preview so the Gamecast tab isn't entirely empty for live NFL games.
function FieldPositionMini({ situation }: { situation: any }) {
  const yardLine = typeof situation?.yardLine === "number" ? situation.yardLine : null;
  const downText =
    situation?.shortDownDistanceText ||
    (typeof situation?.down === "number" && typeof situation?.distance === "number"
      ? `${ordinal(situation.down)} & ${situation.distance}`
      : null);
  const possText = situation?.possessionText || null;

  if (yardLine == null && !downText) return null;

  // ESPN's yardLine ranges 0-100; 50 = midfield, <50 is on possession's side.
  // We render a simple horizontal field 0-100 with a vertical marker line.
  const x = yardLine != null ? Math.max(2, Math.min(98, yardLine)) : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-2)" }}
        >
          Field position
        </span>
        {downText && (
          <span className="text-sm font-bold tabular-nums">{downText}</span>
        )}
      </div>

      <svg viewBox="0 0 100 18" className="w-full h-12" preserveAspectRatio="none">
        {/* Field background */}
        <rect x="0" y="0" width="100" height="18" fill="var(--surface-2)" />
        {/* End zones */}
        <rect x="0" y="0" width="3" height="18" fill="rgba(0,0,0,0.15)" />
        <rect x="97" y="0" width="3" height="18" fill="rgba(0,0,0,0.15)" />
        {/* Yard markers every 10 */}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <line
            key={yd}
            x1={yd}
            x2={yd}
            y1="2"
            y2="16"
            stroke="var(--border)"
            strokeWidth="0.3"
          />
        ))}
        {/* 50 yard line emphasized */}
        <line x1="50" x2="50" y1="0" y2="18" stroke="var(--text-3)" strokeWidth="0.4" />
        {/* Ball marker */}
        {x != null && (
          <g>
            <line x1={x} x2={x} y1="0" y2="18" stroke="var(--danger)" strokeWidth="0.6" />
            <circle cx={x} cy="9" r="1.5" fill="var(--danger)" />
          </g>
        )}
      </svg>

      {possText && (
        <div className="mt-2 text-xs text-center" style={{ color: "var(--text-2)" }}>
          {possText}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
