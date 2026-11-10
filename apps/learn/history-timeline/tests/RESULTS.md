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
