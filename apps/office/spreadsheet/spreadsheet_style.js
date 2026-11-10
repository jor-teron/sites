/*
 * spreadsheet_style.js  (SH11)
 * Merge cells, borders, font size, wrap, conditional formatting, format painter.
 * Pure helpers at the top (Node tests). UI uses in-app panels only.
 */

function styleClone(st) {
  var o = defaultStyle(), k;
  st = st || {};
  for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) o[k] = st[k];
  return o;
}

function styleDefaultBorders() {
  return { bt: "", br: "", bb: "", bl: "" };
}

/** Merge that contains (r,c), or null. */
function styleMergeAt(merges, r, c) {
  var i, m;
  if (!merges) return null;
  for (i = 0; i < merges.length; i++) {
    m = merges[i];
    if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m;
  }
  return null;
}

function styleMergesOverlap(merges, g) {
  var i, m;
  for (i = 0; i < (merges || []).length; i++) {
    m = merges[i];
    if (!(m.r2 < g.r1 || m.r1 > g.r2 || m.c2 < g.c1 || m.c1 > g.c2)) return true;
  }
  return false;
}

function styleAddMerge(merges, g) {
  var out = (merges || []).filter(function (m) {
    return m.r2 < g.r1 || m.r1 > g.r2 || m.c2 < g.c1 || m.c1 > g.c2;
  });
  if (g.r1 !== g.r2 || g.c1 !== g.c2) out.push({ r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2 });
  return out;
}

function styleRemoveMergeAt(merges, r, c) {
  return (merges || []).filter(function (m) {
    return !(r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
  });
}

function styleHexToRgb(hex) {
  var h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function styleRgbToHex(r, g, b) {
  function p(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16); }
  return "#" + p(r) + p(g) + p(b);
}

function styleMix(a, b, t) {
  var A = styleHexToRgb(a), B = styleHexToRgb(b);
  if (t < 0) t = 0; if (t > 1) t = 1;
  return styleRgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

/**
 * Colour-scale shade. colors is 2 or 3 hex colours (low, [mid], high).
 * Returns null if val is not a number or the range has no spread.
 */
function styleScaleColor(val, min, max, colors) {
  if (typeof val !== "number" || !isFinite(val) || min == null || max == null) return null;
  if (min === max) return colors[Math.floor((colors.length - 1) / 2)] || colors[0];
  var t = (val - min) / (max - min);
  if (t < 0) t = 0; if (t > 1) t = 1;
  if (colors.length < 3) return styleMix(colors[0], colors[1] || colors[0], t);
  if (t <= 0.5) return styleMix(colors[0], colors[1], t * 2);
  return styleMix(colors[1], colors[2], (t - 0.5) * 2);
}

function styleNumeric(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v === "" || v == null) return null;
  var n = Number(v);
  return (String(v).trim() !== "" && !isNaN(n) && isFinite(n)) ? n : null;
}

/**
 * Min / max of numeric values in a range, using a getter get(r,c) → value.
 */
function styleRangeMinMax(g, get) {
  var r, c, n, min = null, max = null;
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) {
      n = styleNumeric(get(r, c));
      if (n == null) continue;
      if (min == null || n < min) min = n;
      if (max == null || n > max) max = n;
    }
  }
  return { min: min, max: max };
}

/**
 * Conditional format result for one cell: { bg, color } or null.
 * rules: [{ r1,c1,r2,c2, type, value, fill, colors }]
 * stats is an optional cache of { i: {min,max} } filled as we go.
 */
function styleCondLook(rules, r, c, get, stats) {
  var i, rule, n, bg, mm, colors, fill;
  if (!rules || !rules.length) return null;
  n = styleNumeric(get(r, c));
  for (i = 0; i < rules.length; i++) {
    rule = rules[i];
    if (r < rule.r1 || r > rule.r2 || c < rule.c1 || c > rule.c2) continue;
    if (rule.type === "scale") {
      if (n == null) continue;
      if (!stats) stats = {};
      if (!stats[i]) stats[i] = styleRangeMinMax(rule, get);
      mm = stats[i];
      colors = rule.colors && rule.colors.length ? rule.colors : ["#f8696b", "#ffeb84", "#63be7b"];
      bg = styleScaleColor(n, mm.min, mm.max, colors);
      if (bg) return { bg: bg, color: null };
    } else if (rule.type === "above" || rule.type === "below") {
      if (n == null) continue;
      if (rule.type === "above" && !(n > Number(rule.value))) continue;
      if (rule.type === "below" && !(n < Number(rule.value))) continue;
      fill = rule.fill || (rule.type === "above" ? "#c6efce" : "#ffc7ce");
      return { bg: fill, color: rule.color || (rule.type === "above" ? "#006100" : "#9c0006") };
    }
  }
  return null;
}

