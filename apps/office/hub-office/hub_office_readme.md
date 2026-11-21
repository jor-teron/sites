# Hub Office — Tabbed Start Center & Suite Container

## 1. What it is
The unified Start Center and multi-document tabbed container for the **Hub Office** suite (inspired by LibreOffice Start Center). It brings together all 5 primary office suite applications:
- **Writer** (Word processor & document editor)
- **Spreadsheet** (Calculations, formulas & analysis)
- **Presentation** (16:9 presentations & slide decks; was Slides before HOP1)
- **Base** (Relational database with tables, forms & queries)
- **Tables** (Structured lightweight data grid)

## 2. Tabbed Container Architecture
<!-- (before HO8) the Start Page was a pinned tab at the top-left of the tab strip (`[ 🏠 Start Page ]`) and the row was always visible. -->
- **Home**: In Hub, a 🏠 Home button (icon and label) sits on the left of the window title bar (H49 `HubTitleBar` via `office-hubbar.js`, `showLabel` and `align:'left'`) and shows the Start Page. Standalone, or before the Hub says hello, a small Home button sits in the document tab row instead. The Start Page still has the HO7 cards (plus the HO13 Settings tile), Open/drop and Recent. (before HO13) It also had the HO9 Settings section underneath.
- **Quick buttons (HO10)**: Once Hub Office is linked to the Hub, it says hello to each suite iframe and relays the active document's Undo, Redo, Save, Print and File buttons into the title bar, just after Home (ids prefixed `d:` so they cannot collide; at most 8 buttons including Home). A click is forwarded to that suite, so its own code does the work. Ribbon tabs stay inside the suite and are not relayed. Switching tabs swaps the buttons; the Start Page shows Home only. Standalone, Hub Office does not say hello to the suites, so each keeps its own quick row. `../shared/office-quick.css` hides the in-app File button when `body.hub-titlebar` is set.
- **Dynamic Document Tabs**: Opening a suite from a card, or opening any recent or dropped document, launches a new tab in the top tab bar. **HO12:** a new blank tab adds `?new=1` to the suite URL, so Writer, Spreadsheet, Presentation, Base and Tables start a fresh document instead of restoring the last one. Opening a file (or a recent) still uses `#drive=…&file=…` and loads that file. A suite opened on its own, outside Hub Office, keeps reopening its last document. A new unsaved document is `Untitled 1`, `Untitled 2`, … (counted per suite) until that suite reports its name; an opened or saved file shows its name (e.g. `[ 📊 Budget.hos ✕ ]`), with the suite's small icon in front. Rename and Save As update the tab. Long names are shortened with an ellipsis, and the full name is the tab's tooltip. Document tabs stay in this row; they are not moved into the title bar.
- **Hidden row**: When no documents are open, the tab row hides, because it only existed for the Start Page tab. (HO13: it also shows while the Settings tab is open.)
- **Settings tab (HO13)**: The ⚙️ Settings tile, the last card after Tables, opens one Settings tab. It always sits right after Home, before any document tab; tapping the tile again just switches to it. The Settings page has a Close button at the top (Esc also closes it), and the tab has the usual ✕; either one closes Settings and returns to the Start Page. While Settings is active the Hub title bar shows Home only. The tile is not a suite: it is not in `SUITES`, `FORMAT_TABLE`, Open, Recent or routing. Pure helpers: `settingsTabInsertIndex`, `planOpenSettings`, `nextTabAfterClose`, `isDocTabActive` and the updated `shouldShowTabBar`.
- **Workspace Navigation**: Switch instantly between open documents and the Start Page without opening multiple desktop windows.
- **Tab Closing**: Closing a document tab (`✕`) returns focus to the previous active document or the Start Page. The Start Page cannot be closed.

## 3. HO7 Start Page (cards unchanged in HO8 / HO8a / HO9 / HO10 / HO11 / HO12)
<!-- (before HO7) HO6 was a minimalist Start Page: Open file on top, a New row of five icons, a Recent list, and a Supported formats link. Suite cards were removed. -->
HO7 brings the suite cards back under a Hub Office header:
- A **Hub Office** heading and the line "Write, calculate, present and organise. Files save on this device."
- One card per suite (Writer, Spreadsheet, Presentation, Base, Tables), with the icon, name, a short description, and format chips grouped as Open, Save and Export. The native save format is marked. Clicking a card opens a blank document in a new tab. (before HO15) Clicking a card, or its Open button, opens a blank document in a new tab.
- **Open file** (Ctrl+O) and a drop hint sit under the cards. Drop a file anywhere on the Start Page; a subtle overlay appears while dragging.
- **Recent**: a plain list of up to 8 files, with the app icon, name and a relative time. An empty list shows one quiet line.
- **Settings** (HO9; moved in HO13): <!-- (before HO13) a compact section under Recent, --> now on its own Settings page (`#view-settings`), opened from the Settings tile, one line per setting (font and size, paper and units, date and number format, autosave, save location, your name). Values are stored in `localStorage` key `hubOffice.settings` via `../shared/office-shared-settings.js`. They are defaults for new documents only; each app's own settings still win, and already-open documents are not restyled. Suites do not read these yet.
- The HO6 New row and Supported formats panel are gone, because the cards cover both. The old sidebar, search box and long "Supported:" line stay gone.

