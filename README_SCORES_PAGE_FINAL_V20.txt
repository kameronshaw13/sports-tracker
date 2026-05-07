Scores page final v20

Included files:
- app/globals.css
- components/LeaguesView.tsx
- components/RetroTeamLogo.tsx

Changes:
- Better vertical centering for ESPN logos beside team names.
- Adds a subtle white outline that applies even on mobile/light theme.
- Adds top breathing room to game info / pitcher info text so it is not clipped.
- Makes score-card boxes a little shorter.
- Keeps ESPN logos and the stationary left Scores header from v18/v19.

Validated by copying into the project and running:
- npx tsc --noEmit --pretty false
