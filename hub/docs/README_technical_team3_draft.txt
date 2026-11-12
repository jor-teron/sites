README_technical_team3_draft.txt

Draft only. These are Team 3's 10-11 Nov 2026 notes, copied as they stood
from hub/docs/README_technical_team2.txt, sections 1.95 to 1.111 (446 lines).
They were written into the Team 2 file by mistake. That file has not been
changed. This draft is not yet in README_technical_team3.txt.

--------------------------------------------------------------------------------

### 1.95 Agent in-app confirm, release AG42

- Agent (`apps/lab/agent/`) no longer uses the browser confirm box for deleting a chat, deleting a
  picture, removing a knowledge document, consenting to send notes to an embedding provider, or
  deleting the semantic index. `app/gui/confirm.js` adds `HR.confirm`, a native dialog opened with
  `showModal()` so it sits on top of Settings and the image viewer. Enter confirms, Esc cancels.
  A dangerous action focuses Cancel and paints OK red. The consent text still says what is sent
  and which provider receives it.
- Deleting a picture used to leave the viewer on a dead image address (the gallery had already
  replaced those addresses). The viewer now rebuilds from the fresh list: next picture, or the
  previous one if the last was deleted, and it closes when none are left.
- Service worker version is `agent-ag42` (legacy line keeps `agent-ag40`). Old confirm lines stay
  in the files as `(before AG42)` comments. `app/api/hub/` was not edited.
- Checked with `node --check` and `node --test apps/lab/agent/tests`. No browser runner and no
  paid API calls.
- 1.53–1.94 are already taken on main, so this note is numbered 1.95.


### 1.96 Office fixes, release HO2

- Draftly and Notely autosave: a failed save (full disk, private mode, IndexedDB or
  localStorage blocked) shows one sticky card, "Couldn't save — storage full" or
  "Couldn't save — storage blocked", until a later save works. `OfficeNotify.saveProblem`
  / `saveOk` in apps/office/shared/office-notify.js. Draftly no longer caches a failed
  IndexedDB open, so a later save can retry.
- Notepad: text is saved on a short timer and flushed on pagehide and when the tab is
  hidden. An empty or blocked read does not wipe text already in the box. The same
  save card is used when storage rejects the write.
- Paper Scan, Print and Notely use `OfficeDialog` instead of `alert` / `confirm` /
  `prompt`. The shared dialog is a `<dialog>` opened with `showModal()` (Enter = OK,
  Esc = Cancel, danger style, textContent only) and gained `OfficeDialog.alert`.
  The same fallback was removed from Draftly, Spreadsheet and office-settings.js.
- Draftly and Base Auto theme follow `sites-hub.theme` inside the Hub and
  `prefers-color-scheme` when standalone, and update on storage, `hub-prefs` and focus
  (`OfficeTheme.watchHub`).
- Draftly's jsPDF, html2canvas and html-docx, and the jsQR copies in Paper Scan and
  Print's sender, load on first use from the same vendor paths. PeerJS, the station
  QR library, OCR's tesseract/pdf.js/jszip, and PDF Tools' pdf.js/pdf-lib stay eager
  (they are needed as soon as the page is up, or the worker wiring is not a safe
  one-line deferral).
- Vendor files were not moved or deleted. Identical copies are listed in
  apps/office/shared/README.md (HO2). No Office app here has a service-worker cache
  version to bump. Old lines are commented with `(before HO2)`.
- Checked with `node apps/office/shared/tests/ho2.test.cjs` and the existing Office
  node tests (spreadsheet SH9–SH12, pdf-tools, base BS5–BS9, expense tracker, invoice).
  No browser runner.
- 1.95 is AG42, so this note is numbered 1.96.


### 1.97 Notely window bar, release NL4

- Notely's Open and Download (the only document buttons on the page) go to the
  Hub window title bar after `hubTitleBarHello`. `NL.hubbar` calls
  `HubTitleBar.set` with those two (text glyphs, short labels, no tabs). Clicks
  come back as `hubTitleBarClick` and call `NL.files.open` / `NL.files.download`.
  The in-page copies hide (`hidden`, and `body.hub-titlebar` in notely.css).
  The word count stays.
- Enabled flags mirror the in-page buttons and follow with `HubTitleBar.update`.
  Both stay enabled: notes autosave, and Download always writes the current text.
  There is no separate Save button to disable when nothing has changed.
