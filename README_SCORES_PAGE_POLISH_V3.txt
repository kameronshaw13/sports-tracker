Scores page polish v3

Changed files:
- app/globals.css
- components/LeaguesView.tsx
- components/AppSettingsButton.tsx
- components/TopNav.tsx

Changes:
- Bottom nav labels are smaller with safer line-height so Scores/Standings do not clip or overflow.
- Game status text like time/final/inning/period is smaller on score cards.
- Adds a little more top breathing room above the Scores header while keeping the same background color.
- Simplifies the date scroller: smaller text, no boxed buttons, active date uses a simple underline.
- Favorite-card logo is larger and favorite team names are uppercase.
- League headers use an adjusted sticky offset so they sit flush against the main sticky Scores/date header instead of leaving an awkward gap.
- Settings menu has no Close label; gear toggles, outside click/Escape close it.

Type check:
- npx tsc --noEmit passed.
