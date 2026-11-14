# Spreadsheet

## 1. What it is
A small offline spreadsheet: 182 columns (A–FZ) × 1000 rows, formulas, styles, CSV import/export and print. Plain JavaScript, no internet needed, works from `file://`. The grid is drawn as a window (only the cells on screen, plus a small buffer) and empty cells are not stored up front.

**Legacy (before SH24):** the sheet was 26 columns (A–Z) × 100 rows, and every cell was a real object drawn in one full table. A `.hos` file from that grid is still version 1 and still opens; its cells land on the larger sheet. New files record `cols` 182 and `rows` 1000 and still write only the cells that have something in them.

**Name note:** "Sheetly" is a possible future name, considered to match Draftly and Notely. For now the app is still called Spreadsheet and the folder and file names are unchanged.

## HOS1 — .hos files

`.hos` (Hub Office Spreadsheet) is the default native file. It is one UTF-8 JSON file, readable in a text editor, with no zip and no new library.

| Field | What it holds |
| --- | --- |
| `format` | `"hos"` |
| `version` | `1`. Any other version is refused. A `sheet-v4` record is refused. |
| `name`, `created`, `updated` | Workbook name and times |
| `active`, `cols`, `rows` | Which sheet is open, and the grid size. SH24 writes 182 × 1000. A file saved before SH24 says 26 × 100 and still opens. |
| `page` | Paper, orientation, margins, print gridlines, headings, fit-to-width |
| `settings` | Options that belong to the file. Version 1 keeps this object empty. Theme, ribbon, hover tabs, the formula bar and the default font stay in `spreadsheet_settings` and are not written here. |
| `sheets` | Every sheet (see below) |

Each sheet holds `name`, sparse `cells` (`r`, `c`, `formula`, `value`, and `style` only where it differs from the default), `widths`, `heights` (row heights in px, `null` = automatic), `hiddenRows`, `hiddenCols`, `freeze`, `sel`, `filters`, `validations`, `merges`, `condFormats` and `charts`. A cell style includes SH17 borders (`bt`, `br`, `bb`, `bl`, including `"auto"`) and the number format (`fmt`).

File → **Save** and **Save As** write `.hos`. File → **Open .hos**, or dropping a `.hos` on the page, restores that workbook. **Open (XLSX / CSV)**, **Export CSV**, **Export XLSX** and **Print** are unchanged. Opening an `.xlsx` starts a new `.hos` so it does not replace the file that was already open. CSV import still edits the current sheet.

**In the Hub**, Save, Save As and autosave write the browser's Local drive, folder **Documents**. That is the same disk the Files app shows. Documents is created the first time a file is saved. Spreadsheet reopens the newest `.hos` in Documents when it starts inside the Hub. A double-click on a `.hos` in Files opens Spreadsheet on that file (the Hub id is still `spreadsheet`). Autosave waits 0.8 s after the last change. A blank new workbook is not written until it has something in it, or you choose Save As.

**Outside the Hub**, Save uses the browser's save picker when the browser has one, and otherwise downloads the `.hos` file. Autosave outside the Hub continues only into a file you already picked. It does not download on each edit.

### Legacy (before HOS1)

The old native copy was `localStorage` key `sheet-v4` (workbook), `sheet-v4-page` (page setup, with `sheet-v3-page` and `sheet-v2-page` as fallbacks) and `spreadsheet-name` (the title). Older `sheet-v3` / `sheet-v2` / `sheet-v1` keys were migrated into `sheet-v4` on load. Spreadsheet does not migrate those records and does not open them. The old load and save calls are still in the source, commented with `(before HOS1)`. `serializeWorkbook` and `applyWorkbookPayload` stay, so the existing sheet tests can still build a workbook in memory. App Settings stay in `spreadsheet_settings`. Open `.xlsx` / `.csv` still uses the same readers.

## 2. Files
- `spreadsheet.html` / `spreadsheet.css`: layout, toolbar, look, print
- `spreadsheet_config.js`: settings and on-screen text
<!-- (before SH16): - `spreadsheet_formula.js`: formula parser / evaluator (no `eval`), dependency-aware recalc, SH13 spill, and SH14 array math -->
- `spreadsheet_formula.js`: formula parser / evaluator (no `eval`), dependency-aware recalc, SH13 spill, SH14 array math, and SH16 ROW / COLUMN / INDIRECT
<!-- (before SH15): - `spreadsheet_functions.js`: formula function library (everything in `FUNCTIONS.txt`), plus FX_CATALOG for the hint/picker -->
- `spreadsheet_functions.js`: formula function library (everything in `FUNCTIONS.txt`), plus FX_CATALOG for the hint/picker. SH15 adds `TEXTSPLIT` and `CHAR`
- `spreadsheet_fx.js`: SH9 formula hint while typing, and the fx function picker
- `spreadsheet_refs.js`: cell refs and ranges, `$` refs, ref shifting and adjusting
- `spreadsheet_state.js`: shared state (cells, selection, widths), blank grid, styles, status
- `spreadsheet_storage.js`: workbook shape. (before HOS1) this wrote `localStorage` `sheet-v4`
- `spreadsheet_hos.js` (HOS1): `.hos` read/write, Hub Documents autosave, standalone picker or download
- `../shared/office-native.js` (HOS1): Hub Documents folder and the save picker, shared with the HOW1 approach
- `spreadsheet_files.js`: CSV import / export, print
- `spreadsheet_grid.js`: builds the grid, header clicks, selection highlight, painting cells
<!-- (before SH18): - `spreadsheet_edit.js`: cell editing, cell and arrow keys, commit, clear -->
- `spreadsheet_edit.js`: cell editing, cell and arrow keys, commit, clear. SH18 Alt+Enter inserts a newline and turns Wrap on
- `spreadsheet_fill.js`: autofill handle
- `spreadsheet_toolbar.js`: toolbar wiring and style buttons
- `spreadsheet_ribbon.js`: ribbon tabs (Home / Insert / Page / Data / View, defined as data) and the File menu, via `../shared/office-ribbon.js`
- `spreadsheet_sheets.js`: SH8 workbook tabs, freeze panes, hide / unhide, selection stats
- `spreadsheet_ribbon.css`: sheet colours for the shared ribbon, formula-bar row
- `spreadsheet_page.js` / `spreadsheet_page.css`: Page tab (orientation, paper, margins, gridlines, headings, fit width, print), saved under `<storage key>-page`
- `../shared/`: Office shared ribbon, dialog and page-setup files (see `apps/office/shared/README.md`)
- `spreadsheet_logic.js`: small orchestrator (after-change pipeline, start-up)
- `spreadsheet_format.js`: number and date / time display formats
<!-- (before SH17): - `spreadsheet_style.js`: SH11 merge, borders, font size, wrap, conditional formatting, format painter -->
- `spreadsheet_style.js`: SH11 merge, borders, font size, wrap, conditional formatting, format painter. SH17 keeps those borders visible on screen and in print
- `spreadsheet_charts.js`: SH12 column / bar / line / pie charts (canvas, no libraries)
- `spreadsheet_undo.js`: undo / redo
- `spreadsheet_select.js`: block selection (drag, Shift+click, Shift+arrows, select all)
- `spreadsheet_clipboard.js`: copy / cut / paste, fill down / right
<!-- (before SH18): - `spreadsheet_rows.js`: insert / delete rows and columns -->
- `spreadsheet_rows.js`: insert / delete rows and columns. SH18 also shifts saved row heights
- `spreadsheet_sort.js`: one-column sort (A→Z / Z→A)
- `spreadsheet_data.js`: SH10 find and replace, header-row filters, multi-column sort, list validation, remove duplicates
<!-- (before SH18): - `spreadsheet_resize.js`: column widths -->
- `spreadsheet_resize.js`: column widths and SH18 row heights (auto-fit and drag)
- `spreadsheet_keys.js`: Ctrl/Cmd shortcuts
- `FUNCTIONS.txt`: list of formulas and shortcuts (opened by the Functions button)
- `spreadsheet_icon.png`: hub icon
- `index.html`: opens `spreadsheet.html`

