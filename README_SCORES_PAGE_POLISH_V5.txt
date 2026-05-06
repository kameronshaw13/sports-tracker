Scores page polish v5

Files changed:
- app/globals.css
- components/LeaguesView.tsx

Changes:
- Gives sticky Favorites/league headers a bit more vertical breathing room so text does not clip.
- Centers score-card logos vertically beside team names.
- Enlarges favorite-card logo again.
- Moves favorite-card team names/time/pitcher text slightly left and keeps their left edge aligned.
- Smooths the large-left Scores title transition into the smaller centered title.
- Adds a small logo crop/scale treatment to help hide edge TM marks when they sit outside the main logo.

Logo note:
- The app can crop/scale edge TM marks a bit, but it cannot perfectly remove TM marks that are inside the main logo artwork.
- White square backgrounds mean the PNG itself is not transparent. Those need replacement transparent PNGs or image cleanup.
