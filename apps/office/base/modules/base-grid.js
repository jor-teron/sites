/*
 * base-grid.js  (BS1, BS2: query filter + shown fields, Totals row)
 * Grid view: one <input> per cell (inline edit, autosave), header click sorts (asc -> desc -> off),
 * search box filters rows (any field contains text). Row number click selects a row for "− Record".
 * API: BaseGrid.render(), BaseGrid.visibleRows(t, ignoreSearch), BaseGrid.inputFor(field, value)
 */
var BaseGrid = (function () {
  function cmp(a, b, type) {
    if (type === "number") return (a === "" ? -Infinity : +a) - (b === "" ? -Infinity : +b);
    if (type === "bool") return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
  function visibleRows(t, ignoreSearch) {
    var rows = typeof BaseQuery !== "undefined" ? BaseQuery.filter(t, t.rows.slice()) : t.rows.slice(), q = ignoreSearch ? "" : BASE.search.trim().toLowerCase(), s = BASE.sort;
    if (q) rows = rows.filter(function (r) {
      return t.fields.some(function (f) { var v = r.v[f.id]; v = f.type === "bool" ? (v ? "yes" : "no") : String(v == null ? "" : v); return v.toLowerCase().indexOf(q) >= 0; });
    });
    var f = s && t.fields.filter(function (x) { return x.id === s.field; })[0];
    if (f) rows.sort(function (a, b) { return cmp(a.v[f.id], b.v[f.id], f.type) * s.dir; });
    return rows;
  }
  function inputFor(f, val, onSet) {
    var i = document.createElement("input");
    if (f.type === "bool") { i.type = "checkbox"; i.checked = !!val; i.addEventListener("change", function () { onSet(i.checked); }); return i; }
    i.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
    i.value = val == null ? "" : val;
    if (f.type === "number") i.step = "any";
    i.addEventListener("input", function () { onSet(f.type === "number" ? (i.value === "" ? "" : Number(i.value)) : i.value); });
    return i;
  }
  function render() {
    var wrap = document.getElementById("grid-wrap"), t = BaseStore.table();
    wrap.textContent = "";
    if (!t) return BaseUI.renderEmpty(wrap);
    var tbl = document.createElement("table"); tbl.className = "base-grid";
    var hr = tbl.createTHead().insertRow(), th = document.createElement("th");
    th.className = "num"; th.textContent = "#"; hr.appendChild(th);
    var cols = typeof BaseQuery !== "undefined" ? BaseQuery.shown(t) : t.fields;
    cols.forEach(function (f) {
      var h = document.createElement("th"), s = BASE.sort;
      h.textContent = f.name;
      var sm = document.createElement("small");
      sm.textContent = (s && s.field === f.id ? (s.dir > 0 ? "▲ " : "▼ ") : "") + BaseUI.typeLabel(f.type);
      h.appendChild(sm); h.title = "Sort by " + f.name;
      h.addEventListener("click", function () {
        var s = BASE.sort;
        BASE.sort = !s || s.field !== f.id ? { field: f.id, dir: 1 } : s.dir > 0 ? { field: f.id, dir: -1 } : null;
        render();
      });
      hr.appendChild(h);
    });
    var body = tbl.createTBody(), rows = visibleRows(t);
    rows.forEach(function (r, n) {
      var tr = body.insertRow(); if (r.id === BASE.selRow) tr.className = "sel";
      var c = tr.insertCell(); c.className = "num"; c.textContent = n + 1; c.title = "Select record";
      c.addEventListener("click", function () { BASE.selRow = r.id; BASE.formIndex = t.rows.indexOf(r); render(); });
      cols.forEach(function (f) {
        var td = tr.insertCell();
        var inp = inputFor(f, r.v[f.id], function (v) { r.v[f.id] = v; BaseStore.save(); });
        inp.addEventListener("focus", function () { if (BASE.selRow !== r.id) { var o = body.querySelector("tr.sel"); if (o) o.className = ""; tr.className = "sel"; BASE.selRow = r.id; } });
        inp.setAttribute("aria-label", f.name + " " + (n + 1));
        td.appendChild(inp);
      });
    });
    if (BASE.totals) totals(tbl, cols, rows);
    wrap.appendChild(tbl);
    var aq = typeof BaseQuery !== "undefined" && BaseQuery.active();
    BaseUI.status(rows.length + " of " + t.rows.length + " records" + (aq ? " · query" + (aq.name ? " “" + aq.name + "”" : "") : "") + (BASE.memOnly ? " · memory only" : ""));
  }
  /* Totals row (BS2): Sum / Avg / Count for Number fields over the visible (searched + queried) rows */
  function fmt(n) { return Math.round(n * 100) / 100 + ""; }
  function totals(tbl, cols, rows) {
    var tr = tbl.createTFoot().insertRow(), c = tr.insertCell(); c.className = "num"; c.textContent = "Σ";
    cols.forEach(function (f) {
      var td = tr.insertCell(); td.className = "base-total";
      if (f.type !== "number") { if (f === cols[0]) td.textContent = rows.length + " records"; return; }
      var v = rows.map(function (r) { return r.v[f.id]; }).filter(function (x) { return x !== "" && x != null && !isNaN(+x); }).map(Number);
      var sum = v.reduce(function (a, b) { return a + b; }, 0);
      [["Sum", fmt(sum)], ["Avg", v.length ? fmt(sum / v.length) : "–"], ["Count", v.length]].forEach(function (p) { var d = document.createElement("div"); d.textContent = p[0] + ": " + p[1]; td.appendChild(d); });
    });
  }
  return { render: render, visibleRows: visibleRows, inputFor: inputFor };
})();