## 3. Behaviour rules
- **Cells:** a click selects. Typing replaces the text; F2 or double-click edits and keeps it. Enter commits and moves down, Tab moves right (Shift+Tab left). Esc cancels the edit.
<!-- (before SH16): - **Formulas:** start with `=`. Only cells that depend on a change are recalculated. Numeric results are rounded to 15 significant digits (`0.1+0.2` → 0.3). While typing, a hint shows the current function and argument. The fx button (left of the formula bar) opens a searchable function list. `SORT`, `SORTBY`, `FILTER` and `UNIQUE` spill. A range or array can be compared or added element by element (`B2:B50>100`, `SEQUENCE(3)+1`). -->
<!-- (before SH15): - **Formulas:** start with `=`. Only cells that depend on a change are recalculated. Numeric results are rounded to 15 significant digits (`0.1+0.2` → 0.3). While typing, a hint shows the current function and argument. The fx button (left of the formula bar) opens a searchable function list. `SORT`, `SORTBY`, `FILTER` and `UNIQUE` spill. A range or array can be compared or added element by element (`B2:B50>100`, `SEQUENCE(3)+1`). `ROW` and `COLUMN` give the row or column of this cell, or of a reference. `INDIRECT` turns text into a reference and recalculates whenever any cell changes. -->
- **Formulas:** start with `=`. Only cells that depend on a change are recalculated. Numeric results are rounded to 15 significant digits (`0.1+0.2` → 0.3). While typing, a hint shows the current function and argument. The fx button (left of the formula bar) opens a searchable function list. `SORT`, `SORTBY`, `FILTER` and `UNIQUE` spill. A range or array can be compared or added element by element (`B2:B50>100`, `SEQUENCE(3)+1`). `ROW` and `COLUMN` give the row or column of this cell, or of a reference. `INDIRECT` turns text into a reference and recalculates whenever any cell changes. `TEXTSPLIT` splits text across columns and down rows and spills. `CHAR` returns the character for a code; `CHAR(10)` is a line break.
- **`$` refs:** `$A$1`, `A$1`, `$A1` stay fixed when copied or filled; other parts shift.
- **Selection:** drag, Shift+click or Shift+arrows select a block. Clicking a column letter or row number selects it; the corner selects all. Delete / Backspace clears the block (styles stay).
<!-- (before SH18): - **Undo / redo:** ↶ ↷ buttons or keys. Covers edits, paste, cut, fill, clear, styles, formats, merge, conditional formatting, insert/delete, sort, find/replace, filter, validation, remove duplicates, CSV/XLSX import, sheet add/rename/delete/reorder, freeze and hide. Last 100 steps; colour-picker drags within 0.8 s count as one step. -->
- **Undo / redo:** ↶ ↷ buttons or keys. Covers edits, paste, cut, fill, clear, styles, formats, merge, conditional formatting, insert/delete, sort, find/replace, filter, validation, remove duplicates, CSV/XLSX import, sheet add/rename/delete/reorder, freeze, hide, and SH18 row-height drags. Last 100 steps; colour-picker drags within 0.8 s count as one step.
- **Copy / paste:**
  - Copy puts tab-separated values on the system clipboard, so it pastes into Excel or Google Sheets.
  - Pasting the app's own copy brings formulas and styles and shifts relative refs.
  - Cut + paste moves the cells and clears the source.
  - One copied cell pasted over a block fills the whole block.
  - Text from other apps (tab-separated) goes in as typed text, starting at the active cell.
- **Fill:** Ctrl+D copies the top row of the block down; Ctrl+R copies the left column right. The small handle on the active cell drags to autofill.
- **Insert / delete:** + Row / − Row / + Col / − Col act on the selected rows or columns. Formula refs are adjusted on every sheet (including `Sheet2!A1` refs that point at the changed sheet), ranges grow or shrink, refs to deleted cells become `#REF!`. The grid stays 182 × 1000, so insert is refused when the last row/column has data.
- **Sort:** Sort A→Z / Z→A sorts the selected block by the active cell's column; with one cell selected, the used area is sorted. Numbers come first, then text (A–Z, case ignored), blanks last. Whole rows move together. **Sort…** (SH10) sorts by up to three columns and can keep a header row.
- **Number formats** (display only; the stored value is unchanged): General, 0, 0.00, 1,000, %, ₹ Currency, Date (YYYY-MM-DD or DD/MM/YYYY), Time, Date and time. Grouping follows `en-IN` (12,34,567). Text and errors show as they are.
- **Column widths:** drag the right edge of a column letter; double-click it to reset. Widths are saved.
<!-- (before SH18): no row-height bullet -->
- **Row heights (SH18):** automatic rows grow and shrink for wrapped text and explicit line breaks (floor 30px, clamp 8–400). Drag the bottom edge of a row number to set a manual height; double-click the edge to return to automatic (content-fit). Heights are already in the `.hos` file (`heights[]`, `null` = automatic). A row-height drag is on the undo stack; column-width drags are still not.
<!-- (before SH17): - **Styles:** align, bold, italic, underline, fill colour, text colour, font size, wrap, borders, merge, format painter, and conditional highlighting for the selection. -->
- **Styles:** align, bold, italic, underline, fill colour, text colour, font size, wrap, borders, merge, format painter, and conditional highlighting for the selection. Borders is a button on the Home tab (All, Outside, Inside, Top, Bottom, Left, Right, No border).
- **CSV:** Export CSV downloads the active sheet (formulas, trailing empty rows/columns trimmed; hidden rows/columns are included). Import CSV loads a file onto the active sheet, starting at A1. Other sheets are left alone.
<!-- (before SH17): - **Print / PDF:** browser print dialog; choose Save as PDF. -->
- **Print / PDF:** browser print dialog; choose Save as PDF. Borders you set are printed in that style and colour. Page → Gridlines draws a light grey line only on edges that have no border of their own. With gridlines off, those edges are blank and the borders you set still print.
<!-- (before HOS1): - **Saving:** automatic after every change. -->
- **Saving (HOS1):** see the HOS1 section. Autosave is 0.8 s after the last change. In the Hub the file is `Documents/<name>.hos` on the Local drive. Outside the Hub, Save downloads or uses the save picker.