- OfficeQuick was not reused. It is Undo / Redo / Save / Print plus ribbon tabs,
  which Notely does not have. `apps/office/shared/` was not edited.
- Standalone, and a frame that never says hello, send nothing and keep the page
  buttons. Keyboard shortcuts are unchanged. Notely has no service-worker cache
  version. Hub build and `hub-shell` CACHE were not bumped. Old lines stay, with
  `(before NL4)` where a comment marks the previous toolbar-only behaviour.
- Checked with `node --check` and `node apps/office/notely/tests/nl4.test.cjs`,
  plus the existing Office node tests (HO2, spreadsheet SH9–SH12, pdf-tools,
  base BS5–BS9, expense tracker, invoice). No browser runner.
- 1.96 is HO2, so this note is numbered 1.97.


### 1.98 Remote saved-connection actions, release RM7

- `apps/connectivity/remote/` only, plus this note. No hub/, shared/, catalog,
  index.html, or build bump.
- Root cause: the ⋯ menu was `position: absolute` at `window.scrollY` plus the
  button's viewport bottom, and it always opened downward. A Hub window clips
  its iframe, and a saved row sits low in that short frame, so Edit, Duplicate
  and Delete were painted below the fold and could not be clicked. Delete had
  a second failure: `confirm()` is blocked in the Hub window and returns false,
  so a click that did land did nothing.
- RM7 pins the menu to the visible window (`position: fixed`, flip upward,
  clamp to the edges) and shows it as a manual popover so it paints above the
  tabs and open dialogs. Right-click and a 500 ms press open the same menu.
  Delete, busy-tab close, and file/folder delete use an in-app dialog. Each
  session bar (SFTP, WebDAV, SSH, VNC) has Edit. The Back link is gone and the
  tabs sit in the header row. Old lines stay, marked `(before RM7)`.
- Checked with `node --check` and `node apps/connectivity/remote/tests/rm7.test.cjs`,
  plus the existing RM1–RM6 node tests. No browser runner.
- 1.97 is NL4, so this note is numbered 1.98.


### 1.99 AG44 Agent MCP

- Agent (`apps/lab/agent/`) gains Settings → MCP Servers. `app/core/mcp.js` is a small Streamable
  HTTP client (JSON-RPC 2.0 via fetch POST): initialize, notifications/initialized, tools/list
  (follows nextCursor) and tools/call. It accepts application/json and text/event-stream, sends
  `Accept: application/json, text/event-stream`, and keeps `Mcp-Session-Id`. Protocol version
  starts at `2025-06-18` and falls back to `2025-03-26` then `2024-11-05`. An optional bearer
  key stays in localStorage on this device.
- Tools join the existing `HR.tools` registry as `<serverslug>__<toolname>` (sanitized, max 64).
  The model sees them like built-in tools while the server is on and connected. Off or unreachable
  servers are skipped quietly; the settings row shows connected, a short error, or off. Each call
  uses the Approve / Deny card unless that server is set to Always allow. Delete uses `HR.confirm`.
- This talks to the Web MCP relay (`POST /mcp/<PIN>`, JSON in, JSON out). No local stdio and no
  helper bridge. Service worker version is `agent-ag44` (legacy line keeps `agent-ag42`). New
  files are on the precache shell list. `app/api/hub/` was not edited. No new libraries.
- Checked with `node --check` and `node apps/lab/agent/tests/ag44.test.cjs` (mocked fetch), plus
  the existing Agent node tests. No browser runner and no paid API.
- 1.98 is RM7, so this note is numbered 1.99.


### 1.100 SH13 Spreadsheet spill and SEQUENCE

- apps/office/spreadsheet only (plus this section). Grid stays 26 columns (A–Z) × 100 rows.
- Dynamic arrays: a formula may return a 2D array. The anchor keeps the top-left value; the rest spills into empty cells (display-only ghosts, not saved). A blocked spill (filled cell, merge, other spill, or past the grid) shows #SPILL! and writes nothing. Ghosts clear when the result shrinks. Other formulas can read a ghost. A1# is the current spill. SEQUENCE and RANDARRAY match Excel's argument order; bad or non-positive sizes are #VALUE!. SUM(SEQUENCE(...)) works. Circular refs stay #LOOP!.
- Ghosts are faded; selecting the source outlines the spill. The fx picker lists both functions. XLSX writes the anchor formula only, so import does not block the spill. Charts read spilled values. Storage stays sheet-v4.
- Title / SHEET_VERSION / ?v=: SH13. Details: apps/office/spreadsheet/spreadsheet_readme.md.
- Checked with node --check and node apps/office/spreadsheet/test-sh13-spill.js, plus the existing SH9–SH12 node tests. No browser runner.


