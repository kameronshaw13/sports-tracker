# Retro visual redesign patch

This patch converts the app to the cleaner retro scoreboard visual direction:
- dark charcoal/black background with cleaner amber/cream/olive palette
- retro page headers
- vintage score cards and bottom nav styling
- Home, Scores, Standings, More, and Game Detail/Gamecast shell styling
- keeps ESPN logos for now
- adds `public/retro_images/` for future retro team logo files

Retro logo naming examples:
- `public/retro_images/baltimore-orioles.png`
- `public/retro_images/new-york-yankees.png`
- `public/retro_images/texas-longhorns.png`

The app does not automatically use these retro images yet, so nothing will 404 while the folder is empty. A helper was added at `lib/retroLogos.ts` for the later switch.