## 4. Keyboard
- Arrows move; Shift+arrows extend the block
- Enter / Tab / Shift+Tab commit and move
- Alt+Enter (SH18) inserts a newline and turns Wrap on; the in-cell editor and formula bar stay single-line, and the break shows in the cell after commit
- F2 edits; Esc cancels
- Delete / Backspace clears the selection
- Ctrl/Cmd+Z undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redo
- Ctrl/Cmd+A selects all
- Ctrl/Cmd+C / X / V copy, cut, paste
- Ctrl/Cmd+D fill down; Ctrl/Cmd+R fill right
- Ctrl/Cmd+F find; Ctrl/Cmd+H find and replace
- While typing in a cell or the formula bar, the browser's own text shortcuts apply.

Works inside the hub and responds to its phone D-pad, but the hub's key presses are synthetic: only shortcuts the app handles itself work (arrows move, Start = Enter, Select = Esc); browser actions such as the system clipboard don't, so a hub paste uses the app's internal copy.

## 5. Saved data
<!-- (before HOS1): localStorage key `sheet-v4` (workbook: sheets, charts, active sheet, cells, styles, formats, widths, freeze, hidden, filters, validation, merges, conditional formats). An older `sheet-v3` / `sheet-v2` / `sheet-v1` save is migrated into v4 on first load and left in place as a backup; later loads use only `sheet-v4`. Page setup is `sheet-v4-page`, with `sheet-v3-page` then `sheet-v2-page` as fallbacks. To reset, use New / Clear (asks first; can be undone) or delete the key / clear site data. -->
**HOS1:** a `.hos` file (see the HOS1 section). In the Hub it lives in Local → Documents. `sheet-v4`, `sheet-v4-page` and `spreadsheet-name` are no longer read or written. App Settings stay in `spreadsheet_settings`. To start again, use New / Clear (asks first; can be undone) or delete the `.hos` file.

## 6. Errors
- In cells: `#DIV/0!` (divide by 0), `#NUM!` (too large / not a number), `#REF!` (outside the sheet or a deleted cell), `#LOOP!` (circular reference), `#N/A` (lookup / IFS / SWITCH not found), `#VALUE!` (wrong type of argument), `#SPILL!` (an array result cannot spill), `#CALC!` (FILTER matched nothing, or UNIQUE with exactly_once kept nothing), `#ERR` (formula not understood).
- Status line: "Save failed" (storage full or blocked), "Can't insert: the last row / column has data".

## 7. Screen sizes
- One layout for all sizes: the toolbar wraps onto more lines on narrow screens and the grid scrolls with sticky headers. No phone-specific layout.
<!-- (before SH18): - Drag selection and column resizing are mouse-based; on touch, tap to select and use the toolbar. -->
- Drag selection and column / row resizing are mouse-based; on touch, tap to select and use the toolbar.
- Print: toolbar, status line, selection and resize grips are hidden; cells print on white.

## 8. Safe settings (`spreadsheet_config.js`)
- `undo.limit` / `undo.mergeMs`: undo steps kept; colour-drag merge time
- `numberFormat.currency` / `numberFormat.locale`: currency symbol; grouping (`"en-US"` gives 1,234,567)
- `colWidth.auto` / `colWidth.min` / `colWidth.rowHead`: column widths in px
- `rowHeight.auto` / `rowHeight.min` / `rowHeight.max`: automatic floor (30) and drag clamp (8–400)
- `precision`: significant digits for results
- `defaultStyle`, `colors`, `boldWeight`: look
- `csv.exportName`: download name
- `text`: on-screen wording
- Leave `grid`, `storage` and `classes` alone unless you know the code.

## 9. Browser checklist
1. Type 10 in B1, 20 in B2, `=B1+B2` in B3: shows 30. Ctrl+Z twice, then Ctrl+Y twice: back to 30.
2. Drag B1:B3, Ctrl+C, click D5, Ctrl+V: D7 is `=D5+D6`.
3. `=A21*$A$21` in B21, select B21:B23, Ctrl+D: B22 is `=A22*$A$21`.
4. `=A32` in B31, select row 32, − Row: B31 shows `#REF!`; Ctrl+Z restores it.
5. Choose ₹ Currency for 1234567.891: shows ₹12,34,567.89.
6. Widen column C, reload: still wide.
7. Sort a mixed column: numbers, then text, blanks last.

## 10. Known limits
- Fixed 182 × 1000 grid (A–FZ); insert is refused when the last row/column has data. A ref past that (GA1, A1001) is `#REF!`.
- Column widths aren't part of undo. Row-height drags are.
- Copy puts raw values on the system clipboard, not formatted text.
- Cut + paste doesn't update other formulas that pointed at the moved cells.
- The one-click A→Z / Z→A buttons still have no header-row detection (use Sort… for a header).
- In the hub, paste uses only the internal copy.
- Old version after an update: hard-refresh.
- SH18: the formula bar and in-cell editor stay single-line; a line break is visible in the cell face after commit. XLSX / CSV do not import or export row heights (XLSX export already writes wrapText only). Charts stay free-positioned and do not move when a row grows. Merged-cell auto-fit measures the top-left cell at the merged width.

## 11. Change log
- 2026-10-04 (IST): undo/redo, block select, clipboard, fill, `$` refs, insert/delete, column resize, sort, number formats, this readme (this commit).
- 2026-10-04 22:06 IST: dependency recalc, `#LOOP!`, rounding, correct errors, `#REF!` limits, trimmed CSV, icon (commit b6eb70d).
- 2026-10-02 19:01 IST: moved to `apps/office/spreadsheet/` (commit 8cb4c69, folder rearrange).

## 12. Related apps
- Draftly: documents. Notely: notes. ("Sheetly" would match them; see the name note above.)

## SH4 — shared ribbon controls
Shared `../shared/office-tools.css` (tool groups, tool buttons, File menu items) and `office-icons.js` (one SVG icon set via `data-icon`). Both apps use the same Bold/Italic/Underline, Align left/center/right and File menu icons. Spreadsheet: Draftly-style File menu (with Settings) and Alignment buttons instead of the select.

- SH5: Settings opens as a centred pop-up dialog (shared office-settings.*, ?v=2).

