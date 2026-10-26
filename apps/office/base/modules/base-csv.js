/*
 * base-csv.js  (BS1)
 * CSV parse / build for Base. Import makes a NEW table and guesses field types
 * (number, date YYYY-MM-DD, yes/no, else text). Export writes the current table (all rows, current sort).
 * API: BaseCsv.parse(text) -> rows[][], BaseCsv.importText(name, text), BaseCsv.exportTable(t)
 */
var BaseCsv = (function () {
  function parse(s) {
    var rows = [], row = [], f = "", q = false, i, c;
    s = s.replace(/^\uFEFF/, "");
    for (i = 0; i < s.length; i++) {
      c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); });
  }
  var YES = /^(yes|no|true|false|y|n)$/i;
  function guess(vals) {
    vals = vals.filter(function (v) { return v.trim() !== ""; });
    if (!vals.length) return "text";
    if (vals.every(function (v) { return v.trim() !== "" && !isNaN(Number(v)); })) return "number";
    if (vals.every(function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()); })) return "date";
    if (vals.every(function (v) { return YES.test(v.trim()); })) return "bool";
    return "text";
  }
  function cast(v, type) {
    if (type === "number") return v === "" ? "" : Number(v);
    if (type === "bool") return /^(yes|true|y)$/i.test(String(v).trim());
    return v;
  }
  function importText(name, text) {
    var rows = parse(text);
    if (!rows.length) return null;
    var head = rows.shift(), n = head.length;
    var fields = head.map(function (h, i) {
      return [h.trim() || "Field " + (i + 1), guess(rows.map(function (r) { return r[i] || ""; }))];
    });
    var data = rows.map(function (r) { var o = []; for (var i = 0; i < n; i++) o.push(cast(r[i] || "", fields[i][1])); return o; });
    return BaseStore.newTable(name, fields, data);
  }
  function esc(v) { v = v === true ? "Yes" : v === false ? "No" : String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportTable(t) {
    var lines = [t.fields.map(function (f) { return esc(f.name); }).join(",")];
    BaseGrid.visibleRows(t, true).forEach(function (r) { lines.push(t.fields.map(function (f) { return esc(r.v[f.id]); }).join(",")); });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = t.name + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  return { parse: parse, importText: importText, exportTable: exportTable, guess: guess, cast: cast };
})();
