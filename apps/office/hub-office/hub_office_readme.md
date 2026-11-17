# Hub Office — Start Center

## 1. What it is
The unified Start Center for the **Hub Office** suite (inspired by LibreOffice Start Center). It brings together all 5 primary office suite applications:
- **Writer** (Word processor & document editor)
- **Spreadsheet** (Calculations, formulas & analysis)
- **Slides** (16:9 presentations & slide decks)
- **Base** (Relational database with tables, forms & queries)
- **Tables** (Structured lightweight data grid)

Provides single-click blank launchers, starter templates, automatic file routing by extension (via drag-and-drop or file picker), and recent document history.

## 2. Files
- `index.html`: Entry point with theme pre-sync, redirects to `hub_office.html`.
- `hub_office.html`: Main Start Center page (sidebar, suite cards grid, drop zone, recent documents).
- `hub_office.css`: Responsive design, Hub OS dark/light variables, mobile-friendly collapsible layout.
- `hub_office.js`: Suite definitions, launcher router (`__hubOpenApp` / `postMessage` / standalone), extension mapper, and recent files loader.
- `hub_office_icon.png`: 128x128 RGBA suite icon.
- `make_icon.py`: Python Pillow script used to generate `hub_office_icon.png`.
- `tests/hub_office.test.cjs`: Unit tests verifying suite coverage, extension routing, and launcher logic.

## 3. Supported File Types & Routing
Files dropped or selected via the Open button automatically route to their dedicated suite application:
- **Writer**: `.how` (native), `.docx`, `.odt`, `.txt`, `.md`, `.pdf`
- **Spreadsheet**: `.hos` (native), `.xlsx`, `.xls`, `.csv`, `.tsv`
- **Slides**: `.hslides` (native), `.pptx`, `.ppt`
- **Base**: `.base`, `.db`, `.sqlite`
- **Tables**: `.hot` (native), `.csv`

## 4. Integration with Hub OS
- **Window Management**: Inside a Hub OS Desktop window, opening an app launches the application in its own native desktop window via `window.parent.__hubOpenApp` or `{ type: 'hub-open-app' }`.
- **Standalone**: Outside the Hub, apps open in new browser tabs.
- **Theming**: Directly follows the Hub theme (Dark/Light and accent colour) via `shared/theme/hub_theme.js`.
- **Recent Documents**: Scans the `Documents` directory on the Hub Local drive (`shared/fs/fs_drives.js` OPFS) and tracks recent documents in `localStorage` (`sites-hub.recent-office-docs`).

## 5. Tests
Run test suite:
```bash
node --test apps/office/hub-office/tests/hub_office.test.cjs
```