## SH6 — XLSX open / save
`spreadsheet_xlsx.js` + vendored SheetJS CE 0.20.3 (`vendor/sheetjs/`, Apache-2.0, ~930 KB, lazy-loaded on first XLSX use). File → Open takes .xlsx/.xls/.csv; File → Export XLSX. Import: first sheet only (toast names it and says if there are more), values + formulas, cells outside A–Z × 100 skipped. Export: values + formulas, sheet/file name from the title. Styles (bold/align/colours) were not read or written in SH6. SH11 writes merged cells (`!merges`) and number/date formats (`cell.z`). Other cell styles are attached as `cell.s` but SheetJS Community Edition usually does not write them; they stay in the app's own save.

## SS1 — Light / Auto themes
Settings → View → Theme: Auto (default) / Light / Dark. Auto inside the Sites Hub (same-origin parent frame) follows `localStorage['sites-hub.theme']` ('dark' = Dark, else Light), live on `storage`, a same-origin `{type:'hub-prefs'}` message and focus; standalone it follows `prefers-color-scheme`. Light / Dark always win. Saved in `spreadsheet_settings` (`theme`, plus `ss1: true`; pre-SS1 settings with the old default 'dark' move to Auto once). Light palette tuned (headers, selection, pressed buttons, dialogs now follow the theme via `--select-bg`); dark values unchanged.

## SH8 — multiple sheets, freeze, hide
The grid is still 26 × 100; this release does not add rows or columns.

- **Tabs:** a bar under the grid with Sheet1, Sheet2, …. `+` adds a sheet (up to 20). Double-click a tab (or right-click → Rename) to rename it, in an in-app dialog. Names must be unique, not empty, at most 31 characters, and must not contain `\ / * ? : [ ]`. Delete is not allowed on the last sheet; it can be undone, and formulas that pointed at the deleted sheet become `#REF!`. Duplicate, drag to reorder, or Move left / right in the tab menu. The active sheet is remembered.
- **Cross-sheet formulas:** `Sheet2!A1`, `Sheet2!A1:B5`, `'My Sheet'!A1`. Recalculation is across the whole workbook. Renaming a sheet rewrites formulas that refer to it. Copy, cut, paste and fill keep the sheet prefix and still shift relative A1 parts. Insert / delete rows or columns on one sheet also adjusts refs from other sheets that point at it.
- **View tab:** Freeze top row, first column, or panes (rows above and columns to the left of the active cell), and Unfreeze. Frozen rows and columns stay visible while scrolling (`position: sticky`). Hide selected rows or columns; Unhide (the selection, including gaps you selected around) or Unhide all. A thin marker shows where something is hidden. Hidden cells are still used in formulas and included in CSV, but skipped when printing.
- **Files:** CSV import / export is the active sheet. XLSX open loads every sheet (up to 20, each still A–Z × 100; a message says if any were cut). XLSX save writes every sheet. Print prints the active sheet.
- **Status bar:** Average, Count and Sum for numeric cells in the selection.
- **Saving:** `sheet-v3`. A `sheet-v2` save is migrated once into Sheet1; the old key is not deleted. New / Clear uses an in-app confirm (no `window.confirm`).
- Title, `SHEET_VERSION` and `?v=` on this app's own css/js are SH8.

## SH9 — more formulas, hint and function picker
The grid is still 26 × 100.

