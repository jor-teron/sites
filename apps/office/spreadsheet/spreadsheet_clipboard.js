/*
 * spreadsheet_clipboard.js
 * Copy / cut / paste of the selected block and fill down / right.
 * System clipboard gets tab-separated values (works with Excel / Google Sheets).
 * The app also keeps an internal copy with formulas + styles: pasting it back shifts
 * relative refs ($ parts stay); cut + paste moves formulas unchanged and clears the source.
 * When the browser gives no clipboard event (e.g. synthetic keys from the hub) the
 * internal copy is used.
 */
var CLIP = null;          // { text, r1, c1, rows: [[{formula, style}]], cut }
var clipEventSeen = false;

function blockText(g) {
  var lines = [], r, c, row, v;
  for (r = g.r1; r <= g.r2; r++) {
    row = [];
    for (c = g.c1; c <= g.c2; c++) {
      v = cells[r][c].value;
      v = v === undefined || v === null ? "" : String(v);
      if (/[\t\n"]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      row.push(v);
    }
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

function normText(t) { return String(t || "").replace(/\r\n?/g, "\n").replace(/\n$/, ""); }

/* Copy (cut = true for cut) the block; returns the TSV text */
function copyBlock(cut) {
  var g = selRange(), r, c, rows = [];
  for (r = g.r1; r <= g.r2; r++) {
    var row = [];
    for (c = g.c1; c <= g.c2; c++) row.push({ formula: cells[r][c].formula, style: Object.assign({}, cellStyle(r, c)) });
    rows.push(row);
  }
  CLIP = { text: blockText(g), r1: g.r1, c1: g.c1, rows: rows, cut: !!cut };
  setStatus((cut ? TXT.cut : TXT.copied) + " " + rangeLabel());
  return CLIP.text;
}

/* Paste text (from the system clipboard) or the internal copy at the block */
function pasteText(text) {
  var g = selRange(), internal = CLIP && (text == null || normText(text) === normText(CLIP.text));
  var data, r, c, i, j, h, w, tile;
  if (internal) data = CLIP.rows;
  else {
    if (!text) return;
    data = parseCsv(String(text).replace(/\r\n?/g, "\n").replace(/\n$/, ""), "\t").map(function (row) {
      return row.map(function (v) { return { formula: v, style: null }; });
    });
    if (!data.length) return;
  }
  h = data.length; w = data[0].length;
  tile = h === 1 && w === 1 && (g.r2 > g.r1 || g.c2 > g.c1);      // one cell → whole block
  undoRecord("paste");
  if (internal && CLIP.cut) {
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) {
      cells[CLIP.r1 + i][CLIP.c1 + j].formula = "";
      cells[CLIP.r1 + i][CLIP.c1 + j].style = defaultStyle();
    }
  }
  var rEnd = tile ? g.r2 : Math.min(ROWS - 1, g.r1 + h - 1);
  var cEnd = tile ? g.c2 : Math.min(COLS - 1, g.c1 + w - 1);
  for (r = g.r1; r <= rEnd; r++) {
    for (c = g.c1; c <= cEnd; c++) {
      var src = data[tile ? 0 : r - g.r1][tile ? 0 : c - g.c1] || { formula: "" };
      var f = src.formula == null ? "" : String(src.formula);
      if (internal && !CLIP.cut) f = shiftFormula(f, r - (CLIP.r1 + (tile ? 0 : r - g.r1)), c - (CLIP.c1 + (tile ? 0 : c - g.c1)));
      cells[r][c].formula = f;
      if (src.style) cells[r][c].style = Object.assign(defaultStyle(), src.style);
    }
  }
  if (internal && CLIP.cut) CLIP = null;
  extR = rEnd; extC = cEnd;
  afterChange();
  highlightSel();
  setStatus(TXT.pasted + " " + rangeLabel());
}

/* Ctrl+D (down) / Ctrl+R (right): copy the first row / column of the block over the rest */
function fillBlock(down) {
  var g = selRange(), r, c, sr, sc;
  if (down ? g.r1 === g.r2 && g.r1 === 0 : g.c1 === g.c2 && g.c1 === 0) return;
  undoRecord("fill");
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) {
      if (down) { sr = g.r1 === g.r2 ? g.r1 - 1 : g.r1; sc = c; if (r === sr) continue; }
      else { sc = g.c1 === g.c2 ? g.c1 - 1 : g.c1; sr = r; if (c === sc) continue; }
      cells[r][c].formula = shiftFormula(cells[sr][sc].formula, r - sr, c - sc);
      cells[r][c].style = Object.assign(defaultStyle(), cellStyle(sr, sc));
    }
  }
  afterChange();
}

/* Clipboard events are ours unless the user is typing in a text box */
function clipTarget() {
  var a = document.activeElement;
  if (!a || a === document.body) return true;
  if (a.tagName === "INPUT" && a.dataset.r != null) return a.readOnly;
  return !(a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
}

/* Keyboard fallback (no native clipboard event followed the key press) */
function clipKey(kind) {
  clipEventSeen = false;
  setTimeout(function () {
    if (clipEventSeen) return;
    if (kind === "v") {
      if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
        navigator.clipboard.readText().then(pasteText, function () { pasteText(null); });
      } else pasteText(null);
    } else {
      var t = copyBlock(kind === "x");
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(t).catch(function () {});
    }
  }, 0);
}

SHEET_INIT.push(function () {
  document.addEventListener("copy", function (e) {
    if (!clipTarget()) return;
    clipEventSeen = true;
    var t = copyBlock(false);
    if (e.clipboardData) { e.clipboardData.setData("text/plain", t); e.preventDefault(); }
  });
  document.addEventListener("cut", function (e) {
    if (!clipTarget()) return;
    clipEventSeen = true;
    var t = copyBlock(true);
    if (e.clipboardData) { e.clipboardData.setData("text/plain", t); e.preventDefault(); }
  });
  document.addEventListener("paste", function (e) {
    if (!clipTarget()) return;
    clipEventSeen = true;
    e.preventDefault();
    pasteText(e.clipboardData ? e.clipboardData.getData("text/plain") : null);
  });
});