### 1.101 SH14 Spreadsheet SORT, SORTBY, FILTER, UNIQUE

- apps/office/spreadsheet only, plus this section. Grid stays 26 × 100. Storage stays sheet-v4.
- SORT, SORTBY, FILTER and UNIQUE match Excel's arguments and spill through the SH13 engine. Sort order 1 is ascending and -1 descending; numbers come before text (case ignored), blanks stay last, and ties keep their order. FILTER's include is a same-height column or a same-width row; no match and no if_empty is #CALC! (added to the error list). A wrong size is #VALUE!. UNIQUE compares rows (or columns), ignoring text case; exactly_once with nothing left is #CALC!.
- Ranges and arrays do element-wise = <> < > <= >= and + - * / against a scalar or a same-size array, so B2:B50>100, (B2:B50>100)*(C2:C50="x") and SEQUENCE(3)+1 spill. Scalar formulas still use the number parser only. Arguments may be a range, an A1# spill, or an array from another function.
- The fx picker lists the four functions. Title / SHEET_VERSION / ?v=: SH14. Details: apps/office/spreadsheet/spreadsheet_readme.md.
- Checked with node --check and node apps/office/spreadsheet/test-sh14-sort-filter.js, plus the existing SH9–SH13 node tests. No browser runner.
- 1.100 is SH13, so this note is numbered 1.101.


### 1.102 SH16 Spreadsheet ROW/COLUMN/INDIRECT

- apps/office/spreadsheet only, plus this section. Grid stays 26 × 100. Storage stays sheet-v4.
- ROW() is the row of the formula cell. ROW(B5) is 5. ROW(A1:A5) spills 1..5 down the column through the SH13 spill engine. ROW(A1#) uses the rows of that spill. COLUMN() is the column of the formula cell (A is 1). COLUMN(C1) is 3. COLUMN(A1:C1) spills 1..3 across the row.
- INDIRECT(text) turns text into a reference: INDIRECT("B2"), INDIRECT("B"&2), INDIRECT("A1:A3"). Alone, a range spills. Inside SUM it is that range. A bad or out-of-grid address is #REF!. It is volatile, like RAND and NOW, so it recalculates whenever any cell changes and the cells it names stay dependencies (including a built address). A circular reference is #LOOP!.
- The evaluator passes the formula cell's position into functions so no-arg ROW/COLUMN can see it. The fx picker lists the three functions. Title / SHEET_VERSION / ?v= stay SH14 (no cache bump). Details: apps/office/spreadsheet/spreadsheet_readme.md.
- Checked with node --check and node apps/office/spreadsheet/test-sh16-row-column-indirect.js, plus the existing SH9–SH14 node tests. No browser runner.
- 1.101 is SH14, so this note is numbered 1.102.


### 1.103 SH15 Spreadsheet TEXTSPLIT

- apps/office/spreadsheet only, plus this section. Grid stays 26 × 100. Storage stays sheet-v4.
- TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with]) splits text across columns and down rows and spills through the SH13 engine. The row delimiter is applied first. A blocked spill is #SPILL!. ignore_empty TRUE skips empty pieces (default FALSE). match_mode 1 is case-insensitive (default 0). A shorter row is padded with pad_with (default #N/A). If ignore_empty removes every piece, the result is #VALUE!.
- An empty column delimiter and no row delimiter is #VALUE!. Text may be one cell; a range is #VALUE!. CHAR(n) is new: the character for a code from 1 to 255. CHAR(10) is a line break and works as a row delimiter. CHAR(65) is A.
- Delimiters are one string each. The parser has no array constants, so {",",";"} is not a delimiter list. Splits are plain: quotes are not treated as CSV. The fx picker lists CHAR and TEXTSPLIT. Title / SHEET_VERSION / ?v= stay SH14 (no cache bump). Details: apps/office/spreadsheet/spreadsheet_readme.md.
- Checked with node --check and node apps/office/spreadsheet/test-sh15-textsplit.js, plus the existing SH9–SH16 node tests. No browser runner.
- 1.102 is SH16, so this note is numbered 1.103.


