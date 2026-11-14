/*
 * spreadsheet_data.js  (SH10)
 * Data tools: find and replace, header-row filters, multi-column sort with
 * a header option, list validation, remove duplicates. Helpers are pure so
 * the Node tests can run them without a DOM. UI uses in-app panels only.
 */
function dataNorm(v) {
  return v == null ? "" : String(v);
}

function dataContains(hay, needle, matchCase) {
  if (needle === "") return false;
  if (!matchCase) { hay = hay.toLowerCase(); needle = needle.toLowerCase(); }
  return hay.indexOf(needle) >= 0;
}

function dataReplaceOne(text, needle, replacement, matchCase) {
  text = String(text == null ? "" : text);
  needle = String(needle == null ? "" : needle);
  replacement = String(replacement == null ? "" : replacement);
  if (!needle) return text;
  if (matchCase) return text.split(needle).join(replacement);
  var out = "", i = 0, low = text.toLowerCase(), n = needle.toLowerCase(), p;
  while ((p = low.indexOf(n, i)) >= 0) {
    out += text.slice(i, p) + replacement;
    i = p + needle.length;
  }
  return out + text.slice(i);
}

function dataCellSearchText(cell, which) {
  if (!cell) return "";
  if (which === "formula") return dataNorm(cell.formula);
  return dataNorm(cell.value);
}

/**
 * Find cells. sheets is [{cells, name}, ...].
 * opts: { query, matchCase, scopeSi }  scopeSi = number for one sheet, null for all.
 * Returns [{ si, r, c, inFormula, inValue }].
 */
function dataFindMatches(sheets, opts) {
  var q = dataNorm(opts && opts.query), matchCase = !!(opts && opts.matchCase);
  var si, r, c, cell, inF, inV, out = [], start = 0, end, i;
  if (!q || !sheets || !sheets.length) return out;
  end = sheets.length;
  if (opts && opts.scopeSi != null) { start = opts.scopeSi; end = start + 1; }
  for (si = start; si < end; si++) {
    if (!sheets[si] || !sheets[si].cells) continue;
    for (r = 0; r < sheets[si].cells.length; r++) {
      var store = typeof rowStore === "function" ? rowStore(sheets[si].cells[r]) : sheets[si].cells[r];
      if (!store || store._n === 0) continue;
      for (c = 0; c < store.length; c++) {
        cell = store[c];
        if (!cell || cell._empty) continue;
        inF = dataContains(dataCellSearchText(cell, "formula"), q, matchCase);
        inV = dataContains(dataCellSearchText(cell, "value"), q, matchCase);
        if (inF || inV) out.push({ si: si, r: r, c: c, inFormula: inF, inValue: inV });
      }
    }
  }
  return out;
}

function dataNextMatch(matches, si, r, c) {
  var i, m;
  if (!matches || !matches.length) return -1;
  for (i = 0; i < matches.length; i++) {
    m = matches[i];
    if (m.si > si || (m.si === si && (m.r > r || (m.r === r && m.c > c)))) return i;
  }
  return 0;
}

/**
 * Replace query in stored formula text only (not in a calculated value).
 * Returns the number of cells changed.
 */
function dataReplaceAll(sheets, opts) {
  var matches = dataFindMatches(sheets, opts), i, m, cell, next, n = 0;
  var q = dataNorm(opts && opts.query), rep = dataNorm(opts && opts.replacement);
  var matchCase = !!(opts && opts.matchCase);
  if (!q) return 0;
  for (i = 0; i < matches.length; i++) {
    m = matches[i];
    if (!m.inFormula) continue;
    cell = sheets[m.si].cells[m.r][m.c];
    next = dataReplaceOne(cell.formula, q, rep, matchCase);
    if (next !== cell.formula) { cell.formula = next; n++; }
  }
  return n;
}

function dataKeysEqual(a, b) {
  if (a.length !== b.length) return false;
  var i;
  for (i = 0; i < a.length; i++) {
    if (dataNorm(a[i]).toLowerCase() !== dataNorm(b[i]).toLowerCase()) return false;
  }
  return true;
}

/**
 * keep[i] is true for the first row with that key combination (and for a header if hasHeader).
 * rows is an array of key-arrays (already extracted).
 */