- **Lookups:** `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`. They work with `Sheet2!A1:C10` ranges. Approximate `VLOOKUP` / `HLOOKUP` (the default, last argument TRUE) needs the first column / row in ascending order. Exact match uses FALSE and returns `#N/A` when nothing matches. `XLOOKUP` default is exact; an optional fallback is used when there is no match. `match_mode` 0 exact, −1 exact or next smaller, 1 exact or next larger, 2 wildcard. `search_mode` −1 searches last to first.
<!-- (before SH19): - **Conditional aggregates:** `SUMIF`, `SUMIFS`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF`. Criteria can be a value, `">10"`, `"<>x"`, or a wildcard (`*` and `?`; `~` escapes). -->
- **Conditional aggregates:** `SUMIF`, `SUMIFS`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF`, `AVERAGEIFS`. Criteria can be a value, `">10"`, `"<>x"`, or a wildcard (`*` and `?`; `~` escapes).
- **Logic:** `AND`, `OR`, `NOT`, `IFS`, `SWITCH`. The literals `TRUE` and `FALSE` are accepted in formulas (and count as 1 and 0 in arithmetic).
- **Text:** `MID`, `FIND` (case-sensitive, 1-based), `SUBSTITUTE`, `PROPER`, `TEXT` (a useful subset of formats: `0.00`, `0%`, `yyyy-mm-dd`, `dd/mm/yyyy`, …), `TEXTJOIN`.
- **Dates:** `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `DATEDIF`, `EDATE`. `DATE` / `TODAY` / `EDATE` return `YYYY-MM-DD`. Month or day overflow rolls over (`DATE(2024,13,1)` is `2025-01-01`). A number is treated as an Excel serial; dates from 1 March 1900 match Excel (the 1900 leap-year bug is not reproduced).
- **Math:** `ROUNDUP`, `ROUNDDOWN`, `MEDIAN`, `RANK`, `RAND`, `RANDBETWEEN`.
- **Hint / picker:** while a formula is being typed in a cell or the formula bar, a hint lists the current function and highlights the argument. The **fx** button opens a searchable in-app list; picking a function inserts `NAME(`.
- Title, `SHEET_VERSION` and `?v=` on this app's own css/js are SH9. Storage is still `sheet-v3` (no new saved fields).
<!-- (before SH19): - **Limits:** `TEXT` only covers the formats listed above (not every Excel custom format). `AVERAGEIFS` is also implemented but is not in the plan list. `RAND` / `RANDBETWEEN` change on every recalculation. Approximate lookup on an unsorted first column follows Excel and can return the wrong row. Date serials before 1 March 1900 may be a day off Excel. -->
- **Limits:** `TEXT` only covers the formats listed above (not every Excel custom format). `RAND` / `RANDBETWEEN` change on every recalculation. Approximate lookup on an unsorted first column follows Excel and can return the wrong row. Date serials before 1 March 1900 may be a day off Excel. `AVERAGEIFS` is listed in the function catalog and FUNCTIONS.txt as of SH19.

## SH10 — data tools
The grid is still 26 × 100. Storage is still `sheet-v3`; filters and validation lists are extra optional fields (an older v3 file still opens).

- **Find and replace:** Data → Find, or Ctrl/⌘+F (Ctrl/⌘+H focuses Replace). Search this sheet or all sheets, optional match case. Find looks in stored text and in calculated values; Replace only changes stored text (a match that is only a formula result is left alone, with a status message). Replace and Replace all can be undone.
- **Filter:** Data → Filter puts arrows on the header row of the used area (or of the selection). Each arrow lists the unique values and blanks. Filtered rows are hidden separately from View → Hide, so Unhide does not clear a filter. Clear filter resets the choices; Filter again turns the arrows off. Arrow-key movement and print skip filtered rows; CSV still includes them.
- **Sort…:** up to three columns, with a "My data has a header row" option that keeps the first row of the range where it is.
- **Data validation:** a dropdown list for the selection, from a comma-separated list or a range (`A1:A10`, `Sheet2!A1:A10`). A typed value that is not in the list gets an in-app confirm (Keep / Cancel). Formulas in a validated cell are allowed.
- **Remove duplicates:** compares the chosen columns in the selected block (or used area), keeps the first row of each set, and can treat the first row as a header. Only cells inside the block move; the rest of the sheet is left alone.
- Title, `SHEET_VERSION` and `?v=` are SH10.
- **Limits:** Find does not support regular expressions or "match entire cell". Filter is a simple unique-value list (no colour or custom conditions). Validation is a dropdown list only (no number or date rules). Remove duplicates is case-insensitive.

## SH11 — formatting
The grid is still 26 × 100. Storage is still `sheet-v3`; merges and conditional-format rules are extra optional fields (an older v3 file still opens).

- **Merge / Unmerge:** the top-left cell keeps its value; other cells in the block are cleared (undo restores them). Covered cells are hidden in the grid.
<!-- (before SH17): - **Borders:** All, Outside, Inside, Top, Bottom, Left, Right, or No border, in black. -->
- **Borders:** All, Outside, Inside, Top, Bottom, Left, Right, or No border. SH11 stored them as black. SH17 still reads that black and draws it as the auto colour (see SH17).
- **Font size:** 8 to 24 px. **Wrap** shows a wrapped preview in the cell (the editor itself stays a single line while you type).
- **Date / time formats:** YYYY-MM-DD, DD/MM/YYYY, HH:MM, and date+time, using the same date parser as the SH9 date functions.
- **Highlight (conditional formatting):** a red–yellow–green or white–green colour scale, or highlight numbers above / below a value. Up to 20 rules on a sheet. A matching rule overrides the cell fill.
- **Format painter:** copies the style of the active cell onto the next click or drag. Double-click keeps it on until Esc.
- **XLSX:** merged cells and number/date formats are written. Font, fill, borders and align are attached for libraries that support `cell.s`; SheetJS CE usually drops them. Styles always stay in the app's own save. CSV is values only, as before.
- Title, `SHEET_VERSION` and `?v=` are SH11.
- **Limits:** wrap preview can clip to a couple of lines; editing is still one line. Merges that include a hidden or filtered row can look odd. Colour scales use numeric values only. Conditional formatting is not written to XLSX. SheetJS CE typically does not persist font/fill/border styles on export.

## SH12 — charts
The grid is still 26 × 100.

- **Insert a chart:** select a range (or click one cell to use the used area) and choose Column, Bar, Line or Pie on the Insert tab. The first row is treated as a header when it contains text; the first column is treated as labels when it is text. A pie chart uses the first series only. At most 8 charts on a sheet.
- **Move and resize:** drag the title bar to move; drag a handle to resize (minimum 200 × 140). Delete (or the × on the chart) asks in an in-app confirm. PNG downloads the chart as an image. Adding, deleting, moving and resizing can be undone.
- **Saving:** `sheet-v4`. A `sheet-v3` (or v2 / v1) save is migrated once and left in place. Charts are stored as type, range, title and position — they are redrawn from the current cell values when the file is opened.
- Title, `SHEET_VERSION` and `?v=` are SH12.
- **Limits:** charts are not written to XLSX or CSV. There are no trendlines, secondary axes, or chart styles beyond the four types. Labels longer than 8 characters are trimmed on the axis. A pie slice smaller than 4% of the total has no label. Charts sit over the grid (they are not in a cell) and print with the sheet but without the move bar.

## SH13 — spill, SEQUENCE and RANDARRAY
The grid is still 26 × 100. Storage is still `sheet-v4`. Ghost cells are not a saved field.

- **Spill:** any function may return a 2D array. The top-left value is the formula cell; the rest is drawn in the cells to the right and below (ghosts). Ghosts are display-only: they are not stored, not part of undo snapshots, and not written by copy, fill or sort. Typing into a ghost stores that entry and the source shows `#SPILL!`. The same happens when a target is already filled, merged, another spill, or past the grid. Nothing is written on a failed spill. When the result shrinks, old ghosts disappear. Other formulas read ghosts normally (`=A2` is the spilled value). `A1#` is the whole current spill of A1. A 1×1 array is an ordinary value. `SUM(SEQUENCE(5))` (and the other range aggregates) accept an array. Circular formulas are still `#LOOP!`.
- **SEQUENCE(rows, [cols], [start], [step])** fills numbers across, then down. Defaults are 1 column, start 1, step 1. **RANDARRAY([rows], [cols], [min], [max], [whole])** fills random numbers. Defaults are 1×1, from 0 to 1, decimals. `whole` TRUE returns integers from min to max inclusive. A bad argument, or a zero or negative size, is `#VALUE!`. A result bigger than the grid, or that does not fit where it was entered, is `#SPILL!` (the array is not allocated past the grid).
- **Look:** ghosts are faded (light and dark). Selecting the source cell draws a thin outline around the spill, in the theme selection colour.
- **Hint / picker:** SEQUENCE and RANDARRAY are in the function list, under Arrays, with argument hints.
- **Files:** save / load keeps the formula only. CSV exports formulas too, so a ghost is blank in the file. XLSX export writes the anchor formula (and the cached top-left value) and does not write ghosts, so a re-import does not block the spill. Charts read spilled values; choosing the anchor cell charts the whole spill.
- Title, `SHEET_VERSION` and `?v=` are SH13.
- **Limits:** array arithmetic (`=SEQUENCE(3)+1`) was `#VALUE!` in SH13; SH14 evaluates it. Sorting uses stored cells, so a ghost sorts as blank and the spill is recomputed afterwards. `RANDARRAY` changes on every recalculation. Copy of a ghost copies an empty stored cell; copy the source formula to spill again.

## SH14 — SORT, SORTBY, FILTER, UNIQUE
The grid is still 26 × 100. Storage is still `sheet-v4`. No new saved fields.

- **SORT(array, [sort_index], [sort_order], [by_col])** sorts rows by a 1-based column (default 1). `sort_order` 1 is ascending (default) and −1 is descending. `by_col` TRUE sorts columns by a row instead. Numbers come first, then text A–Z ignoring case, and blanks stay last in both directions. Equal keys keep their original order. A bad index, an order other than 1 or −1, or a non-boolean `by_col` is `#VALUE!`.
- **SORTBY(array, by_array1, [order1], [by_array2, order2], …)** sorts by one or more keys. A key that is one column tall as the array sorts rows; a key that is one row wide as the array sorts columns. Later keys break ties. An order argument is 1 or −1; leave it out to sort ascending. A key of a different size, or keys that mix row and column direction, is `#VALUE!`.
- **FILTER(array, include, [if_empty])** keeps rows when `include` is a column of the same height, or columns when it is a row of the same width. TRUE / FALSE and numbers work (0 is left out, any other number is kept). `(B2:B50>100)*(C2:C50="x")` is AND and `+` is OR, because a comparison is 1 or 0 once it is multiplied or added. No match and no `if_empty` is `#CALC!`. A provided `if_empty` is returned instead (a value or an array). A different size, or a block that is both multiple rows and multiple columns, is `#VALUE!`.
- **UNIQUE(array, [by_col], [exactly_once])** returns distinct rows, or distinct columns when `by_col` is TRUE, in first-seen order. Text is compared ignoring case. A typed number and the same number as text count as the same value. `exactly_once` TRUE keeps only rows or columns that occur once; if that set is empty the result is `#CALC!`.
- **Array math:** a range or array with `= <> < > <= >=` or `+ - * /` against a scalar, or against another array of the same shape, is element by element and spills when it is the whole formula. `=SEQUENCE(3)+1` spills 2, 3, 4. A different shape is `#VALUE!`. A formula that never produces an array (`=A1+B1`, `=1+2`) still uses the scalar parser and is not slower. `=A1>1` on a single cell is still `#ERR`, as before.
- **Arguments** may be a range, an `A1#` spill, or an array returned by another function (`SORT(UNIQUE(A2:A50))`, `SUM(FILTER(...))`).
- **Hint / picker:** SORT, SORTBY, FILTER and UNIQUE are in the function list, under Arrays, with argument hints. `#CALC!` is in the error list.
- Title, `SHEET_VERSION` and `?v=` are SH14.
- **Limits:** arrays of different shapes are not broadcast (`#VALUE!`). `SORT`'s `sort_index` is one column or row; use `SORTBY` for more keys. A blank cell inside an array sum or product counts as 0; a blank single cell in `=A1+1` is still `#ERR`. The Data tab's sort still reads stored cells, so a ghost sorts as blank until the spill is drawn again.

## SH16 — ROW, COLUMN, INDIRECT
The grid is still 26 × 100. Storage is still `sheet-v4`. No new saved fields.

- **ROW([ref])** with no argument is the row number of the cell that holds the formula (1-based). `ROW(B5)` is 5. `ROW(A1:A5)` spills 1, 2, 3, 4, 5 down the column. A reference that covers several rows spills one number per row. `ROW(A1#)` uses the rows of that spill.
- **COLUMN([ref])** with no argument is the column number of the formula cell (A is 1). `COLUMN(C1)` is 3. `COLUMN(A1:C1)` spills 1, 2, 3 across the row. A reference that covers several columns spills one number per column.
- **INDIRECT(text)** turns text into a reference: `INDIRECT("B2")`, `INDIRECT("B"&2)`, `INDIRECT("A1:A3")`. Used alone, a range spills. Inside `SUM` (and the other aggregates) it is that range. A bad address, or one outside A–Z × 1–100, is `#REF!`. It is volatile, like `RAND` and `NOW`: it is calculated again whenever any cell changes, and the cells it names are dependencies even when the address is built from text. A circular reference is `#LOOP!`.
- **Hint / picker:** ROW, COLUMN and INDIRECT are in the function list, under Lookup, with argument hints.
- Legacy: title, `SHEET_VERSION` and `?v=` stay SH14. This release does not bump the cache token. Storage stays `sheet-v4`.
- **Limits:** `INDIRECT` reads A1-style addresses (a cell, a range, or `A1#`), not R1C1. `ROW(1)` is `#VALUE!` because 1 is not a reference. A range passed to `ROW` spills row numbers, not one number per cell. `ROW(INDIRECT("B5"))` is `#VALUE!` as well: `INDIRECT` yields the cell's value (or a spilled range), and `ROW` / `COLUMN` need the reference written in the formula.

## SH15 — TEXTSPLIT and CHAR
The grid is still 26 × 100. Storage is still `sheet-v4`. No new saved fields.

- **TEXTSPLIT(text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with])** splits `text` by `col_delimiter` across columns and by `row_delimiter` down rows. The row delimiter is applied first; each of those pieces is then split by the column delimiter. The result spills through the SH13 engine. A blocked spill (a filled cell, a merge, another spill, or past the grid) is `#SPILL!` and writes nothing else. A 1×1 result is an ordinary value.
- **ignore_empty** TRUE skips empty pieces, including a blank row from a repeated row delimiter (default FALSE, which keeps the blank). If that removes every piece, the result is `#VALUE!`. **match_mode** 1 compares delimiters ignoring case (default 0, case-sensitive). Any other match mode is `#VALUE!`. A shorter row is filled out to the widest row with **pad_with** (default `#N/A`).
- **Delimiters** are one string each: a quoted string, or one cell. An empty column delimiter with no row delimiter is `#VALUE!`. An empty column delimiter with a row delimiter splits into a single column. The formula parser does not accept array constants, so `{",",";"}` is not a list of delimiters.
- **text** may be a string or one cell. A range, or any array that is not a single value, is `#VALUE!`. An error in that cell is returned as that error.
- **CHAR(number)** is the character for a code from 1 to 255. `CHAR(10)` is a line break and can be the row delimiter. `CHAR(65)` is A. A code outside 1–255 is `#VALUE!`. `CHAR` uses the Unicode code point, so a code Excel maps through an old ANSI page may differ; 10 and the ASCII letters match.
- **Quotes** are ordinary characters. `TEXTSPLIT` does not treat a comma inside quotes as one field (no CSV parse).
- **Hint / picker:** CHAR and TEXTSPLIT are in the function list, under Text, with argument hints.
- Legacy: title, `SHEET_VERSION` and `?v=` stay SH14. This release does not bump the cache token. Storage stays `sheet-v4`.
- **Limits:** one delimiter string for columns and one for rows (not a list). No CSV quote rules. `CHAR` is code points 1–255, not Excel's Windows-1252 page. A result that does not fit is `#SPILL!`.

