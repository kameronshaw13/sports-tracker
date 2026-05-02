# sports-tracker-gamecast-pbp-v14-files

Fixes the MLB pitch sequence parser for batted-ball at-bats.

## What changed

- Treats ESPN rows like `Pitch 5 : Ball In Play` as pitch rows even when ESPN also sets the row type to `Ground Out`, `Fly Out`, `Single`, `Double`, `Home Run`, etc.
- Keeps the v13 ESPN at-bat stem grouping that fixed cross-at-bat pitch bleeding.
- Displays the batted-ball pitch as `In-play ball` and styles it blue in both Gamecast and Play-by-Play.

## Files changed

- `app/api/plays/route.ts`
- `components/Gamecast.tsx`
- `components/PlayByPlay.tsx`
