GameTracker v131 polish

Changes:
- Plays tab now runs oldest-to-newest so the 1st inning is at the top and later innings are lower.
- Plays section headers now use Team - Top/Bottom ordinal inning format.
- Plays header/text alignment was moved down slightly while keeping the team logo position steady.
- Removed the LIVE pill inside Plays at-bat rows.
- Pitcher baseball marker is now a plain baseball without the circle and is positioned to the left of the pitcher text.
- Scoring tab logo nudged down slightly and scoring text made a touch larger.
- Pitch sequence rows in Live and Plays are now horizontal, without the pill/card container look.
- Pitch number icons are solid colored balls with centered white text.
- Pitch description text uses the same metadata-style font/color as the Scoring and Plays text.

Validation:
- npx tsc --noEmit passed.