function dataUniqueKeep(rows, hasHeader) {
  var keep = [], seen = [], i, k, s, found;
  for (i = 0; i < rows.length; i++) {
    if (hasHeader && i === 0) { keep[i] = true; continue; }
    found = false;
    for (k = 0; k < seen.length; k++) {
      if (dataKeysEqual(seen[k], rows[i])) { found = true; break; }
    }
    if (found) keep[i] = false;
    else { keep[i] = true; seen.push(rows[i]); }
  }
  return keep;
}

function dataSortKey(v) {
  if (v === "" || v == null) return { t: 2 };
  if (typeof v === "number") return { t: 0, n: v };
  var s = String(v), n = Number(s);
  if (s.trim() !== "" && !isNaN(n)) return { t: 0, n: n };
  return { t: 1, s: s.toLowerCase() };
}

/**
 * Sort index order for a block of row-key objects.
 * specs: [{ values:[...per row], desc: boolean }]
 * hasHeader: first index stays first.
 */
function dataSortOrder(n, specs, hasHeader) {
  var idx = [], i, start = hasHeader ? 1 : 0;
  for (i = 0; i < n; i++) idx.push(i);
  var body = idx.slice(start);
  body.sort(function (a, b) {
    var s, va, vb, d;
    for (s = 0; s < specs.length; s++) {
      va = dataSortKey(specs[s].values[a]);
      vb = dataSortKey(specs[s].values[b]);
      if (va.t !== vb.t) d = va.t - vb.t;
      else if (va.t === 2) d = 0;
      else if (va.t === 0) d = va.n - vb.n;
      else d = va.s < vb.s ? -1 : (va.s > vb.s ? 1 : 0);
      if (d) return specs[s].desc ? -d : d;
    }
    return a - b;
  });
  return hasHeader ? [0].concat(body) : body;
}

/**
 * Parse a validation source: a range token, or a comma-separated list.
 * Returns { range: token } or { items: [..] }.
 */
function dataParseListSource(source) {
  var s = dataNorm(source).trim();
  if (!s) return { items: [] };
  if (typeof parseRefToken === "function") {
    var p = parseRefToken(s);
    if (p && !p.error && p.list && p.list.length) return { range: s };
  } else if (/^[A-Za-z]+[0-9]+:[A-Za-z]+[0-9]+$/.test(s) || /^[A-Za-z_].*![A-Za-z]+[0-9]/.test(s)) {
    return { range: s };
  }
  return { items: s.split(",").map(function (x) { return x.replace(/^\s+|\s+$/g, ""); }).filter(function (x) { return x !== ""; }) };
}

function dataListValues(source, rangeVals) {
  var p = dataParseListSource(source);
  if (p.range) return (rangeVals && rangeVals(p.range)) || [];
  return p.items || [];
}

function dataInList(value, list) {
  var i, v = dataNorm(value);
  for (i = 0; i < list.length; i++) {
    if (dataNorm(list[i]).toLowerCase() === v.toLowerCase()) return true;
    if (v !== "" && !isNaN(Number(v)) && !isNaN(Number(list[i])) && Number(v) === Number(list[i])) return true;
  }
  return false;
}

/**
 * Does data-row values pass the column filters?
 * filters: { "0": { blanks: true|false, values: [..] or null for all listed } }
 * A missing column key means no restriction on that column.
 * values: array indexed by column-offset (0 = first col of the range).
 */
