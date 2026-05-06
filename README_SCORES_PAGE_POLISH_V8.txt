Scores page polish v8

Changed files:
- app/globals.css
- components/LeaguesView.tsx

Changes:
- Shifts favorite-card time/team names/pitcher text a touch farther right so it has more breathing room from the logo.
- Makes Favorites/league sticky headers thinner vertically while keeping safe line-height/padding to avoid clipping.
- Leaves the score-card logo centering from v7 unchanged.

Validation:
- npx tsc --noEmit passed.
