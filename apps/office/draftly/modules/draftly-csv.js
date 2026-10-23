/* ============================================================
   FILE: modules/draftly-csv.js
   PROJECT: Draftly
   ROLE: CSV reader for mail merge (RFC 4180): quoted fields, "" escapes,
         commas / semicolons / tabs / newlines inside quotes, CR / LF / CRLF row ends,
         a UTF-8 (or UTF-16) BOM, delimiter auto-detect, header row required.
   API:  Draftly.csv.decode(arrayBuffer)  → { text, note }       (UTF-8, UTF-16 BOM, else Windows-1252)
         Draftly.csv.parse(text, delim?)  → { ok, error, delimiter, header, rows, warnings }
         Draftly.csv.key(name)            → lookup key (trimmed, spaces collapsed, lower case)
   header = unique column names; rows = arrays padded / cut to header.length.
   Pure functions: no DOM, no storage. Works from file://.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.csv = {};

/* Bytes → text. A BOM is dropped. Not valid UTF-8 → Windows-1252 (a note says so). */
Draftly.csv.decode = function decode(buf) {
  var b = new Uint8Array(buf);
  var text, note = '';
  try {
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) text = new TextDecoder('utf-16le').decode(b.subarray(2));
    else if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) text = new TextDecoder('utf-16be').decode(b.subarray(2));
    else text = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch (e) {
    text = new TextDecoder('windows-1252').decode(b);
    note = 'Not valid UTF-8: read as Windows-1252';
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return { text: text, note: note };
};

/* Key used to match a placeholder to a column. */
Draftly.csv.key = function key(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase();
};

/* Split text into records with one delimiter. `limit` stops early (for detection). */
Draftly.csv.records = function records(text, delim, limit) {
  var out = [], row = [], f = '', i = 0, n = text.length, c;
  var inQ = false, wasQ = false, unterminated = false;
  function endField() { row.push(f); f = ''; wasQ = false; }
  function endRow() {
    endField();
    /* a line with no characters at all is skipped; a line of only delimiters is kept */
    if (!(row.length === 1 && row[0] === '' )) out.push(row);
    row = [];
  }
  while (i < n) {
    c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { f += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      f += c; i++; continue;
    }
    if (c === '"' && f === '' && !wasQ) { inQ = true; wasQ = true; i++; continue; }
    if (c === delim) { endField(); i++; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
      i++; endRow();
      if (limit && out.length >= limit) return { rows: out, unterminated: false };
      continue;
    }
    f += c; i++;   /* a quote in the middle of an unquoted field is kept as text */
  }
  if (inQ) unterminated = true;
  if (f !== '' || row.length) endRow();
  return { rows: out, unterminated: unterminated };
};

/* Pick , ; or tab: the one that gives the most rows with the same, >1, field count as the header. */
Draftly.csv.detect = function detect(text) {
  var best = ',', bestScore = -1;
  [',', ';', '\t'].forEach(function (d) {
    var r = Draftly.csv.records(text, d, 12).rows;
    if (!r.length) return;
    var cols = r[0].length, same = 0, k;
    for (k = 0; k < r.length; k++) if (r[k].length === cols) same++;
    var score = cols > 1 ? same * 1000 + cols : 0;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
};

/* Unique, non-empty column names. Returns { names, warnings }. */
Draftly.csv.headerNames = function headerNames(raw) {
  var seen = {}, names = [], warnings = [];
  raw.forEach(function (h, i) {
    var name = String(h).replace(/\s+/g, ' ').trim();
    if (!name) { name = 'Column ' + (i + 1); warnings.push('Column ' + (i + 1) + ' has no name: called "' + name + '"'); }
    var k = Draftly.csv.key(name), base = name, n = 1;
    while (seen[k]) {
      n++; name = base + ' (' + n + ')'; k = Draftly.csv.key(name);
    }
    if (n > 1) warnings.push('Duplicate column "' + base + '": the repeat is called "' + name + '"');
    seen[k] = true;
    names.push(name);
  });
  return { names: names, warnings: warnings };
};

/* One column, comma chosen, but the header holds ; or a tab: probably the wrong delimiter. */
function w1(res, delim, first) { return res.header.length === 1 && delim === ',' && /[;\t]/.test(first[0]); }

/* Records (first = header) → { header, rows, warnings }. Shared by CSV and Excel (label: 'CSV' | 'sheet').
   rows are padded / cut to the header width. */
Draftly.csv.table = function table(recs, label) {
  var out = { header: [], rows: [], warnings: [] };
  var hn = Draftly.csv.headerNames(recs[0] || []);
  out.header = hn.names;
  out.warnings = hn.warnings;
  var w = out.header.length, short = 0, long = 0, i, r, k;
  for (i = 1; i < recs.length; i++) {
    r = recs[i];
    if (r.length < w) short++;
    else if (r.length > w) long++;
    var cells = new Array(w);
    for (k = 0; k < w; k++) cells[k] = k < r.length ? r[k] : '';
    out.rows.push(cells);
  }
  if (short) out.warnings.push(short + ' row' + (short === 1 ? ' has' : 's have') + ' fewer values than the header: filled with blanks');
  if (long) out.warnings.push(long + ' row' + (long === 1 ? ' has' : 's have') + ' more values than the header: extra values ignored');
  if (!out.rows.length) out.warnings.push('The ' + (label || 'CSV') + ' has a header but no data rows');
  return out;
};

/* Parse CSV text. delim: ',' ';' '\t' or '' / 'auto'. */
Draftly.csv.parse = function parse(text, delim) {
  var res = { ok: false, error: '', delimiter: ',', header: [], rows: [], warnings: [] };
  text = String(text == null ? '' : text);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!text.trim()) { res.error = 'The CSV file is empty'; return res; }
  if (!delim || delim === 'auto') delim = Draftly.csv.detect(text);
  res.delimiter = delim;
  var rec = Draftly.csv.records(text, delim);
  if (!rec.rows.length) { res.error = 'The CSV file has no header row'; return res; }
  if (rec.unterminated) res.warnings.push('A quoted field is not closed: the rest of the file was read as one value');
  var t = Draftly.csv.table(rec.rows, 'CSV');
  res.header = t.header;
  res.rows = t.rows;
  res.warnings = res.warnings.concat(t.warnings);
  if (w1(res, delim, rec.rows[0])) res.warnings.push('Only one column found: try another delimiter');
  res.ok = true;
  return res;
};