function styleBorderCss(color) {
  if (!color) return "";
  return "1px solid " + color;
}

/* ---------- workbook / UI ---------- */

var STYLE_PAINTER = { on: false, sticky: false, style: null };

function styleSheetMerges() {
  var s = workbook.sheets[workbook.active];
  if (!s.merges) s.merges = [];
  return s.merges;
}

function applyMerges() {
  var table = document.querySelector("table." + CLS.table), r, c, td, m, rs, cs, i;
  if (!table) return;
  for (r = 0; r < ROWS; r++) {
    if (!table.rows[r + 1]) continue;
    for (c = 0; c < COLS; c++) {
      td = table.rows[r + 1].cells[c + 1];
      if (!td) continue;
      td.removeAttribute("rowspan");
      td.removeAttribute("colspan");
      td.classList.remove("merged", "merge-hidden");
      td.style.display = "";
    }
  }
  var merges = styleSheetMerges();
  for (i = 0; i < merges.length; i++) {
    m = merges[i];
    if (!table.rows[m.r1 + 1]) continue;
    td = table.rows[m.r1 + 1].cells[m.c1 + 1];
    if (!td) continue;
    rs = m.r2 - m.r1 + 1;
    cs = m.c2 - m.c1 + 1;
    if (rs > 1) td.rowSpan = rs;
    if (cs > 1) td.colSpan = cs;
    td.classList.add("merged");
    for (r = m.r1; r <= m.r2; r++) {
      for (c = m.c1; c <= m.c2; c++) {
        if (r === m.r1 && c === m.c1) continue;
        if (!table.rows[r + 1]) continue;
        td = table.rows[r + 1].cells[c + 1];
        if (!td) continue;
        td.classList.add("merge-hidden");
        td.style.display = "none";
      }
    }
  }
}

function mergeSelection() {
  var g = selRange(), s = workbook.sheets[workbook.active], r, c;
  if (g.r1 === g.r2 && g.c1 === g.c2) { setStatus("Select more than one cell to merge"); return; }
  undoRecord("merge");
  if (!s.merges) s.merges = [];
  /* Keep the top-left cell; clear the others. */
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) {
      if (r === g.r1 && c === g.c1) continue;
      cells[r][c].formula = "";
      cells[r][c].value = "";
    }
  }
  s.merges = styleAddMerge(s.merges, g);
  afterChange();
  if (typeof applyMerges === "function") applyMerges();
  setStatus("Cells merged");
}

function unmergeSelection() {
  var g = selRange(), s = workbook.sheets[workbook.active], r, c, next, any = false;
  if (!s.merges || !s.merges.length) return;
  undoRecord("unmerge");
  next = s.merges.slice();
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) {
      if (styleMergeAt(next, r, c)) { next = styleRemoveMergeAt(next, r, c); any = true; }
    }
  }
  s.merges = next;
  afterChange();
  applyMerges();
  setStatus(any ? "Cells unmerged" : "No merged cells in the selection");
}

function applyBorders(mode, color) {
  var g = selRange(), col = color || "#000000";
  undoRecord("border");
  forSelection(function (r, c) {
    var st = cellStyle(r, c);
    function set(side, on) { st[side] = on ? col : ""; }
    if (mode === "none") { set("bt", 0); set("br", 0); set("bb", 0); set("bl", 0); }
    else if (mode === "all") { set("bt", 1); set("br", 1); set("bb", 1); set("bl", 1); }
    else if (mode === "outside") {
      set("bt", r === g.r1); set("bb", r === g.r2); set("bl", c === g.c1); set("br", c === g.c2);
    } else if (mode === "inside") {
      if (r !== g.r1) set("bt", 1);
      if (r !== g.r2) set("bb", 1);
      if (c !== g.c1) set("bl", 1);
      if (c !== g.c2) set("br", 1);
    } else if (mode === "top") set("bt", 1);
    else if (mode === "bottom") set("bb", 1);
    else if (mode === "left") set("bl", 1);
    else if (mode === "right") set("br", 1);
  });
  paintAll();
  saveStore();
}

