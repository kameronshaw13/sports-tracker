GameTracker v128 patch

Built from the v127 clean recovery base.

Changes:
- Moved the scoring-row team logo left of scoring text up just a touch.
- Changed the Scoring / Live / Plays switcher from pill buttons to compact full-width underline tabs.
- Restyled Live and Plays sections to fill the page width instead of feeling like boxed/pill cards.
- Added centered, larger batter/pitcher cards with ESPN headshot fallback URLs.
- Centered Live/Plays text and added safer line-height/padding to avoid clipped text tops.
- Kept the current good GameTracker component base instead of reverting to older v125 code.

Files changed:
- app/globals.css
- components/Gamecast.tsx
