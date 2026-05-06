Scores page polish v11

Files changed:
- app/globals.css
- components/LeaguesView.tsx
- components/RetroTeamLogo.tsx
- components/TeamHeader.tsx
- components/TeamSelector.tsx
- components/HomeDashboard.tsx

Changes:
- Makes score-card logo containers consistent so different source images occupy the same visual space.
- Keeps retro logo fallback behavior: tries /retro_images first, then ESPN/API logo.
- Adds RetroTeamLogo reuse to Home live scores, team selector, and team header so the retro logos appear in more places.
- Adds more sticky-header slack so league/Favorites header text is less likely to clip while scrolling.
- Preserves the v10 favorite card layout with both team logos.

Tested with: npx tsc --noEmit --pretty false
