/*
 * spreadsheet_charts.js  (SH12)
 * Column, bar, line and pie charts from a selected range, drawn on a canvas
 * with no libraries. Charts can be moved, resized and saved as PNG, and are
 * stored in the sheet-v4 workbook (older files migrate and still open).
 */
var CHART_COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7"];
var CHART_MAX = 8;
var CHART_MIN_W = 200;
var CHART_MIN_H = 140;

function chartPad(n) { return n < 10 ? "0" + n : String(n); }

function chartParseRange(token) {
  var p;
  if (typeof parseRefToken === "function") {
    p = parseRefToken(token);
    if (p && !p.error && p.list && p.list.length) {
      var r1 = p.list[0].r, r2 = p.list[0].r, c1 = p.list[0].c, c2 = p.list[0].c, i;
      for (i = 1; i < p.list.length; i++) {
        if (p.list[i].r < r1) r1 = p.list[i].r;
        if (p.list[i].r > r2) r2 = p.list[i].r;
        if (p.list[i].c < c1) c1 = p.list[i].c;
        if (p.list[i].c > c2) c2 = p.list[i].c;
      }
      return { r1: r1, r2: r2, c1: c1, c2: c2, si: p.si };
    }
  }
  var m = String(token || "").toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  function col(s) { return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(s); }
  return { r1: +m[2] - 1, r2: +m[4] - 1, c1: col(m[1]), c2: col(m[3]) };
}

function chartRangeToken(g) {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(g.c1) + (g.r1 + 1) + ":" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(g.c2) + (g.r2 + 1);
}

function chartIsNumber(v) {
  if (typeof v === "number" && isFinite(v)) return true;
  if (v === "" || v == null) return false;
  var n = Number(v);
  return String(v).trim() !== "" && !isNaN(n) && isFinite(n);
}

