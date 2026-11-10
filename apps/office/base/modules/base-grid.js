/*
 * base-grid.js  (BS1, BS2: query filter + shown fields, Totals row, BS5: new field types)
 * Grid view: one control per cell (inline edit, autosave), header click sorts (asc -> desc -> off),
 * search box filters rows (any field contains text; pictures are skipped). Row number click selects
 * a row (for Records ⋯ > Delete record…, BS4).
 * BS5: Choice is a <select>, Currency shows ₹ en-IN when not editing, Long text is a one-line
 *   textarea, Picture is a thumbnail, Auto-number ID is read-only, Link has an open-in-new-tab
 *   button, invalid (required / unique) cells are marked. Totals include Currency.
 * API: BaseGrid.render(), BaseGrid.visibleRows(t, ignoreSearch), BaseGrid.inputFor(field, value, onSet, mode, row)
 */
var BaseGrid = (function () {
  function T() { return typeof BaseTypes !== "undefined" ? BaseTypes : null; }
  function cmp(a, b, type) {
    var st = T() ? BaseTypes.sortType(type) : type;
    if (st === "number") return (a === "" || a == null || isNaN(+a) ? -Infinity : +a) - (b === "" || b == null || isNaN(+b) ? -Infinity : +b);
    if (st === "bool") return (a ? 1 : 0) - (b ? 1 : 0);
    if (type === "picture") return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), undefined, { numeric: true, sensitivity: "base" });
  }
  function visibleRows(t, ignoreSearch) {
    var rows = typeof BaseQuery !== "undefined" ? BaseQuery.filter(t, t.rows.slice()) : t.rows.slice(), q = ignoreSearch ? "" : BASE.search.trim().toLowerCase(), s = BASE.sort;
    if (q) rows = rows.filter(function (r) {
      return t.fields.some(function (f) {
        if (f.type === "picture") return false;
        var v = T() ? BaseTypes.formatSearch(f, r.v[f.id]) : (f.type === "bool" ? (r.v[f.id] ? "yes" : "no") : String(r.v[f.id] == null ? "" : r.v[f.id]));
        return v.toLowerCase().indexOf(q) >= 0;
      });
    });
    var f = s && t.fields.filter(function (x) { return x.id === s.field; })[0];
    if (f) rows.sort(function (a, b) { return cmp(a.v[f.id], b.v[f.id], f.type) * s.dir; });
    return rows;
  }

