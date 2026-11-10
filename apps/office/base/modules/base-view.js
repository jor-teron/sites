/*
 * base-view.js  (BS8)
 * Header filters, saved views, column hide/order/widths, freeze, conditional colours,
 * gallery cards and a month calendar. Pure helpers (filter, colours, layout, calendar
 * cells) have no DOM and are safe to load in Node.
 *
 *   View: { id, name, table, filters, sort, cols, widths, freeze, colors,
 *           mode: "grid"|"gallery"|"calendar", galleryPic, galleryFields, calendarField }
 *   Filter: { field, values?: string[], op?, val? }  — several columns AND together
 *   Color rule: { field, op, val, color, target: "row"|"cell" }
 *
 * The working layout lives on the table (t.layout) and is saved with the database
 * (schema 8). Named views are snapshots in BASE.db.views. Header filters run after
 * an active query and before the search box. The grid renders at most 200 rows, the
 * gallery at most 80 cards (narrow the filter to see the rest).
 *
 * API: BaseView.layout(t), .normalize(raw, t), .applyFilters(t, rows, filters),
 *      .matchFilter(t, filter, row), .applyColors(rules, t, row), .visibleCols(t, fields),
 *      .uniqueValues(t, field, rows, cap), .monthCells(year, month, rows, dateValue),
 *      .COLORS, .GRID_CAP, .GALLERY_CAP,
 *      .render(), .renderGallery(), .renderCalendar(), .renderPicker(),
 *      .openHeader(th, field), .columns(), .colours(), .setFreeze(n), .setMode(m),
 *      .save(), .rename(), .remove(), .pick(id), .clearFilters(), .dropForTable(id),
 *      .attachResize(th, field)
 */
