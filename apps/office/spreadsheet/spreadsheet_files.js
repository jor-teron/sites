/*
 * spreadsheet_files.js
 * Files: CSV export / import of the active sheet (parser), download helper, print (active sheet; hidden rows/cols skipped).
 */

/**
 * Export formulas as CSV. Trailing empty rows and columns are left out
 * (blank cells inside the used area are kept).
 */
function exportCsv() {
  var r, c, row, f, lines = [], lastR = -1, lastC = -1;
  /* (before SH24) the scan read cells[r][c].formula for every slot.
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (f != null && String(f) !== "") {
        if (r > lastR) lastR = r;
        if (c > lastC) lastC = c;
      }
    }
  }
  */
  forEachReal(cells, function (rr, cc, cell) {
    f = cell.formula;
    if (f != null && String(f) !== "") {
      if (rr > lastR) lastR = rr;
      if (cc > lastC) lastC = cc;
    }
  });
  for (r = 0; r <= lastR; r++) {
    row = [];
    for (c = 0; c <= lastC; c++) {
      var real = realCellAt(cells, r, c);
      f = real ? real.formula : "";
      if (f == null) f = "";
      f = String(f);
      if (/[",\n]/.test(f)) f = '"' + f.replace(/"/g, '""') + '"';
      row.push(f);
    }
    lines.push(row.join(","));
  }
  var name = (workbook && workbook.sheets[workbook.active] && workbook.sheets[workbook.active].name) || "sheet";
  name = String(name).replace(/[\\\/:*?"<>|]/g, "_") + ".csv";
  downloadText(name || CFG.csv.exportName, lines.join("\n"));
}

/**
 * Trigger file download
 */
function downloadText(name, text) {
  var blob = new Blob([text], { type: CFG.csv.mime });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import CSV (undoable)
 */
function importCsvText(text) {
  var rows = parseCsv(text);
  var r, c;
  undoRecord("import");
  emptyGrid();
  for (r = 0; r < Math.min(ROWS, rows.length); r++) {
    for (c = 0; c < Math.min(COLS, rows[r].length); c++) {
      cells[r][c].formula = rows[r][c];
    }
  }
  afterChange();
  setStatus(TXT.csvLoaded);
}

/**
 * Minimal CSV / TSV parser (sep defaults to ",")
 */
function parseCsv(text, sep) {
  var rows = [];
  var row = [];
  var cur = "";
  var i, ch, inQ = false;
  sep = sep || ",";
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (inQ) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"' && cur === "") inQ = true;
      else if (ch === sep) {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else cur += ch;
    }
  }
  row.push(cur);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/**
 * Print via browser dialog (Save as PDF there)
 */
function printSheet() {
  window.print();
}
