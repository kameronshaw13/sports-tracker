Scores tab patch

Changed files:
- app/page.tsx
- app/globals.css
- components/LeaguesView.tsx
- components/AppSettingsButton.tsx

How to apply from Terminal:

cd ~/Downloads
unzip scores-tab-patch.zip
cd scores-tab-patch
./apply_patch.sh

Then:

cd ~/Downloads/sports-tracker
npm run build
git add .
git commit -m "scores tab update"
git push origin main

If your project is not at ~/Downloads/sports-tracker, pass the path:

./apply_patch.sh "/path/to/sports-tracker"
