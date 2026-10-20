/*
  File: history_io.js
  Project: devbench
  Role: History data in/out: CSV and JSON download of the raw runs, PNG of the current graph,
  JSON import from another device (merge + dedupe by id, via DevbenchHistory.merge).
  Exposes window.DevbenchHistIO: csv(), json(), png(canvas), importFile(file) -> Promise<added>.
*/

function devbenchHioSave(name, blob) {
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

function devbenchHioDay() { return new Date().toISOString().slice(0, 10); }

/* One CSV cell: quote when it has a comma, quote or newline. */
function devbenchHioCell(v) {
  var s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function devbenchHioCsv() {
  var rows = [["id", "date", "score", "cpu", "gpu", "memory", "ai", "browser", "model", "platform", "ua"]];
  window.DevbenchHistory.list().forEach(function (e) {
    rows.push([e.id, e.date, e.score, e.cats.cpu, e.cats.gpu, e.cats.mem, e.cats.ai, e.device.browser, e.device.model, e.device.platform, e.device.ua]);
  });
  devbenchHioSave("devbench-history-" + devbenchHioDay() + ".csv", new Blob([rows.map(function (r) { return r.map(devbenchHioCell).join(","); }).join("\n") + "\n"], { type: "text/csv" }));
}

function devbenchHioJson() {
  var data = { app: "devbench-history", version: 2, exported: new Date().toISOString(), runs: window.DevbenchHistory.list() };
  devbenchHioSave("devbench-history-" + devbenchHioDay() + ".json", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

function devbenchHioPng(canvas) {
  canvas.toBlob(function (b) { if (b) { devbenchHioSave("devbench-graph-" + devbenchHioDay() + ".png", b); } }, "image/png");
}

/* Accepts our export ({ runs: [...] }) or a plain array of runs. */
async function devbenchHioImport(file) {
  var data = JSON.parse(await file.text());
  var runs = Array.isArray(data) ? data : data && data.runs;
  if (!Array.isArray(runs)) { throw new Error("Not a devbench history file"); }
  return window.DevbenchHistory.merge(runs);
}

window.DevbenchHistIO = { csv: devbenchHioCsv, json: devbenchHioJson, png: devbenchHioPng, importFile: devbenchHioImport };
