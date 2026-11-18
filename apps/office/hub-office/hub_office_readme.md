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
- **Home**: In Hub, a 🏠 Home button (icon and label) sits on the left of the window title bar (H49 `HubTitleBar` via `office-hubbar.js`, `showLabel` and `align:'left'`) and shows the Start Page. Standalone, or before the Hub says hello, a small Home button sits in the document tab row instead. The Start Page still has the HO7 cards, Open/drop and Recent, plus the HO9 Settings section underneath.
- **Quick buttons (HO10)**: Once Hub Office is linked to the Hub, it says hello to each suite iframe and relays the active document's Undo, Redo, Save, Print and File buttons into the title bar, just after Home (ids prefixed `d:` so they cannot collide; at most 8 buttons including Home). A click is forwarded to that suite, so its own code does the work. Ribbon tabs stay inside the suite and are not relayed. Switching tabs swaps the buttons; the Start Page shows Home only. Standalone, Hub Office does not say hello to the suites, so each keeps its own quick row. `../shared/office-quick.css` hides the in-app File button when `body.hub-titlebar` is set.
- **Dynamic Document Tabs**: Opening a suite from a card, or opening any recent or dropped document, launches a new tab in the top tab bar (e.g. `[ 📝 Writer 1 ✕ ]`, `[ 📊 Budget.hos ✕ ]`). Document tabs stay in this row; they are not moved into the title bar.
- **Hidden row**: When no documents are open, the tab row hides, because it only existed for the Start Page tab.
- **Workspace Navigation**: Switch instantly between open documents and the Start Page without opening multiple desktop windows.
- **Tab Closing**: Closing a document tab (`✕`) returns focus to the previous active document or the Start Page. The Start Page cannot be closed.

## 3. HO7 Start Page (cards unchanged in HO8 / HO8a / HO9 / HO10)
<!-- (before HO7) HO6 was a minimalist Start Page: Open file on top, a New row of five icons, a Recent list, and a Supported formats link. Suite cards were removed. -->
HO7 brings the suite cards back under a Hub Office header:
- A **Hub Office** heading and the line "Write, calculate, present and organise. Files save on this device."
- One card per suite (Writer, Spreadsheet, Presentation, Base, Tables), with the icon, name, a short description, and format chips grouped as Open, Save and Export. The native save format is marked. Clicking a card, or its Open button, opens a blank document in a new tab.
- **Open file** (Ctrl+O) and a drop hint sit under the cards. Drop a file anywhere on the Start Page; a subtle overlay appears while dragging.
- **Recent**: a plain list of up to 8 files, with the app icon, name and a relative time. An empty list shows one quiet line.
- **Settings** (HO9): a compact section under Recent, one line per setting (font and size, paper and units, date and number format, autosave, save location, your name). Values are stored in `localStorage` key `hubOffice.settings` via `../shared/office-shared-settings.js`. They are defaults for new documents only; each app's own settings still win, and already-open documents are not restyled. Suites do not read these yet.
- The HO6 New row and Supported formats panel are gone, because the cards cover both. The old sidebar, search box and long "Supported:" line stay gone.

Files already on the Hub local drive (Documents) open through `#drive=…&file=…`, which each suite already reads. A file dropped or picked on a standalone page cannot be handed into the iframe, so the matching app opens and a short in-app note asks you to use File → Open there. Unknown extensions get an in-app message and do not open a tab.

## 4. Files
- `index.html`: Entry point with theme pre-sync, redirects to `hub_office.html`.
- `hub_office.html`: Document tab bar (with a standalone Home button), Start Page view (cards, Open/drop, Recent, Settings), dynamic document view container. Loads `../shared/office-hubbar.js` and `../shared/office-shared-settings.js`.
- `hub_office.css`: Responsive design, Hub OS dark/light variables, tab strip styling, HO7 Start Page cards and Open/drop area, HO8 Home button and empty-row hide, HO9 Settings rows.
- `hub_office.js`: Tab management (`createDocTab`, `switchTab`, `closeTab`), H49 Home-button wiring (HO8a: labelled, left-aligned), HO10 title-bar relay for the active document's quick buttons, FORMAT_TABLE, formatChipGroups, extension router, recent files loader, and HO9 Settings form. Version constant: `HO10`.
- `hub_office_icon.png`: 128x128 RGBA suite icon.
- `tests/hub_office.test.cjs`: Test suite verifying FORMAT_TABLE, formatChipGroups, tab creation/switching/closing, extension routing, and the Settings section.
- `tests/ho10-titlebar.test.cjs`: Pure compose / prefix / cap / File-from-tabs / update-patch tests for the HO10 relay.

## 5. Supported File Types & Routing
Files dropped or selected automatically open in a dedicated tab running the matching suite app. Lists below match each app's file pickers and export menus (verified in HO6):
<!-- (before DW7) - **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md`, `.pdf` -->
<!-- (before HO6) - **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md` -->
- **Writer**: open `.how` (native), `.docx`, `.odt`; save `.how`; export `.docx`, `.odt`, `.pdf`
<!-- (before SH27) - **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.csv`, `.tsv` -->
<!-- (before HO6) - **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv` -->
- **Spreadsheet**: open `.hos` (native), `.xlsx`, `.xls`, `.ods`, `.csv`; save `.hos`; export `.xlsx`, `.ods`, `.csv`
<!-- (before PN1) - **Presentation**: `.hop` (native; `.hslides` still opens), `.pptx`, `.ppt` -->
<!-- (before HO6) - **Presentation**: `.hop` (native; `.hslides` still opens), `.pptx`, `.odp` -->
- **Presentation**: open `.hop` (native; `.hslides` still opens), `.pptx`, `.odp`; save `.hop`; export `.pptx`, `.odp`, `.png`, `.pdf`
<!-- (before BS11) - **Base**: `.hob` (native backup; `.hbase` still opens), `.base`, `.db`, `.sqlite` -->
<!-- (before HO6) - **Base**: `.hob` (native backup; `.hbase` still opens), `.odb`, `.base`, `.db`, `.sqlite` -->
- **Base**: open `.hob` (native; `.hbase` still opens), `.odb`, `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xls`, `.json`, `.sqlite`, `.sqlite3`, `.db`; save `.hob`; export `.odb`, `.xlsx`, `.csv`
- **Tables**: open `.hot` (native), `.csv`; save `.hot`; export `.csv`

`.csv` files route to Spreadsheet. `.ppt` and `.md` are not opened. Presentation does not open legacy `.ppt`.

## 6. Tests
Run test suite:
```bash
node --test apps/office/hub-office/tests/hub_office.test.cjs
node --test apps/office/hub-office/tests/ho10-titlebar.test.cjs
node --test apps/office/shared/tests/ho9-shared-settings.test.cjs
```
