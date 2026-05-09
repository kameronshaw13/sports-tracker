Patch v25

Changed files:
- components/GameDetail.tsx
- components/Boxscore.tsx

Changes:
- Moved game header record text slightly upward.
- Moved game header date/status text slightly upward.
- Added team logo beside MLB linescore abbreviation.
- Moved linescore logo down slightly and abbreviation down a touch more.
- Made the linescore inning/R/H/E header heavier.

Local test:
cd ~/Downloads
rm -rf scores-page-final-v25
mkdir scores-page-final-v25
unzip scores-page-final-v25-flat.zip -d scores-page-final-v25
rsync -av scores-page-final-v25/ sports-tracker/
cd sports-tracker
npm run dev
