# Local validation

## HT-1a
- 150 structured records: schema/unique ids/no year zero/end date/lat-lon tests passed.
- Node: 9/9 tests passed (both scales, decades, clamps, search, topic/region intersection, contemporaries, chronology, centuries and date anchors).
- Chrome on 8833: 48 checks passed, no console/page errors.
- 1366×900, 390×844, 844×390 at 2× DPR: no horizontal overflow, crisp canvas, marker selection, title search, lane switching, linear/log full-range-to-decade navigation, wheel/keyboard zoom, phone pinch and three theme choices checked.
- Screenshots manually inspected. Very early linear zoom can intentionally show no events; all records remain available in the paginated list. All-time deep scale is the recommended overview.

## HT-1b
- 350 unique structured records (150 core + 200 expansion); individual dates and caveats reviewed.
- Node: 10/10 tests passed, including combined filters and global related-event windows.
- Chrome on 8833: 72 checks passed, no console/page errors across all three viewports.
- Topic chips, map pin, full contemporaries list, bookmark add/remove/filter and persistence after reload checked, plus all HT-1a navigation/theme/gesture checks.
- Fixed a duplicate internal `rosetta` id before commit (the comet landing is `philae`). Representative location labels were made readable.

## HT-1c / final
- Exactly 350 records; latest card is SpaDeX docking (2025). Axis extends to the device's current year. Recent 2024/2025 additions checked against ISRO; redundant 395/1348 records replaced.
- Node: 15/15 tests passed. Includes 100 generated five-event ordering puzzles, 500 century questions, BCE/CE/century boundaries, duplicate/invalid ordering rejection, tour references/chronological order and decade bounds.
- Explorer Chrome regression: 72 checks passed. Activities Chrome regression: 116 checks passed. No console/page errors in either suite.
- All three viewports at 2× DPR checked again. Desktop pointer drag and portrait-phone touch drag, accessible reorder buttons, correct quiz scores and persisted bests, all four tours, previous/next/pause/end/completion, actual timed auto-advance, direct-manipulation pausing, animated/reduced-motion navigation and phone card-before-results layout passed.
- Hub theme vs OS fallback, corrupt bookmark/view storage, blocked localStorage and direct file:// operation passed. All app resources are local.
- 200 demand-driven draws averaged 0.24 ms on this headless Chrome run (selected recent window; not a real-device FPS claim).
- Final desktop/portrait/landscape screenshots inspected. Label overlaps fixed using interval reservation; phone cards moved before the event list and receive a Timeline return button.
- Syntax checks and git diff whitespace/scope checks passed. Physical phones have not been tested.
- Historical accuracy is a self-audit of the curated cards with selective authoritative anchor checks, not independent external verification of every record. Approximate dates remain labelled; quizzes exclude approximate/traditional entries.
