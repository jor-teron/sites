/*
  File: history_tab.js
  Project: devbench
  Role: History tab UI: Day / Week / Month switch (Day = each run, last 60; Week / Month = averages),
  tap-to-toggle CPU / GPU / Memory / AI lines, tap a point for details, best marker, recent runs,
  "Save graph" PNG. Settings → History data: CSV, JSON, Import JSON, Clear.
  Uses DevbenchHistory (store), DevbenchHistChart (canvas), DevbenchHistIO (files).
*/

var devbenchHt = { mode: "day", lines: [], sel: -1, pts: [] };

function devbenchHt$(id) { return document.getElementById(id); }

/* Monday of the week (local time) as YYYY-MM-DD. */
function devbenchHtWeek(d) {
  var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
}

/* Average of numbers, ignoring null; null when empty. */
function devbenchHtAvg(a) {
  var v = a.filter(function (x) { return typeof x === "number"; });
  return v.length ? Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : null;
}

/* Build chart points (oldest first) for the current mode. */
function devbenchHtPoints(mode) {
  var runs = window.DevbenchHistory.list().slice().reverse();
  var short = function (d, o) { return d.toLocaleDateString(undefined, o); };
  if (mode === "day") {
    return runs.slice(-60).map(function (r) {
      var d = new Date(r.date);
      return { label: short(d, { day: "numeric", month: "short" }), score: r.score, cats: r.cats, runs: [r] };
    });
  }
  var groups = {}, order = [];
  runs.forEach(function (r) {
    var d = new Date(r.date), key = mode === "week" ? devbenchHtWeek(d) : r.date.slice(0, 7);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(r);
  });
  return order.map(function (key) {
    var g = groups[key], cats = {};
    Object.keys(window.DevbenchHistory.CATS).forEach(function (k) { cats[k] = devbenchHtAvg(g.map(function (r) { return r.cats[k]; })); });
    var d = new Date(mode === "week" ? key + "T12:00:00" : key + "-15T12:00:00");
    return { key: key, label: mode === "week" ? "wk " + short(d, { day: "numeric", month: "short" }) : short(d, { month: "short", year: "2-digit" }),
      score: devbenchHtAvg(g.map(function (r) { return r.score; })), cats: cats, runs: g };
  });
}

/* Details card for the selected point. */
function devbenchHtDetails() {
  var box = devbenchHt$("hist-detail"), pt = devbenchHt.pts[devbenchHt.sel];
  if (!pt) { box.innerHTML = '<span class="muted">Tap a point on the graph to see that run.</span>'; return; }
  var C = window.DevbenchHistory.CATS;
  var cats = Object.keys(C).map(function (k) {
    return '<span class="chip-val" style="--c:' + C[k].color + '">' + C[k].label + " <b>" + (pt.cats[k] == null ? "–" : pt.cats[k]) + "</b></span>";
  }).join("");
  var r = pt.runs[pt.runs.length - 1], head;
  if (devbenchHt.mode === "day") {
    head = "<b>" + new Date(r.date).toLocaleString() + "</b><br><span class=\"muted\">" + esc(r.device.browser) + (r.device.model ? " · " + esc(r.device.model) : "") + "</span>";
  } else {
    var best = pt.runs.reduce(function (a, b) { return b.score > a.score ? b : a; });
    head = "<b>" + pt.label + "</b> · " + pt.runs.length + " run" + (pt.runs.length > 1 ? "s" : "") + " (average)<br><span class=\"muted\">best " + best.score + " on " + new Date(best.date).toLocaleDateString() + "</span>";
  }
  box.innerHTML = '<div class="hd-score">' + pt.score + "</div><div>" + head + '</div><div class="hd-cats">' + cats + "</div>";
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
}

