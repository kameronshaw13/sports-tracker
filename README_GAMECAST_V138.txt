GameTracker / Box Score v138 patch

Base used: stable v136 GameTracker + restored pre-v137 Boxscore.

Changes:
- Live pitcher baseball marker no longer clips at the top.
- Baseball marker is CSS drawn with side-facing stitch arcs.
- Live current at-bat pitch strip shows newest pitch on the left, older pitches to the right.
- Live current at-bat pitch strip scrolls horizontally without widening the page.
- Game detail top bar, score header, and GameTracker/Box Score tabs are sticky while scrolling.
- Record/date text in the main score header moved up slightly.
- Box Score keeps the current layout but removes the rounded boxed feel from player stat groups.
- Box Score rows are more compact and full-width with straight divider lines.
- MLB line score inning headers are moved down slightly.
- MLB line score team logo is moved up slightly and abbreviation down slightly.

Important:
- Do not apply this patch with rsync --delete.
- Use rsync -av only, or copy these three files directly.
