Update: In-play pitch sequence fix

Files changed:
- app/api/plays/route.ts

What this does:
- Keeps Ball In Play as the final pitch in the pending at-bat.
- Does not close/output the at-bat until the actual result play arrives.
- Prevents leftover Ball In Play-only rows from showing as fake current/last at-bats.
- Helps preserve pitch sequences for balls in play at the end of half innings.