### 1.104 TB1 Tables app

- New Office app at `apps/office/tables/` (Office → Hub Office, after Base). A simple
  database that looks and works like a spreadsheet, and an easier alternative to Base.
  Base was not edited. Branch `cursor/tb1-tables-app-f835`. No `?v=` cache buster and
  no build bump. Title is Tables. Plain HTML/CSS/JS, no libraries and no CDN.
- Several tables, each a tab: add, rename, delete. Delete asks with the shared
  Office dialog (`OfficeDialog.confirm`), not `alert` / `confirm` / `prompt`.
  `apps/office/shared/` was not edited.
- Grid: click a cell and type. Enter moves down, Tab across, arrows move. Add row,
  delete row(s), add / rename / delete column. One type per column, chosen for the
  whole column: Text, Number, Date, Yes/No (checkbox), Choice (a list you can edit).
  A value that does not fit shows a small in-cell warning and is not stored.
- Search across the top filters the current table. Each column has a filter:
  contains, equals, greater than / less than for numbers and dates, and checked
  for Yes/No. Click the column name to sort ascending, then descending. Blanks stay
  last. The row count is shown. An empty table explains how to start.
- CSV import makes a new table, guesses column types, and lets you change them
  before creating it. CSV export downloads the current table. Quoted fields, doubled
  quotes and line breaks inside quotes are kept. Save is automatic in localStorage
  under `tables-v1` (offline, this device only). Theme Auto follows `sites-hub.theme`,
  else the device.
- Touch and keyboard, and the layout wraps on a phone. The grid draws at most 300
  rows at a time; Show earlier rows and Show later rows reach the rest. Import
  keeps at most 5000 data rows and refuses a file over 2 MB.
- New files: `index.html` (redirect only), `tables.html`, `tables.css`, `tables.js`,
  `tables_model.js`, `test-tb1.js`, `tables_readme.md`, `tables_icon.svg`. A row was
  added to `apps/office/office-apps.csv` (name Tables, path `tables/`, icon
  `tables/tables_icon.svg`, section Hub Office). Hub-owned catalog files were not
  edited. Hub Main Bot still needs to regenerate `hub/core/hub_catalog.js` and
  `hub/core/hub_appindex.js` after this is on main, using that CSV row.
- Details: `apps/office/tables/tables_readme.md`. Checked with `node --check` on
  `tables_model.js`, `tables.js` and `test-tb1.js`, and `node test-tb1.js` (types,
  sort, filter, search, quoted CSV, save/load). No browser runner.
- 1.103 is SH15, so this note is numbered 1.104.

### 1.105 TB2 Tables card view and linked tables

- Tables at `apps/office/tables/` gains a card view and a Link column. TB1 on main is unchanged
  in behaviour for text, number, date, yes/no and choice. No `?v=` cache buster and no build
  bump. Title stays Tables. Plain HTML/CSS/JS, no libraries and no CDN. `apps/office/shared/`
  was not edited. Base was not edited. Only this app and this note were touched.
- Grid / Cards toggles the current table. Cards show one record each, with field labels, and
  stack in one column on a phone. Click, tap, Enter or Space opens an in-app record panel
  (not `alert` / `confirm` / `prompt`). The panel edits every field with the same type checks
  as the grid, and has Previous, Next and Delete record. Delete uses `OfficeDialog.confirm`.
  New record opens the panel empty. Search, filters and sort use the same row list as the grid.
  Arrow keys move between cards.
- Column type Link stores the target row’s stable id and shows that table’s first column.
  The picker is an in-app searchable list. A column can allow several links. The record panel
  lists Linked from (rows in other tables that point here); choosing one jumps to that record.
  Deleting a target row, or a table, clears links to it and the confirm says so. Renaming a
  table or a column keeps the stored ids. Search and filters on a Link column use the display
  text. CSV export writes that text. CSV import never creates a Link column.
- Row ids were already on TB1 rows. Load gives an id to any row that lacks one and keeps it.
  The storage key stays `tables-v1` (no `tables-v2`). A TB1 save is migrated in place on the
  next edit; the key is not removed.
