GameTracker Center Header v209

This pass builds on v208 and aligns the middle GameTracker lane so the logos,
scores, and Final/time/inning label share the same vertical centerline.

Changes:
- Keeps the top date/record row from v208.
- Defines matching top/middle/bottom row heights for the team blocks and center rail.
- Centers Final/time/inning inside the same middle visual lane as the logos and scores.
- Keeps the larger logos and inward score/record columns from v208.

Apply with:
cd ~/Downloads
rm -rf gametracker-center-v209
mkdir gametracker-center-v209
unzip -o gametracker-center-v209-flat.zip -d gametracker-center-v209
rsync -av gametracker-center-v209/ sports-tracker/
cd ~/Downloads/sports-tracker
npm run dev
