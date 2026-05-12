GameTracker scoring tab follow-up patch (v125)

Files changed:
- app/globals.css
- components/Gamecast.tsx
- components/GameDetail.tsx

What changed:
- Moved Scoring / Live / Plays pill text down a fraction.
- Moved scoring section logo/text up a fraction.
- Reduced scoring team score emphasis to color only, without changing score size.
- Moved GameTracker / Box Score tab text down a fraction while preserving enough height to avoid clipping.
- Added a darker brown background to the top GameTracker score/header hero for more pop.
- Switched scoring section logos to the SVG outline logo component used elsewhere for stronger white outline behavior.

Validation:
- npx tsc --noEmit passed.
- npm run build could not complete in this sandbox because Next tried to download @next/swc-linux-x64-gnu from npm and internet access is blocked here.
