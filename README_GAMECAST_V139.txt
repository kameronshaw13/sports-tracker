# v139 GameTracker / Box Score consistency patch

This patch keeps the v138 GameTracker/Live pitch updates, but restores the newer flat Box Score component/classes so older rounded boxed styles do not poke through.

Files changed:
- app/globals.css
- components/Gamecast.tsx
- components/Boxscore.tsx

Important: apply with rsync -av only. Do not use rsync --delete with patch folders.
