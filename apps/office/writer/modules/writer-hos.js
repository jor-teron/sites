/* ============================================================
   FILE: modules/writer-hos.js
   PROJECT: Writer
   ROLE: MM8 small Spreadsheet .hos reader for the Merge tab (read only).
         A .hos file is UTF-8 JSON { format: "hos", version: 1, sheets: [...] } written by
         Hub Office Spreadsheet (HOS1). Cells become the text Spreadsheet shows:
         the saved value (cell.value; formulas are NOT recalculated, their saved result is used)
         through the cell's named number format (style.fmt: general, int, dec2, thousands,
         percent, currency, date, datedmy, time, datetime).
         The number format helper is a small port of formatCellValue (spreadsheet_format.js)
         and fxParseDate (spreadsheet_functions.js); the Spreadsheet files are not loaded.
   API:  Writer.hos.sniff(arrayBuffer|string) → { kind: 'hos'|'how'|'other', data, text }   (by content)
         Writer.hos.open(arrayBuffer|string|data) → workbook (sync; throws Error with userMessage)
           workbook = { sheets: [name…], table(index) → table }
           table    = { ok, error, header, rows, warnings }   (the shape of Writer.csv.parse)
         Writer.hos.format(value, fmt)  → display text
   LIMITS: version 1 only; 26 columns × 100 rows; 20 sheets; no formula recalculation (a formula
         with no saved value is blank, with a warning); filters and hidden rows are not applied
         (the full sheet is read); charts ignored; merged cells keep the top-left value only.
   Needs: writer-csv.js (Writer.csv.table). No DOM.
   ============================================================ */

var Writer = (typeof window !== 'undefined' && window.Writer) || (typeof globalThis !== 'undefined' && globalThis.Writer) || {};
if (typeof window !== 'undefined') window.Writer = Writer;