/* Recent runs list (last 5, newest first). */
function devbenchHtRecent() {
  var list = window.DevbenchHistory.list().slice(0, 5), ul = devbenchHt$("history");
  ul.innerHTML = list.length ? list.map(function (h) {
    return "<li><span>" + new Date(h.date).toLocaleString() + "</span><b>" + h.score + '</b><span class="hbar" style="width:' + h.score + '%"></span></li>';
  }).join("") : '<li class="muted">No runs saved yet. Run all saves one.</li>';
  devbenchHt$("hist-count").textContent = window.DevbenchHistory.list().length + " runs saved in this browser (max 500).";
}

/* Redraw everything; animate = jelly draw-in. */
function devbenchHtRender(animate) {
  var panel = document.querySelector('[data-panel="history"]');
  if (!panel || panel.hidden) { return; }
  devbenchHt.pts = devbenchHtPoints(devbenchHt.mode);
  if (devbenchHt.sel >= devbenchHt.pts.length) { devbenchHt.sel = devbenchHt.pts.length - 1; }
  var best = -1;
  devbenchHt.pts.forEach(function (p, i) { if (best < 0 || p.score > devbenchHt.pts[best].score) { best = i; } });
  window.DevbenchHistChart.draw(devbenchHt$("hist-canvas"), devbenchHt.pts, { lines: devbenchHt.lines, sel: devbenchHt.sel, best: best, animate: animate });
  document.querySelectorAll("[data-hmode]").forEach(function (b) { b.classList.toggle("on", b.dataset.hmode === devbenchHt.mode); });
  document.querySelectorAll("[data-hline]").forEach(function (b) { b.classList.toggle("on", devbenchHt.lines.indexOf(b.dataset.hline) >= 0); });
  devbenchHtDetails(); devbenchHtRecent();
}

function devbenchHtInit() {
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-hmode],[data-hline]") : null;
    if (!b) { return; }
    if (b.dataset.hmode) { devbenchHt.mode = b.dataset.hmode; devbenchHt.sel = -1; devbenchHtRender(true); return; }
    var k = b.dataset.hline, i = devbenchHt.lines.indexOf(k);
    if (i >= 0) { devbenchHt.lines.splice(i, 1); } else { devbenchHt.lines.push(k); }
    devbenchHtRender(i < 0);
  });
  devbenchHt$("hist-canvas").addEventListener("click", function (e) {
    var rect = e.currentTarget.getBoundingClientRect();
    devbenchHt.sel = window.DevbenchHistChart.hit(e.currentTarget, devbenchHt.pts.length, e.clientX - rect.left);
    devbenchHtRender(false);
  });
  devbenchHt$("hist-png").addEventListener("click", function () { window.DevbenchHistIO.png(devbenchHt$("hist-canvas")); });
  devbenchHt$("hist-csv").addEventListener("click", window.DevbenchHistIO.csv);
  devbenchHt$("hist-json").addEventListener("click", window.DevbenchHistIO.json);
  devbenchHt$("hist-import").addEventListener("click", function () { devbenchHt$("hist-file").click(); });
  devbenchHt$("hist-file").addEventListener("change", async function (e) {
    var f = e.target.files[0], out = devbenchHt$("hist-io-out");
    if (!f) { return; }
    try { out.textContent = "Imported " + (await window.DevbenchHistIO.importFile(f)) + " new runs."; } catch (err) { out.textContent = "Import failed: " + err.message; }
    e.target.value = "";
  });
  devbenchHt$("hist-clear").addEventListener("click", async function () {
    var D = window.UiDialog;   // H76: shared Hub dialog; browser confirm only if it is missing
    var ok = D ? await D.confirm("Delete all saved runs?", "Removes every saved Devbench run from this browser.", "Delete", true)
      : confirm("Delete all saved runs in this browser?");
    if (ok) { window.DevbenchHistory.clear(); }
  });
  document.addEventListener("devbench:tab", function (e) { if (e.detail === "history") { devbenchHtRender(true); } });
  document.addEventListener("devbench:history", function () { devbenchHtRender(false); });
  window.addEventListener("resize", function () { devbenchHtRender(false); });
}

devbenchHtInit();
window.DevbenchHistTab = { render: devbenchHtRender, state: devbenchHt };
