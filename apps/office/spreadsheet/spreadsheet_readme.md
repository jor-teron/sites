# Spreadsheet

## 1. What it is
A small offline spreadsheet: 26 columns (A–Z) × 100 rows, formulas, styles, CSV import/export and print. Plain JavaScript, no internet needed, works from `file://`.

**Name note:** "Sheetly" is a possible future name, considered to match Draftly and Notely. For now the app is still called Spreadsheet and the folder and file names are unchanged.

## 2. Files
- `spreadsheet.html` / `spreadsheet.css`: layout, toolbar, look, print
- `spreadsheet_config.js`: settings and on-screen text
- `spreadsheet_formula.js`: formula engine (no `eval`), `$` refs, ref shifting and adjusting
- `spreadsheet_logic.js`: grid, editing, selection, styles, save/load, CSV, autofill handle, start-up
- `spreadsheet_format.js`: number formats
- `spreadsheet_undo.js`: undo / redo
- `spreadsheet_select.js`: block selection (drag, Shift+click, Shift+arrows, select all)
- `spreadsheet_clipboard.js`: copy / cut / paste, fill down / right
- `spreadsheet_rows.js`: insert / delete rows and columns
- `spreadsheet_sort.js`: sort
- `spreadsheet_resize.js`: column widths
- `spreadsheet_keys.js`: Ctrl/Cmd shortcuts
- `FUNCTIONS.txt`: list of formulas and shortcuts (opened by the Functions button)
- `spreadsheet_icon.png`: hub icon
- `index.html`: opens `spreadsheet.html`

## 3. Behaviour rules
- **Cells:** a click selects. Typing replaces the text; F2 or double-click edits and keeps it. Enter commits and moves down, Tab moves right (Shift+Tab left). Esc cancels the edit.
- **Formulas:** start with `=`. Only cells that depend on a change are recalculated. Numeric results are rounded to 15 significant digits (`0.1+0.2` → 0.3).
- **`$` refs:** `$A$1`, `A$1`, `$A1` stay fixed when copied or filled; other parts shift.
- **Selection:** drag, Shift+click or Shift+arrows select a block. Clicking a column letter or row number selects it; the corner selects all. Delete / Backspace clears the block (styles stay).
- **Undo / redo:** ↶ ↷ buttons or keys. Covers edits, paste, cut, fill, clear, styles, formats, insert/delete, sort and CSV import. Last 100 steps; colour-picker drags within 0.8 s count as one step.
- **Copy / paste:**
  - Copy puts tab-separated values on the system clipboard, so it pastes into Excel or Google Sheets.
  - Pasting the app's own copy brings formulas and styles and shifts relative refs.
  - Cut + paste moves the cells and clears the source.
  - One copied cell pasted over a block fills the whole block.
  - Text from other apps (tab-separated) goes in as typed text, starting at the active cell.
- **Fill:** Ctrl+D copies the top row of the block down; Ctrl+R copies the left column right. The small handle on the active cell drags to autofill.
- **Insert / delete:** + Row / − Row / + Col / − Col act on the selected rows or columns. Formula refs are adjusted, ranges grow or shrink, refs to deleted cells become `#REF!`. The grid stays 26 × 100, so insert is refused when the last row/column has data.
- **Sort:** Sort A→Z / Z→A sorts the selected block by the active cell's column; with one cell selected, the used area is sorted. Numbers come first, then text (A–Z, case ignored), blanks last. Whole rows move together. There is no header-row detection.
- **Number formats** (display only; the stored value is unchanged): General, 0, 0.00, 1,000, %, ₹ Currency. Grouping follows `en-IN` (12,34,567). Text and errors show as they are.
- **Column widths:** drag the right edge of a column letter; double-click it to reset. Widths are saved.
- **Styles:** align, bold, italic, underline, fill colour, text colour for the selection.
- **CSV:** Export CSV downloads `sheet.csv` (values, trailing empty rows/columns trimmed). Import CSV loads a file starting at A1.
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
- While typing in a cell or the formula bar, the browser's own text shortcuts apply.

Works inside the hub and responds to its phone D-pad, but the hub's key presses are synthetic: only shortcuts the app handles itself work (arrows move, Start = Enter, Select = Esc); browser actions such as the system clipboard don't, so a hub paste uses the app's internal copy.

## 5. Saved data
localStorage key `sheet-v2` (cells, styles, formats, column widths). An older `sheet-v1` save is read if `sheet-v2` is empty, and older `sheet-v2` saves without widths or formats still load. To reset, use Clear (asks first; can be undone) or delete the key / clear site data.

## 6. Errors
- In cells: `#DIV/0!` (divide by 0), `#NUM!` (too large / not a number), `#REF!` (outside the sheet or a deleted cell), `#LOOP!` (circular reference), `#ERR` (formula not understood).
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
- Sort has no header-row detection (select below the header).
- In the hub, paste uses only the internal copy.
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-04 (IST): undo/redo, block select, clipboard, fill, `$` refs, insert/delete, column resize, sort, number formats, this readme (this commit).
- 2026-10-04 22:06 IST: dependency recalc, `#LOOP!`, rounding, correct errors, `#REF!` limits, trimmed CSV, icon (commit b6eb70d).
- 2026-10-02 19:01 IST: moved to `apps/office/spreadsheet/` (commit 8cb4c69, folder rearrange).

## 12. Related apps
- Draftly: documents. Notely: notes. ("Sheetly" would match them; see the name note above.)
