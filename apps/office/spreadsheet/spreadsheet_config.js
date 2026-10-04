/*
 * Spreadsheet — configuration.
 * Grid size, storage keys, default cell style, colours, keys and on-screen text.
 * spreadsheet_logic.js (and, through its globals, spreadsheet_formula.js) reads from SPREADSHEET_CONFIG.
 */
const SPREADSHEET_CONFIG = {
  // Grid
  grid: {
    cols: 26,                            // number of columns (A..Z, max 26); refs beyond it → #REF!
    rows: 100,                           // number of data rows; refs beyond it (e.g. A150) → #REF!
    colLetters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", // column header letters
  },

  // Starting selection
  start: {
    row: 0,                              // selected row (0-based)
    col: 0,                              // selected column (0-based)
    mode: "cell",                        // "cell" | "col" | "row"
  },

  // localStorage
  storage: {
    key: "sheet-v2",                     // current save key
    legacyKey: "sheet-v1",               // older save read if the current key is empty
  },

  // Default style of every cell
  defaultStyle: {
    align: "center",                     // "left" | "center" | "right"
    bold: false,
    italic: false,
    underline: false,
    bg: "",                              // cell background ("" = CSS default)
    color: "",                           // text colour ("" = CSS default)
  },

  // Colours / look
  colors: {
    fillPicker: "#1e1e1e",               // colour picker value when a cell has no background
    textPicker: "#e8e8e8",               // colour picker value when a cell has no text colour
  },
  boldWeight: "700",                     // font-weight used for bold cells

  // CSV export
  csv: {
    exportName: "sheet.csv",             // download file name
    mime: "text/plain;charset=utf-8",    // download MIME type
  },

  // Key bindings (KeyboardEvent.key)
  keys: {
    commit: "Enter",                     // commit and move down (cell) / commit (formula bar)
    next: "Tab",                         // commit and move right (Shift = left)
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  },

  // CSS classes used by the logic
  classes: {
    table: "sheet",
    rowHeadCol: "row-head",
    dataCol: "data",
    corner: "corner",
    colHead: "col-head",
    rowNum: "row-num",
    cell: "cell",
    fillHandle: "fill-handle",
    selected: "selected",
    band: "sel-band",
    error: "error",
    toggleOn: "on",
  },

  // Numeric formula results are rounded to this many significant digits (0.1+0.2 → 0.3)
  precision: 15,

  // Cell values painted with the error style (ERR "#ERR" from spreadsheet_formula.js is added by the logic)
  errorValues: ["#DIV/0!", "#NUM!", "#REF!", "#LOOP!"],

  // On-screen text
  text: {
    saved: "Saved",
    saveFailed: "Save failed",
    csvLoaded: "CSV loaded",
    columnPrefix: "Column ",             // + letter, when a column header is clicked
    rowPrefix: "Row ",                   // + number, when a row number is clicked
    ready: "A–Z × 100",                  // status after start-up
    confirmClear: "Clear entire sheet?",
  },
};