- Replaced code is commented with `(before TB2)` and was not deleted.
- Checked with `node --check` on `tables_model.js`, `tables.js`, `test-tb1.js` and `test-tb2.js`,
  then `node test-tb1.js` and `node test-tb2.js` (row ids and TB1 migration, link set / display /
  search, multi-link, backlinks, delete target clears links, rename keeps links, card filter and
  sort uses the same list, CSV). No browser runner.
- Details: `apps/office/tables/tables_readme.md`.
- 1.104 is TB1, so this note is numbered 1.105.

### 1.106 TB4 Tables spreadsheet look and dates

- Tables at `apps/office/tables/` is drawn like Spreadsheet. TB1 and TB2 behaviour for
  text, number, yes/no, choice and links is unchanged. No `?v=` cache buster and no build
  bump. Title stays Tables. Plain HTML/CSS/JS, no libraries and no CDN. `apps/office/shared/`
  was not edited. Spreadsheet and Base were not edited. Only this app and this note were touched.
- The grid copies Spreadsheet’s variables into `tables.css` (not by editing Spreadsheet):
  13px Segoe UI, 30px rows, 1px borders, header background, row-number gutter, 2px selection
  outline, toolbar buttons, and sheet tabs in the footer. Light and dark use the same colours.
  Cards still work.
- A column header is one line, `Name (Type)`, for example `Due (Date)` or `date (Date)`.
  The type is smaller and lighter. A long label ellipsizes. Clicking the name still sorts.
  ⋯, right-click, or a long press opens the column menu (filter, rename, type, delete).
- Dates are plain text, not `<input type="date">`. That control left the year as `0001`
  (`07/05/0001`) and the validator then refused it (“Use a date like 2026-11-11 — not saved”),
  because `new Date(1, month, day)` is year 1901, not year 1. Accepted text matches Spreadsheet’s
  `fxParseDate`: `YYYY-MM-DD` (optional time, date kept), `D/M/YYYY` with `/`, `-` or `.`
  (day first, swap when the month is > 12 and the day is <= 12), and an Excel serial
  (`46336` is 2026-11-10). Also `11 Nov 2026`, `11 November 2026`, `7 May 2026`, `Nov 11, 2026`.
  Display is Spreadsheet’s Date format, `YYYY-MM-DD`. Storage stays ISO. Years must be
  1000–9999, so `07/05/0001` is not saved and is not rewritten to 1901. 30 February is rejected.
  Sort and filter compare the real date.
- The storage key stays `tables-v1` (no `tables-v2`). Old ISO dates load as they are. A date
  cell that held `11/11/2026` or `11 Nov 2026` is read as ISO on load. Replaced code is
  commented with `(before TB4)` and was not deleted.
- Checked with `node --check` on `tables_model.js`, `tables.js`, `test-tb1.js`, `test-tb2.js`
  and `test-tb4.js`, then `node test-tb1.js`, `node test-tb2.js` and `node test-tb4.js`
  (date parse and display, year 0001, ISO storage, old `tables-v1` load, date sort and filter,
  header label text). No browser runner.
- Details: `apps/office/tables/tables_readme.md`.
- 1.105 is TB2, so this note is numbered 1.106.

### 1.107 SH17 Spreadsheet borders on screen and in print

- Spreadsheet at `apps/office/spreadsheet/` only, plus this section. Grid stays 26 × 100.
  Storage stays `sheet-v4`. Title, `SHEET_VERSION` and `?v=` stay SH14 (no cache bump).
  No new libraries and no CDN. `hub/`, `desktop/`, `apps/office/shared/`, `apps/system`,
  `hub.html`, `index.html` and the catalogs were not edited.
- User borders did not print as set. The print rules
  `body.print-no-grid td.cell { border-color: #fff !important }` and
  `body:not(.print-no-grid) td.cell { border-color: #999 !important }` overrode the
  inline border colour. Each bordered side is now marked `bd-t`, `bd-r`, `bd-b`, `bd-l`
  (and `data-bd-*`). Those rules skip marked sides, so the set style and colour print
  whether gridlines are on or off. Gridlines on is a light grey line on unmarked edges;
  gridlines off leaves unmarked edges blank. The on-screen gridlines-off rule no longer
  clears a marked side.