## SH17 — borders on screen and in print
The grid is still 26 × 100. Storage is still `sheet-v4`. No new saved fields. Title, `SHEET_VERSION` and `?v=` stay SH14.

- **Print:** a border you set is printed in that style and colour, whether Page → Gridlines is on or off. Gridlines on draws a light grey (`#999`) line only on edges with no border of their own. Gridlines off leaves those edges blank. The old print rules set every cell's border colour with `!important`, which covered the inline border. Each bordered side is now marked (`bd-t`, `bd-r`, `bd-b`, `bd-l`, and the same `data-bd-*` attribute) and the print rules skip those sides.
- **Screen:** the same marks keep Settings → gridlines off from clearing a border you set. The auto colour is black in the light theme and on paper (`#000000`, darker than the light grid `#d9dde5`) and light grey in the dark theme (`#f0f0f0`, lighter than the dark grid `#3a3a3a`). A border saved by SH11 as `#000000` or `#000` is that auto colour. Any other stored colour is used as written, on screen and in print.
- **Shared edges:** the grid collapses two borders into one, and the upper or left cell wins. A Top or Left border is drawn on that neighbour when the neighbour has no border there, so it is not replaced by the gridline. A merged cell draws the outer edges of the whole merge (the right-hand cell's right border, the last row's bottom border).
- **Borders button:** Home tab, an inline SVG (no CDN) and the word Borders. It opens the same eight choices. `#bd-sel` is still in the page, hidden, and a choice sets it and fires `change`, which applies the border. The old visible `<select>` is commented with `(before SH17)`.
- **XLSX:** auto and the old default black are written as thin black (`000000`) on `cell.s`. Other colours are written as their hex. SheetJS Community Edition still does not read or write those styles; they stay in `sheet-v4`. Merged cells are still `!merges`.
- **Legacy:** title, `SHEET_VERSION` and `?v=` stay SH14. This release does not bump the cache token. Storage stays `sheet-v4`.
- **Limits:** borders are 1px solid. There is no colour or thickness picker. A merged cell shows the outer borders, not lines between the cells inside the merge. Conditional formatting is unchanged.

