/*
 * base-csv.js  (BS1, BS5)
 * CSV parse / build for Base. Import makes a NEW table and guesses field types
 * (number, date YYYY-MM-DD, yes/no, else text). Export writes the current table (all rows, current sort).
 * BS5: Currency is written as a plain number; Picture columns are left out (a note is shown);
 *   import still creates a new table, then reports required / unique / format problems if any.
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
    if (typeof BaseTypes !== "undefined" && BaseTypes.TYPES[type]) return BaseTypes.cast(v, type);
    if (type === "number") return v === "" ? "" : Number(v);
    if (type === "bool") return /^(yes|true|y)$/i.test(String(v).trim());
    return v;
  }
  function reportIssues(t) {
    if (typeof BaseTypes === "undefined") return;
    var bad = [], warns = 0;
    t.rows.forEach(function (r, i) {
      var res = BaseTypes.validateRow(t, r);
      if (res.errors.length) bad.push("Row " + (i + 1) + ": " + res.errors.join(" "));
      warns += res.warns.length;
    });
    if (bad.length) {
      var more = bad.length > 6 ? " (and " + (bad.length - 6) + " more)" : "";
      try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show("Import problems: " + bad.slice(0, 6).join(" · ") + more, 6000); } catch (e) {}
    } else if (warns) {
      try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(warns + " imported value" + (warns === 1 ? "" : "s") + " look unusual (email, phone or link). They were kept.", 4000); } catch (e) {}
    }
  }
  function importText(name, text) {
    var rows = parse(text);
    if (!rows.length) return null;
    var head = rows.shift(), n = head.length;
    var fields = head.map(function (h, i) {
      return [h.trim() || "Field " + (i + 1), guess(rows.map(function (r) { return r[i] || ""; }))];
    });
    var data = rows.map(function (r) { var o = []; for (var i = 0; i < n; i++) o.push(cast(r[i] || "", fields[i][1])); return o; });
    var t = BaseStore.newTable(name, fields, data);
    reportIssues(t);
    return t;
  }
  function esc(v) { v = v === true ? "Yes" : v === false ? "No" : String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportTable(t) {
    var skipped = 0;
    var fields = t.fields.filter(function (f) { if (f.type === "picture") { skipped++; return false; } return true; });
    var lines = [fields.map(function (f) { return esc(f.name); }).join(",")];
    BaseGrid.visibleRows(t, true).forEach(function (r) {
      lines.push(fields.map(function (f) {
        var v = r.v[f.id];
        if (f.type === "currency") return esc(v === "" || v == null || isNaN(+v) ? "" : +v);
        return esc(v);
      }).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = t.name + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    if (skipped) {
      try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show("Picture column" + (skipped === 1 ? " was" : "s were") + " left out of the CSV.", 3500); } catch (e) {}
    }
  }
  return { parse: parse, importText: importText, exportTable: exportTable, guess: guess, cast: cast };
})();