- The auto border colour is black in the light theme and on paper, and `#f0f0f0` in the
  dark theme, so it is stronger than the grid (`#d9dde5` light, `#3a3a3a` dark). A border
  saved as `#000000` or `#000` uses that auto colour. Any other stored colour is used as
  written. With collapsed borders, a Top or Left border is drawn on the upper or left
  cell when that cell has no border of its own. A merged cell shows the outer edges of
  the merge. XLSX still writes `!merges`. Auto and the old default black export as thin
  `000000` on `cell.s`; SheetJS CE still does not read styles.
- The Home tab Borders control is a tool button with an inline SVG. It opens All,
  Outside, Inside, Top, Bottom, Left, Right and No border. `#bd-sel` stays in the page,
  hidden, and a choice sets it and fires `change`. The old visible select is commented
  with `(before SH17)` and was not deleted.
- Checked with `node --check` on the spreadsheet scripts that this release edits, then
  `node apps/office/spreadsheet/test-sh17-borders.js` and the existing SH9–SH16 node
  tests. No browser runner.
- Details: `apps/office/spreadsheet/spreadsheet_readme.md`.
- 1.106 is TB4, so this note is numbered 1.107.

### 1.108 DF24 Writer (visible name; was Draftly)

- The word processor at `apps/office/draftly/` is shown as Writer. The folder,
  file names, IndexedDB name `draftly`, localStorage keys (`draftly_settings`,
  `draftly_last_name`, `draftly_theme`, and the rest), message types (`hub-app`,
  `hub-tab`, and the others), the Hub id `draftly`, and URLs stay as they were.
  Saved documents and `#draftly` links keep working. `window.Draftly` stays.
- Visible text: both page titles, the header brand, Settings → About
  (`Writer` plus the same version), PDF title and creator, the noscript
  “Open Writer” link, and the Hub title-bar name (`app` on `hub-app`, and the
  Quick Access `app` name). The Office tile in `apps/office/office-apps.csv`
  is Writer; the path is still `draftly/`.
- `python3 hub/core/hub_appindex_gen.py --catalog-only` rewrote
  `hub/core/hub_catalog.js` from the CSVs. `hub_appindex.js` keeps the id
  `draftly` and the display name Writer (the full index script needs
  Playwright; only this name was brought in line with the CSV). The legacy
  archive row in `hub_apps.js` uses the same display name. `hub_profile.js`
  has no display name: the id `draftly` and the storage keys stay.
  `desktop/gamebar/hub-gamebar.js` and `desktop/wm/wm.css` mention Draftly
  only in comments, so they were left. `tree.txt` and the historical Hub docs
  were not edited.
- Replaced lines are commented with `(before DF24)` and were not deleted.
  Code comments that people do not see were left. No `?v=` and no version or
  build bump. No new libraries and no CDN.
- Checked with `node --check` on the edited scripts,
  `node apps/office/draftly/test-df24-name.js`, and
  `node apps/office/shared/tests/ho2.test.cjs` (it loads the settings and PDF
  scripts). No browser runner.
- Details: `apps/office/draftly/draftly_readme.md`.
- 1.107 is SH17, so this note is numbered 1.108.

### 1.109 HOW1 Writer .how files

- Writer (`apps/office/draftly/`, Hub id `draftly`) now keeps a document in one
  `.how` file. The file is UTF-8 JSON: `format` `"how"`, `version` `1`, `name`,
  `created`, `updated`, `html` (formatting and images as data URLs), `hf`
  (header/footer slots) and `page` (size, orientation, margins, page numbers).
  No zip, no new library, no CDN. Version other than 1 is refused. Old IndexedDB
  documents are not migrated and are not opened.
- Save, Save As and autosave write `.how`. Inside the Hub they write the
  browser Local drive (OPFS, `FsDrives.handle('local')` + `FsOps.writeFile`),
  folder `Documents`, the same folder the Files app calls Documents. The folder
  is created on first save. Outside the Hub, Save uses `showSaveFilePicker`
  when the browser has it, otherwise a download. Autosave outside the Hub only
  continues into a file already picked. In-app dialogs only (name clash, Save
  As, delete). No `window.alert` / `confirm` / `prompt`.
