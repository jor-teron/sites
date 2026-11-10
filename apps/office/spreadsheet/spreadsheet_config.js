/*
 * Spreadsheet — configuration.
 * Grid size, storage keys, default cell style, colours, keys and on-screen text.
 * spreadsheet_state.js (and, through its globals, the other modules) reads from SPREADSHEET_CONFIG.
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
    key: "sheet-v4",                     // current save key (workbook: sheets + charts)
    legacyKey: "sheet-v3",               // SH8–SH11 workbook, migrated (left in place)
    legacyKey1: "sheet-v2",              // older single-sheet save
    legacyKey2: "sheet-v1",              // even older save
  },

  // Workbook (SH8)
  sheets: {
    max: 20,                             // cap for add / XLSX open, keeps the Celeron light
    nameMax: 31,                         // Excel-style name length
  },

  // Default style of every cell
  defaultStyle: {
    align: "center",                     // "left" | "center" | "right"
    bold: false,
    italic: false,
    underline: false,
    bg: "",                              // cell background ("" = CSS default)
    color: "",                           // text colour ("" = CSS default)
    fontSize: "",                        // px, "" = default
    wrap: false,
    bt: "", br: "", bb: "", bl: "",     // border colours ("" = none extra)
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
    colGrip: "col-grip",
    selected: "selected",
    band: "sel-band",
    error: "error",
    toggleOn: "on",
  },

  // Undo / redo
  undo: {
    limit: 100,                          // steps kept
    mergeMs: 800,                        // colour-picker drags within this time = one step
  },

  // Number formats (display only)
  numberFormat: {
    currency: "₹",                       // symbol for the Currency format
    locale: "en-IN",                     // grouping style ("en-US" → 1,234,567; "en-IN" → 12,34,567)
  },

  // Column widths (px)
  colWidth: {
    auto: 100,                           // narrowest automatic column
    min: 30,                             // narrowest a dragged column can get
    rowHead: 40,                         // row-number column
  },

  // Numeric formula results are rounded to this many significant digits (0.1+0.2 → 0.3)
  precision: 15,

  // Cell values painted with the error style (ERR "#ERR" from spreadsheet_formula.js is added by the logic)
  errorValues: ["#DIV/0!", "#NUM!", "#REF!", "#LOOP!", "#N/A", "#VALUE!"],

  // On-screen text
  text: {
    saved: "Saved",
    saveFailed: "Save failed",
    csvLoaded: "CSV loaded",
    columnPrefix: "Column ",             // + letter, when a column header is clicked
    rowPrefix: "Row ",                   // + number, when a row number is clicked
    ready: "A–Z × 100",                  // status after start-up
    confirmClear: "Clear the workbook and start a new sheet?",
    selectAll: "All cells",
    undone: "Undo",
    redone: "Redo",
    copied: "Copied",
    cut: "Cut",
    pasted: "Pasted",
    insertFull: "Can't insert: the last row / column has data",
    sortedAsc: "Sorted A→Z",
    sortedDesc: "Sorted Z→A",
    sheetAdded: "Sheet added",
    sheetRenamed: "Sheet renamed",
    sheetDeleted: "Sheet deleted",
    sheetDuplicated: "Sheet duplicated",
    sheetMoved: "Sheet moved",
    lastSheet: "Can't delete the last sheet",
    sheetMax: "Can't add more than 20 sheets",
    frozenTop: "Top row frozen",
    frozenFirst: "First column frozen",
    frozenPanes: "Panes frozen",
    unfrozen: "Panes unfrozen",
    rowsHidden: "Rows hidden",
    colsHidden: "Columns hidden",
    unhidden: "Rows / columns unhidden",
    nothingHidden: "Nothing hidden in the selection",
    freezeAtA1: "Select a cell below or to the right of A1 to freeze panes",
  },
};
