Sports Tracker Gamecast PBP v11

Files changed:
- app/api/plays/route.ts
- components/Gamecast.tsx
- components/PlayByPlay.tsx

What changed:
1. Ball In Play is treated as the final pitch, not the at-bat result.
2. Pending at-bats that already have Ball In Play are hidden until ESPN sends the real result row.
3. Removed risky backward attachment of generic pitch-only rows, which was causing pitch sequences to bleed across batters.
4. Removed playEvents/events from pitch extraction because those arrays can contain more than one at-bat in ESPN's feed.
5. Added a debug mode:
   /api/plays?league=mlb&event=EVENT_ID&debug=1

How to debug:
Open the debug URL in the browser, copy the JSON around the bad inning/at-bats, and paste it into ChatGPT.