- Open `.how` (File menu, drop, or the page hash from Files) restores the
  document. In the Hub, startup opens the newest `.how` in Documents when no
  file hash is present. Open `.docx`, Export DOCX, Export PDF and Print are
  unchanged. Replaced IndexedDB load/save calls are commented with
  `(before HOW1)` and were not deleted. `Draftly.storage.save` stays in
  `draftly-storage.js` for the HO2 test; `draftly-how.js` points it at the
  `.how` writer and keeps the original as `saveLegacy`.
- Files association: `shared/fs/filetypes.js` maps `.how` to app id `draftly`
  (display name Writer, url `apps/office/draftly/`). `apps/system/files/files_actions.js`
  opens that file with `FsRef.openIn`, so a double-click opens Writer on it.
  Display copy only in `apps/office/office-apps.csv`, `hub/core/hub_catalog.js`
  and `hub/core/hub_appindex.js` (the id, path and icon stay). No `desktop/`
  edit. No `?v=` and no version or build bump.
- Checked with `node --check` on the edited scripts,
  `node apps/office/draftly/test-how1-format.js` (round-trip of a `.how`
  document, including an embedded image and page setup),
  `node apps/office/draftly/test-df24-name.js`, and
  `node apps/office/shared/tests/ho2.test.cjs`. No browser runner.
- Details: `apps/office/draftly/draftly_readme.md` (HOW1 section, legacy notes).
- 1.108 is DF24, so this note is numbered 1.109.

### 1.110 HOS1 Spreadsheet .hos files

- Spreadsheet (`apps/office/spreadsheet/`, Hub id `spreadsheet`) now keeps a
  workbook in one `.hos` file. The file is UTF-8 JSON: `format` `"hos"`,
  `version` `1`, `name`, `created`, `updated`, `active`, `cols`, `rows`,
  `page` (paper, orientation, margins, print gridlines, headings, fit width),
  `settings` (file-owned options; version 1 writes `{}` — theme, ribbon, hover
  tabs, formula bar and default font stay in `spreadsheet_settings`) and
  `sheets`. Each sheet has the cells (formula, value, style, including SH17
  borders and number formats), merges, column widths, row heights, frozen
  panes, hidden rows and columns, filters, validation, conditional formatting,
  charts and the last selection. No zip, no new library, no CDN. Version other
  than 1 is refused. Old `localStorage` `sheet-v4` / `sheet-v3` / `sheet-v2` /
  `sheet-v1` workbooks, `sheet-v4-page` and `spreadsheet-name` are not migrated
  and are not opened.
- Save, Save As and autosave write `.hos`. Inside the Hub they write the
  browser Local drive (OPFS, `FsDrives.handle('local')` + `FsOps.writeFile`),
  folder `Documents`, the same folder the Files app calls Documents. The folder
  is created on first save. Outside the Hub, Save uses `showSaveFilePicker`
  when the browser has it, otherwise a download. Autosave outside the Hub only
  continues into a file already picked. Autosave waits 0.8 s. A blank new
  workbook is not written until it has content, or Save As. In-app dialogs only
  (name clash, Save As, New / Clear). No `window.alert` / `confirm` / `prompt`.
- Open `.hos` (File menu, drop, or the page hash from Files) restores the
  workbook. In the Hub, startup opens the newest `.hos` in Documents when no
  file hash is present. Open XLSX / CSV, Export CSV, Export XLSX and Print are
  unchanged. An `.xlsx` open becomes its own `.hos` (it does not overwrite the
  file that was open). CSV import still edits the current sheet. Replaced
  `localStorage` load/save calls are commented with `(before HOS1)` and were
  not deleted. `serializeWorkbook` / `applyWorkbookPayload` stay for the
  existing sheet tests. The Documents helper is
  `apps/office/shared/office-native.js` (the same approach as HOW1). Writer's
  `draftly-how.js` is unchanged.
- Files association: `shared/fs/filetypes.js` maps `.hos` to app id
  `spreadsheet` (display name Spreadsheet, url `apps/office/spreadsheet/`).
  `apps/system/files/files_actions.js` already opens a `file: true` app with
  `FsRef.openIn`, so a double-click opens Spreadsheet on that file. `.how`
  still opens Writer. Display copy only in `apps/office/office-apps.csv`,
  `hub/core/hub_catalog.js` and `hub/core/hub_appindex.js` (the id, path and
  icon stay). No `desktop/` edit. No `?v=` and no version or build bump
  (`SHEET_VERSION` stays `SH14`).
