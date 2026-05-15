GameTracker center v205

This refactors only the center of the GameTracker header into real vertical rows:
- top row: date, aligned with team records
- middle row: time/final/live inning and live situation
- bottom row: Game/series label

The row gap is shared, so the Game/series label is as far from the middle status as the middle status is from the date. This avoids fixed left/right nudges and avoids separate vertical top nudges for different label lengths.
