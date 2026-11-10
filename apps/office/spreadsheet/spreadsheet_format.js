/*
 * spreadsheet_format.js
 * Number formats (display only; the stored value is unchanged). Saved as style.fmt:
 * general | int (0 decimals) | dec2 (2 decimals) | thousands | percent | currency
 * | date (YYYY-MM-DD) | datedmy (DD/MM/YYYY) | time (HH:MM) | datetime (YYYY-MM-DD HH:MM).
 * Locale and currency symbol come from CFG.numberFormat. Text and errors show as they are.
 */
function formatCellValue(v, fmt) {
  if (v === undefined || v === null) return "";
  if (!fmt || fmt === "general") return String(v);
  var n = typeof v === "number" ? v : (String(v).trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
  if (fmt === "date" || fmt === "datedmy" || fmt === "time" || fmt === "datetime") {
    var dt = typeof fxParseDate === "function" ? fxParseDate(v) : null;
    if (!dt) return String(v);
    var y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, da = dt.getUTCDate();
    var hh = dt.getUTCHours(), mm = dt.getUTCMinutes();
    function p2(x) { return x < 10 ? "0" + x : String(x); }
    if (fmt === "date") return y + "-" + p2(mo) + "-" + p2(da);
    if (fmt === "datedmy") return p2(da) + "/" + p2(mo) + "/" + y;
    if (fmt === "time") return p2(hh) + ":" + p2(mm);
    return y + "-" + p2(mo) + "-" + p2(da) + " " + p2(hh) + ":" + p2(mm);
  }
  if (n === null || !isFinite(n)) return String(v);
  var loc = CFG.numberFormat.locale;
  var fix = function (x, d) { var s = x.toFixed(d); return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; };
  if (fmt === "int") return fix(n, 0);
  if (fmt === "dec2") return fix(n, 2);
  if (fmt === "thousands") return n.toLocaleString(loc, { maximumFractionDigits: 2 });
  if (fmt === "percent") return (n * 100).toLocaleString(loc, { maximumFractionDigits: 2, useGrouping: false }) + "%";
  if (fmt === "currency") {
    var s = Math.abs(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 && s !== "0.00" ? "-" : "") + CFG.numberFormat.currency + s;
  }
  return String(v);
}

SHEET_INIT.push(function () {
  var sel = document.getElementById("fmt-sel");
  if (!sel) return;
  sel.addEventListener("change", function () {
    styleSelection("fmt", function (st) { st.fmt = sel.value; });
  });
});