Writer.hos = (function () {
  var H = {
    version: 1, cols: 26, rows: 100, maxSheets: 20, maxBytes: 48 * 1024 * 1024,
    /* same defaults as Spreadsheet CFG.numberFormat (spreadsheet_config.js) */
    numberFormat: { currency: '\u20b9', locale: 'en-IN' }
  };

  function fail(msg, code) { var e = new Error(msg); e.userMessage = msg; e.code = code || 'hos'; return e; }

  function toText(src) {
    if (typeof src === 'string') return src.charCodeAt(0) === 0xFEFF ? src.slice(1) : src;
    var b = new Uint8Array(src);
    var t = new TextDecoder('utf-8').decode(b);
    return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
  }
  function firstChar(src) {
    if (typeof src === 'string') { var m = /\S/.exec(src.replace(/^\uFEFF/, '')); return m ? m[0] : ''; }
    var b = new Uint8Array(src, 0, Math.min(src.byteLength, 4096)), i = 0;
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) i = 3;
    for (; i < b.length; i++) if (b[i] !== 0x20 && b[i] !== 0x09 && b[i] !== 0x0A && b[i] !== 0x0D) return String.fromCharCode(b[i]);
    return '';
  }

  /* ---------------------------------------------------------- type sniffing (content, not name) */
  H.sniff = function sniff(src) {
    var out = { kind: 'other', data: null, text: '' };
    if (firstChar(src) !== '{') return out;
    var size = typeof src === 'string' ? src.length : src.byteLength;
    if (size > H.maxBytes) return out;
    var text = toText(src), data;
    try { data = JSON.parse(text); } catch (e) { return out; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
    out.text = text; out.data = data;
    if (data.format === 'hos') out.kind = 'hos';
    else if (data.format === 'how') out.kind = 'how';
    return out;
  };

  /* ---------------------------------------------------------- number formats (port of formatCellValue) */
  function parseDate(v) {
    if (v === '' || v == null) return null;
    var d, m;
    if (typeof v === 'number' && isFinite(v)) {
      d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d.getTime()) ? null : d;
    }
    var s = String(v).trim();
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
      return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      var da = +m[1], mo = +m[2], y = +m[3];
      if (mo > 12 && da <= 12) { var tmp = da; da = mo; mo = tmp; }
      d = new Date(Date.UTC(y, mo - 1, da));
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
  function p2(x) { return x < 10 ? '0' + x : String(x); }
  function fix(x, d) { var s = x.toFixed(d); return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; }

  H.format = function format(v, fmt) {
    if (v === undefined || v === null) return '';
    if (!fmt || fmt === 'general') return String(v);
    var n = typeof v === 'number' ? v : (String(v).trim() !== '' && !isNaN(Number(v)) ? Number(v) : null);
    if (fmt === 'date' || fmt === 'datedmy' || fmt === 'time' || fmt === 'datetime') {
      var dt = parseDate(v);
      if (!dt) return String(v);
      var y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, da = dt.getUTCDate(), hh = dt.getUTCHours(), mm = dt.getUTCMinutes();
      if (fmt === 'date') return y + '-' + p2(mo) + '-' + p2(da);
      if (fmt === 'datedmy') return p2(da) + '/' + p2(mo) + '/' + y;
      if (fmt === 'time') return p2(hh) + ':' + p2(mm);
      return y + '-' + p2(mo) + '-' + p2(da) + ' ' + p2(hh) + ':' + p2(mm);
    }
    if (n === null || !isFinite(n)) return String(v);
    var loc = H.numberFormat.locale;
    if (fmt === 'int') return fix(n, 0);
    if (fmt === 'dec2') return fix(n, 2);
    if (fmt === 'thousands') return n.toLocaleString(loc, { maximumFractionDigits: 2 });
    if (fmt === 'percent') return (n * 100).toLocaleString(loc, { maximumFractionDigits: 2, useGrouping: false }) + '%';
    if (fmt === 'currency') {
      var s = Math.abs(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (n < 0 && s !== '0.00' ? '-' : '') + H.numberFormat.currency + s;
    }
    return String(v);
  };

  /* ---------------------------------------------------------- workbook */
  function sheetNames(list) {
    var used = {}, out = [];
    list.forEach(function (sh, i) {
      var base = String((sh && sh.name) || ('Sheet' + (i + 1))).replace(/\s+/g, ' ').trim() || ('Sheet' + (i + 1));
      var name = base, k = 2;
      while (used[name.toLowerCase()]) name = base + ' (' + (k++) + ')';
      used[name.toLowerCase()] = true;
      out.push(name);
    });
    return out;
  }

  H.open = function open(src) {
    var data = src;
    if (typeof src === 'string' || (src && (src instanceof ArrayBuffer || ArrayBuffer.isView(src)))) {
      var s = H.sniff(src && src.buffer && ArrayBuffer.isView(src) ? src.buffer : src);
      if (s.kind === 'other') throw fail('This .hos file could not be read: it is not a Spreadsheet file');
      data = s.data;
    }
    if (!data || typeof data !== 'object') throw fail('This .hos file could not be read: it is not a Spreadsheet file');
    if (data.format === 'how') throw fail('This is a Writer document (.how), not merge data: choose a CSV, Excel or Spreadsheet .hos file', 'how');
    if (data.format !== 'hos') throw fail('This is not a Hub Office Spreadsheet .hos file');
    if (data.version !== H.version) throw fail('This .hos file is version ' + data.version + '. Writer Mail Merge reads version 1', 'version');
    if (!Array.isArray(data.sheets) || !data.sheets.length) throw fail('This .hos file has no sheet');
    var list = data.sheets.slice(0, H.maxSheets);
    var names = sheetNames(list);
    var cut = data.sheets.length > H.maxSheets;
    return {
      sheets: names,
      table: function (index) {
        var sh = list[index];
        if (!sh) throw fail('No such sheet');
        var t = sheetTable(sh, names[index]);
        if (cut && t.ok) t.warnings.unshift('Only the first ' + H.maxSheets + ' sheets of the file are listed');
        return t;
      }
    };
  };

  function cellText(cell, count) {
    var f = cell.formula == null ? '' : String(cell.formula);
    var v = cell.value;
    var fmt = cell.style && typeof cell.style.fmt === 'string' ? cell.style.fmt : 'general';
    if (f.charAt(0) === '=') {
      if (v === '' || v == null) { count.noCache++; return ''; }
    } else if (v === '' || v == null) v = f;   /* plain input: the typed text is the value */
    if (typeof v === 'object') return '';
    return H.format(v, fmt).replace(/\r\n?/g, '\n');
  }

  function sheetTable(sh, sheetName) {
    var cells = Array.isArray(sh.cells) ? sh.cells : [], grid = [], count = { noCache: 0 }, cutCells = 0, i, r, c;
    for (i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (!cell || typeof cell !== 'object') continue;
      r = cell.r; c = cell.c;
      if (typeof r !== 'number' || typeof c !== 'number' || r < 0 || c < 0 || r !== Math.floor(r) || c !== Math.floor(c)) continue;
      if (r >= H.rows || c >= H.cols) { cutCells++; continue; }
      var txt = cellText(cell, count);
      if (txt === '') continue;
      if (!grid[r]) grid[r] = [];
      grid[r][c] = txt;
    }
    /* merged cells: only the top-left value stays (same as MM3) */
    (Array.isArray(sh.merges) ? sh.merges : []).forEach(function (m) {
      if (!m) return;
      var r0 = Math.max(0, m.r1 | 0), c0 = Math.max(0, m.c1 | 0), r1 = Math.min(H.rows - 1, m.r2 | 0), c1 = Math.min(H.cols - 1, m.c2 | 0);
      for (var rr = r0; rr <= r1; rr++) for (var cc = c0; cc <= c1; cc++) {
        if ((rr !== r0 || cc !== c0) && grid[rr] && grid[rr][cc] !== undefined) grid[rr][cc] = undefined;
      }
    });

    var rows = [];
    for (r = 0; r < H.rows; r++) {
      var row = grid[r];
      if (row && row.some(function (v) { return v !== undefined && v !== ''; })) rows.push(row);
    }
    var warnings = [];
    if (count.noCache) warnings.push(count.noCache + ' formula cell' + (count.noCache === 1 ? ' has' : 's have') + ' no saved result and show' + (count.noCache === 1 ? 's' : '') + ' as blank: open the file in Spreadsheet and save it');
    if (!rows.length) return { ok: false, error: 'The sheet "' + sheetName + '" is empty', header: [], rows: [], warnings: warnings };

    /* columns empty in the header and in every data row are dropped (same as MM3) */
    var used = [], keep = [];
    rows.forEach(function (row) { for (var k = 0; k < row.length; k++) if (row[k] !== undefined && row[k] !== '') used[k] = true; });
    for (c = 0; c < H.cols; c++) if (used[c]) keep.push(c);
    var recs = rows.map(function (row) { return keep.map(function (col) { var v = row[col]; return v === undefined ? '' : v; }); });

    if (cutCells) warnings.push(cutCells + ' cell' + (cutCells === 1 ? ' is' : 's are') + ' outside the ' + H.cols + ' \u00d7 ' + H.rows + ' grid and were not read');
    var t = Writer.csv.table(recs, 'sheet');
    return { ok: true, error: '', header: t.header, rows: t.rows, warnings: warnings.concat(t.warnings) };
  }

  return H;
})();

if (typeof module === 'object' && module.exports) module.exports = Writer.hos;
