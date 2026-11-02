/*
  File: export.js
  Project: devbench
  Role: One JSON and one TXT export of the whole result (device facts, features, tests, score, verdicts).
  Exposes window.DevbenchExport.json(state) and .txt(state). Nothing is uploaded.
*/

/* Device facts read back from the info card rows. */
function devbenchFacts() {
  var out = {};
  document.querySelectorAll("#sys-out > div").forEach(function (row) { out[row.firstChild.textContent] = row.lastChild.textContent; });
  return out;
}

/* File-name stamp YYYYMMDD-HHMM in local time. */
function devbenchStamp() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

function devbenchDownload(name, text, type) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

/* Plain object for JSON export (stage elements and functions are not included). */
function devbenchSnapshot(state) {
  return { app: "devbench", version: 2, date: new Date().toISOString(), device: devbenchFacts(),
    features: state.features, tests: state.tests, score: state.score, verdicts: state.verdicts };
}

function devbenchExportJson(state) {
  devbenchDownload("devbench-" + devbenchStamp() + ".json", JSON.stringify(devbenchSnapshot(state), null, 2), "application/json");
}

function devbenchExportTxt(state) {
  var s = devbenchSnapshot(state), L = ["Device Benchmark — " + new Date().toString(), "Score: " + (s.score ? s.score.overall + " / 100" : "-"), ""];
  L.push("[Device]"); Object.keys(s.device).forEach(function (k) { L.push("  " + k + ": " + s.device[k]); });
  L.push("", "[Tests]");
  window.DEVBENCH_TESTS.forEach(function (t) { var r = s.tests[t.id]; if (r) { L.push("  " + t.name + ": " + (r.error ? "ERROR " + r.error : r.text)); } });
  if (s.verdicts) { L.push("", "[Games]"); s.verdicts.forEach(function (v) { L.push("  " + v.game + ": " + v.level + " — " + v.note); }); }
  if (s.features) {
    L.push("", "[Features]");
    Object.keys(s.features).forEach(function (k) { L.push("  " + (window.DevbenchFeatures.labels[k] || k) + ": " + (s.features[k] ? "yes" : "no")); });
  }
  devbenchDownload("devbench-" + devbenchStamp() + ".txt", L.join("\n") + "\n", "text/plain");
}

window.DevbenchExport = { json: devbenchExportJson, txt: devbenchExportTxt };