function inputFor(f, val, onSet, mode, r) {
    mode = mode || "grid";
    var t = BaseStore.table();
    var wrap = document.createElement("div"); wrap.className = "base-cell base-cell-" + f.type + (mode === "form" ? " in-form" : "");
    var issue = (r && typeof BaseFields !== "undefined") ? BaseFields.issue(t, f, r) : null;

    function pendingMark(read) {
      if (typeof BaseTypes === "undefined") return;
      var res = BaseTypes.validate(t, f, read(), r.id);
      BaseFields.mark(wrap, (res.error || res.warn) ? res : null);
    }
    function restore(node, readFailed) {
      var cur = r.v[f.id];
      if (node.type === "checkbox") node.checked = !!cur;
      else if ("value" in node) node.value = cur == null ? "" : String(cur);
    }
    function hook(node, ev, read) {
      if (r && typeof BaseFields !== "undefined") {
        node.addEventListener("focus", function () { BaseFields.touch(f, r); });
        node.addEventListener(ev === "change" ? "change" : "input", function () {
          var ok = BaseFields.apply(t, f, r, read(), ev === "change" ? "change" : "live");
          if (!ok && ev === "change") restore(node);
          pendingMark(read);
        });
        if (ev !== "change") node.addEventListener("blur", function () {
          var ok = BaseFields.apply(t, f, r, read(), "blur");
          if (!ok) restore(node);
          BaseFields.mark(wrap, BaseFields.issue(t, f, r));
        });
      } else if (onSet) {
        node.addEventListener(ev === "change" ? "change" : "input", function () { onSet(read()); });
      }
    }

    if (f.type === "bool") {
      var i = document.createElement("input"); i.type = "checkbox"; i.checked = !!val;
      hook(i, "change", function () { return i.checked; });
      wrap.appendChild(i);
    } else if (f.type === "choice") {
      var s = document.createElement("select"); s.className = "base-choice";
      var opts = (f.options || []).slice(), cur = val == null ? "" : String(val);
      if (!f.required) { var z = document.createElement("option"); z.value = ""; z.textContent = "—"; s.appendChild(z); }
      if (cur && opts.indexOf(cur) < 0) opts = [cur].concat(opts);
      opts.forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o; s.appendChild(op); });
      s.value = cur;
      hook(s, "change", function () { return s.value; });
      wrap.appendChild(s);
    } else if (f.type === "id") {
      var ro = document.createElement("input"); ro.type = "text"; ro.value = val == null ? "" : String(val);
      ro.readOnly = true; ro.tabIndex = -1; ro.className = "base-id"; ro.setAttribute("aria-readonly", "true");
      wrap.appendChild(ro);
    } else if (f.type === "long") {
      var ta = document.createElement("textarea"); ta.className = "base-long";
      ta.rows = mode === "form" ? 6 : 1; ta.value = val == null ? "" : String(val);
      ta.setAttribute("aria-label", f.name);
      hook(ta, "input", function () { return ta.value; });
      wrap.appendChild(ta);
    } else if (f.type === "picture") {
      wrap.classList.add("base-pic-cell");
      if (val && typeof BasePics !== "undefined") wrap.appendChild(BasePics.thumb(val, mode === "form" ? "base-pic-lg" : "base-thumb"));
      else { var ph = document.createElement("span"); ph.className = "base-pic-ph"; ph.textContent = mode === "form" ? "No picture" : "—"; wrap.appendChild(ph); }
      if (f.type === "picture" && r) {
        var actions = document.createElement("div"); actions.className = "base-pic-actions";
        var lab = document.createElement("label"); lab.className = "base-pic-btn"; lab.textContent = val ? "Change" : "Add";
        var file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
        lab.appendChild(file);
        file.addEventListener("change", function () {
          var fl = file.files && file.files[0]; file.value = ""; if (!fl) return;
          if (typeof BaseFields !== "undefined") BaseFields.touch(f, r);
          BasePics.ingest(fl, function (key) {
            if (!key) return;
            if (typeof BaseFields !== "undefined") BaseFields.apply(t, f, r, key, "set");
            else { r.v[f.id] = key; BaseStore.save(); }
            BaseUI.render();
          });
        });
        actions.appendChild(lab);
        if (val) {
          var rm = document.createElement("button"); rm.type = "button"; rm.className = "base-pic-btn"; rm.textContent = "Remove";
          rm.addEventListener("click", function () {
            if (typeof BaseFields !== "undefined") BaseFields.apply(t, f, r, "", "set");
            else { r.v[f.id] = ""; BaseStore.save(); }
            BaseUI.render();
          });
          actions.appendChild(rm);
        }
        wrap.appendChild(actions);
      }
    } else if (f.type === "currency") {
      var ci = document.createElement("input"); ci.type = "text"; ci.inputMode = "decimal";
      ci.className = "base-currency-in";
      var focused = false;
      function show() { ci.value = focused ? (val === "" || val == null ? "" : String(val)) : (T() ? BaseTypes.formatCurrency(val) : String(val == null ? "" : val)); }
      show();
      ci.addEventListener("focus", function () { focused = true; if (r && typeof BaseFields !== "undefined") BaseFields.touch(f, r); ci.value = (r ? r.v[f.id] : val) == null || (r ? r.v[f.id] : val) === "" ? "" : String(r ? r.v[f.id] : val); });
      ci.addEventListener("input", function () {
        if (r && typeof BaseFields !== "undefined") {
          var n = BaseTypes.parseCurrency(ci.value);
          if (n !== null) BaseFields.apply(t, f, r, n, "live");
        } else if (onSet) { var n2 = T() ? BaseTypes.parseCurrency(ci.value) : Number(ci.value); if (n2 !== null) onSet(n2); }
      });
      ci.addEventListener("blur", function () {
        focused = false;
        if (r && typeof BaseFields !== "undefined") {
          var n = BaseTypes.parseCurrency(ci.value);
          if (ci.value.trim() === "") n = "";
          if (n === null) { toastLike("Enter a number for “" + f.name + "”"); n = r.v[f.id]; }
          BaseFields.apply(t, f, r, n, "blur");
          val = r.v[f.id];
        }
        show();
        if (r && typeof BaseFields !== "undefined") BaseFields.mark(wrap, BaseFields.issue(t, f, r));
      });
      wrap.appendChild(ci);
    } else if (f.type === "link") {
      var li = document.createElement("input"); li.type = "url"; li.value = val == null ? "" : String(val);
      li.placeholder = "https://";
      hook(li, "input", function () { return li.value; });
      wrap.appendChild(li);
      var a = document.createElement("a"); a.className = "base-link-out"; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "↗"; a.title = "Open link"; a.setAttribute("aria-label", "Open link in a new tab");
      function setHref() { var h = T() ? BaseTypes.hrefFor(li.value) : ""; if (h) { a.href = h; a.hidden = false; } else { a.removeAttribute("href"); a.hidden = !li.value; } }
      li.addEventListener("input", setHref); li.addEventListener("blur", setHref); setHref();
      a.addEventListener("click", function (e) { if (!a.href) e.preventDefault(); });
      wrap.appendChild(a);
    } else {
      var inp = document.createElement("input");
      inp.type = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
      inp.value = val == null ? "" : val;
      if (f.type === "number") inp.step = "any";
      if (f.type === "email") inp.placeholder = "name@example.com";
      if (f.type === "phone") inp.inputMode = "tel";
      hook(inp, "input", function () { return f.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value; });
      wrap.appendChild(inp);
    }
    if (issue && typeof BaseFields !== "undefined") BaseFields.mark(wrap, issue);
    /* For callers that want a raw input (legacy), wrap is the cell control. */
    return wrap;
  }
  function toastLike(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 2500); } catch (e) {} }

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
      h.textContent = f.name + (f.required ? " *" : "");
      if (f.required) h.title = f.name + " (required)";
      var sm = document.createElement("small");
      var lab = T() ? BaseTypes.label(f.type) : BaseUI.typeLabel(f.type);
      sm.textContent = (s && s.field === f.id ? (s.dir > 0 ? "▲ " : "▼ ") : "") + lab;
      h.appendChild(sm); if (!h.title) h.title = "Sort by " + f.name;
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
        var inp = inputFor(f, r.v[f.id], null, "grid", r);
        inp.addEventListener("focus", function (e) { if (BASE.selRow !== r.id) { var o = body.querySelector("tr.sel"); if (o) o.className = ""; tr.className = "sel"; BASE.selRow = r.id; } }, true);
        var ctrl = inp.querySelector("input, select, textarea");
        if (ctrl) ctrl.setAttribute("aria-label", f.name + " " + (n + 1));
        td.appendChild(inp);
      });
    });
    if (BASE.totals) totals(tbl, cols, rows);
    wrap.appendChild(tbl);
    var aq = typeof BaseQuery !== "undefined" && BaseQuery.active();
    BaseUI.status(rows.length + " of " + t.rows.length + " records" + (aq ? " · query" + (aq.name ? " “" + aq.name + "”" : "") : "") + (BASE.memOnly ? " · memory only" : ""));
  }
  /* Totals row (BS2/BS5): Sum / Avg / Count for Number and Currency fields over the visible rows */
  function fmt(n) { return Math.round(n * 100) / 100 + ""; }
  function totals(tbl, cols, rows) {
    var tr = tbl.createTFoot().insertRow(), c = tr.insertCell(); c.className = "num"; c.textContent = "Σ";
    cols.forEach(function (f) {
      var td = tr.insertCell(); td.className = "base-total";
      var numeric = f.type === "number" || f.type === "currency";
      if (!numeric) { if (f === cols[0]) td.textContent = rows.length + " records"; return; }
      var v = rows.map(function (r) { return r.v[f.id]; }).filter(function (x) { return x !== "" && x != null && !isNaN(+x); }).map(Number);
      var sum = v.reduce(function (a, b) { return a + b; }, 0);
      var show = function (n) { return f.type === "currency" && T() ? BaseTypes.formatCurrency(n) : fmt(n); };
      [["Sum", v.length ? show(sum) : "–"], ["Avg", v.length ? show(sum / v.length) : "–"], ["Count", v.length]].forEach(function (p) { var d = document.createElement("div"); d.textContent = p[0] + ": " + p[1]; td.appendChild(d); });
    });
  }
  return { render: render, visibleRows: visibleRows, inputFor: inputFor };
})();
