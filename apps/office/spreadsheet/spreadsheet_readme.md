# Spreadsheet

## 1. What it is
A small offline spreadsheet: 26 columns (A–Z) × 100 rows, formulas, styles, CSV import/export and print. Plain JavaScript, no internet needed, works from `file://`.

**Name note:** "Sheetly" is a possible future name, considered to match Draftly and Notely. For now the app is still called Spreadsheet and the folder and file names are unchanged.

## 2. Files
- `spreadsheet.html` / `spreadsheet.css`: layout, toolbar, look, print
- `spreadsheet_config.js`: settings and on-screen text
- `spreadsheet_formula.js`: formula parser / evaluator (no `eval`) and dependency-aware recalc
- `spreadsheet_functions.js`: formula function library (everything in `FUNCTIONS.txt`), plus FX_CATALOG for the hint/picker
- `spreadsheet_fx.js`: SH9 formula hint while typing, and the fx function picker
- `spreadsheet_refs.js`: cell refs and ranges, `$` refs, ref shifting and adjusting
- `spreadsheet_state.js`: shared state (cells, selection, widths), blank grid, styles, status
- `spreadsheet_storage.js`: save / load in the browser
- `spreadsheet_files.js`: CSV import / export, print
- `spreadsheet_grid.js`: builds the grid, header clicks, selection highlight, painting cells
- `spreadsheet_edit.js`: cell editing, cell and arrow keys, commit, clear
- `spreadsheet_fill.js`: autofill handle
- `spreadsheet_toolbar.js`: toolbar wiring and style buttons
- `spreadsheet_ribbon.js`: ribbon tabs (Home / Insert / Page / Data / View, defined as data) and the File menu, via `../shared/office-ribbon.js`
- `spreadsheet_sheets.js`: SH8 workbook tabs, freeze panes, hide / unhide, selection stats
- `spreadsheet_ribbon.css`: sheet colours for the shared ribbon, formula-bar row
- `spreadsheet_page.js` / `spreadsheet_page.css`: Page tab (orientation, paper, margins, gridlines, headings, fit width, print), saved under `<storage key>-page`
- `../shared/`: Office shared ribbon, dialog and page-setup files (see `apps/office/shared/README.md`)
- `spreadsheet_logic.js`: small orchestrator (after-change pipeline, start-up)
- `spreadsheet_format.js`: number and date / time display formats
- `spreadsheet_style.js`: SH11 merge, borders, font size, wrap, conditional formatting, format painter
- `spreadsheet_charts.js`: SH12 column / bar / line / pie charts (canvas, no libraries)
- `spreadsheet_undo.js`: undo / redo
- `spreadsheet_select.js`: block selection (drag, Shift+click, Shift+arrows, select all)
- `spreadsheet_clipboard.js`: copy / cut / paste, fill down / right
- `spreadsheet_rows.js`: insert / delete rows and columns
- `spreadsheet_sort.js`: one-column sort (A→Z / Z→A)
- `spreadsheet_data.js`: SH10 find and replace, header-row filters, multi-column sort, list validation, remove duplicates
- `spreadsheet_resize.js`: column widths
- `spreadsheet_keys.js`: Ctrl/Cmd shortcuts
- `FUNCTIONS.txt`: list of formulas and shortcuts (opened by the Functions button)
- `spreadsheet_icon.png`: hub icon
- `index.html`: opens `spreadsheet.html`

## 3. Behaviour rules
- **Cells:** a click selects. Typing replaces the text; F2 or double-click edits and keeps it. Enter commits and moves down, Tab moves right (Shift+Tab left). Esc cancels the edit.
- **Formulas:** start with `=`. Only cells that depend on a change are recalculated. Numeric results are rounded to 15 significant digits (`0.1+0.2` → 0.3). While typing, a hint shows the current function and argument. The fx button (left of the formula bar) opens a searchable function list.
- **`$` refs:** `$A$1`, `A$1`, `$A1` stay fixed when copied or filled; other parts shift.
- **Selection:** drag, Shift+click or Shift+arrows select a block. Clicking a column letter or row number selects it; the corner selects all. Delete / Backspace clears the block (styles stay).
- **Undo / redo:** ↶ ↷ buttons or keys. Covers edits, paste, cut, fill, clear, styles, formats, merge, conditional formatting, insert/delete, sort, find/replace, filter, validation, remove duplicates, CSV/XLSX import, sheet add/rename/delete/reorder, freeze and hide. Last 100 steps; colour-picker drags within 0.8 s count as one step.
- **Copy / paste:**
  - Copy puts tab-separated values on the system clipboard, so it pastes into Excel or Google Sheets.
  - Pasting the app's own copy brings formulas and styles and shifts relative refs.
  - Cut + paste moves the cells and clears the source.
  - One copied cell pasted over a block fills the whole block.
  - Text from other apps (tab-separated) goes in as typed text, starting at the active cell.
