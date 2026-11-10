/*
 * base-report.js  (BS7)
 * Group-by reports, a print-friendly summary, and simple bar / pie charts (SVG, no library).
 * The compute helpers (group, aggregate, build) have no DOM and are safe to load in Node.
 *
 *   Report: { id, name, table, groupBy, groupBy2?, bucket, bucket2?,
 *             aggs: [{ field, fn: "count"|"sum"|"avg"|"min"|"max" }],
 *             chart: "none"|"bar"|"pie", chartField, chartFn }
 *
 * A row with several links is counted in each linked group. Reports are stored in BASE.db.reports
 * (same IndexedDB record as the tables). Print uses the browser print window (Save as PDF there);
 * there is no PDF library.
 *
 * API: BaseReport.build(table, rows, spec, db), .numericFields(table, db), .groupFields(table, db),
 *      .format(value, type), .open(), .close(), .run(spec), .clear(), .save(), .rename(),
 *      .remove(), .pick(id), .print(), .active(), .renderPicker(), .render()
 */
(function (root) {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var FNS = [
    { id: "count", label: "Count" },
    { id: "sum", label: "Sum" },
    { id: "avg", label: "Average" },
    { id: "min", label: "Min" },
    { id: "max", label: "Max" }
  ];
  var COLORS = ["#6a48e8", "#e5484d", "#2f9e44", "#f08c00", "#1971c2", "#c2255c", "#0ca678", "#e8590c", "#7048e8", "#495057"];
  var draft = null, lastBuilt = null;

  function useDb(d) { return d || (typeof BASE !== "undefined" && BASE.db) || { tables: [], reports: [] }; }
  function reports() {
    if (typeof BASE === "undefined") return [];
    if (!BASE.db.reports) BASE.db.reports = [];
    return BASE.db.reports;
  }
  function groupFields(table, db) {
    var list = (typeof BaseLinks !== "undefined") ? BaseLinks.queryFields(table, db) : (table && table.fields ? table.fields.slice() : []);
    return list.filter(function (f) { return f.type !== "picture"; });
  }
  function findField(table, id, db) { return groupFields(table, db).filter(function (f) { return f.id === id; })[0] || null; }
  function typeOf(table, field, db) {
    if (!field) return "text";
    if (typeof BaseLinks !== "undefined") return BaseLinks.resolvedType(table, field, db);
    return field.type;
  }
  function isNum(t) { return t === "number" || t === "currency" || t === "id"; }
  function numericFields(table, db) {
    return groupFields(table, db).filter(function (f) { return isNum(typeOf(table, f, db)); });
  }
  function rawValues(table, field, row, db) {
    if (!field || !row) return [];
    if (typeof BaseLinks !== "undefined" && (field.type === "ref" || field.type === "lookup" || field._via)) {
      return BaseLinks.resolve(table, field, row, db);
    }
    var v = row.v ? row.v[field.id] : "";
    return (v === "" || v == null) ? [] : [v];
  }
  function monthLabel(ym) {
    var y = String(ym).slice(0, 4), m = parseInt(String(ym).slice(5, 7), 10);
    if (m >= 1 && m <= 12) return MONTHS[m - 1] + " " + y;
    return String(ym);
  }
  function keyLabel(v, typ, bucket) {
    if (v === "" || v == null) return { key: "", label: "(blank)" };
    if (typ === "bool") return { key: v ? "1" : "0", label: v ? "Yes" : "No" };
    var s = String(v);
    if (typ === "date" && (bucket === "year" || bucket === "month")) {
      var y = s.slice(0, 4), m = s.slice(5, 7);
      if (bucket === "year") return { key: y || s, label: y || s };
      if (y && m) return { key: y + "-" + m, label: monthLabel(y + "-" + m) };
    }
    if (typ === "currency" && typeof BaseTypes !== "undefined") {
      var pretty = BaseTypes.formatCurrency(v);
      return { key: isNaN(+v) ? s : String(+v), label: pretty || s };
    }
    var lab = (typeof BaseTypes !== "undefined") ? BaseTypes.previewText({ type: typ, name: "" }, v) : s;
    if (!lab || lab === "—") lab = s;
    return { key: s, label: lab };
  }
  function parts(table, field, row, bucket, db) {
    if (!field) return [{ key: "_all", label: "All" }];
    var typ = typeOf(table, field, db);
    var vals = rawValues(table, field, row, db);
    if (!vals.length) return [{ key: "", label: "(blank)" }];
    if (field.type === "ref" && typeof BaseLinks !== "undefined") {
      return vals.map(function (id) {
        return { key: String(id), label: BaseLinks.displayText(field, id, db) || "(missing)" };
      });
    }
    return vals.map(function (v) { return keyLabel(v, typ, bucket); });
  }
  function emptyStats(aggs) {
    var s = {};
    aggs.forEach(function (a) {
      if (a.fn === "count" || s[a.field]) return;
      s[a.field] = { sum: 0, n: 0, min: null, max: null };
    });
    return s;
  }
  function addStats(stats, table, row, aggs, db) {
    var seen = {};
    aggs.forEach(function (a) {
      if (a.fn === "count" || !a.field || seen[a.field]) return;
      seen[a.field] = 1;
      var f = findField(table, a.field, db); if (!f) return;
      if (!stats[a.field]) stats[a.field] = { sum: 0, n: 0, min: null, max: null };
      var st = stats[a.field];
      rawValues(table, f, row, db).forEach(function (v) {
        if (v === "" || v == null || isNaN(+v)) return;
        var n = +v;
        st.sum += n; st.n += 1;
        if (st.min == null || n < st.min) st.min = n;
        if (st.max == null || n > st.max) st.max = n;
      });
    });
  }
  function mergeStats(into, from) {
    Object.keys(from || {}).forEach(function (k) {
      var a = from[k], b = into[k] || (into[k] = { sum: 0, n: 0, min: null, max: null });
      b.sum += a.sum; b.n += a.n;
      if (a.min != null && (b.min == null || a.min < b.min)) b.min = a.min;
      if (a.max != null && (b.max == null || a.max > b.max)) b.max = a.max;
    });
    return into;
  }
  function metric(stats, count, field, fn) {
    if (fn === "count") return count;
    var st = stats && stats[field];
    if (!st || !st.n) return null;
    if (fn === "sum") return st.sum;
    if (fn === "avg") return st.sum / st.n;
    if (fn === "min") return st.min;
    if (fn === "max") return st.max;
    return null;
  }
  function fmtNum(n) {
    if (n == null || (typeof n === "number" && isNaN(n))) return "–";
    if (Math.abs(n) >= 100) return String(Math.round(n * 100) / 100);
    var r = Math.round(n * 100) / 100;
    return String(r);
  }
  function format(value, type) {
    if (value == null) return "–";
    if (type === "currency" && typeof BaseTypes !== "undefined") return BaseTypes.formatCurrency(value) || "–";
    return fmtNum(value);
  }

  /* Pure: build the grouped report. rows are already filtered (query + search). */
  function build(table, rows, spec, db) {
    spec = spec || {};
    db = useDb(db);
    var f1 = findField(table, spec.groupBy, db);
    var f2 = spec.groupBy2 ? findField(table, spec.groupBy2, db) : null;
    var aggs = (spec.aggs || []).filter(function (a) {
      if (!a || !a.fn) return false;
      if (a.fn === "count") return true;
      return !!findField(table, a.field, db);
    });
    if (!aggs.some(function (a) { return a.fn === "count"; })) aggs = [{ field: "", fn: "count" }].concat(aggs);
    var map = {}, order = [];
    (rows || []).forEach(function (r) {
      var a = parts(table, f1, r, spec.bucket, db);
      var b = f2 ? parts(table, f2, r, spec.bucket2, db) : [{ key: "", label: "" }];
      a.forEach(function (p) {
        b.forEach(function (q) {
          var k = p.key + "\0" + q.key;
          if (!map[k]) { map[k] = { key: p.key, label: p.label, key2: q.key, label2: q.label, count: 0, stats: emptyStats(aggs) }; order.push(k); }
          map[k].count += 1;
          addStats(map[k].stats, table, r, aggs, db);
        });
      });
    });
    var leaves = order.map(function (k) { return map[k]; });
    leaves.sort(function (a, b) {
      var c = String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" });
      return c || String(a.label2).localeCompare(String(b.label2), undefined, { numeric: true, sensitivity: "base" });
    });
    var groups, totalStats = emptyStats(aggs), totalCount = 0;
    if (f2) {
      var parents = {}, porder = [];
      leaves.forEach(function (g) {
        if (!parents[g.key]) { parents[g.key] = { key: g.key, label: g.label, count: 0, stats: emptyStats(aggs), children: [] }; porder.push(g.key); }
        var p = parents[g.key];
        p.children.push(g);
        p.count += g.count;
        mergeStats(p.stats, g.stats);
        mergeStats(totalStats, g.stats);
        totalCount += g.count;
      });
      groups = porder.map(function (k) { return parents[k]; });
      groups.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" }); });
    } else {
      groups = leaves;
      leaves.forEach(function (g) { mergeStats(totalStats, g.stats); totalCount += g.count; });
    }
    var columns = aggs.map(function (a) {
      var f = a.fn === "count" ? null : findField(table, a.field, db);
      var typ = f ? typeOf(table, f, db) : "number";
      var label = a.fn === "count" ? "Count" : ((FNS.filter(function (x) { return x.id === a.fn; })[0] || { label: a.fn }).label + (f ? " of " + f.name : ""));
      return { field: a.field || "", fn: a.fn, type: typ, label: label };
    });
    return {
      groups: groups, two: !!f2, columns: columns,
      total: { count: totalCount, stats: totalStats },
      groupField: f1, groupField2: f2,
      title: spec.name || (f1 ? "By " + f1.name : "Report")
    };
  }
  function valuesOf(built, g, col) { return metric(g.stats, g.count, col.field, col.fn); }
  function totalOf(built, col) { return metric(built.total.stats, built.total.count, col.field, col.fn); }
  function chartSeries(built, spec) {
    spec = spec || {};
    var fn = spec.chartFn || "count", field = spec.chartField || "";
    var typ = "number", label = "Count";
    built.columns.forEach(function (c) {
      if (c.fn === fn && (fn === "count" || c.field === field)) { typ = c.type; label = c.label; }
    });
    var items = built.two
      ? built.groups.map(function (p) { return { label: p.label, value: metric(p.stats, p.count, field, fn) }; })
      : built.groups.map(function (g) { return { label: g.label, value: metric(g.stats, g.count, field, fn) }; });
    items = items.filter(function (x) { return x.value != null && !isNaN(x.value); });
    return { items: items, type: typ, label: label, fn: fn };
  }

  /* ---- UI ---- */
  function $(id) { return typeof document !== "undefined" ? document.getElementById(id) : null; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function toast(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 2500); } catch (e) {} }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function active() {
    var r = typeof BASE !== "undefined" && BASE.report, t = typeof BaseStore !== "undefined" && BaseStore.table();
    return r && t && r.table === t.id ? r : null;
  }
  function blank(t) {
    var nums = numericFields(t), aggs = [{ field: "", fn: "count" }];
    nums.slice(0, 3).forEach(function (f) { aggs.push({ field: f.id, fn: "sum" }); });
    var g = groupFields(t).filter(function (f) { return f.type !== "lookup"; })[0] || groupFields(t)[0];
    return { id: null, name: "", table: t.id, groupBy: g ? g.id : "", groupBy2: "", bucket: "value", bucket2: "value", aggs: aggs, chart: "none", chartField: "", chartFn: "count" };
  }

  function sel(opts, val, cls, onCh) {
    var s = el("select", cls);
    opts.forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; if (o[0] === val) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { onCh(s.value); });
    return s;
  }
  function defaultRows(t) {
    return (typeof BaseGrid !== "undefined") ? BaseGrid.visibleRows(t, true) : (t.rows || []).slice();
  }

  function renderBuilder() {
    var wrap = $("report-wrap"), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    if (!wrap) return;
    wrap.textContent = "";
    if (!draft || !t) { wrap.hidden = true; return; }
    if (draft.table !== t.id) draft = blank(t);
    wrap.hidden = false;
    var box = el("div", "bq br");
    var head = el("div", "bq-head");
    head.appendChild(el("b", null, draft.name ? "Report: " + draft.name : "New report"));
    box.appendChild(head);
    var gf = groupFields(t);
    box.appendChild(el("div", "bq-label", "Group by"));
    var gr = el("div", "bq-row");
    gr.appendChild(sel([["", "(pick a field)"]].concat(gf.map(function (f) { return [f.id, f.name]; })), draft.groupBy || "", "bq-sel", function (v) { draft.groupBy = v; renderBuilder(); }));
    var f1 = findField(t, draft.groupBy);
    if (f1 && typeOf(t, f1) === "date") {
      gr.appendChild(sel([["value", "Each day"], ["month", "By month"], ["year", "By year"]], draft.bucket || "value", "bq-sel", function (v) { draft.bucket = v; }));
    }
    box.appendChild(gr);
    var gr2 = el("div", "bq-row");
    gr2.appendChild(sel([["", "Then by (optional)"]].concat(gf.filter(function (f) { return f.id !== draft.groupBy; }).map(function (f) { return [f.id, f.name]; })), draft.groupBy2 || "", "bq-sel", function (v) { draft.groupBy2 = v; renderBuilder(); }));
    var f2 = findField(t, draft.groupBy2);
    if (f2 && typeOf(t, f2) === "date") {
      gr2.appendChild(sel([["value", "Each day"], ["month", "By month"], ["year", "By year"]], draft.bucket2 || "value", "bq-sel", function (v) { draft.bucket2 = v; }));
    }
    box.appendChild(gr2);
    box.appendChild(el("div", "bq-label", "Show"));
    var ar = el("div", "bq-row bq-checks");
    function hasAgg(field, fn) { return draft.aggs.some(function (a) { return a.fn === fn && (fn === "count" || a.field === field); }); }
    function toggle(field, fn, on) {
      draft.aggs = draft.aggs.filter(function (a) { return !(a.fn === fn && (fn === "count" || a.field === field)); });
      if (on) draft.aggs.push({ field: field, fn: fn });
    }
    function chk(label, field, fn) {
      var l = el("label", "bq-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = hasAgg(field, fn);
      if (fn === "count") { cb.checked = true; cb.disabled = true; }
      cb.addEventListener("change", function () { toggle(field, fn, cb.checked); });
      l.appendChild(cb); l.appendChild(document.createTextNode(" " + label)); ar.appendChild(l);
    }
    chk("Count", "", "count");
    numericFields(t).forEach(function (f) {
      ["sum", "avg", "min", "max"].forEach(function (fn) {
        var lab = (FNS.filter(function (x) { return x.id === fn; })[0].label) + " of " + f.name;
        chk(lab, f.id, fn);
      });
    });
    box.appendChild(ar);
    box.appendChild(el("div", "bq-label", "Chart"));
    var cr = el("div", "bq-row");
    [["none", "None"], ["bar", "Bar"], ["pie", "Pie"]].forEach(function (p) {
      var b = el("button", "base-btn" + (draft.chart === p[0] ? " on" : ""), p[1]); b.type = "button";
      b.addEventListener("click", function () { draft.chart = p[0]; renderBuilder(); if (active()) run(draft); });
      cr.appendChild(b);
    });
    if (draft.chart !== "none") {
      var copts = [["count", "Count"]].concat(numericFields(t).map(function (f) { return ["sum:" + f.id, "Sum of " + f.name]; }));
      var cur = draft.chartFn === "count" ? "count" : ((draft.chartFn || "sum") + ":" + (draft.chartField || ""));
      cr.appendChild(sel(copts, cur, "bq-sel", function (v) {
        if (v === "count") { draft.chartFn = "count"; draft.chartField = ""; }
        else { draft.chartFn = "sum"; draft.chartField = v.split(":")[1]; }
        if (active()) run(draft);
      }));
    }
    box.appendChild(cr);
    var act = el("div", "bq-row bq-actions");
    [["▶ Run", "primary", function () { run(draft); }], ["Save…", "", save], ["Print", "", printReport], ["Close", "", close]].forEach(function (a) {
      var b = el("button", "base-btn " + a[1], a[0]); b.type = "button"; b.addEventListener("click", a[2]); act.appendChild(b);
    });
    box.appendChild(act);
    wrap.appendChild(box);
  }

  function renderResult() {
    var out = $("report-out"), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    if (!out) return;
    out.textContent = "";
    var spec = active();
    if (!spec || !t) { out.hidden = true; lastBuilt = null; return; }
    out.hidden = false;
    var built = build(t, defaultRows(t), spec);
    lastBuilt = { built: built, spec: spec, table: t };
    var head = el("div", "br-head");
    head.appendChild(el("h2", "br-title", built.title + (t ? " — " + t.name : "")));
    var sub = [];
    if (built.groupField) sub.push("grouped by " + built.groupField.name + (spec.bucket && spec.bucket !== "value" ? " (" + spec.bucket + ")" : ""));
    if (built.groupField2) sub.push("then " + built.groupField2.name);
    if (typeof BaseQuery !== "undefined" && BaseQuery.active()) {
      var q = BaseQuery.active(); sub.push("query" + (q.name ? " “" + q.name + "”" : ""));
    }
    if (sub.length) head.appendChild(el("div", "br-sub", sub.join(" · ")));
    out.appendChild(head);
    if (spec.chart && spec.chart !== "none") {
      var chart = el("div", "br-chart"); chart.appendChild(drawChart(built, spec)); out.appendChild(chart);
    }
    out.appendChild(drawTable(built));
  }
  function drawTable(built) {
    var tbl = el("table", "br-table");
    var hr = tbl.createTHead().insertRow();
    function th(txt, cls) { var h = document.createElement("th"); h.textContent = txt; if (cls) h.className = cls; hr.appendChild(h); }
    th(built.groupField ? built.groupField.name : "Group");
    if (built.two) th(built.groupField2 ? built.groupField2.name : "Then");
    built.columns.forEach(function (c) { th(c.label, "num"); });
    var body = tbl.createTBody();
    function row(kind, cells) {
      var tr = body.insertRow(); tr.className = "br-" + kind;
      cells.forEach(function (x, i) { var td = tr.insertCell(); td.textContent = x; if (i >= (built.two ? 2 : 1) || kind === "total" || kind === "sub") td.className = "num"; });
    }
    function cells(g, label, label2) {
      var a = [label]; if (built.two) a.push(label2 == null ? "" : label2);
      built.columns.forEach(function (c) { a.push(format(valuesOf(built, g, c), c.type)); });
      return a;
    }
    built.groups.forEach(function (g) {
      if (built.two) {
        (g.children || []).forEach(function (ch) { row("leaf", cells(ch, g.label, ch.label2)); });
        row("sub", cells(g, "Subtotal · " + g.label, ""));
      } else row("leaf", cells(g, g.label));
    });
    var tot = ["Grand total"]; if (built.two) tot.push("");
    built.columns.forEach(function (c) { tot.push(format(totalOf(built, c), c.type)); });
    row("total", tot);
    return tbl;
  }
  function drawChart(built, spec) {
    var series = chartSeries(built, spec), items = series.items.slice();
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "br-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", series.label + " chart");
    var kind = spec.chart === "pie" ? "pie" : "bar";
    if (kind === "pie") drawPie(svg, items, series);
    else drawBar(svg, items, series);
    return svg;
  }
  function ns(name, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function drawBar(svg, items, series) {
    var maxN = 12, extra = 0;
    if (items.length > maxN) {
      items = items.slice().sort(function (a, b) { return b.value - a.value; });
      extra = items.length - maxN;
      items = items.slice(0, maxN);
    }
    var W = 640, H = 280, padL = 52, padB = 56, padT = 16, padR = 12;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var max = 0; items.forEach(function (it) { if (it.value > max) max = it.value; });
    if (max <= 0) max = 1;
    var iw = W - padL - padR, ih = H - padT - padB;
    var bw = items.length ? iw / items.length : iw, gap = Math.min(12, bw * 0.25);
    svg.appendChild(ns("line", { x1: padL, y1: padT, x2: padL, y2: padT + ih, stroke: "currentColor", "stroke-opacity": "0.3" }));
    svg.appendChild(ns("line", { x1: padL, y1: padT + ih, x2: W - padR, y2: padT + ih, stroke: "currentColor", "stroke-opacity": "0.3" }));
    var ticks = 4, i;
    for (i = 0; i <= ticks; i++) {
      var v = max * (1 - i / ticks), y = padT + ih * (i / ticks);
      svg.appendChild(ns("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "currentColor", "stroke-opacity": "0.08" }));
      var tx = ns("text", { x: padL - 6, y: y + 4, "text-anchor": "end", "font-size": "11", fill: "currentColor" });
      tx.textContent = format(v, series.type); svg.appendChild(tx);
    }
    items.forEach(function (it, i) {
      var h = (it.value / max) * ih, x = padL + i * bw + gap / 2, y = padT + ih - h, w = Math.max(2, bw - gap);
      var r = ns("rect", { x: x, y: y, width: w, height: Math.max(0, h), fill: COLORS[i % COLORS.length], rx: "2" });
      r.setAttribute("aria-label", it.label + ": " + format(it.value, series.type));
      svg.appendChild(r);
      var lb = ns("text", { x: x + w / 2, y: H - 36, "text-anchor": "middle", "font-size": "11", fill: "currentColor" });
      var lab = it.label.length > 10 ? it.label.slice(0, 9) + "…" : it.label;
      lb.textContent = lab;
      if (items.length > 6) lb.setAttribute("transform", "rotate(-35 " + (x + w / 2) + " " + (H - 36) + ")");
      svg.appendChild(lb);
    });
    var cap = ns("text", { x: padL, y: 12, "font-size": "12", fill: "currentColor" });
    cap.textContent = series.label + (extra ? " · top " + maxN + " of " + (maxN + extra) : "");
    svg.appendChild(cap);
  }
  function drawPie(svg, items, series) {
    var maxN = 8, rest = 0;
    items = items.slice().sort(function (a, b) { return b.value - a.value; });
    if (items.length > maxN) {
      items.slice(maxN).forEach(function (it) { rest += it.value; });
      items = items.slice(0, maxN);
      if (rest) items.push({ label: "Other", value: rest });
    }
    var W = 640, H = 280, cx = 160, cy = 140, R = 108, sum = 0;
    items.forEach(function (it) { sum += Math.max(0, it.value); });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    if (sum <= 0) {
      var em = ns("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: "currentColor" }); em.textContent = "No values to chart"; svg.appendChild(em); return;
    }
    var ang = -Math.PI / 2;
    function pt(a, r) { return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    items.forEach(function (it, i) {
      var slice = (Math.max(0, it.value) / sum) * Math.PI * 2, a2 = ang + slice;
      var p1 = pt(ang, R), p2 = pt(a2, R), large = slice > Math.PI ? 1 : 0;
      var d = "M " + cx + " " + cy + " L " + p1[0] + " " + p1[1] + " A " + R + " " + R + " 0 " + large + " 1 " + p2[0] + " " + p2[1] + " Z";
      if (items.length === 1) d = "M " + (cx - R) + " " + cy + " A " + R + " " + R + " 0 1 1 " + (cx + R) + " " + cy + " A " + R + " " + R + " 0 1 1 " + (cx - R) + " " + cy;
      var path = ns("path", { d: d, fill: COLORS[i % COLORS.length] });
      path.setAttribute("aria-label", it.label + ": " + format(it.value, series.type));
      svg.appendChild(path);
      ang = a2;
      var ly = 24 + i * 28;
      svg.appendChild(ns("rect", { x: 330, y: ly - 10, width: 12, height: 12, fill: COLORS[i % COLORS.length], rx: "2" }));
      var tx = ns("text", { x: 350, y: ly, "font-size": "13", fill: "currentColor" });
      tx.textContent = it.label + " · " + format(it.value, series.type);
      svg.appendChild(tx);
    });
    var cap = ns("text", { x: 16, y: 16, "font-size": "12", fill: "currentColor" }); cap.textContent = series.label; svg.appendChild(cap);
  }

  function open() {
    var t = typeof BaseStore !== "undefined" && BaseStore.table(); if (!t) return toast("Make a table first");
    draft = active() ? copy(BASE.report) : (draft && draft.table === t.id ? draft : blank(t));
    if (typeof ribbonSelectTab === "function") ribbonSelectTab("report");
    render();
  }
  function close() { draft = null; renderBuilder(); }
  function run(spec) {
    var t = BaseStore.table(); if (!t) return toast("Make a table first");
    if (spec && spec.groupBy !== undefined) draft = copy(spec);
    if (!draft) draft = blank(t);
    if (!draft.groupBy) return toast("Pick a field to group by");
    BASE.report = copy(draft); BASE.report.table = t.id; BASE.view = "report";
    if (typeof BaseUI !== "undefined") BaseUI.render();
    else render();
    toast(lastBuilt && lastBuilt.built ? lastBuilt.built.groups.length + " groups" : "Report ready");
  }
  function clear() { BASE.report = null; lastBuilt = null; if (BASE.view === "report") BASE.view = "grid"; if (typeof BaseUI !== "undefined") BaseUI.render(); }
  function save() {
    if (!draft) open(); if (!draft) return;
    OfficeDialog.prompt({ title: "Save report", label: "Report name", value: draft.name || "My report" }).then(function (n) {
      if (!n) return;
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Save report"); } catch (e) {}
      var rs = reports(), d = copy(draft); d.name = n.trim(); d.table = BaseStore.table().id;
      var old = rs.filter(function (x) { return x.id && x.id === d.id; })[0] || rs.filter(function (x) { return x.name === d.name && x.table === d.table; })[0];
      if (old) { d.id = old.id; rs[rs.indexOf(old)] = d; } else { d.id = BaseStore.uid(); rs.push(d); }
      draft.id = d.id; draft.name = d.name;
      BaseStore.save(); run(d); toast("Report “" + d.name + "” saved");
    });
  }
  function currentSaved() { var r = active() || draft; return r && r.id ? reports().filter(function (x) { return x.id === r.id; })[0] : null; }
  function rename() {
    var r = currentSaved(); if (!r) return toast("Pick a saved report first");
    OfficeDialog.prompt({ title: "Rename report", label: "Name", value: r.name }).then(function (n) {
      if (!n) return;
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Rename report"); } catch (e) {}
      r.name = n.trim(); if (draft && draft.id === r.id) draft.name = r.name; if (BASE.report && BASE.report.id === r.id) BASE.report.name = r.name;
      BaseStore.save(); if (typeof BaseUI !== "undefined") BaseUI.render();
    });
  }
  function remove() {
    var r = currentSaved(); if (!r) return toast("Pick a saved report first");
    OfficeDialog.confirm({ title: "Delete report?", message: "Delete saved report “" + r.name + "”? Your records are not touched.", okLabel: "Delete", danger: true }).then(function (ok) {
      if (!ok) return;
      try { if (typeof BaseHistory !== "undefined") BaseHistory.push("Delete report"); } catch (e) {}
      BASE.db.reports = reports().filter(function (x) { return x !== r; });
      if (draft && draft.id === r.id) { draft.id = null; draft.name = ""; }
      if (BASE.report && BASE.report.id === r.id) BASE.report = copy(draft || BASE.report), BASE.report.id = null;
      BaseStore.save(); if (typeof BaseUI !== "undefined") BaseUI.render();
    });
  }
  function pick(id) {
    var r = reports().filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (!BASE.db.tables.some(function (t) { return t.id === r.table; })) return toast("That report's table was deleted");
    if (BaseStore.table().id !== r.table) { BASE.db.current = r.table; BASE.selRow = null; }
    draft = copy(r); run(r);
  }
  function printReport() {
    if (!active()) { window.print(); return; }
    if (!lastBuilt) run(active());
    document.body.classList.add("base-print-report");
    var done = function () { document.body.classList.remove("base-print-report"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1500);
  }
  function renderPicker() {
    var rs = reports(), t = typeof BaseStore !== "undefined" ? BaseStore.table() : null;
    var mine = t ? rs.filter(function (r) { return r.table === t.id; }) : rs;
    var ps = $("report-pick"), fm = $("file-reports"), cur = active();
    if (ps) {
      ps.textContent = ""; var o0 = el("option", null, mine.length ? "Saved reports…" : "(no saved reports)"); o0.value = ""; ps.appendChild(o0);
      mine.forEach(function (r) { var o = el("option", null, r.name); o.value = r.id; o.selected = !!(cur && cur.id === r.id); ps.appendChild(o); });
    }
    if (fm) {
      fm.textContent = "";
      rs.forEach(function (r) {
        var tb = BASE.db.tables.filter(function (x) { return x.id === r.table; })[0];
        var b = el("button", "file-item" + (cur && cur.id === r.id ? " on" : ""), "▣ " + r.name + (tb ? " · " + tb.name : ""));
        b.type = "button"; b.setAttribute("role", "menuitem");
        b.addEventListener("click", function () { if (typeof ribbonSetFile === "function") ribbonSetFile(false); pick(r.id); });
        fm.appendChild(b);
      });
      var tit = $("file-reports-title"); if (tit) tit.hidden = !rs.length;
    }
    var on = $("btn-report"); if (on) on.classList.toggle("on", !!draft);
    var cl = $("btn-report-clear"); if (cl) cl.disabled = !cur;
    ["bar", "pie"].forEach(function (k) {
      var b = $("btn-report-" + k); if (b) b.classList.toggle("on", !!(cur && cur.chart === k));
    });
    renderBuilder();
    renderResult();
  }
  function render() { renderPicker(); }
  function dropForTable(tableId) {
    if (typeof BASE === "undefined" || !BASE.db.reports) return;
    BASE.db.reports = BASE.db.reports.filter(function (r) { return r.table !== tableId; });
    if (BASE.report && BASE.report.table === tableId) BASE.report = null;
    if (draft && draft.table === tableId) draft = null;
  }
  function setChart(kind) {
    if (!draft && active()) draft = copy(active());
    if (!draft) { open(); if (draft) draft.chart = kind; return; }
    draft.chart = draft.chart === kind ? "none" : kind;
    if (active()) run(draft); else renderBuilder();
  }

  var api = {
    FNS: FNS, build: build, chartSeries: chartSeries, format: format, metric: metric,
    groupFields: groupFields, numericFields: numericFields, monthLabel: monthLabel,
    keyLabel: keyLabel,
    open: open, close: close, run: run, clear: clear, save: save, rename: rename, remove: remove,
    pick: pick, print: printReport, active: active, renderPicker: renderPicker, render: render,
    dropForTable: dropForTable, setChart: setChart
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseReport = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