Files already on the Hub local drive (Documents) open through `#drive=…&file=…`, which each suite already reads. A file dropped or picked on a standalone page cannot be handed into the iframe, so the matching app opens and a short in-app note asks you to use File → Open there. Unknown extensions get an in-app message and do not open a tab.

## 4. Files
- `index.html`: Entry point with theme pre-sync, redirects to `hub_office.html`.
<!-- (before HO13) - `hub_office.html`: Document tab bar (with a standalone Home button), Start Page view (cards, Open/drop, Recent, Settings), dynamic document view container. -->
- `hub_office.html`: Document tab bar (with a standalone Home button), Start Page view (cards, Open/drop, Recent; the old Settings section is commented out), HO13 Settings view (`#view-settings`, heading, `#btn-settings-close`, the same `#ho-settings` controls), dynamic document view container. Loads `../shared/office-hubbar.js`, `../shared/office-docname.js`, `../shared/office-newdoc.js` and `../shared/office-shared-settings.js`.
- `hub_office.css`: Responsive design, Hub OS dark/light variables, tab strip styling, HO7 Start Page cards and Open/drop area, HO8 Home button and empty-row hide, HO9 Settings rows, HO11 tab-title ellipsis, HO13 Settings page, Close button and tile.
- `hub_office.js`: Tab management (`createDocTab`, `switchTab`, `closeTab`), HO12 new-blank-tab URLs (`?new=1` via `office-newdoc.js`), HO11 document-name tab labels (`applyDocName`), H49 Home-button wiring (HO8a: labelled, left-aligned), HO10 title-bar relay for the active document's quick buttons, FORMAT_TABLE, formatChipGroups, extension router, recent files loader, and HO9 Settings form. HO13 Settings tile and tab (`openSettingsTab`, `closeSettingsTab`). HO14 close-tab rule. HO15 tile-only opening. Version constant: `HO15`. (before HO15) Version constant: `HO14`. (before HO14) Version constant: `HO13`. (before HO13) Version constant: `HO12b`. (before HO12b) Version constant: `HO12`.
- `hub_office_icon.png`: 128x128 RGBA suite icon.
- `tests/hub_office.test.cjs`: Test suite verifying FORMAT_TABLE, formatChipGroups, tab creation/switching/closing, Untitled/file-name labels, extension routing, and the Settings section.
- `tests/ho15-tiles.test.cjs`: HO15 tiles with no Open buttons, no tab-bar +, tile click / Enter / Space open the right tab or Settings.
- `tests/ho14-tabs.test.cjs`: HO14 close-tab rule (never Settings for a closed document) and Home leaving Settings open.
- `tests/ho13-settings.test.cjs`: HO13 Settings tab placement, single instance, close-to-Home, tab-row visibility, Home-only title bar, and the Settings page markup.
- `tests/ho10-titlebar.test.cjs`: Pure compose / prefix / cap / File-from-tabs / update-patch tests for the HO10 relay.

## 5. Supported File Types & Routing
Files dropped or selected automatically open in a dedicated tab running the matching suite app. Lists below match each app's file pickers and export menus (verified in HO6):
<!-- (before DW7) - **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md`, `.pdf` -->
<!-- (before HO6) - **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md` -->
<!-- (before DW9) - **Writer**: open `.how` (native), `.docx`, `.odt`; save `.how`; export `.docx`, `.odt`, `.pdf` -->
- **Writer**: open `.how` (native), `.docx`, `.odt`, `.txt`; save `.how`; export `.docx`, `.odt`, `.pdf`
  DW9: Writer opens `.txt` as a document (one paragraph per line). Saving still writes `.how` and does not overwrite the `.txt`. From Hub Office Open, `.txt` goes to Writer. Base can still import `.txt` from inside Base.
<!-- (before SH27) - **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.csv`, `.tsv` -->
<!-- (before HO6) - **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv` -->
- **Spreadsheet**: open `.hos` (native), `.xlsx`, `.xls`, `.ods`, `.csv`; save `.hos`; export `.xlsx`, `.ods`, `.csv`
<!-- (before PN1) - **Presentation**: `.hop` (native; `.hslides` still opens), `.pptx`, `.ppt` -->
<!-- (before HO6) - **Presentation**: `.hop` (native; `.hslides` still opens), `.pptx`, `.odp` -->
<!-- (before PN4) - **Presentation**: open `.hop` (native; `.hslides` still opens), `.pptx`, `.odp`; save `.hop`; export `.pptx`, `.odp`, `.png`, `.pdf` -->
- **Presentation**: open `.hop` (native), `.pptx`, `.odp`; save `.hop`; export `.pptx`, `.odp`, `.png`, `.pdf`
  PN4: `.hslides` no longer opens; old `.hslides` files are the same JSON — rename to `.hop` to open.