function dataRowPasses(values, filters) {
  var c, f, v, i, ok;
  if (!filters) return true;
  for (c in filters) {
    if (!Object.prototype.hasOwnProperty.call(filters, c)) continue;
    f = filters[c];
    if (!f) continue;
    v = values[+c];
    if (v == null || v === "") {
      if (!f.blanks) return false;
      continue;
    }
    if (f.values == null) continue;
    ok = false;
    for (i = 0; i < f.values.length; i++) {
      if (dataNorm(f.values[i]).toLowerCase() === dataNorm(v).toLowerCase()) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

/* ---------- workbook hooks (use the live grid when present) ---------- */

function emptyFilters() {
  return { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} };
}

function cloneFilters(f) {
  return f ? JSON.parse(JSON.stringify(f)) : emptyFilters();
}

function cloneValidations(v) {
  return Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : [];
}

function applyFilters(si) {
  var s = workbook.sheets[si == null ? workbook.active : si];
  var r, c, values, f, off;
  if (!s.filterHidden) s.filterHidden = flags(ROWS);
  for (r = 0; r < ROWS; r++) s.filterHidden[r] = false;
  f = s.filters;
  if (!f || !f.on) return;
  for (r = f.r1 + 1; r <= f.r2; r++) {
    values = [];
    for (c = f.c1; c <= f.c2; c++) {
      values[c - f.c1] = s.cells[r][c].value;
    }
    if (!dataRowPasses(values, f.cols)) s.filterHidden[r] = true;
  }
}

function dataUsedOrSel() {
  var g = selRange();
  if (g.r1 === g.r2 && g.c1 === g.c2) {
    g = typeof usedArea === "function" ? usedArea() : null;
    if (!g) g = { r1: 0, r2: 0, c1: 0, c2: 0 };
  }
  return g;
}

function dataLiveSheets() {
  return workbook.sheets;
}

function dataValidationAt(r, c, si) {
  var s = workbook.sheets[si == null ? workbook.active : si], i, v;
  if (!s || !s.validations) return null;
  for (i = 0; i < s.validations.length; i++) {
    v = s.validations[i];
    if (r >= v.r1 && r <= v.r2 && c >= v.c1 && c <= v.c2) return v;
  }
  return null;
}

function dataSourceValues(source) {
  return dataListValues(source, function (token) {
    var list = null;
    try { list = rangeValues(token, false); } catch (e) { list = []; }
    return (list || []).filter(function (v) { return v !== "" && v != null; });
  });
}

/* ---------- UI ---------- */

var DATA_UI = { find: null, sort: null, filter: null, valid: null, matches: [], last: -1 };

function dataClosePanels(except) {
  ["data-find", "data-sort", "data-filter", "data-valid", "data-dups"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && id !== except) el.hidden = true;
  });
  if (DATA_UI.filter && except !== "data-filter") DATA_UI.filter.hidden = true;
}

function dataOpenFind() {
  var box = document.getElementById("data-find");
  if (!box) return;
  dataClosePanels("data-find");
  box.hidden = false;
  var q = document.getElementById("data-find-q");
  if (q) { q.focus(); q.select(); }
}

