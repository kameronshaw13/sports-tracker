Scores page polish v6

Flat patch structure: app/ and components/ are directly inside this zip.

Changes:
- Removed the logo crop/scale treatment from v5 so retro logos show normally again.
- Added more vertical slack inside sticky Favorites / league headers so the top text is not clipped.
- Nudged score-card logos slightly upward so they are more centered beside the team wording.
- Changed score numbers on the Scores page to use the simpler Home Live Scores number style.

Apply with:
cd ~/Downloads
rm -rf scores-page-polish-v6
mkdir scores-page-polish-v6
unzip scores-page-polish-v6-flat.zip -d scores-page-polish-v6
rsync -av scores-page-polish-v6/ sports-tracker/
cd sports-tracker
npm run dev
