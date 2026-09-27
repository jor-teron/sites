/*
 * Spreadsheet — configuration.
 * Grid size, storage keys, default cell style, colours, keys and on-screen text.
 * spreadsheet_logic.js (and, through its globals, formula.js) reads from SPREADSHEET_CONFIG.
 */
const SPREADSHEET_CONFIG = {
  // Grid
  grid: {
    cols: 26,                            // number of columns (A..Z); formula refs support A-Z only
    rows: 100,                           // number of data rows
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

  // Cell values painted with the error style (ERR from formula.js is added by the logic)
  errorValues: ["#DIV/0!"],

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
