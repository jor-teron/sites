/*
  File: history.js
  Project: devbench
  Role: Run history store on this browser only (localStorage "devbench-history", no syncing).
  One entry per Run all: { id, date, score, parts, cats: {cpu, gpu, mem, ai}, device: {browser, model, platform, ua} }.
  Newest first, max 500. Older entries (date/score/parts only) are migrated on read.
  Also shows "+N vs last run" under the score. Fires "devbench:history" when the list changes.
  Exposes window.DevbenchHistory: list, add, merge, clear, migrate, CATS.
*/

var DEVBENCH_HIST_KEY = "devbench-history";
var DEVBENCH_HIST_MAX = 500;

/* Category = average of these score parts (see score.js keys). */
var DEVBENCH_HIST_CATS = {
  cpu: { label: "CPU", parts: ["cpu", "js"], color: "#3dd6ff" },
  gpu: { label: "GPU", parts: ["gpu", "tris", "sprites"], color: "#ffb347" },
  mem: { label: "Memory", parts: ["mem", "disk"], color: "#38c172" },
  ai: { label: "AI", parts: ["aimat", "wasm", "webgpu"], color: "#c38bff" }
};

/* Category scores from score parts; null when none of its parts ran. */
function devbenchHistCats(parts) {
  var out = {};
  Object.keys(DEVBENCH_HIST_CATS).forEach(function (k) {
    var vals = DEVBENCH_HIST_CATS[k].parts.map(function (p) { return parts ? parts[p] : null; }).filter(function (v) { return typeof v === "number"; });
    out[k] = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;
  });
  return out;
}

/* Bring any stored/imported entry to the current shape. Returns null if unusable. */
function devbenchHistMigrate(e) {
  if (!e || typeof e.score !== "number" || !e.date || isNaN(Date.parse(e.date))) { return null; }
  return {
    id: e.id || "m-" + Date.parse(e.date).toString(36) + "-" + e.score,
    date: new Date(e.date).toISOString(),
    score: e.score,
    parts: e.parts || {},
    cats: e.cats || devbenchHistCats(e.parts),
    device: e.device || { browser: "unknown", model: "", platform: "", ua: "" }
  };
}

function devbenchHistList() {
  var raw;
  try { raw = JSON.parse(localStorage.getItem(DEVBENCH_HIST_KEY)) || []; } catch (e) { raw = []; }
  return raw.map(devbenchHistMigrate).filter(Boolean);
}

function devbenchHistSave(list) {
  list.sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); });
  try { localStorage.setItem(DEVBENCH_HIST_KEY, JSON.stringify(list.slice(0, DEVBENCH_HIST_MAX))); } catch (e) { /* full or blocked */ }
  document.dispatchEvent(new CustomEvent("devbench:history"));
}

/* Short device summary from the info card + user agent. */
function devbenchHistDevice() {
  var f = {};
  document.querySelectorAll("#sys-out > div").forEach(function (r) { f[r.firstChild.textContent] = r.lastChild.textContent; });
  var model = f.Model && f.Model !== "n/a" ? f.Model : "";
  return { browser: f.Browser || "unknown", model: model, platform: f.Platform || "", ua: navigator.userAgent.slice(0, 160) };
}

/* Add one Run all result. Returns the stored entry. */
function devbenchHistAdd(score) {
  var entry = { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), date: new Date().toISOString(),
    score: score.overall, parts: score.parts, cats: devbenchHistCats(score.parts), device: devbenchHistDevice() };
  var list = devbenchHistList(); list.unshift(entry); devbenchHistSave(list);
  return entry;
}

/* Merge imported entries; dedupe by id. Returns how many were new. */
function devbenchHistMerge(entries) {
  var list = devbenchHistList(), seen = {}, added = 0;
  list.forEach(function (e) { seen[e.id] = true; });
  (entries || []).map(devbenchHistMigrate).filter(Boolean).forEach(function (e) {
    if (!seen[e.id]) { seen[e.id] = true; list.push(e); added++; }
  });
  devbenchHistSave(list);
  return added;
}

/* After Run all: compare with the previous run, then save this one. */
document.addEventListener("devbench:runall", function (e) {
  var s = e.detail;
  if (!s.score) { return; }
  var prev = devbenchHistList()[0], note = document.getElementById("score-note");
  if (prev && note) {
    var d = s.score.overall - prev.score;
    note.innerHTML = 'Done. <span class="vs ' + (d >= 0 ? "up" : "down") + '">' + (d >= 0 ? "+" : "") + d + "</span> vs last run (" + prev.score + ").";
  }
  devbenchHistAdd(s.score);
});

/* Rewrite old-format entries once so the stored data is in the new shape. */
(function () {
  try { if (localStorage.getItem(DEVBENCH_HIST_KEY)) { devbenchHistSave(devbenchHistList()); } } catch (e) { /* no storage */ }
})();

window.DevbenchHistory = {
  list: devbenchHistList,
  add: devbenchHistAdd,
  merge: devbenchHistMerge,
  migrate: devbenchHistMigrate,
  clear: function () { try { localStorage.removeItem(DEVBENCH_HIST_KEY); } catch (e) { /* no */ } document.dispatchEvent(new CustomEvent("devbench:history")); },
  CATS: DEVBENCH_HIST_CATS
};