function styleApplyLook(td, inp, st, r, c) {
  var face, editing, cf, get;
  inp.style.fontSize = st.fontSize ? (st.fontSize + "px") : "";
  td.style.borderTop = styleBorderCss(st.bt);
  td.style.borderRight = styleBorderCss(st.br);
  td.style.borderBottom = styleBorderCss(st.bb);
  td.style.borderLeft = styleBorderCss(st.bl);
  td.classList.toggle("wrap", !!st.wrap);
  editing = document.activeElement === inp && !inp.readOnly;
  face = td.querySelector(".cell-face");
  if (st.wrap) {
    if (!face) {
      face = document.createElement("div");
      face.className = "cell-face";
      td.insertBefore(face, inp);
    }
    face.hidden = !!editing;
    inp.classList.toggle("wrap-edit", !!editing);
    if (!editing) face.textContent = inp.value;
  } else if (face) {
    face.remove();
    inp.classList.remove("wrap-edit");
  }
  if (typeof styleCondLook === "function") {
    get = function (rr, cc) { return cells[rr][cc].value; };
    cf = styleCondLook(workbook.sheets[workbook.active].condFormats, r, c, get, STYLE_CF_STATS);
    if (cf && cf.bg) td.style.background = cf.bg;
    if (cf && cf.color) inp.style.color = cf.color;
    if (cf && cf.bg && face) face.style.background = cf.bg;
    if (cf && cf.color && face) face.style.color = cf.color;
  }
}

var STYLE_CF_STATS = {};

function stylePainterArm(sticky) {
  STYLE_PAINTER.on = true;
  STYLE_PAINTER.sticky = !!sticky;
  STYLE_PAINTER.style = styleClone(cellStyle(selR, selC));
  var b = document.getElementById("btn-painter");
  if (b) b.classList.add(CLS.toggleOn);
  setStatus(sticky ? "Format painter (click cells, Esc to stop)" : "Format painter (click a cell or drag a block)");
}

function stylePainterOff() {
  STYLE_PAINTER.on = false;
  STYLE_PAINTER.sticky = false;
  STYLE_PAINTER.style = null;
  var b = document.getElementById("btn-painter");
  if (b) b.classList.remove(CLS.toggleOn);
}

function stylePainterApply() {
  var src = STYLE_PAINTER.style, sticky;
  if (!STYLE_PAINTER.on || !src) return;
  sticky = STYLE_PAINTER.sticky;
  undoRecord("painter");
  forSelection(function (r, c) {
    var st = cellStyle(r, c), k;
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k) && k !== "merge") st[k] = src[k];
  });
  paintAll();
  syncStyleUi();
  saveStore();
  if (!sticky) stylePainterOff();
  else setStatus("Format painter (click cells, Esc to stop)");
}

function styleOpenCf() {
  var box = document.getElementById("style-cf"), html, s, i, rule, g;
  if (!box) return;
  s = workbook.sheets[workbook.active];
  if (!s.condFormats) s.condFormats = [];
  g = selRange();
  html = "<div class=\"fx-picker-head\"><strong>Conditional formatting</strong>" +
    "<button type=\"button\" class=\"fx-picker-close\" data-cf-close=\"1\" aria-label=\"Close\">×</button></div>";
  html += "<p class=\"fx-help\">Applies to " + rangeLabel() + ". Colour scales shade by value in the range. Above / below highlight numbers against a value.</p>";
  html += "<div class=\"data-actions\">" +
    "<button type=\"button\" data-cf-add=\"ryg\">Red–yellow–green scale</button>" +
    "<button type=\"button\" data-cf-add=\"green\">White–green scale</button>" +
    "<button type=\"button\" data-cf-add=\"above\">Highlight above…</button>" +
    "<button type=\"button\" data-cf-add=\"below\">Highlight below…</button>" +
    "</div>";
  if (s.condFormats.length) {
    html += "<div class=\"fx-help\">Rules on this sheet</div>";
    for (i = 0; i < s.condFormats.length; i++) {
      rule = s.condFormats[i];
      html += "<div class=\"data-sort-row\"><span>" + styleCfLabel(rule) + "</span>" +
        "<button type=\"button\" data-cf-del=\"" + i + "\">Remove</button></div>";
    }
  }
  box.innerHTML = html;
  box.hidden = false;
  box.style.left = "80px";
  box.style.top = "120px";
  box.onclick = function (ev) {
    var add = ev.target.getAttribute && ev.target.getAttribute("data-cf-add");
    var del = ev.target.getAttribute && ev.target.getAttribute("data-cf-del");
    if (ev.target.closest("[data-cf-close]")) { box.hidden = true; return; }
    if (del != null) { styleRemoveCf(+del); styleOpenCf(); return; }
    if (add === "ryg") styleAddCf({ type: "scale", colors: ["#f8696b", "#ffeb84", "#63be7b"] });
    else if (add === "green") styleAddCf({ type: "scale", colors: ["#ffffff", "#63be7b"] });
    else if (add === "above" || add === "below") {
      if (typeof OfficeDialog !== "undefined" && OfficeDialog.prompt) {
        OfficeDialog.prompt({ title: "Highlight cells " + add, label: "Value", value: "0", okLabel: "Add" }).then(function (v) {
          if (v == null || v === "") return;
          styleAddCf({ type: add, value: Number(v), fill: add === "above" ? "#c6efce" : "#ffc7ce", color: add === "above" ? "#006100" : "#9c0006" });
          styleOpenCf();
        });
        return;
      }
    }
    if (add) styleOpenCf();
  };
}

