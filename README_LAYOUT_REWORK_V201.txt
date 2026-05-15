Layout Rework v201

This is a broader visual-alignment/design-system pass on top of the v200 GameTracker work.

Main intent:
- Keep the current Sportive look and color direction.
- Replace fragile pixel nudges with reusable grid/flex alignment rules.
- Make centering dynamic when text changes length, like Final vs Final/OT vs Final/12.
- Align logos, team names, records, status text, scores, standings columns, schedules, boxscore tables, home cards, More rows, Gamecast rows, and bottom nav using consistent layout cells.

Changed file:
- app/globals.css

Notes:
- This is intentionally CSS-first so it does not rewrite the app's data/API logic.
- It should be tested on both local desktop and phone width because this pass targets responsive alignment.
- If one specific component still looks off, the next best step is to convert that component's JSX structure to the same shared grid pattern instead of adding another one-off nudge.
