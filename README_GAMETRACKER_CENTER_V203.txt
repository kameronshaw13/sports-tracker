GameTracker Center Header v203

This patch focuses only on the center rail of the GameTracker header: date, status/time/final/inning, odds, baseball diamond/out count, and series/game labels.

What changed:
- Replaces fixed left/transform nudges with a true center-anchored grid stack.
- Keeps Final, Final/OT, Final/12, Top 1st, Bot 2nd, pregame times, and longer/shorter dates centered from the same axis.
- Removes old positional overrides only inside .game-score-hero .game-score-center, so it should not affect regular score cards, standings, More, Home, or box score rows.
- Keeps the current visual style; this is a structural alignment fix, not a redesign.

Files changed:
- app/globals.css
