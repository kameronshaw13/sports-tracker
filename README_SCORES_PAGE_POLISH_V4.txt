Scores page polish v4

Flat zip structure: app/ and components/ are directly inside this folder so rsync copies into the project root correctly.

Changed files:
- app/page.tsx
- app/globals.css
- components/LeaguesView.tsx
- components/AppSettingsButton.tsx
- components/TopNav.tsx

Changes:
- Fixes selected date disappearing while keeping the underline style.
- Applies the same lighter/thinner meta font/color to MLB count + outs as records and pitcher matchups.
- Adds a little more safe top space above the large Scores header.
- Smooths the Scores title transition by keeping it absolutely positioned and animating left/transform/font-size.
- Makes Favorites header sticky like league headers.
- Adds a bit more vertical padding to league/Favorites headers so the text does not clip.
- Increases the favorite-card logo size again and shifts team names slightly left while preserving spacing.
- Score page logos now prefer /public/retro_images/*.png and fall back to ESPN logos if the retro file is missing.

Retro logo matching:
For a team, the app tries these filenames in /public/retro_images/:
- nickname slug, e.g. blue-jays.png
- short/name/displayName slug, e.g. toronto-blue-jays.png
- abbreviation slug, e.g. tor.png
Then it falls back to the ESPN logo.