- Checked with `node --check` on the edited scripts,
  `node apps/office/spreadsheet/test-hos1-format.js` (round-trip of a `.hos`
  workbook: formulas, styles, borders, merges, row heights, two sheets),
  the existing `node apps/office/spreadsheet/test-sh*.js` files, and
  `node apps/office/draftly/test-how1-format.js`. No browser runner.
- Details: `apps/office/spreadsheet/spreadsheet_readme.md` (HOS1 section, legacy notes).
- 1.109 is HOW1, so this note is numbered 1.110.

### 1.111 HOT1 Tables .hot files

- Tables (`apps/office/tables/`, Hub id `tables`) now keeps every table in one
  `.hot` file. The file is UTF-8 JSON: `format` `"hot"`, `version` `1`, `name`,
  `created`, `updated`, `activeId` (the open sheet tab), `settings` (file-owned
  options; version 1 keeps `theme`: `auto`, `light` or `dark`) and `tables`
  in sheet-tab order. Each table has `id`, `name`, `view` (`grid` or `cards`),
  `columns` (id, name, type, width in px or `null`, choice `options`, and for
  a Link column `linkTable` and `multiple`) and `rows` (stable id, cells keyed
  by column id). A link cell stores the other row's id. Backlinks are not
  stored again: they are calculated from those ids when the file is opened.
  No zip, no new library, no CDN. Version other than 1 is refused. Old
  `localStorage` `tables-v1` is not migrated and is not opened.
- Save, Save As and autosave write `.hot`. Inside the Hub they write the
  browser Local drive (OPFS, `FsDrives.handle('local')` + `FsOps.writeFile`),
  folder `Documents`, the same folder the Files app calls Documents. The folder
  is created on first save. Outside the Hub, Save uses `showSaveFilePicker`
  when the browser has it, otherwise a download. Autosave outside the Hub only
  continues into a file already picked. Autosave waits 0.8 s. A blank new file
  (Table 1, the four starter columns, no rows, Grid, Auto) is not written until
  it has content, or Save As. In-app dialogs only (name clash, Save As). No
  `window.alert` / `confirm` / `prompt`.
- Open `.hot` (Open .hot, drop, or the page hash from Files) restores the
  tables, tab order, active tab, Grid/Cards per table, column widths, link
  ids (and so the backlinks) and the theme. In the Hub, startup opens the
  newest `.hot` in Documents when no file hash is present. Import CSV and
  Export CSV are unchanged. CSV import still adds a table and still does not
  create a Link column. Replaced `localStorage` load/save calls are commented
  with `(before HOT1)` and were not deleted. `saveTo` / `loadFrom` stay in
  `tables_model.js` for the TB1 / TB2 / TB4 tests. The Documents helper is
  `apps/office/shared/office-native.js` (the same approach as HOW1 and HOS1).
  Writer's `draftly-how.js` and Spreadsheet's `spreadsheet_hos.js` are unchanged.
- Files association: `shared/fs/filetypes.js` maps `.hot` to app id `tables`
  (display name Tables, url `apps/office/tables/`). `apps/system/files/files_actions.js`
  already opens a `file: true` app with `FsRef.openIn`, so a double-click opens
  Tables on that file. `.how` still opens Writer and `.hos` still opens
  Spreadsheet. Display copy only in `apps/office/office-apps.csv`,
  `hub/core/hub_catalog.js` and `hub/core/hub_appindex.js` (the id, path and
  icon stay). No `desktop/` edit. No `?v=` and no version or build bump.
  The page title stays `Tables`.
- Checked with `node --check` on the edited scripts,
  `node apps/office/tables/test-hot1-format.js` (round-trip of a `.hot`
  file: links and backlinks, two tables, every column type, views, widths),
  the existing `node apps/office/tables/test-tb1.js`, `test-tb2.js` and
  `test-tb4.js`, `node apps/office/spreadsheet/test-hos1-format.js`, and
  `node apps/office/draftly/test-how1-format.js`. No browser runner.
- Details: `apps/office/tables/tables_readme.md` (HOT1 section, legacy notes).
- 1.110 is HOS1, so this note is numbered 1.111.