<!-- (before BS11) - **Base**: `.hob` (native backup; `.hbase` still opens), `.base`, `.db`, `.sqlite` -->
<!-- (before HO6) - **Base**: `.hob` (native backup; `.hbase` still opens), `.odb`, `.base`, `.db`, `.sqlite` -->
<!-- (before BS14) - **Base**: open `.hob` (native; `.hbase` still opens), `.odb`, `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.json`, `.sqlite`, `.sqlite3`, `.db`; save `.hob`; export `.odb`, `.xlsx`, `.csv` -->
- **Base**: open `.hob` (native), `.odb`, `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.json`, `.sqlite`, `.sqlite3`, `.db`; save `.hob`; export `.odb`, `.xlsx`, `.csv`
  BS14: `.hbase` no longer opens; old `.hbase` files are the same JSON — rename to `.hob` to open.
- **Tables**: open `.hot` (native), `.csv`; save `.hot`; export `.csv`

`.csv` files route to Spreadsheet. `.txt` files route to Writer (DW9; Base can still import `.txt` from inside Base). `.ppt`, `.md` and `.hslides` are not opened. Presentation does not open legacy `.ppt`. PN4: `.hslides` no longer opens; old `.hslides` files are the same JSON — rename to `.hop` to open. BS14: `.hbase` no longer opens; old `.hbase` files are the same JSON — rename to `.hob` to open.

## 6. Tests
Run test suite:
```bash
node --test apps/office/hub-office/tests/hub_office.test.cjs
node --test apps/office/hub-office/tests/ho10-titlebar.test.cjs
node --test apps/office/shared/tests/ho8a-hubbar.test.cjs
node --test apps/office/shared/tests/ho9-shared-settings.test.cjs
node --test apps/office/shared/tests/ho11-docname.test.cjs
node --test apps/office/shared/tests/ho12-newdoc.test.cjs
node --test apps/office/shared/tests/ho12b-untitled.test.cjs
node --test apps/office/writer/test/test-ho12b-untitled.cjs
```

## HO15 — tiles open on tap; duplicate buttons removed
- Suite cards no longer have the `➕ Open <app>` button, and the Settings tile no longer has `⚙️ Open Settings`. Both did the same as tapping the tile. Tap, click, Enter or Space on a tile still opens it (`role="button"`, `aria-label` kept). The old code is commented `(before HO15)`.
- The tab-bar `+` (`#btn-add-tab`, new Writer document) is commented out in the HTML, its handler and `.ho-tab-add` CSS too. There was no keyboard shortcut for a new document; Ctrl+O (Open) is unchanged. Use the Writer tile for a new document.
- Tiles look tappable: pointer cursor, hover, focus ring and a pressed (`:active`) state; on touch screens the hover colour is dropped so only the press shows. The bottom padding is even without the actions row.
- Version constant and cache tokens: `HO15`. Tests: `tests/ho15-tiles.test.cjs`.

## HO14 — closing a document never jumps to Settings
- `nextTabAfterClose`: closing a document goes to the nearest document tab on its left; if there is none, it goes to the Start Page. It never returns the Settings tab for a closed document. Closing Settings still goes to the Start Page. (before HO14) a closed document went to whatever tab sat before it in the strip, which could be Settings.
- Home (title bar or tab row) still calls `switchTab('start')`: the Start Page becomes active and the Settings tab stays open in the strip, inactive.
- Version constant and cache tokens: `HO14`. Tests: `tests/ho14-tabs.test.cjs`.

## HO12b — Untitled N everywhere, names without extension, focus on tab switch

- **New documents are `Untitled N` in every suite.** N is the lowest number not used by that suite's open tabs or its files seen in `Documents` (last Start Page scan). Hub Office passes it to the suite as `?new=1&untitled=N`; the suite uses that name when it is free among its saved files, otherwise the lowest free `Untitled N`. The name the suite sends always wins, so the tab's placeholder only changes when a saved file already has that number. Writer no longer names new documents `Doc_YYYY_MM_DD_HH-MM`; Spreadsheet no longer uses `Sheet`/`Sheet_2`, Tables `Tables (2)`, Presentation `Untitled deck`, Base `base`. Saved documents keep their names.
- **No name-clash dialog for an auto-made name.** If two tabs both start as `Untitled 1`, the second one's first save quietly becomes `Untitled 2` (and its tab follows). A name you type yourself still gets the "Name already used" dialog.
- **Tab labels show the name without its extension** (`Report`, not `Report.how`). `OfficeDocName.set` strips known office extensions; the tab tooltip still shows the file name when Hub Office opened the file.
- **Switching to a document tab focuses its frame** (`iframe.contentWindow.focus()` and `iframe.focus()`, like the Hub title bar), so Ctrl+B / Ctrl+I / Ctrl+E reach the document right after a tab click. Switching to the Start Page does not move focus.
- Limit: a suite cannot see other open Hub Office tabs, so two tabs can briefly share a name when their numbers come from different sources; the quiet save above settles it.