function chartNum(v) {
  if (typeof v === "number" && isFinite(v)) return v;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Read a range from a 2D cells grid (cells[r][c].value).
 * Auto-detects a header row when the first row has any non-numeric text
 * (or when opts.header is true). Categories come from the first column
 * when it is text. Returns { labels, series:[{name, values}], title }.
 */
function chartExtractData(grid, range, opts) {
  var r1 = range.r1, r2 = range.r2, c1 = range.c1, c2 = range.c2;
  var header = opts && opts.header;
  var r, c, v, labels = [], series = [], firstRowText = false, firstColText = false;
  if (!grid || r2 < r1 || c2 < c1) return { labels: [], series: [], title: "" };
  if (header == null) {
    for (c = c1; c <= c2; c++) {
      v = grid[r1] && grid[r1][c] ? grid[r1][c].value : "";
      if (v !== "" && v != null && !chartIsNumber(v)) { firstRowText = true; break; }
    }
    header = firstRowText;
  }
  var dataR1 = header ? r1 + 1 : r1;
  if (dataR1 <= r2) {
    for (r = dataR1; r <= r2; r++) {
      v = grid[r] && grid[r][c1] ? grid[r][c1].value : "";
      if (v !== "" && v != null && !chartIsNumber(v)) { firstColText = true; break; }
    }
  }
  /* One row of numbers and no header: a single series along the row. */
  if (!header && r1 === r2) {
    for (c = c1; c <= c2; c++) {
      labels.push(String(c - c1 + 1));
    }
    series.push({ name: "Series 1", values: [] });
    for (c = c1; c <= c2; c++) series[0].values.push(chartNum(grid[r1][c] && grid[r1][c].value));
    return { labels: labels, series: series, title: "" };
  }
  /* One column of numbers and no header. */
  if (!header && c1 === c2) {
    for (r = r1; r <= r2; r++) labels.push(String(r - r1 + 1));
    series.push({ name: "Series 1", values: [] });
    for (r = r1; r <= r2; r++) series[0].values.push(chartNum(grid[r][c1] && grid[r][c1].value));
    return { labels: labels, series: series, title: "" };
  }
  var catCol = firstColText ? c1 : c1 - 1;
  var seriesC1 = firstColText ? c1 + 1 : c1;
  if (seriesC1 > c2 && firstColText) {
    /* only a category column + maybe numbers in the same col — treat as one series of counts? use numeric first col if mixed */
    seriesC1 = c1;
    catCol = c1 - 1;
    firstColText = false;
  }
  for (r = dataR1; r <= r2; r++) {
    labels.push(firstColText ? String((grid[r][c1] && grid[r][c1].value) || "") : String(r - dataR1 + 1));
  }
  for (c = seriesC1; c <= c2; c++) {
    var name = "Series " + (c - seriesC1 + 1);
    if (header && grid[r1][c] && grid[r1][c].value != null && String(grid[r1][c].value) !== "") name = String(grid[r1][c].value);
    var values = [];
    for (r = dataR1; r <= r2; r++) values.push(chartNum(grid[r][c] && grid[r][c].value));
    series.push({ name: name, values: values });
  }
  var title = "";
  if (header && firstColText && grid[r1][c1] && grid[r1][c1].value) title = String(grid[r1][c1].value);
  return { labels: labels, series: series, title: title };
}

function chartMax(data) {
  var m = 0, i, j, v;
  for (i = 0; i < data.series.length; i++) {
    for (j = 0; j < data.series[i].values.length; j++) {
      v = data.series[i].values[j];
      if (v > m) m = v;
    }
  }
  return m <= 0 ? 1 : m;
}

function chartNiceMax(m) {
  if (m <= 0) return 1;
  var p = Math.pow(10, Math.floor(Math.log(m) / Math.LN10));
  var n = Math.ceil(m / p);
  if (n > 5) n = 10;
  else if (n > 2) n = 5;
  return n * p;
}

/**
 * Draw a chart onto a CanvasRenderingContext2D (or a stub in tests).
 */
function chartDraw(ctx, type, data, w, h) {
  var padL = 44, padR = 12, padT = 28, padB = 36, i, j, x, y, bw, bh, n, seriesN, max, plotW, plotH, colW, cx, cy, radius, total, a0, a1, val;
  if (!ctx || !data) return;
  w = w || 360; h = h || 220;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#202124";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  if (data.title) ctx.fillText(String(data.title), w / 2, 16);
  n = data.labels.length;
  seriesN = data.series.length;
  if (!n || !seriesN) {
    ctx.fillStyle = "#80868b";
    ctx.fillText("No data in the range", w / 2, h / 2);
    return;
  }
  /* legend */
  var lx = 8, ly = h - 16;
  ctx.textAlign = "left";
  ctx.font = "10px sans-serif";
  for (i = 0; i < seriesN && (type !== "pie" || i === 0); i++) {
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(lx, ly - 8, 10, 10);
    ctx.fillStyle = "#202124";
    ctx.fillText(data.series[i].name, lx + 14, ly);
    lx += 14 + Math.min(80, (ctx.measureText ? ctx.measureText(data.series[i].name).width : 40) + 12);
  }

  if (type === "pie") {
    total = 0;
    for (j = 0; j < n; j++) total += Math.max(0, data.series[0].values[j]);
    if (total <= 0) { ctx.fillStyle = "#80868b"; ctx.textAlign = "center"; ctx.fillText("No positive values", w / 2, h / 2); return; }
    cx = w / 2; cy = padT + (h - padT - padB) / 2; radius = Math.max(20, Math.min(cx - 16, cy - padT) - 4);
    a0 = -Math.PI / 2;
    for (j = 0; j < n; j++) {
      val = Math.max(0, data.series[0].values[j]);
      a1 = a0 + (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = CHART_COLORS[j % CHART_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      var mid = (a0 + a1) / 2;
      if (val / total >= 0.04) {
        ctx.fillStyle = "#202124";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(data.labels[j], cx + Math.cos(mid) * (radius * 0.62), cy + Math.sin(mid) * (radius * 0.62));
      }
      a0 = a1;
    }
    return;
  }

  max = chartNiceMax(chartMax(data));
  plotW = w - padL - padR;
  plotH = h - padT - padB;
  ctx.strokeStyle = "#d9dde5";
  ctx.fillStyle = "#5f6368";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  for (i = 0; i <= 4; i++) {
    y = padT + plotH - (plotH * i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round((max * i / 4) * 100) / 100), padL - 4, y + 3);
  }

  if (type === "column") {
    colW = plotW / n;
    bw = Math.max(2, (colW - 8) / seriesN);
    for (j = 0; j < n; j++) {
      for (i = 0; i < seriesN; i++) {
        val = data.series[i].values[j] || 0;
        bh = (val / max) * plotH;
        x = padL + j * colW + 4 + i * bw;
        y = padT + plotH - bh;
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fillRect(x, y, Math.max(1, bw - 1), Math.max(0, bh));
      }
      ctx.fillStyle = "#202124";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(data.labels[j]).slice(0, 8), padL + j * colW + colW / 2, padT + plotH + 12);
    }
    return;
  }

  if (type === "bar") {
    var rowH = plotH / n;
    bh = Math.max(2, (rowH - 6) / seriesN);
    for (j = 0; j < n; j++) {
      for (i = 0; i < seriesN; i++) {
        val = data.series[i].values[j] || 0;
        bw = (val / max) * plotW;
        y = padT + j * rowH + 3 + i * bh;
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
        ctx.fillRect(padL, y, Math.max(0, bw), Math.max(1, bh - 1));
      }
      ctx.fillStyle = "#202124";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(data.labels[j]).slice(0, 8), padL - 4, padT + j * rowH + rowH / 2 + 3);
    }
    return;
  }

  /* line */
  colW = plotW / Math.max(1, n - 1);
  for (i = 0; i < seriesN; i++) {
    ctx.beginPath();
    ctx.strokeStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.lineWidth = 2;
    for (j = 0; j < n; j++) {
      val = data.series[i].values[j] || 0;
      x = padL + (n === 1 ? plotW / 2 : j * colW);
      y = padT + plotH - (val / max) * plotH;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    for (j = 0; j < n; j++) {
      val = data.series[i].values[j] || 0;
      x = padL + (n === 1 ? plotW / 2 : j * colW);
      y = padT + plotH - (val / max) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#202124";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  for (j = 0; j < n; j++) {
    x = padL + (n === 1 ? plotW / 2 : j * colW);
    ctx.fillText(String(data.labels[j]).slice(0, 8), x, padT + plotH + 12);
  }
}

/* ---------- workbook / UI ---------- */

function chartList(si) {
  var s = workbook.sheets[si == null ? workbook.active : si];
  if (!s.charts) s.charts = [];
  return s.charts;
}

function chartNewId() {
  return "c" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

function chartDataFor(ch, si) {
  var s = workbook.sheets[si == null ? workbook.active : si];
  var g = chartParseRange(ch.range);
  if (!g) return { labels: [], series: [], title: ch.title || "" };
  var data = chartExtractData(s.cells, g, { header: ch.header });
  if (ch.title) data.title = ch.title;
  return data;
}

function chartPaintCanvas(ch, canvas, si) {
  var w = Math.max(CHART_MIN_W, ch.w || 360), h = Math.max(CHART_MIN_H, ch.h || 220);
  var ctx, ratio = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx = canvas.getContext("2d");
  if (ratio !== 1) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  chartDraw(ctx, ch.type, chartDataFor(ch, si), w, h);
}

var CHART_SEL = null;
var CHART_DRAG = null;

function renderCharts() {
  var wrap = document.getElementById("sheet-wrap"), layer, list, i, ch, box;
  if (!wrap) return;
  layer = document.getElementById("chart-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "chart-layer";
    wrap.appendChild(layer);
  }
  layer.innerHTML = "";
  var table = wrap.querySelector("table." + (typeof CLS !== "undefined" ? CLS.table : "sheet"));
  var lw = Math.max(wrap.scrollWidth, table ? table.scrollWidth : 0, wrap.clientWidth);
  var lh = Math.max(wrap.scrollHeight, table ? table.scrollHeight : 0, wrap.clientHeight);
  layer.style.width = lw + "px";
  layer.style.height = lh + "px";
  list = chartList();
  for (i = 0; i < list.length; i++) {
    ch = list[i];
    box = document.createElement("div");
    box.className = "sheet-chart" + (CHART_SEL && CHART_SEL.id === ch.id ? " on" : "");
    box.style.left = (ch.x || 40) + "px";
    box.style.top = (ch.y || 40) + "px";
    box.style.width = Math.max(CHART_MIN_W, ch.w || 360) + "px";
    box.dataset.id = ch.id;
    var bar = document.createElement("div");
    bar.className = "sheet-chart-bar";
    bar.innerHTML = "<span class=\"sheet-chart-title\">" + String(ch.title || ch.type || "Chart").replace(/</g, "&lt;") +
      "</span><button type=\"button\" data-chart-png=\"1\" title=\"Save as PNG\">PNG</button>" +
      "<button type=\"button\" data-chart-del=\"1\" title=\"Delete chart\">×</button>";
    var canvas = document.createElement("canvas");
    canvas.className = "sheet-chart-canvas";
    box.appendChild(bar);
    box.appendChild(canvas);
    ["nw", "ne", "sw", "se", "e", "s"].forEach(function (h) {
      var el = document.createElement("span");
      el.className = "sheet-chart-h sheet-chart-h-" + h;
      el.dataset.handle = h;
      box.appendChild(el);
    });
    layer.appendChild(box);
    chartPaintCanvas(ch, canvas);
  }
}

function chartById(id) {
  var list = chartList(), i;
  for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function chartSelect(id) {
  CHART_SEL = id ? chartById(id) : null;
  var nodes = document.querySelectorAll(".sheet-chart"), i;
  for (i = 0; i < nodes.length; i++) nodes[i].classList.toggle("on", CHART_SEL && nodes[i].dataset.id === CHART_SEL.id);
}

function addChart(type) {
  var g = selRange(), s = workbook.sheets[workbook.active], ch, data;
  if (g.r1 === g.r2 && g.c1 === g.c2) g = typeof usedArea === "function" ? usedArea() : g;
  if (!g) { setStatus("Select a range with numbers to chart"); return; }
  if ((s.charts || []).length >= CHART_MAX) { setStatus("At most " + CHART_MAX + " charts on a sheet"); return; }
  data = chartExtractData(s.cells, g, {});
  if (!data.series.length) { setStatus("Select a range with numbers to chart"); return; }
  undoRecord("chart-add");
  if (!s.charts) s.charts = [];
  ch = {
    id: chartNewId(),
    type: type,
    range: chartRangeToken(g),
    title: data.title || (type.charAt(0).toUpperCase() + type.slice(1) + " chart"),
    header: null,
    x: 48 + (s.charts.length % 3) * 24,
    y: 48 + (s.charts.length % 3) * 24,
    w: 360,
    h: 220
  };
  s.charts.push(ch);
  CHART_SEL = ch;
  saveStore();
  renderCharts();
  setStatus("Chart added");
}

function deleteChart(id) {
  var s = workbook.sheets[workbook.active], i;
  if (!s.charts) return;
  function go() {
    undoRecord("chart-del");
    s.charts = s.charts.filter(function (c) { return c.id !== id; });
    if (CHART_SEL && CHART_SEL.id === id) CHART_SEL = null;
    saveStore();
    renderCharts();
    setStatus("Chart deleted");
  }
  if (typeof OfficeDialog !== "undefined" && OfficeDialog.confirm) {
    OfficeDialog.confirm({ title: "Delete chart", message: "Delete this chart?", okLabel: "Delete", danger: true }).then(function (ok) { if (ok) go(); });
  } else go();
}

function chartSavePng(id) {
  var box = document.querySelector('.sheet-chart[data-id="' + id + '"]');
  var canvas = box && box.querySelector("canvas");
  var ch = chartById(id);
  if (!canvas || !canvas.toDataURL) { setStatus("Could not save the chart"); return; }
  var a = document.createElement("a");
  var name = (ch && ch.title ? ch.title : "chart").replace(/[\\\/:*?"<>|]/g, "_") + ".png";
  a.href = canvas.toDataURL("image/png");
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Saved " + name);
}

function initCharts() {
  onBtn("btn-chart-col", function () { addChart("column"); });
  onBtn("btn-chart-bar", function () { addChart("bar"); });
  onBtn("btn-chart-line", function () { addChart("line"); });
  onBtn("btn-chart-pie", function () { addChart("pie"); });
  var wrap = document.getElementById("sheet-wrap");
  if (wrap && !wrap._chartsBound) {
    wrap._chartsBound = true;
    wrap.addEventListener("mousedown", function (ev) {
      var box = ev.target.closest && ev.target.closest(".sheet-chart");
      var handle, bar, ch, r;
      if (ev.target.closest && ev.target.closest("[data-chart-png]")) {
        ev.preventDefault(); ev.stopPropagation();
        if (box) chartSavePng(box.dataset.id);
        return;
      }
      if (ev.target.closest && ev.target.closest("[data-chart-del]")) {
        ev.preventDefault(); ev.stopPropagation();
        if (box) deleteChart(box.dataset.id);
        return;
      }
      if (!box) { chartSelect(null); return; }
      ev.stopPropagation();
      chartSelect(box.dataset.id);
      ch = chartById(box.dataset.id);
      if (!ch) return;
      handle = ev.target.dataset && ev.target.dataset.handle;
      bar = ev.target.closest(".sheet-chart-bar");
      if (!handle && !bar) return;
      ev.preventDefault();
      r = wrap.getBoundingClientRect();
      if (typeof undoRecord === "function") undoRecord("chart-move");
      CHART_DRAG = {
        id: ch.id, handle: handle || "move",
        sx: ev.clientX, sy: ev.clientY,
        ox: ch.x || 0, oy: ch.y || 0, ow: ch.w || 360, oh: ch.h || 220,
        sl: wrap.scrollLeft, st: wrap.scrollTop, changed: false
      };
    });
    window.addEventListener("mousemove", function (ev) {
      var d = CHART_DRAG, ch, dx, dy, box;
      if (!d) return;
      ch = chartById(d.id);
      if (!ch) return;
      dx = ev.clientX - d.sx;
      dy = ev.clientY - d.sy;
      if (d.handle === "move") {
        ch.x = Math.max(0, d.ox + dx);
        ch.y = Math.max(0, d.oy + dy);
      } else {
        if (d.handle.indexOf("e") >= 0) ch.w = Math.max(CHART_MIN_W, d.ow + dx);
        if (d.handle.indexOf("s") >= 0) ch.h = Math.max(CHART_MIN_H, d.oh + dy);
        if (d.handle.indexOf("w") >= 0) { ch.w = Math.max(CHART_MIN_W, d.ow - dx); ch.x = d.ox + (d.ow - ch.w); }
        if (d.handle.indexOf("n") >= 0) { ch.h = Math.max(CHART_MIN_H, d.oh - dy); ch.y = d.oy + (d.oh - ch.h); }
      }
      d.changed = true;
      box = document.querySelector('.sheet-chart[data-id="' + d.id + '"]');
      if (box) {
        box.style.left = ch.x + "px";
        box.style.top = ch.y + "px";
        box.style.width = ch.w + "px";
        var canvas = box.querySelector("canvas");
        if (canvas && d.handle !== "move") chartPaintCanvas(ch, canvas);
      }
    });
    window.addEventListener("mouseup", function () {
      var d = CHART_DRAG;
      if (!d) return;
      CHART_DRAG = null;
      if (d.changed) saveStore();
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (CHART_SEL) { ev.preventDefault(); deleteChart(CHART_SEL.id); }
  });
  renderCharts();
}

SHEET_INIT.push(initCharts);