function dataGoto(m) {
  if (m.si !== workbook.active) switchSheet(m.si);
  selR = extR = m.r; selC = extC = m.c; selMode = "cell";
  highlightSel();
  if (typeof focusCell === "function") {
    /* don't enter edit */
    var inp = inpGrid[m.r] && inpGrid[m.r][m.c];
    if (inp) {
      try { inp.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
    }
  }
}

function dataRefreshMatches() {
  var q = document.getElementById("data-find-q");
  var cse = document.getElementById("data-find-case");
  var scope = document.querySelector('input[name="data-find-scope"]:checked');
  var opts = {
    query: q ? q.value : "",
    matchCase: !!(cse && cse.checked),
    scopeSi: (scope && scope.value === "book") ? null : workbook.active
  };
  DATA_UI.matches = dataFindMatches(dataLiveSheets(), opts);
  DATA_UI.opts = opts;
  return DATA_UI.matches;
}

function dataFindNext() {
  var matches = dataRefreshMatches(), i;
  if (!matches.length) { setStatus("No matches"); return; }
  i = dataNextMatch(matches, workbook.active, selR, selC);
  DATA_UI.last = i;
  dataGoto(matches[i]);
  setStatus("Match " + (i + 1) + " of " + matches.length);
}

function dataReplaceOneUi() {
  var matches = dataRefreshMatches(), i, m, cell, next, rep, qel;
  if (!matches.length) { setStatus("No matches"); return; }
  i = DATA_UI.last;
  if (i < 0 || !matches[i] || matches[i].si !== workbook.active || matches[i].r !== selR || matches[i].c !== selC) {
    i = dataNextMatch(matches, workbook.active, selR === 0 && selC === 0 ? -1 : selR, selC);
    /* If we are already on a match, use that; else find next. */
    var on = -1, k;
    for (k = 0; k < matches.length; k++) {
      if (matches[k].si === workbook.active && matches[k].r === selR && matches[k].c === selC) { on = k; break; }
    }
    i = on >= 0 ? on : dataNextMatch(matches, workbook.active, selR, selC);
    dataGoto(matches[i]);
    if (on < 0) { setStatus("Match " + (i + 1) + " of " + matches.length); return; }
  }
  m = matches[i];
  if (!m.inFormula) { setStatus("This match is a formula result — edit the formula to change it"); return; }
  qel = document.getElementById("data-find-q");
  rep = document.getElementById("data-find-r");
  undoRecord("replace");
  cell = workbook.sheets[m.si].cells[m.r][m.c];
  next = dataReplaceOne(cell.formula, qel ? qel.value : "", rep ? rep.value : "", DATA_UI.opts && DATA_UI.opts.matchCase);
  cell.formula = next;
  afterChange();
  dataFindNext();
}

function dataReplaceAllUi() {
  var n;
  dataRefreshMatches();
  if (!DATA_UI.opts || !DATA_UI.opts.query) { setStatus("Enter text to find"); return; }
  undoRecord("replace-all");
  n = dataReplaceAll(dataLiveSheets(), Object.assign({ replacement: (document.getElementById("data-find-r") || {}).value || "" }, DATA_UI.opts));
  afterChange();
  setStatus(n ? ("Replaced in " + n + " cell" + (n === 1 ? "" : "s")) : "Nothing to replace in stored cell text");
}

function dataToggleFilter() {
  var s = workbook.sheets[workbook.active], g;
  undoRecord("filter");
  if (s.filters && s.filters.on) {
    s.filters.on = false;
    s.filters.cols = {};
  } else {
    g = dataUsedOrSel();
    s.filters = { on: true, r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2, cols: {} };
  }
  applyFilters();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  dataRenderFilterButtons();
  saveStore();
  setStatus(s.filters.on ? "Filter on" : "Filter off");
}

function dataClearFilter() {
  var s = workbook.sheets[workbook.active];
  if (!s.filters || !s.filters.on) return;
  undoRecord("filter");
  s.filters.cols = {};
  applyFilters();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  dataRenderFilterButtons();
  saveStore();
  setStatus("Filter cleared");
}

function dataFilterUniques(s, c) {
  var f = s.filters, r, v, seen = {}, items = [], blanks = 0;
  for (r = f.r1 + 1; r <= f.r2; r++) {
    /* Uniques come from the unfiltered data (like Excel). */
    v = s.cells[r][c].value;
    if (v == null || v === "") { blanks++; continue; }
    v = dataNorm(v);
    if (!seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; items.push(v); }
  }
  items.sort(function (a, b) {
    var ka = dataSortKey(a), kb = dataSortKey(b);
    if (ka.t !== kb.t) return ka.t - kb.t;
    if (ka.t === 0) return ka.n - kb.n;
    return ka.s < kb.s ? -1 : (ka.s > kb.s ? 1 : 0);
  });
  return { items: items, blanks: blanks };
}

function dataApplyColFilter(c, selected, blanksOn) {
  var s = workbook.sheets[workbook.active], f = s.filters, off;
  if (!f || !f.on) return;
  undoRecord("filter");
  off = c - f.c1;
  f.cols[off] = { blanks: !!blanksOn, values: selected };
  applyFilters();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  dataRenderFilterButtons();
  saveStore();
  setStatus("Filter applied");
}

function dataRenderFilterButtons() {
  var s = workbook.sheets[workbook.active], f = s.filters, table, head, c, th, btn, on;
  table = document.querySelector("table." + CLS.table);
  if (!table || !table.rows[0]) return;
  head = table.rows[0];
  for (c = 0; c < COLS; c++) {
    /* (before SH24) th = head.cells[c + 1]; the virtual header is not column c+1. */
    th = head.querySelector("th." + CLS.colHead + '[data-c="' + c + '"]');
    if (!th) th = head.cells[c + 1];
    if (!th) continue;
    btn = th.querySelector(".filter-btn");
    on = f && f.on && c >= f.c1 && c <= f.c2;
    if (!on) { if (btn) btn.remove(); th.classList.remove("has-filter", "filter-active"); continue; }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.title = "Filter";
      btn.setAttribute("aria-label", "Filter " + colLetter(c));
      btn.textContent = "▾";
      btn.dataset.c = String(c);
      btn.addEventListener("click", function (ev) { ev.stopPropagation(); dataOpenFilterMenu(+ev.currentTarget.dataset.c, ev.currentTarget); });
      th.appendChild(btn);
    }
    th.classList.add("has-filter");
    th.classList.toggle("filter-active", !!(f.cols && f.cols[c - f.c1] && (f.cols[c - f.c1].values || f.cols[c - f.c1].blanks === false)));
  }
}

