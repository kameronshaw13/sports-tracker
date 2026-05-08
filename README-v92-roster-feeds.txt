V92 changes
- Restyled Roster tab into a flat ESPN-style roster table with # / Player / Position columns and a View Depth Chart button.
- Restyled Injuries tab into date-sectioned feed rows with larger headshots, name + position, and injury detail text.
- Added a Transactions tab feed using a new /api/transactions route.
- Transactions use MLB StatsAPI for MLB teams and best-effort ESPN transaction feeds for NFL/NBA/NHL/college.
- Kept colors/surfaces tied to the app's retro theme variables.

Validation
- `npx tsc --noEmit` passed.
- `npm run build` could not complete in this sandbox because Next tried to download the SWC package from npm and the sandbox has no DNS/network access. Run the build locally with the terminal commands below.
