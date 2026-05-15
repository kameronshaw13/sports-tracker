GameTracker Center Header v210

This pass fixes the middle-line alignment issue from v209.

What changed:
- Defines a single visual middle axis for the GameTracker hero.
- Logo, score, and Final/time/inning all align by their vertical centers, not by tops or bottoms.
- Moves odds, bases/count, and series/game labels into the lower center row so they do not affect the Final/time line.
- Keeps the larger logo sizing and inward score/record columns from v208.

Apply with:
cd ~/Downloads
rm -rf gametracker-center-v210
mkdir gametracker-center-v210
unzip -o gametracker-center-v210-flat.zip -d gametracker-center-v210
rsync -av gametracker-center-v210/ sports-tracker/
cd ~/Downloads/sports-tracker
npm run dev