function dataOpenFilterMenu(c, anchor) {
  var s = workbook.sheets[workbook.active], f = s.filters, box, info, cur, i, html, r;
  if (!f || !f.on) return;
  dataClosePanels("data-filter");
  box = document.getElementById("data-filter");
  if (!box) return;
  info = dataFilterUniques(s, c);
  cur = f.cols[c - f.c1] || { blanks: true, values: null };
  html = "<div class=\"fx-picker-head\"><strong>Filter " + colLetter(c) + "</strong>" +
    "<button type=\"button\" class=\"fx-picker-close\" data-filter-close=\"1\" aria-label=\"Close\">×</button></div>";
  html += "<label class=\"data-check\"><input type=\"checkbox\" data-filter-all checked> (Select all)</label>";
  if (info.blanks) {
    html += "<label class=\"data-check\"><input type=\"checkbox\" data-filter-blank\"" +
      (cur.blanks !== false ? " checked" : "") + "> (Blanks)</label>";
  }
  for (i = 0; i < info.items.length; i++) {
    var checked = !cur.values || cur.values.some(function (v) { return dataNorm(v).toLowerCase() === info.items[i].toLowerCase(); });
    html += "<label class=\"data-check\"><input type=\"checkbox\" data-filter-val=\"" +
      String(info.items[i]).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + "\"" + (checked ? " checked" : "") + "> " +
      String(info.items[i]).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</label>";
  }
  html += "<div class=\"data-actions\"><button type=\"button\" data-filter-ok=\"1\">OK</button> " +
    "<button type=\"button\" data-filter-close=\"1\">Cancel</button></div>";
  box.innerHTML = html;
  /* fix typo if any in blanks attribute - already in string */
  var rect = anchor.getBoundingClientRect();
  box.style.left = Math.round(rect.left) + "px";
  box.style.top = Math.round(rect.bottom + 2) + "px";
  box.hidden = false;
  var all = box.querySelector("[data-filter-all]");
  function vals() { return box.querySelectorAll("[data-filter-val]"); }
  function syncAll() {
    var boxes = vals(), on = true, j;
    for (j = 0; j < boxes.length; j++) if (!boxes[j].checked) on = false;
    if (all) all.checked = on && (!box.querySelector("[data-filter-blank]") || box.querySelector("[data-filter-blank]").checked);
  }
  if (all) all.addEventListener("change", function () {
    var boxes = vals(), j, on = all.checked;
    for (j = 0; j < boxes.length; j++) boxes[j].checked = on;
    var b = box.querySelector("[data-filter-blank]");
    if (b) b.checked = on;
  });
  box.onchange = syncAll;
  box.onclick = function (ev) {
    if (ev.target.closest("[data-filter-close]")) { box.hidden = true; return; }
    if (ev.target.closest("[data-filter-ok]")) {
      var selected = [], boxes = vals(), j, blank = box.querySelector("[data-filter-blank]");
      for (j = 0; j < boxes.length; j++) if (boxes[j].checked) selected.push(boxes[j].getAttribute("data-filter-val"));
      dataApplyColFilter(c, selected, blank ? blank.checked : true);
      box.hidden = true;
    }
  };
  syncAll();
}

function dataOpenSort() {
  var box = document.getElementById("data-sort"), g, c, html, i, cols;
  if (!box) return;
  dataClosePanels("data-sort");
  g = dataUsedOrSel();
  cols = [];
  for (c = g.c1; c <= g.c2; c++) cols.push(c);
  html = "<div class=\"fx-picker-head\"><strong>Sort</strong>" +
    "<button type=\"button\" class=\"fx-picker-close\" data-sort-close=\"1\" aria-label=\"Close\">×</button></div>";
  html += "<label class=\"data-check\"><input type=\"checkbox\" id=\"data-sort-header\"> My data has a header row</label>";
  for (i = 0; i < 3; i++) {
    html += "<div class=\"data-sort-row\"><span>" + (i ? "Then by" : "Sort by") + "</span> <select data-sort-col=\"" + i + "\">";
    if (i) html += "<option value=\"\">(none)</option>";
    for (c = 0; c < cols.length; c++) html += "<option value=\"" + cols[c] + "\"" + (i === 0 && cols[c] === selC ? " selected" : "") + ">" + colLetter(cols[c]) + "</option>";
    html += "</select> <select data-sort-dir=\"" + i + "\"><option value=\"asc\">A → Z</option><option value=\"desc\">Z → A</option></select></div>";
  }
  html += "<div class=\"data-actions\"><button type=\"button\" id=\"data-sort-ok\">Sort</button> " +
    "<button type=\"button\" data-sort-close=\"1\">Cancel</button></div>";
  box.innerHTML = html;
  box.hidden = false;
  box.style.left = "80px";
  box.style.top = "120px";
  box.onclick = function (ev) {
    if (ev.target.closest("[data-sort-close]")) { box.hidden = true; return; }
    if (ev.target.id === "data-sort-ok") {
      var specs = [], sel, dir, header = !!(document.getElementById("data-sort-header") && document.getElementById("data-sort-header").checked);
      for (i = 0; i < 3; i++) {
        sel = box.querySelector("[data-sort-col=\"" + i + "\"]");
        dir = box.querySelector("[data-sort-dir=\"" + i + "\"]");
        if (sel && sel.value !== "") specs.push({ c: +sel.value, desc: dir && dir.value === "desc" });
      }
      box.hidden = true;
      dataSortRange(g, specs, header);
    }
  };
}

