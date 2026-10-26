/*
 * base-query.js  (BS2)
 * Query builder (no SQL typing): pick table, condition rows (field / operator / value), AND/OR,
 * sort field + direction, fields to show. Run = grid shows only matching rows + chosen fields
 * (cells stay editable; edits go to the real table). Saved queries live in BASE.db.queries
 * (same IndexedDB record as the tables). "Show as SQL" prints the same query as SQL + a plain
 * explanation of each part, for learning only.
 *   Query: { id, name, table, join: "and"|"or", conds: [{field, op, val}], sort: {field, dir}|null, show: [fieldId] }
 * API: BaseQuery.open(), .close(), .run(q), .clear(), .filter(t, rows), .shown(t), .active(),
 *      .save(), .rename(), .remove(), .pick(id), .toggleSql(), .renderPicker()
 */
var BaseQuery = (function () {
  var OPS = [
    { id: "eq", label: "=", sql: "=", types: "text number date" }, { id: "ne", label: "≠", sql: "<>", types: "text number date" },
    { id: "gt", label: ">", sql: ">", types: "number date" }, { id: "lt", label: "<", sql: "<", types: "number date" },
    { id: "ge", label: ">=", sql: ">=", types: "number date" }, { id: "le", label: "<=", sql: "<=", types: "number date" },
    { id: "has", label: "contains", types: "text" }, { id: "sw", label: "starts with", types: "text" },
    { id: "empty", label: "is empty", types: "text number date" }, { id: "full", label: "is not empty", types: "text number date" },
    { id: "yes", label: "is yes", types: "bool" }, { id: "no", label: "is no", types: "bool" }
  ];
  var draft = null, showSql = false;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function toast(m) { if (typeof OfficeToast !== "undefined") OfficeToast.show(m, 2500); }
  function queries() { if (!BASE.db.queries) BASE.db.queries = []; return BASE.db.queries; }
  function fieldOf(t, id) { return t.fields.filter(function (f) { return f.id === id; })[0]; }
  function opOf(id) { return OPS.filter(function (o) { return o.id === id; })[0]; }
  function opsFor(type) { return OPS.filter(function (o) { return o.types.split(" ").indexOf(type) >= 0; }); }
  function active() { var q = BASE.query, t = BaseStore.table(); return q && t && q.table === t.id ? q : null; }
  function blank(t) { return { id: null, name: "", table: t.id, join: "and", conds: [], sort: null, show: t.fields.map(function (f) { return f.id; }) }; }
  function copy(q) { return JSON.parse(JSON.stringify(q)); }

  /* ---- evaluation ---- */
  function test(c, f, v) {
    var o = c.op, empty = v === "" || v == null;
    if (o === "yes") return !!v; if (o === "no") return !v;
    if (o === "empty") return empty; if (o === "full") return !empty;
    var a = v, b = c.val;
    if (f.type === "number") { if (empty || b === "" || isNaN(+b)) return o === "ne" && !empty; a = +a; b = +b; }
    else { a = String(a == null ? "" : a).toLowerCase(); b = String(b == null ? "" : b).toLowerCase(); }
    switch (o) {
      case "eq": return a === b; case "ne": return a !== b;
      case "gt": return !empty && a > b; case "lt": return !empty && a < b;
      case "ge": return !empty && a >= b; case "le": return !empty && a <= b;
      case "has": return a.indexOf(b) >= 0; case "sw": return a.indexOf(b) === 0;
    }
    return true;
  }
  function filter(t, rows) {
    var q = active(); if (!q) return rows;
    var cs = q.conds.filter(function (c) { return fieldOf(t, c.field) && opOf(c.op); });
    if (cs.length) rows = rows.filter(function (r) {
      var res = cs.map(function (c) { var f = fieldOf(t, c.field); return test(c, f, r.v[f.id]); });
      return q.join === "or" ? res.indexOf(true) >= 0 : res.indexOf(false) < 0;
    });
    return rows;
  }
  function shown(t) {
    var q = active(); if (!q || !q.show || !q.show.length) return t.fields;
    var s = t.fields.filter(function (f) { return q.show.indexOf(f.id) >= 0; });
    return s.length ? s : t.fields;
  }

  /* ---- SQL text (learning only) ---- */
  function qi(n) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : '"' + n.replace(/"/g, '""') + '"'; }
  function lit(f, v) { return f.type === "number" && v !== "" && !isNaN(+v) ? String(+v) : "'" + String(v).replace(/'/g, "''") + "'"; }
  function condSql(t, c) {
    var f = fieldOf(t, c.field), o = opOf(c.op); if (!f || !o) return "";
    var n = qi(f.name);
    if (o.id === "yes") return n + " = TRUE"; if (o.id === "no") return n + " = FALSE";
    if (o.id === "empty") return "(" + n + " IS NULL OR " + n + " = '')";
    if (o.id === "full") return "(" + n + " IS NOT NULL AND " + n + " <> '')";
    if (o.id === "has") return n + " LIKE '%" + String(c.val).replace(/'/g, "''") + "%'";
    if (o.id === "sw") return n + " LIKE '" + String(c.val).replace(/'/g, "''") + "%'";
    return n + " " + o.sql + " " + lit(f, c.val);
  }
  function sql(q) {
    var t = BASE.db.tables.filter(function (x) { return x.id === q.table; })[0]; if (!t) return { text: "", parts: [] };
    var show = t.fields.filter(function (f) { return q.show.indexOf(f.id) >= 0; });
    var all = !show.length || show.length === t.fields.length;
    var sel = all ? "*" : show.map(function (f) { return qi(f.name); }).join(", ");
    var where = q.conds.map(function (c) { return condSql(t, c); }).filter(Boolean);
    var sf = q.sort && fieldOf(t, q.sort.field);
    var text = "SELECT " + sel + "\nFROM " + qi(t.name);
    var parts = [["SELECT " + sel, all ? "show every field (* means all)" : "show only these fields"], ["FROM " + qi(t.name), "read records from this table"]];
    if (where.length) {
      var w = where.join(q.join === "or" ? "\n   OR " : "\n  AND ");
      text += "\nWHERE " + w;
      parts.push(["WHERE …", "keep only records where " + (where.length > 1 ? (q.join === "or" ? "ANY" : "ALL") + " of the conditions are true" : "the condition is true") + " (LIKE '%x%' = contains, 'x%' = starts with)"]);
    }
    if (sf) { text += "\nORDER BY " + qi(sf.name) + (q.sort.dir < 0 ? " DESC" : " ASC"); parts.push(["ORDER BY", "sort the results; ASC = small→big / A→Z, DESC = big→small / Z→A"]); }
    return { text: text + ";", parts: parts };
  }

  /* ---- builder panel ---- */
  function sel(opts, val, cls, onCh) {
    var s = el("select", cls); opts.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; op.selected = o[0] === val; s.appendChild(op); });
    s.addEventListener("change", function () { onCh(s.value); }); return s;
  }
  function render() {
    var wrap = $("query-wrap"), t = BaseStore.table();
    wrap.textContent = "";
    if (!draft || !t) { wrap.hidden = true; return; }
    if (draft.table !== t.id) draft = blank(t);
    wrap.hidden = false;
    var box = el("div", "bq");
    var head = el("div", "bq-head");
    head.appendChild(el("b", null, draft.name ? "Query: " + draft.name : "New query"));
    head.appendChild(sel(BASE.db.tables.map(function (x) { return [x.id, "Table: " + x.name]; }), t.id, "bq-sel", function (id) { BaseUI.switchTable(id); draft = blank(BaseStore.table()); render(); }));
    box.appendChild(head);

    /* conditions */
    box.appendChild(el("div", "bq-label", "Show records where"));
    draft.conds.forEach(function (c, i) {
      var row = el("div", "bq-row"), f = fieldOf(t, c.field) || t.fields[0];
      if (!f) return; c.field = f.id;
      var ops = opsFor(f.type); if (!opOf(c.op) || ops.indexOf(opOf(c.op)) < 0) c.op = ops[0].id;
      if (i > 0) row.appendChild(el("span", "bq-join", draft.join.toUpperCase()));
      row.appendChild(sel(t.fields.map(function (x) { return [x.id, x.name]; }), f.id, "bq-sel", function (v) { c.field = v; c.val = ""; render(); }));
      row.appendChild(sel(ops.map(function (o) { return [o.id, o.label]; }), c.op, "bq-sel", function (v) { c.op = v; render(); }));
      if (["empty", "full", "yes", "no"].indexOf(c.op) < 0) {
        var inp = el("input", "bq-val"); inp.type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
        if (f.type === "number") inp.step = "any"; inp.value = c.val == null ? "" : c.val; inp.placeholder = "value";
        inp.addEventListener("input", function () { c.val = inp.value; if (showSql) renderSql(); });
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
        row.appendChild(inp);
      }
      var x = el("button", "bq-x", "✕"); x.type = "button"; x.title = "Remove condition";
      x.addEventListener("click", function () { draft.conds.splice(i, 1); render(); }); row.appendChild(x);
      box.appendChild(row);
    });
    var cr = el("div", "bq-row");
    var add = el("button", "base-btn", "+ Condition"); add.type = "button";
    add.addEventListener("click", function () { draft.conds.push({ field: t.fields[0] && t.fields[0].id, op: "", val: "" }); render(); });
    cr.appendChild(add);
    if (draft.conds.length > 1) {
      ["and", "or"].forEach(function (j) {
        var b = el("button", "base-btn" + (draft.join === j ? " on" : ""), j === "and" ? "Match ALL (AND)" : "Match ANY (OR)"); b.type = "button";
        b.addEventListener("click", function () { draft.join = j; render(); }); cr.appendChild(b);
      });
    }
    box.appendChild(cr);

    /* sort */
    box.appendChild(el("div", "bq-label", "Sort by"));
    var sr = el("div", "bq-row");
    sr.appendChild(sel([["", "(no sort)"]].concat(t.fields.map(function (x) { return [x.id, x.name]; })), draft.sort ? draft.sort.field : "", "bq-sel", function (v) { draft.sort = v ? { field: v, dir: draft.sort ? draft.sort.dir : 1 } : null; render(); }));
    if (draft.sort) sr.appendChild(sel([["1", "Ascending (A→Z, 1→9)"], ["-1", "Descending (Z→A, 9→1)"]], String(draft.sort.dir), "bq-sel", function (v) { draft.sort.dir = +v; render(); }));
    box.appendChild(sr);

    /* fields to show */
    box.appendChild(el("div", "bq-label", "Fields to show"));
    var fr = el("div", "bq-row bq-checks");
    t.fields.forEach(function (f) {
      var l = el("label", "bq-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = draft.show.indexOf(f.id) >= 0;
      cb.addEventListener("change", function () { draft.show = t.fields.filter(function (x) { return x === f ? cb.checked : draft.show.indexOf(x.id) >= 0; }).map(function (x) { return x.id; }); if (showSql) renderSql(); });
      l.appendChild(cb); l.appendChild(document.createTextNode(" " + f.name)); fr.appendChild(l);
    });
    box.appendChild(fr);

    /* actions */
    var ar = el("div", "bq-row bq-actions");
    [["▶ Run", "primary", run], ["Save…", "", save], ["Show as SQL", showSql ? "on" : "", toggleSql], ["Clear", "", clear], ["Close", "", close]].forEach(function (a) {
      var b = el("button", "base-btn " + a[1], a[0]); b.type = "button"; b.addEventListener("click", a[2]); ar.appendChild(b);
    });
    box.appendChild(ar);
    var sq = el("div", "bq-sql"); sq.id = "bq-sql"; sq.hidden = !showSql; box.appendChild(sq);
    wrap.appendChild(box);
    if (showSql) renderSql();
  }
  function renderSql() {
    var box = $("bq-sql"); if (!box || !draft) return;
    box.textContent = ""; var s = sql(draft);
    box.appendChild(el("pre", null, s.text));
    var ul = el("ul"); s.parts.forEach(function (p) { var li = el("li"); li.appendChild(el("code", null, p[0])); li.appendChild(document.createTextNode(" — " + p[1])); ul.appendChild(li); });
    box.appendChild(ul);
    box.appendChild(el("div", "bq-note", "Read-only, for learning. You never need to type SQL here."));
  }

  /* ---- commands ---- */
  function open() { var t = BaseStore.table(); if (!t) return toast("Make a table first"); draft = active() ? copy(BASE.query) : (draft && draft.table === t.id ? draft : blank(t)); BASE.view = "grid"; BaseUI.render(); }
  function close() { draft = null; render(); }
  function run(q) {
    if (q && q.conds) { if (draft) draft = copy(q); } else if (draft) q = draft; else return;
    BASE.query = copy(q); BASE.sort = q.sort ? { field: q.sort.field, dir: q.sort.dir } : null; BASE.selRow = null;
    BASE.view = "grid"; BaseUI.render();
    var t = BaseStore.table(); toast((t ? BaseGrid.visibleRows(t).length : 0) + " records match");
  }
  function clear() { BASE.query = null; BASE.sort = null; var t = BaseStore.table(); if (draft && t) draft = blank(t); BaseUI.render(); }
  function save() {
    if (!draft) open(); if (!draft) return;
    OfficeDialog.prompt({ title: "Save query", label: "Query name", value: draft.name || "My query" }).then(function (n) {
      if (!n) return; var qs = queries(), d = copy(draft); d.name = n.trim();
      var old = qs.filter(function (x) { return x.id && x.id === d.id; })[0] || qs.filter(function (x) { return x.name === d.name && x.table === d.table; })[0];
      if (old) { d.id = old.id; qs[qs.indexOf(old)] = d; } else { d.id = BaseStore.uid(); qs.push(d); }
      draft.id = d.id; draft.name = d.name; BaseStore.save(); run(d); toast("Query “" + d.name + "” saved");
    });
  }
  function current() { var q = active() || draft; return q && q.id ? queries().filter(function (x) { return x.id === q.id; })[0] : null; }
  function rename() {
    var q = current(); if (!q) return toast("Pick a saved query first");
    OfficeDialog.prompt({ title: "Rename query", label: "Name", value: q.name }).then(function (n) {
      if (!n) return; q.name = n.trim(); if (draft && draft.id === q.id) draft.name = q.name; if (BASE.query && BASE.query.id === q.id) BASE.query.name = q.name; BaseStore.save(); BaseUI.render();
    });
  }
  function remove() {
    var q = current(); if (!q) return toast("Pick a saved query first");
    OfficeDialog.confirm({ title: "Delete query?", message: "Delete saved query “" + q.name + "”? Your records are not touched.", okLabel: "Delete", danger: true }).then(function (ok) {
      if (!ok) return; BASE.db.queries = queries().filter(function (x) { return x !== q; });
      if (draft && draft.id === q.id) { draft.id = null; draft.name = ""; } if (BASE.query && BASE.query.id === q.id) BASE.query.id = null;
      BaseStore.save(); BaseUI.render();
    });
  }
  function pick(id) {
    var q = queries().filter(function (x) { return x.id === id; })[0]; if (!q) return;
    if (!BASE.db.tables.some(function (t) { return t.id === q.table; })) return toast("That query's table was deleted");
    if (BaseStore.table().id !== q.table) { BASE.db.current = q.table; BASE.selRow = null; }
    run(q);
  }
  function toggleSql() { showSql = !showSql; render(); }
  function renderPicker() {
    var qs = queries(), ps = $("query-pick"), fm = $("file-queries"), cur = active();
    if (ps) {
      ps.textContent = ""; var o0 = el("option", null, qs.length ? "Saved queries…" : "(no saved queries)"); o0.value = ""; ps.appendChild(o0);
      qs.forEach(function (q) { var t = BASE.db.tables.filter(function (x) { return x.id === q.table; })[0]; var o = el("option", null, q.name + (t ? " · " + t.name : "")); o.value = q.id; o.selected = !!(cur && cur.id === q.id); ps.appendChild(o); });
    }
    if (fm) {
      fm.textContent = "";
      qs.forEach(function (q) { var b = el("button", "file-item" + (cur && cur.id === q.id ? " on" : ""), "▶ " + q.name); b.type = "button"; b.setAttribute("role", "menuitem"); b.addEventListener("click", function () { ribbonSetFile(false); pick(q.id); }); fm.appendChild(b); });
      $("file-queries-title").hidden = !qs.length;
    }
    var on = $("btn-query"); if (on) on.classList.toggle("on", !!draft);
    var cl = $("btn-query-clear"); if (cl) cl.disabled = !cur;
    render();
  }
  return { open: open, close: close, run: run, clear: clear, filter: filter, shown: shown, active: active, sql: sql,
    save: save, rename: rename, remove: remove, pick: pick, toggleSql: toggleSql, renderPicker: renderPicker, OPS: OPS };
})();
