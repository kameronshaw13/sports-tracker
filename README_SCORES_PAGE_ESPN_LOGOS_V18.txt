Scores page ESPN logo rollback v18

Included files:
- app/globals.css
- components/LeaguesView.tsx
- components/RetroTeamLogo.tsx

Changes:
- Scores page team logos now use ESPN logo URLs again instead of /retro_images.
- The shared RetroTeamLogo component now uses ESPN/fallback URLs too, so places that were switched to retro logos go back to normal team logos.
- Score logos use a fixed visual box and object-contain so they stay centered beside team names.
- Adds a tiny subtle white outline around logos.
- Keeps the Scores header stationary on the left instead of moving to center on scroll.

Validated with: npx tsc --noEmit --pretty false
