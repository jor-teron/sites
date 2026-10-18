/*
  File: history.js
  Project: devbench
  Role: Run history on this device (localStorage "devbench-history", newest first, max 20).
  Saves after each Run all, shows the list in Settings and a "vs last run" note under the score.
  Exposes window.DevbenchHistory.list() and .clear().
*/

var DEVBENCH_HIST_KEY = "devbench-history";
var DEVBENCH_HIST_MAX = 20;

function devbenchHistList() {
  try { return JSON.parse(localStorage.getItem(DEVBENCH_HIST_KEY)) || []; } catch (e) { return []; }
}

function devbenchHistSave(list) {
  try { localStorage.setItem(DEVBENCH_HIST_KEY, JSON.stringify(list.slice(0, DEVBENCH_HIST_MAX))); } catch (e) { /* full or blocked */ }
}

/* Paint the history list inside Settings. */
function devbenchHistRender() {
  var ul = document.getElementById("history");
  if (!ul) { return; }
  var list = devbenchHistList();
  if (!list.length) { ul.innerHTML = '<li class="muted">No runs saved yet. Run all saves one.</li>'; return; }
  ul.innerHTML = list.map(function (h) {
    return "<li><span>" + new Date(h.date).toLocaleString() + "</span><b>" + h.score + '</b><span class="hbar" style="width:' + h.score + '%"></span></li>';
  }).join("");
}

/* After Run all: compare with the previous run, then save this one. */
document.addEventListener("devbench:runall", function (e) {
  var s = e.detail;
  if (!s.score) { return; }
  var list = devbenchHistList(), prev = list[0], note = document.getElementById("score-note");
  if (prev && note) {
    var d = s.score.overall - prev.score;
    note.innerHTML = 'Done. <span class="vs ' + (d >= 0 ? "up" : "down") + '">' + (d >= 0 ? "+" : "") + d + "</span> vs last run (" + prev.score + ").";
  }
  list.unshift({ date: new Date().toISOString(), score: s.score.overall, parts: s.score.parts });
  devbenchHistSave(list);
  devbenchHistRender();
});

document.addEventListener("DOMContentLoaded", devbenchHistRender);
devbenchHistRender();

window.DevbenchHistory = {
  list: devbenchHistList,
  clear: function () { try { localStorage.removeItem(DEVBENCH_HIST_KEY); } catch (e) { /* no */ } devbenchHistRender(); }
};
