sports-tracker-gamecast-pbp-v12-files

Fix focus:
- Strikeouts/walks already had good pitch sequences.
- Batted-ball results were rendering, but their pitch arrays were empty.
- This patch keeps the working pending-at-bat model and adds a safer handoff:
  when the official result row arrives, it can inherit the best matching pending
  pitch bucket even if ESPN gave the BIP pitch/result row slightly different
  half-inning or sequence metadata.

Files updated:
- app/api/plays/route.ts
- components/Gamecast.tsx
- components/PlayByPlay.tsx

Debug note:
- The debug 404 you saw was from an invalid ESPN event id.
- Use the event id from your app's URL/network request, or open the API route
  for a game that is currently visible in your app:
  /api/plays?league=mlb&event=REAL_EVENT_ID&debug=1