function dataSortRange(g, specs, hasHeader) {
  var rows, r, c, i, src, keySpecs, order;
  if (!g || !specs || !specs.length) return;
  if (g.r1 === g.r2 && !hasHeader) return;
  if (hasHeader && g.r2 <= g.r1) return;
  keySpecs = specs.map(function (sp) {
    var values = [];
    for (r = g.r1; r <= g.r2; r++) values.push(cells[r][sp.c].value);
    return { values: values, desc: !!sp.desc };
  });
  order = dataSortOrder(g.r2 - g.r1 + 1, keySpecs, !!hasHeader);
  rows = [];
  for (i = 0; i < order.length; i++) {
    r = g.r1 + order[i];
    rows.push({ src: r, cells: cells[r].slice(g.c1, g.c2 + 1) });
  }
  undoRecord("sort");
  for (i = 0; i < rows.length; i++) {
    r = g.r1 + i;
    for (c = g.c1; c <= g.c2; c++) {
      src = rows[i].cells[c - g.c1];
      cells[r][c] = { formula: shiftFormula(src.formula, r - rows[i].src, 0), value: src.value, style: src.style };
    }
  }
  afterChange();
  setStatus(TXT.sortedAsc + " " + colLetter(g.c1) + (g.r1 + 1) + ":" + colLetter(g.c2) + (g.r2 + 1));
}

function dataOpenDups() {
  var box = document.getElementById("data-dups"), g, c, html;
  if (!box) return;
  dataClosePanels("data-dups");
  g = dataUsedOrSel();
  html = "<div class=\"fx-picker-head\"><strong>Remove duplicates</strong>" +
    "<button type=\"button\" class=\"fx-picker-close\" data-dups-close=\"1\" aria-label=\"Close\">×</button></div>";
  html += "<p class=\"fx-help\">Columns to compare in " + colLetter(g.c1) + (g.r1 + 1) + ":" + colLetter(g.c2) + (g.r2 + 1) + "</p>";
  html += "<label class=\"data-check\"><input type=\"checkbox\" id=\"data-dups-header\"> My data has a header row</label>";
  for (c = g.c1; c <= g.c2; c++) {
    html += "<label class=\"data-check\"><input type=\"checkbox\" data-dups-col=\"" + c + "\" checked> " + colLetter(c) + "</label>";
  }
  html += "<div class=\"data-actions\"><button type=\"button\" id=\"data-dups-ok\">Remove</button> " +
    "<button type=\"button\" data-dups-close=\"1\">Cancel</button></div>";
  box.innerHTML = html;
  box.hidden = false;
  box.style.left = "80px";
  box.style.top = "120px";
  box.onclick = function (ev) {
    if (ev.target.closest("[data-dups-close]")) { box.hidden = true; return; }
    if (ev.target.id === "data-dups-ok") {
      var cols = [], header = !!(document.getElementById("data-dups-header") && document.getElementById("data-dups-header").checked);
      var nodes = box.querySelectorAll("[data-dups-col]");
      for (c = 0; c < nodes.length; c++) if (nodes[c].checked) cols.push(+nodes[c].getAttribute("data-dups-col"));
      box.hidden = true;
      dataRemoveDups(g, cols, header);
    }
  };
}

