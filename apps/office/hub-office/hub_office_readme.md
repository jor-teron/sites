# Hub Office — Tabbed Start Center & Suite Container

## 1. What it is
The unified Start Center and multi-document tabbed container for the **Hub Office** suite (inspired by LibreOffice Start Center). It brings together all 5 primary office suite applications:
- **Writer** (Word processor & document editor)
- **Spreadsheet** (Calculations, formulas & analysis)
- **Presentation** (16:9 presentations & slide decks; was Slides before HOP1)
- **Base** (Relational database with tables, forms & queries)
- **Tables** (Structured lightweight data grid)

## 2. Tabbed Container Architecture
- **Persistent Start Page Tab**: Pinned to the top-left (`[ 🏠 Start Page ]`). It never closes, so the user can always switch back to browse suites, drop files, or view recent documents.
- **Dynamic Document Tabs**: Clicking "Open Writer", "Open Spreadsheet", or opening any recent or dropped document launches a new tab in the top tab bar (e.g. `[ 📝 Writer 1 ✕ ]`, `[ 📊 Budget.hos ✕ ]`).
- **Clean Single-Action Cards**: Each suite tile features a clean primary launch button ("Open Writer", "Open Spreadsheet", "Open Presentation", "Open Base", "Open Tables") with no clutter or extra dropdowns.
- **Workspace Navigation**: Switch instantly between open documents and the Start Page without opening multiple desktop windows.
- **Tab Closing**: Closing a document tab (`✕`) returns focus to the previous active document or the Start Page.

## 3. Files
- `index.html`: Entry point with theme pre-sync, redirects to `hub_office.html`.
- `hub_office.html`: Top tab bar, Start Page view, dynamic document view container.
- `hub_office.css`: Responsive design, Hub OS dark/light variables, tab strip styling, clean single-action card layout.
- `hub_office.js`: Tab management (`createDocTab`, `switchTab`, `closeTab`), suite launchpad, extension router, and recent files loader.
- `hub_office_icon.png`: 128x128 RGBA suite icon.
- `tests/hub_office.test.cjs`: Test suite verifying suite coverage, tab creation/switching/closing, and extension routing.

## 4. Supported File Types & Routing
Files dropped or selected automatically open in a dedicated tab running the matching suite app:
<!-- (before DW7) - **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md`, `.pdf` -->
- **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md`
- **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.csv`, `.tsv`
- **Presentation**: `.hop` (native; `.hslides` still opens), `.pptx`, `.ppt`
- **Base**: `.hob` (native backup; `.hbase` still opens), `.base`, `.db`, `.sqlite`
- **Tables**: `.hot` (native), `.csv`

## 5. Tests
Run test suite:
```bash
node --test apps/office/hub-office/tests/hub_office.test.cjs
```
