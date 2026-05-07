Scores page final polish v21

Included files:
- app/globals.css
- components/LeaguesView.tsx

Changes:
- Adds a little more sticky-header slack by lowering league/Favorites sticky top offset.
- Makes score boxes slightly shorter.
- Keeps Final/Period/Inning text in place but moves the team names/logos/count line upward by tightening the space below the game status.
- Nudges ESPN logos upward a little more for better visual centering with team names.
- Replaces the filter/drop-shadow outline on score logos with a duplicated white logo layer behind the real logo. This should work better on phone/PWA than the previous filter-only outline and should look like a thin white border instead of a glow.
- Keeps the left-stationary Scores header and ESPN logos.