- **Fill:** Ctrl+D copies the top row of the block down; Ctrl+R copies the left column right. The small handle on the active cell drags to autofill.
- **Insert / delete:** + Row / − Row / + Col / − Col act on the selected rows or columns. Formula refs are adjusted on every sheet (including `Sheet2!A1` refs that point at the changed sheet), ranges grow or shrink, refs to deleted cells become `#REF!`. The grid stays 26 × 100, so insert is refused when the last row/column has data.
- **Sort:** Sort A→Z / Z→A sorts the selected block by the active cell's column; with one cell selected, the used area is sorted. Numbers come first, then text (A–Z, case ignored), blanks last. Whole rows move together. **Sort…** (SH10) sorts by up to three columns and can keep a header row.
- **Number formats** (display only; the stored value is unchanged): General, 0, 0.00, 1,000, %, ₹ Currency, Date (YYYY-MM-DD or DD/MM/YYYY), Time, Date and time. Grouping follows `en-IN` (12,34,567). Text and errors show as they are.
- **Column widths:** drag the right edge of a column letter; double-click it to reset. Widths are saved.
- **Styles:** align, bold, italic, underline, fill colour, text colour, font size, wrap, borders, merge, format painter, and conditional highlighting for the selection.
- **CSV:** Export CSV downloads the active sheet (formulas, trailing empty rows/columns trimmed; hidden rows/columns are included). Import CSV loads a file onto the active sheet, starting at A1. Other sheets are left alone.
- **Print / PDF:** browser print dialog; choose Save as PDF.
- **Saving:** automatic after every change.

## 4. Keyboard
- Arrows move; Shift+arrows extend the block
- Enter / Tab / Shift+Tab commit and move
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
localStorage key `sheet-v4` (workbook: sheets, charts, active sheet, cells, styles, formats, widths, freeze, hidden, filters, validation, merges, conditional formats). An older `sheet-v3` / `sheet-v2` / `sheet-v1` save is migrated into v4 on first load and left in place as a backup; later loads use only `sheet-v4`. Page setup is `sheet-v4-page`, with `sheet-v3-page` then `sheet-v2-page` as fallbacks. To reset, use New / Clear (asks first; can be undone) or delete the key / clear site data.

## 6. Errors
- In cells: `#DIV/0!` (divide by 0), `#NUM!` (too large / not a number), `#REF!` (outside the sheet or a deleted cell), `#LOOP!` (circular reference), `#N/A` (lookup / IFS / SWITCH not found), `#VALUE!` (wrong type of argument), `#ERR` (formula not understood).
- Status line: "Save failed" (storage full or blocked), "Can't insert: the last row / column has data".

## 7. Screen sizes
- One layout for all sizes: the toolbar wraps onto more lines on narrow screens and the grid scrolls with sticky headers. No phone-specific layout.
- Drag selection and column resizing are mouse-based; on touch, tap to select and use the toolbar.
- Print: toolbar, status line, selection and resize grips are hidden; cells print on white.

## 8. Safe settings (`spreadsheet_config.js`)
- `undo.limit` / `undo.mergeMs`: undo steps kept; colour-drag merge time
- `numberFormat.currency` / `numberFormat.locale`: currency symbol; grouping (`"en-US"` gives 1,234,567)
- `colWidth.auto` / `colWidth.min` / `colWidth.rowHead`: column widths in px
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
- Fixed 26 × 100 grid; insert is refused when the last row/column has data.
- Column widths aren't part of undo.
- Copy puts raw values on the system clipboard, not formatted text.
- Cut + paste doesn't update other formulas that pointed at the moved cells.
- The one-click A→Z / Z→A buttons still have no header-row detection (use Sort… for a header).
- In the hub, paste uses only the internal copy.
- Old version after an update: hard-refresh.

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
- **Conditional aggregates:** `SUMIF`, `SUMIFS`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF`. Criteria can be a value, `">10"`, `"<>x"`, or a wildcard (`*` and `?`; `~` escapes).
- **Logic:** `AND`, `OR`, `NOT`, `IFS`, `SWITCH`. The literals `TRUE` and `FALSE` are accepted in formulas (and count as 1 and 0 in arithmetic).
- **Text:** `MID`, `FIND` (case-sensitive, 1-based), `SUBSTITUTE`, `PROPER`, `TEXT` (a useful subset of formats: `0.00`, `0%`, `yyyy-mm-dd`, `dd/mm/yyyy`, …), `TEXTJOIN`.
- **Dates:** `DATE`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `DATEDIF`, `EDATE`. `DATE` / `TODAY` / `EDATE` return `YYYY-MM-DD`. Month or day overflow rolls over (`DATE(2024,13,1)` is `2025-01-01`). A number is treated as an Excel serial; dates from 1 March 1900 match Excel (the 1900 leap-year bug is not reproduced).
- **Math:** `ROUNDUP`, `ROUNDDOWN`, `MEDIAN`, `RANK`, `RAND`, `RANDBETWEEN`.
- **Hint / picker:** while a formula is being typed in a cell or the formula bar, a hint lists the current function and highlights the argument. The **fx** button opens a searchable in-app list; picking a function inserts `NAME(`.
- Title, `SHEET_VERSION` and `?v=` on this app's own css/js are SH9. Storage is still `sheet-v3` (no new saved fields).
- **Limits:** `TEXT` only covers the formats listed above (not every Excel custom format). `AVERAGEIFS` is also implemented but is not in the plan list. `RAND` / `RANDBETWEEN` change on every recalculation. Approximate lookup on an unsorted first column follows Excel and can return the wrong row. Date serials before 1 March 1900 may be a day off Excel.

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
- **Borders:** All, Outside, Inside, Top, Bottom, Left, Right, or No border, in black.
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