function dataRemoveDups(g, keyCols, hasHeader) {
  var rows = [], r, c, i, keep, next, removed = 0, src;
  if (!g || !keyCols || !keyCols.length) return;
  for (r = g.r1; r <= g.r2; r++) {
    rows.push(keyCols.map(function (c) { return cells[r][c].value; }));
  }
  keep = dataUniqueKeep(rows, !!hasHeader);
  for (i = 0; i < keep.length; i++) if (!keep[i]) removed++;
  if (!removed) { setStatus("No duplicate rows"); return; }
  undoRecord("dups");
  next = g.r1;
  for (i = 0; i < keep.length; i++) {
    if (!keep[i]) continue;
    r = g.r1 + i;
    if (next !== r) {
      for (c = g.c1; c <= g.c2; c++) {
        src = cells[r][c];
        cells[next][c] = { formula: shiftFormula(src.formula, next - r, 0), value: src.value, style: src.style };
      }
    }
    next++;
  }
  for (r = next; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) cells[r][c] = blankCell();
  }
  afterChange();
  setStatus("Removed " + removed + " duplicate row" + (removed === 1 ? "" : "s"));
}

function dataOpenValid() {
  var box = document.getElementById("data-valid"), cur, html, g;
  if (!box) return;
  dataClosePanels("data-valid");
  g = selRange();
  cur = dataValidationAt(selR, selC);
  html = "<div class=\"fx-picker-head\"><strong>Data validation</strong>" +
    "<button type=\"button\" class=\"fx-picker-close\" data-valid-close=\"1\" aria-label=\"Close\">×</button></div>";
  html += "<p class=\"fx-help\">Dropdown list for " + rangeLabel() + ". Type items separated by commas, or a range such as A1:A10 or Sheet2!A1:A10.</p>";
  html += "<input id=\"data-valid-src\" type=\"text\" value=\"" + (cur ? String(cur.source).replace(/&/g, "&amp;").replace(/\"/g, "&quot;") : "") + "\" placeholder=\"Yes, No, Maybe\">";
  html += "<div class=\"data-actions\"><button type=\"button\" id=\"data-valid-ok\">Apply</button> " +
    "<button type=\"button\" id=\"data-valid-clear\">Clear</button> " +
    "<button type=\"button\" data-valid-close=\"1\">Cancel</button></div>";
  box.innerHTML = html;
  box.hidden = false;
  box.style.left = "80px";
  box.style.top = "120px";
  box.onclick = function (ev) {
    if (ev.target.closest("[data-valid-close]")) { box.hidden = true; return; }
    if (ev.target.id === "data-valid-ok") {
      var src = (document.getElementById("data-valid-src") || {}).value || "";
      box.hidden = true;
      dataSetValidation(g, src);
    } else if (ev.target.id === "data-valid-clear") {
      box.hidden = true;
      dataClearValidation(g);
    }
  };
}

function dataSetValidation(g, source) {
  var s = workbook.sheets[workbook.active];
  source = dataNorm(source).trim();
  undoRecord("valid");
  if (!s.validations) s.validations = [];
  /* Drop overlapping rules, then add this one. */
  s.validations = s.validations.filter(function (v) {
    return v.r2 < g.r1 || v.r1 > g.r2 || v.c2 < g.c1 || v.c1 > g.c2;
  });
  if (source) s.validations.push({ r1: g.r1, r2: g.r2, c1: g.c1, c2: g.c2, source: source });
  saveStore();
  dataRenderValidBtn();
  setStatus(source ? "List applied" : "List cleared");
}

function dataClearValidation(g) { dataSetValidation(g, ""); }

function dataRenderValidBtn() {
  var btn = document.getElementById("data-valid-arrow"), v, inp, td, r;
  if (!btn) return;
  v = dataValidationAt(selR, selC);
  if (!v || !inpGrid[selR] || !inpGrid[selR][selC]) { btn.hidden = true; return; }
  td = inpGrid[selR][selC].parentNode;
  r = td.getBoundingClientRect();
  btn.hidden = false;
  btn.style.top = Math.round(r.top + 2) + "px";
  btn.style.left = Math.round(r.right - 18) + "px";
}

function dataOpenValidList() {
  var v = dataValidationAt(selR, selC), list, box, i, html, inp;
  if (!v) return;
  list = dataSourceValues(v.source);
  box = document.getElementById("data-valid-list");
  if (!box) return;
  html = "";
  for (i = 0; i < list.length; i++) {
    html += "<button type=\"button\" class=\"fx-item\" data-valid-pick=\"" +
      String(list[i]).replace(/&/g, "&amp;").replace(/\"/g, "&quot;") + "\">" +
      String(list[i]).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</button>";
  }
  if (!html) html = "<div class=\"fx-help\">The list is empty.</div>";
  box.innerHTML = html;
  inp = inpGrid[selR][selC];
  if (inp) {
    var r = inp.parentNode.getBoundingClientRect();
    box.style.left = Math.round(r.left) + "px";
    box.style.top = Math.round(r.bottom) + "px";
    box.style.minWidth = Math.round(r.width) + "px";
  }
  box.hidden = false;
}

function dataAllowCommit(r, c, text) {
  var v = dataValidationAt(r, c), list, ok;
  if (!v) return true;
  if (String(text || "").charAt(0) === "=") return true;
  list = dataSourceValues(v.source);
  if (!list.length) return true;
  if (dataInList(text, list)) return true;
  if (typeof OfficeDialog !== "undefined" && OfficeDialog.confirm) {
    OfficeDialog.confirm({
      title: "Not in the list",
      message: "\"" + text + "\" is not in the dropdown list. Keep it anyway?",
      okLabel: "Keep"
    }).then(function (keep) {
      if (keep) {
        undoRecord("edit");
        cells[r][c].formula = text;
        afterChange();
      } else {
        paintCell(r, c);
        var bar = document.getElementById("formula-bar");
        if (bar) bar.value = cells[r][c].formula;
      }
    });
    return false;
  }
  setStatus("That value is not in the list");
  return false;
}

function initDataTools() {
  var wrap;
  onBtn("btn-find", dataOpenFind);
  onBtn("btn-filter", dataToggleFilter);
  onBtn("btn-filter-clear", dataClearFilter);
  onBtn("btn-sort-more", dataOpenSort);
  onBtn("btn-dups", dataOpenDups);
  onBtn("btn-valid", dataOpenValid);
  onBtn("data-valid-arrow", function (ev) { ev.preventDefault(); ev.stopPropagation(); dataOpenValidList(); });
  var find = document.getElementById("data-find");
  if (find) {
    find.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-find-close]")) { find.hidden = true; return; }
      if (ev.target.id === "data-find-next") dataFindNext();
      else if (ev.target.id === "data-find-rep") dataReplaceOneUi();
      else if (ev.target.id === "data-find-all") dataReplaceAllUi();
    });
    find.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); dataFindNext(); }
      if (ev.key === "Escape") { find.hidden = true; }
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    var k = String(ev.key).toLowerCase();
    if (k === "f" || k === "h") {
      ev.preventDefault();
      dataOpenFind();
      if (k === "h") {
        var r = document.getElementById("data-find-r");
        if (r) r.focus();
      }
    }
  });
  document.addEventListener("mousedown", function (ev) {
    var ids = ["data-find", "data-sort", "data-dups", "data-valid", "data-filter", "data-valid-list"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.hidden) return;
      if (el.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest(".filter-btn")) return;
      if (id === "data-valid-list" && ev.target.id === "data-valid-arrow") return;
      if (id === "data-find" && ev.target.id === "btn-find") return;
      el.hidden = true;
    });
  });
  var list = document.getElementById("data-valid-list");
  if (list) list.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-valid-pick]");
    if (!b) return;
    var text = b.getAttribute("data-valid-pick");
    list.hidden = true;
    commitCell(selR, selC, text);
    paintCell(selR, selC);
  });
  /* Validate typed values; skip the first commit if the dialog is used. */
  if (!commitCell._dataWrap) {
    var orig = commitCell;
    commitCell = function (r, c, text) {
      if (!dataAllowCommit(r, c, text)) return;
      orig(r, c, text);
    };
    commitCell._dataWrap = true;
  }
  wrap = document.getElementById("sheet-wrap");
  if (wrap) wrap.addEventListener("scroll", function () { dataRenderValidBtn(); }, { passive: true });
  window.addEventListener("resize", function () { dataRenderValidBtn(); });
  dataRenderFilterButtons();
  dataRenderValidBtn();
  if (typeof highlightSel === "function" && !highlightSel._dataWrap) {
    var _hi = highlightSel;
    highlightSel = function () {
      _hi.apply(this, arguments);
      dataRenderValidBtn();
    };
    highlightSel._dataWrap = true;
  }
}

SHEET_INIT.push(initDataTools);
