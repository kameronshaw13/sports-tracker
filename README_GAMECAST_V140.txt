V140 GameTracker / Boxscore cleanup patch

Built from the stable v136/v139 path without reintroducing the broken v137 boxscore.

Files changed:
- app/globals.css
- components/Gamecast.tsx
- components/GameDetail.tsx
- components/Boxscore.tsx

Fixes:
- Removed visible Line score and Boxscore section headers.
- Restored Hitters/Pitchers group labels for MLB box score sections.
- Outputs every player; removed the Show all player button.
- Restored NYY / Team / BAL style 3-part pill selector.
- Cleaned stat dividers to one thin straight grey line.
- Fixed line score spacing so logo/abbreviation do not overlap inning values.
- Changed H-AB display label to H/AB.
- Nudged top header date left so it sits centered over the status/final text.
