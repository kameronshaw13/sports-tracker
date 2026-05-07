Scores page final polish v22

Included files:
- app/globals.css
- components/LeaguesView.tsx

Changes:
- Replaces the duplicate-logo white outline layer with a cleaner thin drop-shadow outline on the actual ESPN logo.
- Keeps the logo outline subtle and more uniform.
- Restores the MLB base diamond/count visual inside favorite score cards when the favorite game is live.

Validated by copying these files into the full project and running:
- npx tsc --noEmit --pretty false
