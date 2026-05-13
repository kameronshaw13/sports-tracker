GameTracker / Box Score v141 patch

Changes:
- Restores the Box Score Team middle selector as a clickable tab and adds the team stats view back.
- Keeps Box Score rows flat/full-width while aligning Hitters/Pitchers with the stat header row.
- Removes H/AB from MLB box score columns by splitting it into AB and H; HT is displayed as H.
- Makes player rows use one consistent scoring-style text color.
- Cleans Live/Plays divider lines to one thin light-gray line and removes the extra brown overlay line.
- Removes the Live tab when MLB games are final, leaving Scoring and Plays.
- Enlarges and slightly shifts the line score logos/team abbreviations.
- Nudges the main header date/status left toward center.

Validation:
- npx tsc --noEmit passed in the extracted app.