function styleCfLabel(rule) {
  var a = colLetter(rule.c1) + (rule.r1 + 1) + ":" + colLetter(rule.c2) + (rule.r2 + 1);
  if (rule.type === "scale") return "Colour scale " + a;
  if (rule.type === "above") return "Above " + rule.value + " " + a;
  if (rule.type === "below") return "Below " + rule.value + " " + a;
  return a;
}

function styleAddCf(partial) {
  var g = selRange(), s = workbook.sheets[workbook.active], rule;
  if ((s.condFormats || []).length >= 20) { setStatus("At most 20 rules on a sheet"); return; }
  undoRecord("cf");
  if (!s.condFormats) s.condFormats = [];
  rule = Object.assign({ r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2 }, partial);
  s.condFormats.push(rule);
  paintAll();
  saveStore();
  setStatus("Rule added");
}

function styleRemoveCf(i) {
  var s = workbook.sheets[workbook.active];
  undoRecord("cf");
  s.condFormats.splice(i, 1);
  paintAll();
  saveStore();
}

function initStyleTools() {
  var bd, fs, i, sizes = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
  onBtn("btn-merge", mergeSelection);
  onBtn("btn-unmerge", unmergeSelection);
  onBtn("btn-wrap", function () {
    var on = !cellStyle(selR, selC).wrap;
    styleSelection("wrap", function (st) { st.wrap = on; });
  });
  onBtn("btn-painter", function (ev) {
    if (STYLE_PAINTER.on && !STYLE_PAINTER.sticky) { stylePainterOff(); return; }
    stylePainterArm(ev.detail === 2);
  });
  onBtn("btn-cf", styleOpenCf);
  bd = document.getElementById("bd-sel");
  if (bd) bd.addEventListener("change", function () {
    if (!bd.value) return;
    applyBorders(bd.value, "#000000");
    bd.value = "";
  });
  fs = document.getElementById("font-size-sel");
  if (fs) {
    if (!fs.options.length) {
      for (i = 0; i < sizes.length; i++) {
        var o = document.createElement("option");
        o.value = String(sizes[i]);
        o.textContent = String(sizes[i]);
        if (sizes[i] === 13) o.selected = true;
        fs.appendChild(o);
      }
    }
    fs.addEventListener("change", function () {
      var n = parseInt(fs.value, 10);
      styleSelection("font-size", function (st) { st.fontSize = n; });
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && STYLE_PAINTER.on) { ev.preventDefault(); stylePainterOff(); setStatus("Format painter off"); }
  });
  /* After a selection is finished, apply the copied style once. */
  if (typeof highlightSel === "function" && !highlightSel._styleWrap) {
    var _hi = highlightSel;
    highlightSel = function () {
      _hi.apply(this, arguments);
      var fsEl = document.getElementById("font-size-sel");
      var st = cellStyle(selR, selC);
      if (fsEl && st.fontSize) fsEl.value = String(st.fontSize);
      else if (fsEl) fsEl.value = "13";
      var w = document.getElementById("btn-wrap");
      if (w) w.classList.toggle(CLS.toggleOn, !!st.wrap);
    };
    highlightSel._styleWrap = true;
  }
  var wrap = document.getElementById("sheet-wrap");
  if (wrap && !wrap._stylePainter) {
    wrap._stylePainter = true;
    wrap.addEventListener("mouseup", function (ev) {
      if (!STYLE_PAINTER.on) return;
      if (ev.target && ev.target.closest && ev.target.closest("td." + CLS.cell)) stylePainterApply();
    });
  }
  applyMerges();
}

SHEET_INIT.push(initStyleTools);
