# Camping Checklist — CC-1a / CC-1b

Outdoor Learn app. Entry: `index.html` → `camping-checklist.html`; standalone or Hub window.
No network content, accounts, analytics, external fonts or runtime dependencies.

## Data and persistence

- 69 distinct gear items, 10 categories, 7 templates. Unit weights are estimates in grams.
- Packed weight is `unit grams × quantity` for checked rows. A tick covers the full quantity.
- All gear, including worn clothing, water and food, is counted; this is not a base-pack-weight calculator.
- `learn.camping-checklist.v1` stores template ticks, custom gear, My lists, planner settings and departure ticks.
- `learn.camping-checklist.theme`: absent = Auto (System), following the Hub through the existing read-only HubTheme helper.
- Up to 30 My lists and 300 rows per list. Duplicate to edit built-in gear. Template custom rows remain editable.
- JSON export/import preserves quantities, packed ticks, trip settings and custom notes. Imports add a fresh list ID, never overwrite.
- JSON is schema-checked, restricted to known fields and limited to 1 MB. Names/notes are rendered as text, not HTML.
- Copy/text export is for users to share themselves; the app does not send anything.

## Planner and safety boundaries

1–30 days and 1–20 people. Personal gear scales by people, food by person-days,
tents/footprints by pairs, and some cooking/navigation gear is shared. Fuel is a
clearly labelled placeholder: actual consumption depends on the stove and conditions.

Food: 800 g per person-day is only an editable placeholder, not a guaranteed calorie
amount. Trekking guidance is approximately 2,500–3,500 kcal/person/day; check labels,
effort, health and conditions. No-cook trips omit the stove kit.

Water: 3 L/person/day, 4 L for hot weather, plus a treatment method. The full-trip
volume appears in totals for planning. It is explicitly **not** a carry-all target;
users must adjust for verified safe refills, reserve and cooking water. No claim that
these quantities suit every person or climate. Empty bottle weight is separate.

India notes cover monsoon floods/leeches/mosquitoes, hot plains, Himalayan altitude,
non-technical snow limitations, permits, cash/UPI outages and emergency 112.
The seven Leave No Trace principles are paraphrased with a link to the original.
References in the app link to Leave No Trace, NPS health/hiking advice and India ERSS.
Gear is not a replacement for training, local forecasts, medical or expert advice.

## Offline, print and tests

`offline.js` caches only this app's shell and its existing theme/header dependencies.
It is scoped to this directory and does not modify or unregister the Hub worker.
Offline use needs a successful first visit over HTTPS or localhost; references and
navigation to other apps need those apps already cached or a connection. Private
browsing/storage clearing can remove lists. Download JSON backups of important lists.

Print list opens the browser print dialog: A4, monochrome, two-column gear with
unbroken item rows, optional tips, departure checks and LNT summary. Save as PDF there.

Run:

```
node --test apps/learn/camping-checklist/tests/model.test.cjs
python3 -m http.server 8839 --bind 127.0.0.1
NODE_PATH=/workspace/arw-test-deps/node_modules node apps/learn/camping-checklist/tests/browser.cjs
```

The browser script needs `puppeteer-core`, `/usr/bin/google-chrome`, and the artifact
directory `/workspace/cc-evidence`. It covers CRUD, persistence, theme, offline reload,
planner, import/export, print PDFs, 390×844 / 844×390 / desktop and 44 px buttons.
Node tests include 600 planner combinations. No shared files, Hub worker or build
version are changed. Device/manual trail validation is still recommended.
