/* ============================================================
   FILE: modules/draftly-xlsx.js
   PROJECT: Draftly
   ROLE: Small self-contained .xlsx reader for the Merge tab (read only; .xls and .ods are not supported).
         zip → workbook.xml (sheets, 1904 flag) → sharedStrings.xml, styles.xml (number formats),
         sheetN.xml. Cells become the text Excel shows: shared / inline strings, booleans, errors,
         numbers and dates through their number format (draftly-numfmt.js), formulas through
         their stored result. Merged cells keep the value in the top-left cell only.
   ZIP:  inflate through DecompressionStream('deflate-raw'); where the browser lacks it, JSZip is loaded
         on demand from shared/vendor/jszip.min.js (MIT or GPLv3, not modified) by a plain <script> tag.
         Works from file://; no import(), no CDN.
   API:  Draftly.xlsx.kind(arrayBuffer)       → 'xlsx' | 'ole' | 'other'   (by content, not by name)
         Draftly.xlsx.open(arrayBuffer)       → Promise<workbook>
           workbook = { sheets: [name…] (visible sheets), date1904, table(index) → Promise<table> }
           table    = { ok, error, header, rows, warnings }   (the shape of Draftly.csv.parse)
         Draftly.xlsx.maxRows / maxCols      → read limits
   Needs: draftly-csv.js (Draftly.csv.table), draftly-numfmt.js, DOMParser.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.xlsx = (function () {
  var X = { maxRows: 20000, maxCols: 1000, maxPart: 200 * 1024 * 1024, jszipUrl: '../../../shared/vendor/jszip.min.js' };
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function fail(msg, code) { var e = new Error(msg); e.userMessage = msg; e.code = code || 'xlsx'; return e; }

  /* ---------------------------------------------------------- type sniffing */
  X.kind = function kind(buf) {
    var b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && (b[2] === 3 || b[2] === 5)) return 'xlsx';   /* zip: checked further in open() */
    if (b.length >= 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'ole';
    return 'other';
  };

  /* ---------------------------------------------------------- zip (own reader) */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }
  function noop() { }

  function readDir(b) {
    var i = b.length - 22, min = Math.max(0, b.length - 22 - 65535);
    for (; i >= min; i--) if (u32(b, i) === 0x06054b50) break;
    if (i < min) throw fail('This file is damaged: it is not a valid .xlsx (zip) file');
    var n = u16(b, i + 10), p = u32(b, i + 16);
    if (n === 0xFFFF || p === 0xFFFFFFFF) throw fail('Zip64 workbooks are not supported');
    var map = {}, k;
    for (k = 0; k < n; k++) {
      if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw fail('This file is damaged: it is not a valid .xlsx (zip) file');
      var nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32);
      map[utf8(b.subarray(p + 46, p + 46 + nl))] = {
        flags: u16(b, p + 8), method: u16(b, p + 10), csize: u32(b, p + 20), usize: u32(b, p + 24), off: u32(b, p + 42)
      };
      p += 46 + nl + el + cl;
    }
    return map;
  }

  function inflateRaw(data) {
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(data).catch(noop); w.close().catch(noop);
    return new Response(ds.readable).arrayBuffer();
  }

  function nativeBackend(buf) {
    var b = new Uint8Array(buf), dir = readDir(b);
    return {
      has: function (name) { return !!dir[name]; },
      text: function (name) {
        var e = dir[name];
        if (!e) return Promise.resolve(null);
        if (e.flags & 1) return Promise.reject(fail('The workbook is encrypted'));
        if (e.usize > X.maxPart) return Promise.reject(fail('The part ' + name + ' is too large to read'));
        if (u32(b, e.off) !== 0x04034b50) return Promise.reject(fail('This file is damaged: it is not a valid .xlsx (zip) file'));
        var start = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28);
        var data = b.subarray(start, start + e.csize);
        if (e.method === 0) return Promise.resolve(utf8(data));
        if (e.method !== 8) return Promise.reject(fail('Unsupported zip compression in the workbook'));
        return inflateRaw(data).then(function (ab) {
          if (ab.byteLength > X.maxPart) throw fail('The part ' + name + ' is too large to read');
          return utf8(new Uint8Array(ab));
        }, function () { throw fail('This file is damaged: the workbook could not be unpacked'); });
      }
    };
  }

  var jszipLoad = null;
  function loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipLoad) jszipLoad = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = X.jszipUrl;
      s.onload = function () { window.JSZip ? res(window.JSZip) : rej(fail('Could not load the zip library')); };
      s.onerror = function () { jszipLoad = null; rej(fail('Could not load the zip library')); };
      document.head.appendChild(s);
    });
    return jszipLoad;
  }
  function jszipBackend(buf) {
    return loadJsZip().then(function (JSZip) { return JSZip.loadAsync(buf); }).then(function (z) {
      return {
        has: function (name) { return !!z.file(name); },
        text: function (name) { var f = z.file(name); return f ? f.async('string').then(function (t) { return t.replace(/^\uFEFF/, ''); }) : Promise.resolve(null); }
      };
    }, function (e) { throw e && e.userMessage ? e : fail('This file is damaged: it is not a valid .xlsx (zip) file'); });
  }
  function hasNativeInflate() {
    try { if (typeof DecompressionStream !== 'function') return false; new DecompressionStream('deflate-raw'); return true; }
    catch (e) { return false; }
  }
  function backend(buf) {
    if (hasNativeInflate()) { try { return Promise.resolve(nativeBackend(buf)); } catch (e) { return Promise.reject(e); } }
    return jszipBackend(buf);
  }

  /* ---------------------------------------------------------- xml helpers */
  function xml(text, what) {
    text = String(text).replace(/^\uFEFF/, '');
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw fail('The workbook is damaged (' + what + ' is not valid XML)');
    return doc.documentElement;
  }
  function kids(el, name) {
    var out = [], c = el && el.firstElementChild;
    for (; c; c = c.nextElementSibling) if (!name || c.localName === name) out.push(c);
    return out;
  }
  function first(el, name) { var c = el && el.firstElementChild; for (; c; c = c.nextElementSibling) if (c.localName === name) return c; return null; }
  function unesc(s) {   /* _x000D_ style escapes of control characters */
    if (s.indexOf('_x') === -1) return s;
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function siText(si) {   /* <si> / <is>: plain <t>, or rich runs <r><t>; phonetic hints are skipped */
    var out = '', c = si.firstElementChild, r;
    for (; c; c = c.nextElementSibling) {
      if (c.localName === 't') out += c.textContent;
      else if (c.localName === 'r') for (r = c.firstElementChild; r; r = r.nextElementSibling) if (r.localName === 't') out += r.textContent;
    }
    return unesc(out).replace(/\r\n?/g, '\n');
  }
  function colIndex(ref) {
    var n = 0, i = 0, c;
    while (i < ref.length) { c = ref.charCodeAt(i); if (c >= 65 && c <= 90) n = n * 26 + c - 64; else if (c >= 97 && c <= 122) n = n * 26 + c - 96; else break; i++; }
    return n - 1;
  }
  function rowIndex(ref) { var m = /(\d+)$/.exec(ref); return m ? parseInt(m[1], 10) - 1 : -1; }
  function resolvePath(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = (base + target).split('/'), out = [];
    parts.forEach(function (p) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }

  /* ---------------------------------------------------------- workbook parts */
  function parseStyles(text) {
    var root = xml(text, 'styles.xml'), fmts = {}, xfs = [];
    var nf = first(root, 'numFmts');
    kids(nf, 'numFmt').forEach(function (n) { fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
    kids(first(root, 'cellXfs'), 'xf').forEach(function (x) { xfs.push(parseInt(x.getAttribute('numFmtId'), 10) || 0); });
    return { fmts: fmts, xfs: xfs };
  }
  function parseShared(text) {
    var root = xml(text, 'sharedStrings.xml');
    return kids(root, 'si').map(siText);
  }

  X.open = function open(buf) {
    var kind = X.kind(buf);
    if (kind === 'ole') return Promise.reject(fail('This is an old .xls (or a password-protected) Excel file. Save it as .xlsx or CSV and choose that.', 'xls'));
    if (kind !== 'xlsx') return Promise.reject(fail('This is not an Excel (.xlsx) workbook', 'xlsx'));
    return backend(buf).then(function (zp) {
      if (!zp.has('xl/workbook.xml')) {
        if (zp.has('content.xml') && zp.has('mimetype')) throw fail('OpenDocument (.ods) files are not supported. Save it as .xlsx or CSV and choose that.', 'ods');
        throw fail('This zip file is not an Excel (.xlsx) workbook', 'xlsx');
      }
      return Promise.all([zp.text('xl/workbook.xml'), zp.text('xl/_rels/workbook.xml.rels'), zp.text('xl/styles.xml')]).then(function (p) {
        var wb = xml(p[0], 'workbook.xml'), rels = {}, sheets = [], date1904 = false;
        if (p[1]) kids(xml(p[1], 'workbook.xml.rels'), 'Relationship').forEach(function (r) {
          rels[r.getAttribute('Id')] = { target: r.getAttribute('Target') || '', type: r.getAttribute('Type') || '' };
        });
        var pr = first(wb, 'workbookPr');
        if (pr) { var d = pr.getAttribute('date1904'); date1904 = d === '1' || d === 'true'; }
        kids(first(wb, 'sheets'), 'sheet').forEach(function (s, i) {
          var rid = s.getAttributeNS(NS_R, 'id') || s.getAttribute('r:id'), rel = rid && rels[rid], path;
          if (rel) path = resolvePath('xl/', rel.target);
          else path = 'xl/worksheets/sheet' + (i + 1) + '.xml';
          if (rel && !/\/worksheet$/.test(rel.type)) return;          /* chartsheet, dialogsheet … */
          if (!zp.has(path)) return;
          var st = s.getAttribute('state');
          if (st === 'hidden' || st === 'veryHidden') return;          /* hidden sheets are not offered */
          sheets.push({ name: s.getAttribute('name') || ('Sheet' + (i + 1)), path: path });
        });
        if (!sheets.length) throw fail('The workbook has no visible worksheets');

        var styles = p[2] ? parseStyles(p[2]) : { fmts: {}, xfs: [] };
        var fmtCache = {};
        function fmtFor(xf) {   /* style index → compiled number format (or null for General) */
          if (fmtCache[xf] !== undefined) return fmtCache[xf];
          var id = styles.xfs[xf], code = null;
          if (id != null && id !== 0) code = styles.fmts[id] != null ? styles.fmts[id] : Draftly.numfmt.builtin(id);
          fmtCache[xf] = code && code !== 'General' ? Draftly.numfmt.compile(code) : null;
          return fmtCache[xf];
        }
        var sharedP = null;
        function shared() {
          if (!sharedP) sharedP = zp.text('xl/sharedStrings.xml').then(function (t) { return t ? parseShared(t) : []; });
          return sharedP;
        }
        return {
          sheets: sheets.map(function (s) { return s.name; }),
          date1904: date1904,
          table: function (index) {
            var sh = sheets[index];
            if (!sh) return Promise.reject(fail('No such sheet'));
            return Promise.all([zp.text(sh.path), shared()]).then(function (r) {
              return sheetTable(xml(r[0], sh.name), r[1], fmtFor, date1904, sh.name);
            });
          }
        };
      });
    });
  };

  /* ---------------------------------------------------------- one sheet */
  function sheetTable(root, strings, fmtFor, date1904, sheetName) {
    var data = first(root, 'sheetData'), rows = [], byRow = {}, seq = 0, noCache = 0, cutCols = false, cutRows = false, nonBlank = 0;
    var limit = X.maxRows + 1;   /* header + data rows */
    var rowEl, cEl;

    function cellText(c) {
      var t = c.getAttribute('t'), vEl = first(c, 'v'), v = vEl ? vEl.textContent : '', f = first(c, 'f');
      if (t === 'inlineStr') { var is = first(c, 'is'); return is ? siText(is) : ''; }
      if (v === '') { if (f && t !== 'str') noCache++; return ''; }
      switch (t) {
        case 's': { var s = strings[parseInt(v, 10)]; return s == null ? '' : s; }
        case 'str': return unesc(v).replace(/\r\n?/g, '\n');
        case 'b': return v === '1' || v === 'true' ? 'TRUE' : 'FALSE';
        case 'e': return v;
        case 'd': return v;
        default: {
          var num = Number(v);
          if (!isFinite(num)) return v;
          var fmt = fmtFor(parseInt(c.getAttribute('s'), 10) || 0);
          return fmt ? fmt.format(num, date1904) : Draftly.numfmt.general(num);
        }
      }
    }

    if (data) for (rowEl = data.firstElementChild; rowEl; rowEl = rowEl.nextElementSibling) {
      if (rowEl.localName !== 'row') continue;
      var ra = rowEl.getAttribute('r'), ri = ra ? parseInt(ra, 10) - 1 : seq;
      seq = ri + 1;
      var cells = [], cseq = 0, any = false;
      for (cEl = rowEl.firstElementChild; cEl; cEl = cEl.nextElementSibling) {
        if (cEl.localName !== 'c') continue;
        var ref = cEl.getAttribute('r'), col = ref ? colIndex(ref) : cseq;
        cseq = col + 1;
        if (col >= X.maxCols) { cutCols = true; continue; }
        var txt = cellText(cEl);
        if (txt !== '') { cells[col] = txt; any = true; }
      }
      if (any) {
        if (nonBlank >= limit) { cutRows = true; break; }
        nonBlank++;
        rows.push({ r: ri, cells: cells }); byRow[ri] = cells;
      }
    }

    /* merged cells: only the top-left value stays */
    var mc = first(root, 'mergeCells'), budget = 2000000;
    kids(mc, 'mergeCell').forEach(function (m) {
      var ref = (m.getAttribute('ref') || '').split(':');
      if (ref.length !== 2) return;
      var c0 = colIndex(ref[0]), r0 = rowIndex(ref[0]), c1 = colIndex(ref[1]), r1 = rowIndex(ref[1]);
      for (var rr = r0; rr <= r1 && budget > 0; rr++) {
        var cs = byRow[rr];
        if (!cs) { budget -= 1; continue; }
        for (var cc = c0; cc <= c1 && budget > 0; cc++, budget--) if ((rr !== r0 || cc !== c0) && cs[cc] !== undefined) cs[cc] = undefined;
      }
    });

    var warnings = [];
    if (!rows.length) return { ok: false, error: 'The sheet "' + sheetName + '" is empty', header: [], rows: [], warnings: [] };

    /* width = last used column; columns empty in the header and in every data row are dropped */
    var width = 0, used = [], i, k;
    rows.forEach(function (r) { if (r.cells.length > width) width = r.cells.length; });
    for (i = 0; i < width; i++) used[i] = false;
    rows.forEach(function (r) { for (k = 0; k < r.cells.length; k++) if (r.cells[k] !== undefined && r.cells[k] !== '') used[k] = true; });
    var keep = [];
    for (i = 0; i < width; i++) if (used[i]) keep.push(i);
    var recs = rows.map(function (r) {
      return keep.map(function (col) { var v = r.cells[col]; return v === undefined ? '' : v; });
    });
    /* rows with only whitespace-free emptiness are already gone; drop rows that became blank after merge cleanup */
    recs = recs.filter(function (r, idx) { return idx === 0 || r.some(function (v) { return v !== ''; }); });

    if (cutRows) warnings.push('Only the first ' + X.maxRows + ' data rows of the sheet were read (Export all handles up to 2000 rows at a time)');
    if (cutCols) warnings.push('Only the first ' + X.maxCols + ' columns of the sheet were read');
    if (noCache) warnings.push(noCache + ' formula cell' + (noCache === 1 ? ' has' : 's have') + ' no stored result and show as blank: open the file in Excel or LibreOffice and save it');
    var t = Draftly.csv.table(recs, 'sheet');
    return { ok: true, error: '', header: t.header, rows: t.rows, warnings: warnings.concat(t.warnings) };
  }

  return X;
})();
