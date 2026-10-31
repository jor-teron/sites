/* Calendar Maker CM17 core: holiday list CSV (no DOM). window.CM.Csv
   Header: Name,Start,End,Type,Repeat. Type Gazetted | Restricted. Repeat Every year | This year.
   Every year: Start/End as DD-MM (29-02 allowed); This year: YYYY-MM-DD. End blank = one day; ranges stay in one year.
   Export: UTF-8 with BOM, CRLF, RFC 4180 quoting. Import: BOM optional, CRLF or LF, Type/Repeat any case,
   columns matched by header name. Data model as core/cm_settings.js:
   fixed [{m, d, name, r?, em?, ed?}], dated [{date, end?, name, r?}]. */
window.CM = window.CM || {};
window.CM.Csv = (function () {
  'use strict';
  const HEAD = ['Name', 'Start', 'End', 'Type', 'Repeat'];
  const p2 = (n) => String(n).padStart(2, '0');
  const mlen = (m) => new Date(2000, m + 1, 0).getDate(); /* Feb = 29 */
  const q = (s) => { s = String(s == null ? '' : s); return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const line = (a) => a.map(q).join(',');
  const fname = (y) => y + '-holidays.csv';

  /* H = {fixed: [...] (or already resolved), dated: [...]} -> CSV text (BOM + CRLF) */
  function serialize(fixed, dated) {
    const out = [line(HEAD)];
    (fixed || []).slice().sort((a, b) => a.m - b.m || a.d - b.d).forEach((h) => {
      const e = h.em != null && h.ed != null && h.em * 100 + h.ed > h.m * 100 + h.d ? p2(h.ed) + '-' + p2(h.em + 1) : '';
      out.push(line([h.name, p2(h.d) + '-' + p2(h.m + 1), e, h.r ? 'Restricted' : 'Gazetted', 'Every year']));
    });
    (dated || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((h) => {
      out.push(line([h.name, h.date, h.end || '', h.r ? 'Restricted' : 'Gazetted', 'This year']));
    });
    return '\uFEFF' + out.join('\r\n') + '\r\n';
  }

  /* RFC 4180 rows -> [{cells, line}] (line = 1-based line where the row starts) */
  function rows(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const out = []; let row = [], cell = '', inQ = false, ln = 1, start = 1, i = 0;
    const endRow = () => { row.push(cell); out.push({ cells: row, line: start }); row = []; cell = ''; };
    for (; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else { if (c === '\n') ln++; cell += c; }
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        endRow(); ln++; start = ln;
      } else cell += c;
    }
    if (cell !== '' || row.length) endRow();
    return out.filter((r) => r.cells.some((c) => c.trim() !== ''));
  }

  const ymd = (s) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); if (!m) return null;
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (mo < 0 || mo > 11 || d < 1 || d > new Date(y, mo + 1, 0).getDate()) return null;
    return y + '-' + p2(mo + 1) + '-' + p2(d);
  };
  const dm = (s) => {
    const m = /^(\d{1,2})[-/](\d{1,2})$/.exec(s); if (!m) return null;
    const d = +m[1], mo = +m[2] - 1;
    if (mo < 0 || mo > 11 || d < 1 || d > mlen(mo)) return null;
    return { m: mo, d };
  };

  /* text -> {fixed: [...], dated: [...], skipped: [{line, reason}], total} ; never throws */
  function parse(text) {
    const res = { fixed: [], dated: [], skipped: [], total: 0 };
    const R = rows(text);
    if (!R.length) { res.skipped.push({ line: 1, reason: 'empty file' }); return res; }
    const hd = R[0].cells.map((c) => c.trim().toLowerCase()), col = {};
    HEAD.forEach((h) => { col[h] = hd.indexOf(h.toLowerCase()); });
    const miss = HEAD.filter((h) => h !== 'End' && col[h] < 0);
    if (miss.length) { res.skipped.push({ line: R[0].line, reason: 'header missing ' + miss.join(', ') }); return res; }
    R.slice(1).forEach((r) => {
      res.total++;
      const g = (k) => (col[k] < 0 ? '' : String(r.cells[col[k]] == null ? '' : r.cells[col[k]]).trim());
      const skip = (reason) => res.skipped.push({ line: r.line, reason });
      const name = g('Name'), type = g('Type').toLowerCase(), rep = g('Repeat').toLowerCase().replace(/\s+/g, ' ');
      const s = g('Start'), e = g('End');
      if (!name) return skip('missing name');
      if (type !== 'gazetted' && type !== 'restricted') return skip('unknown type "' + g('Type') + '"');
      if (rep !== 'every year' && rep !== 'this year') return skip('unknown repeat "' + g('Repeat') + '"');
      const rr = type === 'restricted';
      if (rep === 'every year') {
        const a = dm(s); if (!a) return skip('bad start date "' + s + '" (use DD-MM)');
        const o = { m: a.m, d: a.d, name };
        if (rr) o.r = true;
        if (e) {
          const b = dm(e); if (!b) return skip('bad end date "' + e + '" (use DD-MM)');
          const k1 = a.m * 100 + a.d, k2 = b.m * 100 + b.d;
          if (k2 < k1) return skip('end before start (ranges cannot cross into the next year)');
          if (k2 > k1) { o.em = b.m; o.ed = b.d; }
        }
        res.fixed.push(o);
      } else {
        const a = ymd(s); if (!a) return skip('bad start date "' + s + '" (use YYYY-MM-DD)');
        const o = { date: a, name };
        if (e) {
          const b = ymd(e); if (!b) return skip('bad end date "' + e + '" (use YYYY-MM-DD)');
          if (b.slice(0, 4) !== a.slice(0, 4)) return skip('range crosses into another year');
          if (b < a) return skip('end before start');
          if (b > a) o.end = b;
        }
        if (rr) o.r = true;
        res.dated.push(o);
      }
    });
    return res;
  }

  /* duplicate keys: same name + same dates + same repeat */
  const keyF = (h) => 'F|' + h.name + '|' + h.m + '-' + h.d + '|' + (h.em != null && h.em * 100 + h.ed > h.m * 100 + h.d ? h.em + '-' + h.ed : '');
  const keyD = (h) => 'D|' + h.name + '|' + h.date + '|' + (h.end && h.end > h.date ? h.end : '');
  /* merge parsed into existing lists (copies); returns {fixed, dated, added, dup} */
  function merge(fixed, dated, P) {
    const F = (fixed || []).slice(), D = (dated || []).slice(), seen = new Set();
    F.forEach((h) => seen.add(keyF(h))); D.forEach((h) => seen.add(keyD(h)));
    let added = 0, dup = 0;
    P.fixed.forEach((h) => { const k = keyF(h); if (seen.has(k)) dup++; else { seen.add(k); F.push(h); added++; } });
    P.dated.forEach((h) => { const k = keyD(h); if (seen.has(k)) dup++; else { seen.add(k); D.push(h); added++; } });
    return { fixed: F, dated: D, added, dup };
  }

  return { HEAD, serialize, parse, rows, merge, fname };
})();