## SH18 — row height (auto-expand and drag resize)
The grid is still 26 × 100. The `.hos` format stays version 1 (`heights[]` was already defined in HOS1: px, `null` = automatic, clamp 8–400). Title, `SHEET_VERSION` and `?v=` are SH18 (a visible grid / CSS change, so the cache token is bumped).

- **Automatic rows** (`heights[r] = null`): grow and shrink back to 30px for wrapped text and for explicit `\n` (2+ lines). Height is the max content need of the visible cells in that row (font size, line-height 1.25, padding, wrap width from that column, merged width for a merge's top-left). A pure helper (`estimateRowHeight`) does the math; there is no 26 × 100 layout read. Recomputed after edit, wrap / font-size change, paste, fill, column resize, and open.
- **Manual resize:** drag the bottom edge of a row-number header (`cursor: row-resize`). The grip is only on the header, not between data cells. Clamp 8–400px. Double-click the grip to reset to automatic (content-fit — not the same as column automatic, which shares free width). Manual heights stay until the user double-clicks or drags again. A drag (and a double-click reset) is recorded on the undo stack. Column-width undo is unchanged (still not on the stack).
- **Alt+Enter:** inserts a newline, turns Wrap on, and stays in the cell. Plain Enter still commits and moves down. The in-cell editor and formula bar stay single-line `<input>`s; the `.cell-face` shows the break after commit. A cell that already has a line break (paste, import, `CHAR(10)`) also shows a face, even if Wrap was off.
- **Insert / delete:** `heights[]` now shifts with the rows, the same way `colWidths` already shifted with columns (this was a latent gap).
- **Freeze:** sticky offsets sum the real (manual or automatic) row heights and still skip hidden / filtered rows, so variable heights stay aligned.
- **Limits:** no XLSX / CSV row-height or wrap-style import (export already writes `wrapText` only). No multiline formula bar or in-cell textarea. Column auto-width behaviour is unchanged. Merged-cell auto-fit measures the top-left cell at the merged width; Excel's merge quirks are not copied. Charts stay free-positioned and will not stick to a row if it grows. Print uses the same table (`tr.style.height`); `.row-grip` is hidden in print like `.col-grip`.

## HO3 — 12pt default font
The default cell text is now **12pt** (16px at 96 dpi), the same as Writer. Before HO3 it was 13px (about 10pt). The `.hos` format stays version 1. `?v=` on `spreadsheet.html` is bumped to `HO3` so a cached 13px stylesheet does not stick; the title and `SHEET_VERSION` stay SH18.

- **Settings → Default size** is in **pt** (9, 10, 11, 12, 14, 16, 18; 12 selected). `spreadsheet_settings` stores it as a CSS length string (`"12pt"`) and applies it to `--sheet-font-size`. The CSS fallback in `spreadsheet.css` is `12pt` too.
- **One-time move** (`ho3` flag): a saved number 13 — the old factory default — becomes `"12pt"`. Any other saved number was chosen in the old px menu, so it stays px (`16` → `"16px"`) and is listed as “16 px (earlier setting)” until a pt size is picked. Limit: someone who picked 13 px on purpose also moves to 12pt.
- **Empty cells** (`fontSize: ""`) inherit the Settings default, so they are 12pt. **Explicit cell sizes** (Home tab menu, saved in `.hos`) are still **px** and are not changed or rescaled. The Home tab menu stays in px (8–24); for a cell with no size it shows the default in px (16) without storing it.
- **Auto-fit** (SH18) uses the default in px (16 for 12pt). One line is 6 + 16 × 1.25 = 26px, under the 30px automatic floor, which is unchanged. `defaultSheetFontSize()` now reads `SHEET_SETTINGS.s` (before HO3 it read a property that was never set and always used 13).
- **Limits:** text that inherits the body size (column letters, row numbers, the function list) grows with it, as it already did when the Settings size was changed. XLSX export still writes the px cell size as `sz`. Changing Settings → Default size does not re-run auto-fit until the next repaint.
- Tests: `node apps/office/spreadsheet/test-ho3-font-default.js`.

## SH21 — formula hint and fx picker start again
The formula argument hint, name autocomplete, and the fx button picker have been in the app since SH9, but they never started after a later script-order change. `spreadsheet_fx.js` ran `SHEET_INIT.push(initFxUi)` at the top level, and it was loaded before `spreadsheet_state.js`, which is the file that declares `var SHEET_INIT = []`. That throw stopped `initFxUi` from being registered, so typing `=IF(` showed no hint and the fx button did nothing.

- **Fix:** `spreadsheet_fx.js` now loads after `spreadsheet_state.js` and `spreadsheet_edit.js`. The old early `<script>` tag is kept as an HTML comment `(before SH21)`. No other file that pushes to `SHEET_INIT`, or that uses a state global at top level, loaded before `state.js`.
- **Release id:** title and `SHEET_VERSION` are SH21. `?v=` stays `HO3` (a cache bump is not needed; this is a script-order fix, like SL10 leaving `?v=SL9`). Storage stays `sheet-v4`. The grid is still 26 × 100.
- **Tests:** `node apps/office/spreadsheet/test-sh21-fx-hint.js` checks the live script order in `spreadsheet.html` and loads that prefix in a vm to confirm `SHEET_INIT` includes `initFxUi`.
<!-- (before SH19): - **Limits:** this only starts the existing SH9 hint and picker. It does not change hint text, add `AVERAGEIFS` to the lists, or replace File → Functions with an in-app dialog (those are parked as SH19 / SH20). -->
- **Limits:** this only starts the existing SH9 hint and picker. List and hint-text fixes are in SH19. Replacing File → Functions with an in-app dialog stays parked as SH20.

## SH19 — function list matches the engine
The formula engine already supported 70 functions, including `AVERAGEIFS`. The fx catalog and File → Functions list (`FUNCTIONS.txt`) were one behind, and some signatures and hints did not match what the engine actually does.

- **AVERAGEIFS** is now in the fx catalog (Lookup, next to `SUMIFS`) and in `FUNCTIONS.txt`. Signature: `AVERAGEIFS(average_range, criteria_range1, criteria1, …)`. The engine is unchanged (`fxIfsAgg("AVERAGE", args)`).
- **Syntax and hints** now match the engine: `LEFT` and `RIGHT` take an optional `[n]` (default 1); `IF`'s else is optional and returns `""` when omitted; `MID`'s `num_chars` is optional (leave it out to take the rest of the string); `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA` and `MEDIAN` take `(value1, …)`; `XLOOKUP` modes are documented (`match_mode`: 0 exact (default), 2 wildcard, −1/1 approximate; `search_mode`: 1 forward (default), −1 reverse); `NOW()` is date and hours:minutes, with no seconds; `TRIM` only trims leading and trailing spaces.
- **Release id:** title and `SHEET_VERSION` are SH19. `?v=` stays `HO3` (no cache bump). Storage stays `sheet-v4`. The grid is still 26 × 100.
- **Not changed:** File → Functions still opens `FUNCTIONS.txt` in a new tab. The in-app Functions dialog stays parked as SH20.

## SH22 — click another sheet's cell to put Sheet2!A1 in a formula
While you write a formula (text that starts with `=`, in a cell or the formula bar), you can now point at a cell on another sheet with the mouse.

- **Tab click:** clicking another sheet tab only switches the view. The formula is not saved or lost. The draft moves to the formula bar and keeps its caret there.
- **Cell click:** on that sheet, clicking a cell inserts `Sheet2!A1` at the caret, or `'My Sheet'!A1` when the name needs quotes (the same rule as typed refs). Clicking another cell straight after replaces that ref. The selection and the rest of the formula do not change.
- **Enter** saves the formula to the cell you started in, goes back to that sheet and selects the cell. **Esc** throws the draft away and goes back.
- Clicking the starting sheet's tab goes back to it and keeps editing. Plain text (not a formula) still saves when you click a tab, as before.
- The formula hint (SH21) stays on the formula bar while pointing.
- **Code:** `spreadsheet_point.js` (new, loaded after `spreadsheet_fx.js`). `switchSheet` asks `pointOnTab` first; formula-bar Enter calls `pointFinish` while pointing (old handler kept as a `(before SH22)` comment).
<!-- (before SH23): - **Limits:** same-sheet pointing and drag ranges are SH23. Clicking a cell back on the starting sheet while pointing saves the formula and selects that cell (like a normal cell edit). Clicking somewhere else (ribbon, column header) also saves the formula and goes back. -->
- **Limits:** clicking somewhere else (ribbon, column header) saves the formula and goes back. Same-sheet pointing and drag ranges arrived in SH23 (below).
- **Release id:** title and `SHEET_VERSION` are SH22. `?v=` stays `HO3`. Storage stays `sheet-v4`. The grid is still 26 × 100.
- **Tests:** `node apps/office/spreadsheet/test-sh22-sheet-pointing.js` (ref text and quoting, replacing the last inserted ref, the tab-click decision).

## SH23 — click or drag cells on the same sheet to put refs and ranges in a formula
While you write a formula (in a cell or the formula bar), clicking another cell on the same sheet now puts its ref in the formula, like Excel.

- **When a click inserts:** only when the caret is at a spot where a ref makes sense: right after `=`, `(`, `,`, an operator (`+ - * / ^ & = < >`), `:`, or a ref you just inserted. Typing `=SUM(` and clicking B2 gives `=SUM(B2`. Anywhere else (for example right after `=A1`), the click saves the formula and selects that cell, as before.
- **Click again right away** to swap the ref. Once you type something, the next click adds a new ref instead.
- **Drag** across cells to insert a range: `A1:B3`, always top-left first, updated as you drag. On another sheet it is `Sheet2!A1:B3` or `'My Sheet'!A1:B3`. **Shift+click** grows the ref you just inserted into a range.
- **The cell you are editing:** clicking it inserts nothing; you keep editing.
- **Pointing across sheets (SH22):** back on the starting sheet, cell clicks now insert refs too (no sheet name), by the same rule, instead of saving.
- The inserted cells get a dashed outline until you type, press Esc, switch sheet or finish.
- **Enter** saves and **Esc** cancels as before. Plain text is unchanged. The formula hint (SH21) keeps working.
- **Code:** `spreadsheet_point.js` (`pointCaretAllowsRef`, `pointRangeText`, `pointCanReplace`, drag via `mouseover`). The SH22 cell-click handler is kept as a `(before SH23)` comment.
- **Limits:** no coloured per-ref outlines for refs already in the formula (only the one just inserted). Clicking a row or column header does not insert `A:A` / `1:1`. Arrow keys do not point (they still move or leave the cell). While pointing across sheets and back on the starting sheet, the starting cell shows its saved value; the draft is in the formula bar.
- **Release id:** title and `SHEET_VERSION` are SH23. `?v=` stays `HO3`. Storage stays `sheet-v4`. The grid is still 26 × 100.
- **Tests:** `node apps/office/spreadsheet/test-sh23-point-ranges.js` (caret-allows-ref decision, range text order and quoting, replacing the last ref).

## SH24 — A–FZ × 1000, drawn as a window

The sheet is 182 columns (A–FZ) by 1000 rows. Empty cells are not created up front, and the table draws only the rows and columns on screen (plus a few extra, and any frozen rows or columns). Scrolling and resizing move that window. The `.hos` file stays version 1.

- **Columns:** A..Z, then AA..FZ. Headers, formulas (`=AA1`, `=A1:FZ10`), `#REF!` past FZ or row 1000, fill, copy, sort, filter, find, freeze, hide, widths, CSV and XLSX all use those names.
- **Name box:** the box at the left of the formula bar shows the selection. Type a cell or a range and press Enter to go there.
- **Memory:** a new sheet does not build 182,000 cell objects. A cell appears when something is written into it. Recalculation walks those cells, not every address on the sheet.
- **Print:** only the used range (last cell that has text, a formula, a style or a merge). Hidden rows and columns stay out.
- **Files:** Save writes `cols` 182 and `rows` 1000, and only cells that have a formula, a value or a style. A `.hos` saved on the old 26 × 100 grid still opens.
- **Legacy:** the old full-table builder and the old one-letter column parser are still in the source, marked `(before SH24)`. Title and `SHEET_VERSION` are SH24. `?v=` stays `HO3`.
- **Limits:** the grid does not grow past FZ × 1000. A merge much taller than the screen can clip until its top-left cell is in view. Selecting every cell and copying it still walks that block. Formatting a whole empty column stores a cell for each selected cell. Print of a sheet that is full to FZ1000 is heavy. `?v=` is not bumped, so the name-box rules are also injected when the page loads.
- **Tests:** `node apps/office/spreadsheet/test-sh24-grid.js`.

## Legacy
IC6: icon redrawn plain without tile; old icon kept as *_icon_before_IC6.png
