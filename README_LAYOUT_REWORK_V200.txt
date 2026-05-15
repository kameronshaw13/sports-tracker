Layout rework v200

This is a holistic visual/layout cleanup layer, not another one-off nudge patch.

What changed:
- GameTracker hero now uses a true 3-column grid with the middle column owning date/status/odds/series labels.
- Status labels such as Final, Final/OT, Final/12, live inning text, and pregame times are now centered dynamically instead of being positioned with left: calc(50% + ...).
- Team logo + score blocks use grid alignment so away/home sides mirror each other more consistently.
- Score cards reserve stable columns for winner marker, logo, team info, and score/odds so the row does not shift when content changes.
- League headers and sticky top areas use consistent page padding and centered alignment.
- Standings/boxscore table cells get a basic fixed-layout centering pass.
- Bottom navigation gets safer bottom spacing so content is less likely to tuck underneath it.

Files changed:
- app/globals.css

Notes:
This intentionally preserves the current retro/brown visual direction. It mainly replaces fragile positioning with dynamic centering rules at the end of the CSS file so it overrides the older accumulated v177-v182 nudges.