(function (root) {
  var COLORS = [
    { id: "red", label: "Red" }, { id: "orange", label: "Orange" }, { id: "yellow", label: "Yellow" },
    { id: "green", label: "Green" }, { id: "blue", label: "Blue" }, { id: "purple", label: "Purple" },
    { id: "pink", label: "Pink" }, { id: "grey", label: "Grey" }
  ];
  var COLOR_IDS = COLORS.map(function (c) { return c.id; });
  var OPS = [
    { id: "eq", label: "=" }, { id: "ne", label: "≠" },
    { id: "gt", label: ">" }, { id: "lt", label: "<" }, { id: "ge", label: ">=" }, { id: "le", label: "<=" },
    { id: "has", label: "contains" }, { id: "sw", label: "starts with" },
    { id: "empty", label: "is empty" }, { id: "full", label: "is not empty" },
    { id: "yes", label: "is yes" }, { id: "no", label: "is no" }
  ];
  var GRID_CAP = 200, GALLERY_CAP = 80, DAY_CAP = 8, UNIQUE_CAP = 50;
  var MIN_W = 60, MAX_W = 480, DEF_W = 140, NUM_W = 40;
  var pop = null, calCursor = null, dragging = null;

  function useDb() { return (typeof BASE !== "undefined" && BASE.db) || { tables: [], views: [] }; }
  function views() {
    if (typeof BASE === "undefined") return [];
    if (!BASE.db.views) BASE.db.views = [];
    return BASE.db.views;
  }
  function toast(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 2500); } catch (e) {} }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function $(id) { return typeof document !== "undefined" ? document.getElementById(id) : null; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function colorOk(c) { return COLOR_IDS.indexOf(c) >= 0 ? c : "yellow"; }
  function fieldsOf(t) { return (t && t.fields) || []; }
  function fieldOf(t, id) {
    if (!t || !id) return null;
    var f = fieldsOf(t).filter(function (x) { return x.id === id; })[0];
    if (f) return f;
    if (typeof BaseLinks !== "undefined") return BaseLinks.queryFields(t).filter(function (x) { return x.id === id; })[0] || null;
    return null;
  }
  function group(type) { return typeof BaseTypes !== "undefined" ? BaseTypes.queryGroup(type) : type; }
  function typeOf(t, f) {
    if (!f) return "text";
    if (typeof BaseLinks !== "undefined") return BaseLinks.resolvedType(t, f);
    return f.type;
  }
  function defaultWidth(f) {
    if (!f) return DEF_W;
    if (f.type === "picture") return 88;
    if (f.type === "bool" || f.type === "id") return 80;
    if (f.type === "long") return 200;
    return DEF_W;
  }
  function defaultLayout(t) {
    return {
      filters: [], sort: null,
      cols: fieldsOf(t).map(function (f) { return f.id; }),
      widths: {}, freeze: 0, colors: [], mode: "grid",
      galleryPic: "", galleryFields: [], calendarField: ""
    };
  }
  function normalize(raw, t) {
    var d = defaultLayout(t), L;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
    try { L = JSON.parse(JSON.stringify(raw)); } catch (e) { return d; }
    var known = {};
    fieldsOf(t).forEach(function (f) { known[f.id] = 1; });
    d.filters = Array.isArray(L.filters) ? L.filters.filter(function (f) {
      return f && typeof f === "object" && f.field && (known[f.field] || fieldOf(t, f.field));
    }).map(function (f) {
      var o = { field: String(f.field) };
      if (Array.isArray(f.values)) o.values = f.values.map(function (v) { return v == null ? "" : String(v); });
      if (f.op) o.op = String(f.op);
      if (f.val != null) o.val = f.val;
      return o;
    }) : [];
    if (L.sort && L.sort.field && (known[L.sort.field] || fieldOf(t, L.sort.field))) {
      d.sort = { field: String(L.sort.field), dir: L.sort.dir < 0 ? -1 : 1 };
    }
    var cols = Array.isArray(L.cols) ? L.cols.map(String).filter(function (id, i, a) { return known[id] && a.indexOf(id) === i; }) : [];
    d.cols = cols.length ? cols : defaultLayout(t).cols;
    d.widths = {};
    if (L.widths && typeof L.widths === "object" && !Array.isArray(L.widths)) {
      Object.keys(L.widths).forEach(function (k) {
        var n = +L.widths[k];
        if (known[k] && isFinite(n)) d.widths[k] = Math.max(MIN_W, Math.min(MAX_W, Math.round(n)));
      });
    }
    d.freeze = L.freeze === 1 || L.freeze === 2 ? L.freeze : 0;
    d.colors = Array.isArray(L.colors) ? L.colors.filter(function (c) {
      return c && c.field && (known[c.field] || fieldOf(t, c.field)) && c.op;
    }).slice(0, 8).map(function (c) {
      return { field: String(c.field), op: String(c.op), val: c.val == null ? "" : c.val, color: colorOk(c.color), target: c.target === "cell" ? "cell" : "row" };
    }) : [];
    d.mode = L.mode === "gallery" || L.mode === "calendar" ? L.mode : "grid";
    d.galleryPic = known[L.galleryPic] ? L.galleryPic : "";
    d.galleryFields = Array.isArray(L.galleryFields) ? L.galleryFields.map(String).filter(function (id, i, a) { return known[id] && a.indexOf(id) === i; }).slice(0, 6) : [];
    d.calendarField = known[L.calendarField] ? L.calendarField : "";
    return d;
  }
  function layout(t) {
    if (!t) return defaultLayout({ fields: [] });
    t.layout = normalize(t.layout, t);
    return t.layout;
  }
  function persist(t, hist) {
    if (!t) return;
    t.layout = layout(t);
    if (typeof BASE !== "undefined") BASE.sort = t.layout.sort;
    if (hist && typeof BaseHistory !== "undefined") { try { BaseHistory.push(hist); } catch (e) {} }
    if (typeof BaseStore !== "undefined") BaseStore.save();
  }

  /* ---- values & filters (pure) ---- */
  function rawValues(t, field, row) {
    if (!field || !row) return [];
    if (typeof BaseLinks !== "undefined" && (field.type === "ref" || field.type === "lookup" || field._via)) {
      return BaseLinks.resolve(t, field, row);
    }
    var v = row.v ? row.v[field.id] : "";
    return (v === "" || v == null) ? [] : (Array.isArray(v) ? v : [v]);
  }
  function keyOf(t, field, v) {
    if (v === "" || v == null) return "";
    if (field && field.type === "ref") return String(v);
    if (field && field.type === "bool") return v ? "1" : "0";
    return String(v);
  }
  function labelOf(t, field, v) {
    if (v === "" || v == null) return "(blank)";
    if (field && field.type === "ref" && typeof BaseLinks !== "undefined") return BaseLinks.displayText(field, v) || "(missing)";
    if (field && field.type === "bool") return v ? "Yes" : "No";
    if (typeof BaseTypes !== "undefined") {
      var lab = BaseTypes.previewText({ type: typeOf(t, field), name: field && field.name || "" }, v);
      if (lab && lab !== "—") return lab;
    }
    return String(v);
  }
  function valueKeys(t, field, row) { return rawValues(t, field, row).map(function (v) { return keyOf(t, field, v); }); }

  function matchCond(t, field, row, cond) {
    if (typeof BaseQuery !== "undefined" && BaseQuery.test) return BaseQuery.test(cond, field, row, t);
    var typ = typeOf(t, field), g = group(typ), vs = rawValues(t, field, row), o = cond.op;
    function one(v) {
      var empty = v === "" || v == null || (Array.isArray(v) && !v.length);
      if (o === "yes") return !!v; if (o === "no") return !v;
      if (o === "empty") return empty; if (o === "full") return !empty;
      var a = v, b = cond.val;
      if (g === "number") { if (empty || b === "" || b == null || isNaN(+b)) return o === "ne" && !empty; a = +a; b = +b; }
      else { a = String(a == null ? "" : a).toLowerCase(); b = String(b == null ? "" : b).toLowerCase(); }
      if (o === "eq") return a === b; if (o === "ne") return a !== b;
      if (o === "gt") return !empty && a > b; if (o === "lt") return !empty && a < b;
      if (o === "ge") return !empty && a >= b; if (o === "le") return !empty && a <= b;
      if (o === "has") return a.indexOf(b) >= 0; if (o === "sw") return a.indexOf(b) === 0;
      return true;
    }
    if (o === "empty") return !vs.length || vs.every(one);
    if (o === "full") return vs.length && vs.some(one);
    if (o === "ne") return (vs.length ? vs : [""]).every(one);
    if (!vs.length) return one("");
    return vs.some(one);
  }
  function matchFilter(t, fil, row) {
    if (!fil || !fil.field) return true;
    var f = fieldOf(t, fil.field); if (!f) return true;
    if (fil.values && fil.values.length) {
      var keys = valueKeys(t, f, row);
      if (!keys.length) keys = [""];
      return keys.some(function (k) { return fil.values.indexOf(k) >= 0; });
    }
    if (fil.op) return matchCond(t, f, row, fil);
    return true;
  }
  function applyFilters(t, rows, filters) {
    (filters || []).forEach(function (fil) {
      rows = rows.filter(function (r) { return matchFilter(t, fil, r); });
    });
    return rows;
  }
  function uniqueValues(t, field, rows, cap) {
    cap = cap == null ? UNIQUE_CAP : cap;
    var seen = {}, list = [], blank = 0, extra = 0;
    (rows || []).forEach(function (r) {
      var vs = rawValues(t, field, r);
      if (!vs.length) { blank++; return; }
      vs.forEach(function (v) {
        var k = keyOf(t, field, v);
        if (k === "") { blank++; return; }
        if (seen[k]) return;
        if (list.length >= cap) { extra++; return; }
        seen[k] = 1;
        list.push({ key: k, label: labelOf(t, field, v) });
      });
    });
    list.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" }); });
    if (blank) list.unshift({ key: "", label: "(blank)" });
    return { items: list, extra: extra, blank: blank };
  }
  function visibleCols(t, all) {
    all = all || fieldsOf(t);
    var L = layout(t), by = {};
    all.forEach(function (f) { by[f.id] = f; });
    var out = (L.cols || []).map(function (id) { return by[id]; }).filter(Boolean);
    return out.length ? out : all.slice();
  }
  function widthOf(t, field) {
    var L = layout(t), w = L.widths && L.widths[field.id];
    return w || defaultWidth(field);
  }
  /* First matching row colour, plus first matching cell colour per field. */
  function applyColors(rules, t, row) {
    var rowColor = null, cells = {};
    (rules || []).forEach(function (rule) {
      var f = fieldOf(t, rule.field); if (!f) return;
      if (!matchCond(t, f, row, rule)) return;
      if (rule.target === "cell") { if (!cells[rule.field]) cells[rule.field] = colorOk(rule.color); }
      else if (!rowColor) rowColor = colorOk(rule.color);
    });
    return { row: rowColor, cells: cells };
  }
  /* month is 1–12. weeks is a list of 7-day rows; inMonth marks days of this month. */
  function monthCells(year, month, items) {
    year = +year; month = +month;
    var first = new Date(year, month - 1, 1), start = first.getDay(); /* 0 = Sunday */
    var days = new Date(year, month, 0).getDate();
    var prevDays = new Date(year, month - 1, 0).getDate();
    var by = {};
    (items || []).forEach(function (it) {
      var d = String(it.date || "");
      if (!by[d]) by[d] = [];
      by[d].push(it);
    });
    function ymd(y, m, d) {
      return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
    }
    var cells = [], i, n = start + days, total = Math.ceil(n / 7) * 7;
    for (i = 0; i < total; i++) {
      var day, m, y, inMonth;
      if (i < start) { day = prevDays - start + 1 + i; m = month - 1; y = year; inMonth = false; if (m < 1) { m = 12; y--; } }
      else if (i >= start + days) { day = i - start - days + 1; m = month + 1; y = year; inMonth = false; if (m > 12) { m = 1; y++; } }
      else { day = i - start + 1; m = month; y = year; inMonth = true; }
      var iso = ymd(y, m, day);
      cells.push({ date: iso, day: day, inMonth: inMonth, items: by[iso] || [] });
    }
    var weeks = [];
    for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { year: year, month: month, weeks: weeks, cells: cells };
  }
  function monthName(m) { return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1] || ""; }

  /* ---- UI: header popover, columns, colours, freeze, resize ---- */
  function closePop() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
    if (typeof document !== "undefined") document.removeEventListener("mousedown", onPopOut, true);
  }
  function onPopOut(e) { if (pop && !pop.contains(e.target) && !(e.target && e.target.closest && e.target.closest("th"))) closePop(); }
  function filterFor(t, fieldId) {
    return layout(t).filters.filter(function (f) { return f.field === fieldId; })[0] || null;
  }
  function setFilter(t, fieldId, fil, hist) {
    var L = layout(t);
    L.filters = L.filters.filter(function (f) { return f.field !== fieldId; });
    if (fil) L.filters.push(fil);
    persist(t, hist || "Filter");
  }
  function openHeader(th, field) {
    var t = BaseStore.table(); if (!t || !field) return;
    closePop();
    var L = layout(t), cur = filterFor(t, field.id), box = el("div", "base-hpop");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Sort and filter " + field.name);
    box.appendChild(el("div", "base-hpop-title", field.name));
    var sorts = el("div", "base-hpop-row");
    function sbtn(lab, dir) {
      var on = L.sort && L.sort.field === field.id && (dir ? L.sort.dir === dir : false);
      if (!dir && !(L.sort && L.sort.field === field.id)) on = true;
      var b = el("button", "base-btn" + (on ? " on" : ""), lab); b.type = "button";
      b.addEventListener("click", function () {
        L.sort = dir ? { field: field.id, dir: dir } : (L.sort && L.sort.field === field.id ? null : L.sort);
        persist(t, "Sort"); closePop(); BaseUI.render();
      });
      sorts.appendChild(b);
    }
    sbtn("A → Z", 1); sbtn("Z → A", -1); sbtn("Clear sort", 0);
    box.appendChild(sorts);
    box.appendChild(el("div", "base-hpop-label", "Show values"));
    var rows = t.rows.slice();
    if (typeof BaseQuery !== "undefined") rows = BaseQuery.filter(t, rows);
    rows = applyFilters(t, rows, L.filters.filter(function (f) { return f.field !== field.id; }));
    var uniq = uniqueValues(t, field, rows, UNIQUE_CAP);
    var chosen = {};
    (cur && cur.values ? cur.values : uniq.items.map(function (x) { return x.key; })).forEach(function (k) { chosen[k] = 1; });
    var list = el("div", "base-hpop-list");
    uniq.items.forEach(function (it) {
      var lab = el("label", "base-hpop-check"), cb = el("input");
      cb.type = "checkbox"; cb.checked = !!chosen[it.key];
      cb.addEventListener("change", function () { if (cb.checked) chosen[it.key] = 1; else delete chosen[it.key]; });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + it.label)); list.appendChild(lab);
    });
    if (uniq.extra) list.appendChild(el("div", "base-hpop-note", "+" + uniq.extra + " more values not listed — use a condition below"));
    if (!uniq.items.length) list.appendChild(el("div", "base-hpop-note", "No values"));
    box.appendChild(list);
    box.appendChild(el("div", "base-hpop-label", "Or a condition"));
    var typ = typeOf(t, field), g = group(typ);
    var allowed;
    if (g === "bool") allowed = ["yes", "no", "empty", "full"];
    else if (g === "number" || typ === "date") allowed = ["eq", "ne", "gt", "lt", "ge", "le", "empty", "full"];
    else if (typ === "picture") allowed = ["empty", "full"];
    else allowed = ["eq", "ne", "has", "sw", "empty", "full"];
    var condOp = (cur && cur.op && allowed.indexOf(cur.op) >= 0) ? cur.op : "";
    var condVal = cur && cur.op ? (cur.val == null ? "" : String(cur.val)) : "";
    var crow = el("div", "base-hpop-row");
    var opSel = el("select", "bq-sel");
    [["", "(none)"]].concat(OPS.filter(function (o) { return allowed.indexOf(o.id) >= 0; }).map(function (o) { return [o.id, o.label]; })).forEach(function (p) {
      var o = el("option", null, p[1]); o.value = p[0]; if (p[0] === condOp) o.selected = true; opSel.appendChild(o);
    });
    var valInp = el("input", "bq-val"); valInp.value = condVal;
    valInp.hidden = !condOp || ["empty", "full", "yes", "no"].indexOf(condOp) >= 0;
    opSel.addEventListener("change", function () {
      condOp = opSel.value;
      valInp.hidden = !condOp || ["empty", "full", "yes", "no"].indexOf(condOp) >= 0;
    });
    crow.appendChild(opSel); crow.appendChild(valInp); box.appendChild(crow);
    var act = el("div", "base-hpop-row base-hpop-actions");
    var apply = el("button", "base-btn primary", "Apply"); apply.type = "button";
    apply.addEventListener("click", function () {
      var vals = Object.keys(chosen), allOn = uniq.items.every(function (it) { return chosen[it.key]; });
      var fil = { field: field.id };
      var hasCond = !!opSel.value;
      if (hasCond) {
        fil.op = opSel.value; fil.val = valInp.value;
      } else if (!allOn && vals.length) {
        fil.values = vals;
      } else if (!allOn && !vals.length) {
        fil.values = ["\u0000"]; /* match nothing */
      } else fil = null;
      setFilter(t, field.id, fil, "Filter"); closePop(); BaseUI.render();
    });
    var clr = el("button", "base-btn", "Clear filter"); clr.type = "button";
    clr.addEventListener("click", function () { setFilter(t, field.id, null, "Clear filter"); closePop(); BaseUI.render(); });
    act.appendChild(apply); act.appendChild(clr); box.appendChild(act);
    document.body.appendChild(box); pop = box;
    var r = th.getBoundingClientRect();
    box.style.top = Math.min(r.bottom + 4, window.innerHeight - 12 - box.offsetHeight) + "px";
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 12 - box.offsetWidth)) + "px";
    document.addEventListener("mousedown", onPopOut, true);
  }
  function attachResize(th, field) {
    var handle = el("span", "base-col-resizer");
    handle.title = "Drag to resize";
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation(); closePop();
      var t = BaseStore.table(), startX = e.clientX, startW = widthOf(t, field);
      dragging = { field: field, startX: startX, startW: startW };
      function move(ev) {
        var w = Math.max(MIN_W, Math.min(MAX_W, startW + (ev.clientX - startX)));
        th.style.width = th.style.minWidth = th.style.maxWidth = w + "px";
        dragging.width = w;
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        if (dragging && dragging.width && dragging.width !== startW) {
          layout(t).widths[field.id] = dragging.width;
          persist(t, "Resize column");
        }
        dragging = null;
        if (typeof BaseUI !== "undefined") BaseUI.render();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    handle.addEventListener("click", function (e) { e.stopPropagation(); });
    th.appendChild(handle);
    th.style.width = th.style.minWidth = th.style.maxWidth = widthOf(BaseStore.table(), field) + "px";
  }
  function applyFreeze(tbl, cols, t) {
    var L = layout(t), n = L.freeze || 0, left = NUM_W, i;
    var numTh = tbl.querySelector("th.num"), numTds = tbl.querySelectorAll("td.num, tfoot td.num");
    if (numTh) { numTh.classList.add("base-freeze"); numTh.style.left = "0px"; }
    Array.prototype.forEach.call(numTds, function (c) { c.classList.add("base-freeze"); c.style.left = "0px"; });
    for (i = 0; i < n && i < cols.length; i++) {
      var w = widthOf(t, cols[i]), idx = i + 2; /* 1-based, +1 for # */
      Array.prototype.forEach.call(tbl.querySelectorAll("tr > :nth-child(" + idx + ")"), function (c) {
        c.classList.add("base-freeze"); c.style.left = left + "px";
      });
      left += w;
    }
  }
  function paintRow(tr, tds, t, row) {
    var painted = applyColors(layout(t).colors, t, row);
    if (painted.row) tr.classList.add("base-c-" + painted.row);
    Object.keys(painted.cells).forEach(function (fid) {
      var td = tds[fid]; if (td) td.classList.add("base-c-" + painted.cells[fid]);
    });
  }
  function markHeader(th, t, field) {
    var L = layout(t), fil = filterFor(t, field.id);
    if (fil) th.classList.add("base-filtered");
    if (L.sort && L.sort.field === field.id) th.classList.add(L.sort.dir > 0 ? "base-sort-asc" : "base-sort-desc");
  }

  function columns() {
    var t = BaseStore.table(); if (!t) return toast("Make a table first");
    var L = layout(t), order = L.cols.slice(), hidden = {};
    fieldsOf(t).forEach(function (f) { if (order.indexOf(f.id) < 0) hidden[f.id] = 1; });
    var back = el("div", "dlg-backdrop base-v-back"); back.id = "base-cols-dlg";
    var box = el("div", "dlg base-v-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.appendChild(el("div", "dlg-title", "Columns"));
    box.appendChild(el("div", "dlg-message", "Tick a field to show it. Use Up / Down to change the order in the grid."));
    var list = el("div", "base-v-list");
    function draw() {
      list.textContent = "";
      var ids = order.concat(fieldsOf(t).map(function (f) { return f.id; }).filter(function (id) { return order.indexOf(id) < 0; }));
      ids.forEach(function (id, i) {
        var f = fieldOf(t, id); if (!f) return;
        var row = el("div", "base-v-row");
        var lab = el("label", "base-v-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = !hidden[id];
        cb.addEventListener("change", function () {
          if (cb.checked) { delete hidden[id]; if (order.indexOf(id) < 0) order.push(id); }
          else { hidden[id] = 1; order = order.filter(function (x) { return x !== id; }); }
        });
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + f.name)); row.appendChild(lab);
        var up = el("button", "base-btn", "Up"); up.type = "button";
        up.addEventListener("click", function () {
          var ix = order.indexOf(id); if (ix > 0) { order.splice(ix, 1); order.splice(ix - 1, 0, id); draw(); }
        });
        var down = el("button", "base-btn", "Down"); down.type = "button";
        down.addEventListener("click", function () {
          var ix = order.indexOf(id); if (ix >= 0 && ix < order.length - 1) { order.splice(ix, 1); order.splice(ix + 1, 0, id); draw(); }
        });
        row.appendChild(up); row.appendChild(down); list.appendChild(row);
      });
    }
    draw(); box.appendChild(list);
    var act = el("div", "dlg-actions");
    var cancel = el("button", "dlg-btn", "Cancel"); cancel.type = "button";
    cancel.addEventListener("click", function () { back.remove(); });
    var ok = el("button", "dlg-btn dlg-ok", "Apply"); ok.type = "button";
    ok.addEventListener("click", function () {
      var cols = order.filter(function (id) { return !hidden[id] && fieldOf(t, id); });
      if (!cols.length) return toast("Keep at least one column");
      layout(t).cols = cols; persist(t, "Columns"); back.remove(); BaseUI.render();
    });
    act.appendChild(cancel); act.appendChild(ok); box.appendChild(act);
    back.appendChild(box); document.body.appendChild(back); ok.focus();
  }
  function colours() {
    var t = BaseStore.table(); if (!t) return toast("Make a table first");
    var rules = copy(layout(t).colors);
    var back = el("div", "dlg-backdrop base-v-back");
    var box = el("div", "dlg base-v-dlg"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.appendChild(el("div", "dlg-title", "Conditional colours"));
    box.appendChild(el("div", "dlg-message", "If a field matches a condition, colour the whole row or just that cell. The first matching rule wins."));
    var list = el("div", "base-v-list");
    function draw() {
      list.textContent = "";
      rules.forEach(function (rule, i) {
        var row = el("div", "base-v-rule");
        var fs = el("select", "bq-sel");
        fieldsOf(t).filter(function (f) { return f.type !== "picture"; }).forEach(function (f) {
          var o = el("option", null, f.name); o.value = f.id; if (f.id === rule.field) o.selected = true; fs.appendChild(o);
        });
        if (!rule.field && fs.options.length) rule.field = fs.value;
        fs.addEventListener("change", function () { rule.field = fs.value; });
        var os = el("select", "bq-sel");
        OPS.forEach(function (o) { var op = el("option", null, o.label); op.value = o.id; if (o.id === rule.op) op.selected = true; os.appendChild(op); });
        if (!rule.op) rule.op = "eq";
        os.addEventListener("change", function () { rule.op = os.value; });
        var val = el("input", "bq-val"); val.value = rule.val == null ? "" : String(rule.val);
        val.addEventListener("input", function () { rule.val = val.value; });
        var tgt = el("select", "bq-sel");
        [["row", "Whole row"], ["cell", "The cell"]].forEach(function (p) {
          var o = el("option", null, p[1]); o.value = p[0]; if (rule.target === p[0]) o.selected = true; tgt.appendChild(o);
        });
        tgt.addEventListener("change", function () { rule.target = tgt.value; });
        var pal = el("div", "base-v-pal");
        COLORS.forEach(function (c) {
          var b = el("button", "base-v-swatch base-c-" + c.id + (rule.color === c.id ? " on" : "")); b.type = "button"; b.title = c.label;
          b.addEventListener("click", function () { rule.color = c.id; draw(); });
          pal.appendChild(b);
        });
        var del = el("button", "base-btn", "Remove"); del.type = "button";
        del.addEventListener("click", function () { rules.splice(i, 1); draw(); });
        row.appendChild(fs); row.appendChild(os); row.appendChild(val); row.appendChild(tgt); row.appendChild(pal); row.appendChild(del);
        list.appendChild(row);
      });
      if (!rules.length) list.appendChild(el("div", "base-hpop-note", "No colour rules yet."));
    }
    draw(); box.appendChild(list);
    var act = el("div", "dlg-actions");
    var add = el("button", "dlg-btn", "+ Rule"); add.type = "button";
    add.addEventListener("click", function () {
      if (rules.length >= 8) return toast("Up to 8 colour rules");
      var f = fieldsOf(t).filter(function (x) { return x.type !== "picture"; })[0];
      rules.push({ field: f ? f.id : "", op: "eq", val: "", color: "yellow", target: "row" }); draw();
    });
    var cancel = el("button", "dlg-btn", "Cancel"); cancel.type = "button";
    cancel.addEventListener("click", function () { back.remove(); });
    var ok = el("button", "dlg-btn dlg-ok", "Apply"); ok.type = "button";
    ok.addEventListener("click", function () { layout(t).colors = rules; persist(t, "Colours"); back.remove(); BaseUI.render(); });
    act.appendChild(add); act.appendChild(cancel); act.appendChild(ok); box.appendChild(act);
    back.appendChild(box); document.body.appendChild(back); ok.focus();
  }
  function setFreeze(n) {
    var t = BaseStore.table(); if (!t) return;
    layout(t).freeze = n === 1 || n === 2 ? n : 0;
    persist(t, "Freeze columns"); if (typeof BaseUI !== "undefined") BaseUI.render();
  }
  function setMode(m) {
    var t = typeof BaseStore !== "undefined" && BaseStore.table();
    if (!t) return;
    if (m === "gallery" || m === "calendar" || m === "grid") {
      layout(t).mode = m;
      if (typeof BASE !== "undefined") BASE.view = m;
      if (typeof BaseStore !== "undefined") BaseStore.save();
    }
  }
  function clearFilters() {
    var t = BaseStore.table(); if (!t) return;
    layout(t).filters = []; persist(t, "Clear filters"); if (typeof BaseUI !== "undefined") BaseUI.render();
  }

  /* ---- gallery & calendar ---- */
  function dateFields(t) { return fieldsOf(t).filter(function (f) { return f.type === "date"; }); }
  function picFields(t) { return fieldsOf(t).filter(function (f) { return f.type === "picture"; }); }
  function textish(t) { return fieldsOf(t).filter(function (f) { return f.type !== "picture"; }); }
  function preview(t, f, row) {
    if (!f) return "";
    if (f.type === "ref" && typeof BaseLinks !== "undefined") return BaseLinks.displayText(f, row.v[f.id]) || "";
    if (f.type === "lookup" && typeof BaseLinks !== "undefined") return BaseLinks.lookupText(t, f, row) || "";
    if (typeof BaseTypes !== "undefined") return BaseTypes.previewText(f, row.v[f.id]) || "";
    var v = row.v[f.id]; return v == null ? "" : String(v);
  }
  function openRecord(t, row) {
    BASE.selRow = row.id; BASE.formIndex = t.rows.indexOf(row); BASE.view = "form";
    if (typeof BaseUI !== "undefined") BaseUI.render();
  }
  function rowsNow(t) { return typeof BaseGrid !== "undefined" ? BaseGrid.visibleRows(t) : (t.rows || []).slice(); }

  function renderGallery() {
    var wrap = $("gallery-wrap"), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    if (!wrap) return;
    wrap.textContent = "";
    if (!t) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var L = layout(t), pics = picFields(t), fields = textish(t);
    var pic = fieldOf(t, L.galleryPic) || pics[0] || null;
    var show = (L.galleryFields.length ? L.galleryFields.map(function (id) { return fieldOf(t, id); }) : fields.slice(0, 4)).filter(Boolean);
    var bar = el("div", "base-gal-bar");
    if (pics.length) {
      var lab = el("label", null, "Picture ");
      var s = el("select", "bq-sel");
      pics.forEach(function (f) { var o = el("option", null, f.name); o.value = f.id; if (pic && f.id === pic.id) o.selected = true; s.appendChild(o); });
      s.addEventListener("change", function () { layout(t).galleryPic = s.value; persist(t); BaseView.renderGallery(); });
      lab.appendChild(s); bar.appendChild(lab);
    }
    bar.appendChild(el("span", "base-hpop-note", "Click a card to open the record"));
    wrap.appendChild(bar);
    var rows = rowsNow(t), cap = rows.length > GALLERY_CAP, shown = cap ? rows.slice(0, GALLERY_CAP) : rows;
    var grid = el("div", "base-gal");
    shown.forEach(function (r) {
      var card = el("button", "base-gal-card" + (r.id === BASE.selRow ? " on" : "")); card.type = "button";
      if (pic) {
        var ph = el("div", "base-gal-pic");
        var key = r.v[pic.id];
        if (key && typeof BasePics !== "undefined") ph.appendChild(BasePics.thumb(key, "base-gal-img"));
        else ph.appendChild(el("span", "base-pic-ph", "No picture"));
        card.appendChild(ph);
      }
      var body = el("div", "base-gal-body");
      show.forEach(function (f, i) {
        var line = el("div", i === 0 ? "base-gal-title" : "base-gal-line");
        if (i) line.appendChild(el("span", "base-gal-k", f.name + " "));
        line.appendChild(document.createTextNode(preview(t, f, r) || "—"));
        body.appendChild(line);
      });
      card.appendChild(body);
      card.addEventListener("click", function () { openRecord(t, r); });
      grid.appendChild(card);
    });
    if (!shown.length) grid.appendChild(el("div", "base-empty", "No records to show."));
    wrap.appendChild(grid);
    var extra = cap ? " · showing " + GALLERY_CAP + " of " + rows.length + " (narrow the filter to see the rest)" : "";
    if (typeof BaseUI !== "undefined") BaseUI.status(rows.length + " of " + t.rows.length + " records · gallery" + extra + (BASE.memOnly ? " · memory only" : ""));
  }
  function renderCalendar() {
    var wrap = $("cal-wrap"), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    if (!wrap) return;
    wrap.textContent = "";
    if (!t) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var L = layout(t), dates = dateFields(t);
    var df = fieldOf(t, L.calendarField) || dates[0] || null;
    var bar = el("div", "base-cal-bar");
    if (!df) {
      wrap.appendChild(el("div", "base-empty", "This table has no Date field, so a calendar cannot be shown. Add a Date field in Fields…"));
      if (typeof BaseUI !== "undefined") BaseUI.status("No date field");
      return;
    }
    var lab = el("label", null, "Date field ");
    var s = el("select", "bq-sel");
    dates.forEach(function (f) { var o = el("option", null, f.name); o.value = f.id; if (f.id === df.id) o.selected = true; s.appendChild(o); });
    s.addEventListener("change", function () { layout(t).calendarField = s.value; persist(t); BaseView.renderCalendar(); });
    lab.appendChild(s); bar.appendChild(lab);
    var rows = rowsNow(t);
    if (!calCursor) {
      var today = new Date(); calCursor = { y: today.getFullYear(), m: today.getMonth() + 1 };
    }
    function nav(d) {
      var m = calCursor.m + d, y = calCursor.y;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      calCursor = { y: y, m: m }; renderCalendar();
    }
    var prev = el("button", "base-btn", "◀"); prev.type = "button"; prev.addEventListener("click", function () { nav(-1); });
    var next = el("button", "base-btn", "▶"); next.type = "button"; next.addEventListener("click", function () { nav(1); });
    var title = el("b", "base-cal-title", monthName(calCursor.m) + " " + calCursor.y);
    bar.appendChild(prev); bar.appendChild(title); bar.appendChild(next);
    wrap.appendChild(bar);
    var items = [], blank = [];
    rows.forEach(function (r) {
      var v = r.v[df.id];
      if (!v) { blank.push(r); return; }
      items.push({ date: String(v).slice(0, 10), row: r, label: preview(t, textish(t)[0] || df, r) || "(record)" });
    });
    var built = monthCells(calCursor.y, calCursor.m, items);
    var tbl = el("table", "base-cal");
    var hr = tbl.createTHead().insertRow();
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) { var h = document.createElement("th"); h.textContent = d; hr.appendChild(h); });
    var body = tbl.createTBody();
    built.weeks.forEach(function (week) {
      var tr = body.insertRow();
      week.forEach(function (cell) {
        var td = tr.insertCell(); td.className = "base-cal-day" + (cell.inMonth ? "" : " other");
        td.appendChild(el("div", "base-cal-num", String(cell.day)));
        var recs = cell.items, more = recs.length > DAY_CAP;
        (more ? recs.slice(0, DAY_CAP) : recs).forEach(function (it) {
          var b = el("button", "base-cal-item" + (it.row.id === BASE.selRow ? " on" : ""), it.label); b.type = "button";
          b.addEventListener("click", function () { openRecord(t, it.row); });
          td.appendChild(b);
        });
        if (more) td.appendChild(el("div", "base-cal-more", "+" + (recs.length - DAY_CAP) + " more"));
      });
    });
    wrap.appendChild(tbl);
    if (blank.length) {
      var rest = el("div", "base-cal-blank");
      rest.appendChild(el("div", "base-cal-blank-title", blank.length + " record" + (blank.length === 1 ? "" : "s") + " with no date"));
      blank.slice(0, 20).forEach(function (r) {
        var b = el("button", "base-cal-item", preview(t, textish(t)[0] || df, r) || "(record)"); b.type = "button";
        b.addEventListener("click", function () { openRecord(t, r); });
        rest.appendChild(b);
      });
      if (blank.length > 20) rest.appendChild(el("span", "base-hpop-note", " +" + (blank.length - 20) + " more"));
      wrap.appendChild(rest);
    }
    if (typeof BaseUI !== "undefined") BaseUI.status(rows.length + " of " + t.rows.length + " records · " + monthName(calCursor.m) + " " + calCursor.y + (BASE.memOnly ? " · memory only" : ""));
  }

  /* ---- saved views ---- */
  function snapshot(t, name, id) {
    var L = layout(t);
    return {
      id: id || (typeof BaseStore !== "undefined" ? BaseStore.uid() : String(Math.random()).slice(2, 9)),
      name: name, table: t.id,
      filters: copy(L.filters), sort: L.sort ? copy(L.sort) : null, cols: L.cols.slice(),
      widths: copy(L.widths), freeze: L.freeze, colors: copy(L.colors),
      mode: L.mode || "grid", galleryPic: L.galleryPic || "", galleryFields: (L.galleryFields || []).slice(),
      calendarField: L.calendarField || ""
    };
  }
  function applyView(t, v) {
    t.layout = normalize(v, t);
    if (typeof BASE !== "undefined") {
      BASE.sort = t.layout.sort;
      if (t.layout.mode === "gallery" || t.layout.mode === "calendar" || t.layout.mode === "grid") BASE.view = t.layout.mode;
    }
  }
  function save() {
    var t = BaseStore.table(); if (!t) return toast("Make a table first");
    OfficeDialog.prompt({ title: "Save view", label: "View name", value: "My view" }).then(function (n) {
      if (!n) return;
      var vs = views(), name = n.trim();
      var old = vs.filter(function (x) { return x.name === name && x.table === t.id; })[0];
      persist(t, "Save view");
      var rec = snapshot(t, name, old && old.id);
      if (old) vs[vs.indexOf(old)] = rec; else vs.push(rec);
      BaseStore.save(); renderPicker(); toast("View “" + name + "” saved");
    });
  }
  function currentSaved() {
    var t = typeof BaseStore !== "undefined" && BaseStore.table(); if (!t) return null;
    var pick = $("view-pick"); if (pick && pick.value) return views().filter(function (v) { return v.id === pick.value; })[0] || null;
    return null;
  }
  function rename() {
    var v = currentSaved(); if (!v) return toast("Pick a saved view first");
    OfficeDialog.prompt({ title: "Rename view", label: "Name", value: v.name }).then(function (n) {
      if (!n) return;
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Rename view"); } catch (e) {}
      v.name = n.trim(); BaseStore.save(); renderPicker();
    });
  }
  function remove() {
    var v = currentSaved(); if (!v) return toast("Pick a saved view first");
    OfficeDialog.confirm({ title: "Delete view?", message: "Delete saved view “" + v.name + "”? Your records are not touched.", okLabel: "Delete", danger: true }).then(function (ok) {
      if (!ok) return;
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Delete view"); } catch (e) {}
      BASE.db.views = views().filter(function (x) { return x !== v; });
      BaseStore.save(); renderPicker();
    });
  }
  function pick(id) {
    var v = views().filter(function (x) { return x.id === id; })[0]; if (!v) return;
    if (!BASE.db.tables.some(function (t) { return t.id === v.table; })) return toast("That view's table was deleted");
    if (BaseStore.table().id !== v.table) { BASE.db.current = v.table; BASE.selRow = null; }
    var t = BaseStore.table();
    try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Apply view"); } catch (e) {}
    applyView(t, v); BaseStore.save();
    if (BASE.report) BASE.report = null;
    if (typeof BaseUI !== "undefined") BaseUI.render();
    toast("View “" + v.name + "”");
  }
  function dropForTable(tableId) {
    if (typeof BASE === "undefined" || !BASE.db.views) return;
    BASE.db.views = BASE.db.views.filter(function (v) { return v.table !== tableId; });
  }
  function renderPicker() {
    var vs = views(), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    var mine = t ? vs.filter(function (v) { return v.table === t.id; }) : vs;
    var ps = $("view-pick"), fm = $("file-views");
    if (ps) {
      ps.textContent = "";
      var o0 = el("option", null, mine.length ? "Saved views…" : "(no saved views)"); o0.value = ""; ps.appendChild(o0);
      mine.forEach(function (v) { var o = el("option", null, v.name); o.value = v.id; ps.appendChild(o); });
    }
    if (fm) {
      fm.textContent = "";
      vs.forEach(function (v) {
        var tb = useDb().tables.filter(function (x) { return x.id === v.table; })[0];
        var b = el("button", "file-item", "▣ " + v.name + (tb ? " · " + tb.name : ""));
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.addEventListener("click", function () { if (typeof ribbonSetFile === "function") ribbonSetFile(false); pick(v.id); });
        fm.appendChild(b);
      });
      var tit = $("file-views-title"); if (tit) tit.hidden = !vs.length;
    }
    var fr = $("view-freeze");
    if (fr && t) fr.value = String(layout(t).freeze || 0);
    var cf = $("btn-filters-clear"); if (cf && t) cf.disabled = !layout(t).filters.length;
    ["grid", "form", "gallery", "calendar"].forEach(function (m) {
      var b = $("btn-view-" + m); if (b && typeof BASE !== "undefined") b.classList.toggle("on", BASE.view === m);
    });
  }
  function render() { renderPicker(); }
  function decorateHeader(th, t, field) {
    markHeader(th, t, field);
    th.classList.add("base-col-h");
    th.title = "Sort and filter " + field.name;
    th.addEventListener("click", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("base-col-resizer")) return;
      openHeader(th, field);
    });
    attachResize(th, field);
  }
  function afterGrid(tbl, cols, t, rows, rendered, capped) {
    applyFreeze(tbl, cols, t);
    var extra = [];
    if (layout(t).filters.length) extra.push("filtered");
    if (capped) extra.push("showing " + rendered + " of " + rows.length + " (narrow the filter to see the rest)");
    return extra;
  }
  function syncSort(t) {
    if (!t) return;
    var L = layout(t);
    if (typeof BASE !== "undefined") {
      if (BASE.sort && (!L.sort || L.sort.field !== BASE.sort.field || L.sort.dir !== BASE.sort.dir)) {
        /* Keep BASE.sort as the live sort (Clear sort / header). */
      }
      if (L.sort && !BASE.sort) BASE.sort = L.sort;
    }
  }

  var api = {
    COLORS: COLORS, GRID_CAP: GRID_CAP, GALLERY_CAP: GALLERY_CAP, UNIQUE_CAP: UNIQUE_CAP, DAY_CAP: DAY_CAP,
    layout: layout, normalize: normalize, defaultLayout: defaultLayout,
    applyFilters: applyFilters, matchFilter: matchFilter, matchCond: matchCond,
    applyColors: applyColors, visibleCols: visibleCols, uniqueValues: uniqueValues,
    monthCells: monthCells, monthName: monthName, widthOf: widthOf,
    openHeader: openHeader, columns: columns, colours: colours, setFreeze: setFreeze, setMode: setMode,
    clearFilters: clearFilters, save: save, rename: rename, remove: remove, pick: pick,
    dropForTable: dropForTable, renderPicker: renderPicker, render: render,
    renderGallery: renderGallery, renderCalendar: renderCalendar,
    decorateHeader: decorateHeader, afterGrid: afterGrid, applyFreeze: applyFreeze,
    paintRow: paintRow, attachResize: attachResize, closePop: closePop, persist: persist, syncSort: syncSort
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseView = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
