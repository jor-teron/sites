/* Hub Office Slides SL5 — rich text model (SLText). No DOM, safe to load in Node for tests.
   A document is { paragraphs: [para, ...] }. A paragraph is
     { runs: [{ text, b?, i?, u?, s?, size?, color?, hl? }], level: 0|1|2, align?: 'left'|'center'|'right', list?: 'bullet'|'number'|'none' }
   NOT raw HTML: paste is mapped to this model (plain text, or a strict allowlist). Old plain-text titles and
   tab-indented bodies become one plain run per line on load; nothing is dropped. */
(function (root) {
  'use strict';
  var SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 56, 72, 96];
  var LISTS = { bullets: 1, numbers: 1, none: 1, bullet: 1, number: 1 };
  var ALIGNS = { left: 1, center: 1, right: 1 };
  var MAX_PARAS = 200, MAX_RUN = 1000, MAX_BOX = 50;

  function str(x, max) { return (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : '')).slice(0, max || 2000); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }
  function escq(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function normList(v, def) {
    v = String(v || '');
    if (v === 'bullets') v = 'bullet';
    if (v === 'numbers' || v === 'numbered') v = 'number';
    return (v === 'bullet' || v === 'number' || v === 'none') ? v : (def || 'none');
  }
  function normAlign(v, def) {
    v = String(v || '');
    if (v === 'centre') v = 'center';
    return ALIGNS[v] ? v : (def || '');
  }
  function cleanColor(s) {
    s = String(s || '').trim().toLowerCase();
    if (/[(){}]|url|expression|javascript|@/i.test(s) && !/^rgba?\(/i.test(s)) return '';
    var m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) { s = m[1]; return '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; }
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(function (n) {
        n = Math.max(0, Math.min(255, +n));
        return ('0' + n.toString(16)).slice(-2);
      }).join('');
    }
    return '';
  }
  function cleanSize(x) {
    if (typeof x === 'string') {
      var m = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(x.trim());
      x = m ? +m[1] : 0;
    }
    x = +x;
    if (!isFinite(x) || x < 8 || x > 200) return 0;
    return Math.round(x);
  }
  function textOfRuns(runs) { var t = '', i; for (i = 0; i < (runs || []).length; i++) t += runs[i].text || ''; return t; }
  function paraText(p) { return textOfRuns(p && p.runs); }
  function runStyled(r) { return !!(r && (r.b || r.i || r.u || r.s || r.size || r.color || r.hl)); }

  function cleanRun(r) {
    r = r && typeof r === 'object' ? r : {};
    var t = str(r.text != null ? r.text : r.t, MAX_RUN).replace(/\r/g, '').replace(/[\n\t]/g, ' ');
    var o = { text: t };
    if (r.b) o.b = true;
    if (r.i) o.i = true;
    if (r.u) o.u = true;
    if (r.s) o.s = true;
    var sz = cleanSize(r.size); if (sz) o.size = sz;
    var c = cleanColor(r.color); if (c) o.color = c;
    var h = cleanColor(r.hl || r.bg || r.highlight); if (h) o.hl = h;
    return o;
  }
  function sameMarks(a, b) {
    return !a.b === !b.b && !a.i === !b.i && !a.u === !b.u && !a.s === !b.s && (a.size || 0) === (b.size || 0) &&
      (a.color || '') === (b.color || '') && (a.hl || '') === (b.hl || '');
  }
  function mergeRuns(runs) {
    var out = [], i, r, last;
    for (i = 0; i < (runs || []).length; i++) {
      r = cleanRun(runs[i]);
      if (!r.text) continue;
      if (last && sameMarks(last, r)) last.text = (last.text + r.text).slice(0, MAX_RUN * 4);
      else { out.push(r); last = r; }
    }
    return out;
  }
  function cleanPara(p, o) {
    o = o || {};
    if (typeof p === 'string') p = { runs: [{ text: p }], level: 0 };
    p = p && typeof p === 'object' ? p : {};
    var list = normList(p.list, o.list || 'none');
    var align = normAlign(p.align, '');
    var level = o.single ? 0 : Math.max(0, Math.min(2, +p.level || 0));
    var runs = Array.isArray(p.runs) ? mergeRuns(p.runs) : mergeRuns([{ text: str(p.text, MAX_RUN) }]);
    return { runs: runs.length ? runs : [{ text: '' }], level: level, align: align, list: list };
  }
  function emptyPara(list, align) { return { runs: [{ text: '' }], level: 0, align: align || '', list: normList(list, 'none') }; }

  function fromPlain(text, o) {
    o = o || {};
    var list = normList(o.list, 'none'), max = o.max || 5000, single = !!o.single;
    text = str(text, max).replace(/\r/g, '');
    if (single) text = text.replace(/[\n\t]+/g, ' ');
    var lines = single ? [text] : text.split('\n');
    if (!lines.length) lines = [''];
    var paras = lines.slice(0, MAX_PARAS).map(function (l) {
      var tabs = /^(\t*)/.exec(l)[1].length;
      var lv = single ? 0 : (tabs >= 2 ? 2 : tabs >= 1 ? 1 : 0);
      var t = l.replace(/^\t+/, '');
      return { runs: [{ text: t }], level: lv, align: '', list: list };
    });
    return { paragraphs: paras };
  }
  function cleanDoc(d, o) {
    o = o || {};
    if (typeof d === 'string' || typeof d === 'number') return fromPlain(String(d), o);
    d = d && typeof d === 'object' ? d : {};
    var paras;
    if (Array.isArray(d.paragraphs)) paras = d.paragraphs;
    else if (Array.isArray(d)) paras = d;
    else if (d.runs || d.text != null) paras = [d];
    else paras = [];
    paras = paras.slice(0, MAX_PARAS).map(function (p) { return cleanPara(p, o); });
    if (o.single) {
      var t = paras.map(paraText).join(' ').replace(/\s+/g, ' ').trim();
      if (o.max) t = t.slice(0, o.max);
      paras = [{ runs: mergeRuns(paras.length === 1 ? paras[0].runs : [{ text: t }]), level: 0,
        align: paras[0] ? paras[0].align : '', list: 'none' }];
      if (paras.length === 1 && paras[0].runs.length && o.max) {
        var n = 0, kept = [];
        paras[0].runs.forEach(function (r) {
          if (n >= o.max) return;
          var piece = r.text.slice(0, o.max - n);
          n += r.text.length;
          kept.push(Object.assign({}, r, { text: piece }));
        });
        if (!kept.length) kept = [{ text: t.slice(0, o.max) }];
        paras[0].runs = mergeRuns(kept);
      }
    } else if (o.max) {
      var used = 0, out = [];
      paras.forEach(function (p) {
        if (used >= o.max) return;
        var tx = paraText(p), room = o.max - used;
        if (tx.length <= room) { out.push(p); used += tx.length + 1; return; }
        var n = 0, runs = [];
        p.runs.forEach(function (r) {
          if (n >= room) return;
          var piece = r.text.slice(0, room - n);
          n += r.text.length;
          runs.push(Object.assign({}, r, { text: piece }));
        });
        out.push(Object.assign({}, p, { runs: mergeRuns(runs.length ? runs : [{ text: '' }]) }));
        used = o.max;
      });
      paras = out;
    }
    if (!paras.length) paras = [emptyPara(o.list || 'none')];
    return { paragraphs: paras };
  }
  function clone(d, o) { return JSON.parse(JSON.stringify(cleanDoc(d, o))); }
  function plain(d, o) {
    o = o || {};
    d = cleanDoc(d, o);
    if (o.single) return d.paragraphs.map(paraText).join(' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return d.paragraphs.map(function (p) {
      return (p.level >= 2 ? '\t\t' : p.level >= 1 ? '\t' : '') + paraText(p);
    }).join('\n');
  }
  function has(d) { return plain(d).replace(/\s+/g, '') !== ''; }
  function equal(a, b) { return JSON.stringify(cleanDoc(a)) === JSON.stringify(cleanDoc(b)); }
  function concat(a, b) {
    var A = cleanDoc(a).paragraphs, B = cleanDoc(b).paragraphs;
    if (A.length && !paraText(A[A.length - 1]).replace(/\s+/g, '')) A = A.slice(0, -1);
    return cleanDoc({ paragraphs: A.concat(B) });
  }
  function charCount(d) { return plain(d).length; }
  function isStyled(d, o) {
    o = o || {};
    d = cleanDoc(d, o);
    var def = normList(o.list, 'none');
    return d.paragraphs.some(function (p) {
      if (p.align && p.align !== 'left') return true;
      if (normList(p.list, def) !== def) return true;
      if ((p.level || 0) > 1) return true;
      return (p.runs || []).some(runStyled);
    });
  }
  function setList(d, list) {
    list = normList(list, 'none');
    d = cleanDoc(d);
    return { paragraphs: d.paragraphs.map(function (p) { return Object.assign({}, p, { list: list }); }) };
  }
  function setAlign(d, align) {
    align = normAlign(align, '');
    d = cleanDoc(d);
    return { paragraphs: d.paragraphs.map(function (p) { return Object.assign({}, p, { align: align }); }) };
  }
  function boxList(d) {
    d = cleanDoc(d);
    var l = d.paragraphs[0] && d.paragraphs[0].list;
    return normList(l, 'none');
  }
  function boxAlign(d) {
    d = cleanDoc(d);
    return (d.paragraphs[0] && d.paragraphs[0].align) || '';
  }

  function letter(n) {
    var s = '';
    n = n | 0;
    if (n <= 0) return 'a';
    while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }
  function roman(n) {
    var v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1],
      sy = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'], o = '', i;
    n = Math.max(1, Math.min(3999, n | 0));
    for (i = 0; i < v.length; i++) while (n >= v[i]) { o += sy[i]; n -= v[i]; }
    return o;
  }
  function marker(n, level) {
    n = Math.max(1, n | 0);
    level = level | 0;
    if (level <= 0) return n + '.';
    if (level === 1) return letter(n) + '.';
    return roman(n) + '.';
  }
  function numbers(paras) {
    var c = [0, 0, 0];
    return (paras || []).map(function (p) {
      if (normList(p.list, 'none') !== 'number') {
        if ((p.level || 0) === 0) { c[1] = 0; c[2] = 0; }
        if ((p.level || 0) === 1) c[2] = 0;
        return '';
      }
      var lv = Math.max(0, Math.min(2, p.level | 0));
      c[lv]++;
      if (lv < 1) c[1] = 0;
      if (lv < 2) c[2] = 0;
      return marker(c[lv], lv);
    });
  }

  function runStyle(r) {
    var st = [];
    if (r.size) st.push('font-size:' + r.size + 'px');
    if (r.color) st.push('color:' + r.color);
    if (r.hl) st.push('background-color:' + r.hl);
    return st.join(';');
  }
  function runHtml(r) {
    var cls = 'r' + (r.b ? ' b' : '') + (r.i ? ' i' : '') + (r.u ? ' u' : '') + (r.s ? ' s' : '');
    var st = runStyle(r);
    var t = esc(r.text || '');
    if (!t) t = '\u200b';
    return '<span class="' + cls + '"' + (st ? ' style="' + st + '"' : '') + '>' + t + '</span>';
  }
  function paraClass(p) {
    var list = normList(p.list, 'none');
    return 'p l' + Math.max(0, Math.min(2, p.level | 0)) + ' ' + list +
      (paraText(p).replace(/\s+/g, '') ? '' : ' e');
  }
  function paraHtml(p, num) {
    var al = ALIGNS[p.align] ? ' style="text-align:' + p.align + '"' : '';
    var dn = (normList(p.list, 'none') === 'number' && num) ? ' data-n="' + escq(num) + '"' : '';
    var runs = (p.runs && p.runs.length) ? p.runs : [{ text: '' }];
    return '<div class="' + paraClass(p) + '"' + dn + al + '>' + runs.map(runHtml).join('') + '</div>';
  }
  function html(d, o) {
    o = o || {};
    d = cleanDoc(d, o);
    var paras = d.paragraphs;
    if (!o.show) paras = paras.filter(function (p) { return paraText(p).replace(/\s+/g, '') !== ''; });
    else {
      while (paras.length && paraText(paras[paras.length - 1]).replace(/\s+/g, '') === '' && paras.length > 1)
        paras = paras.slice(0, -1);
    }
    if (o.max) paras = paras.slice(0, o.max);
    var nums = numbers(paras);
    return paras.map(function (p, i) { return paraHtml(p, nums[i]); }).join('');
  }
  function inlineHtml(d, o) {
    o = Object.assign({}, o || {}, { single: true });
    d = cleanDoc(d, o);
    var p = d.paragraphs[0] || emptyPara('none');
    return (p.runs && p.runs.length ? p.runs : [{ text: '' }]).map(runHtml).join('');
  }

  /* ---------- selection + format (offsets are characters inside a paragraph) ---------- */
  function normSel(doc, sel) {
    var paras = cleanDoc(doc).paragraphs, last = paras.length - 1;
    function clip(pt) {
      pt = pt || { p: 0, off: 0 };
      var p = Math.max(0, Math.min(last, pt.p | 0));
      var n = paraText(paras[p]).length;
      return { p: p, off: Math.max(0, Math.min(n, pt.off | 0)) };
    }
    if (!sel || sel === 'all') return { a: { p: 0, off: 0 }, b: { p: last, off: paraText(paras[last]).length } };
    var a = clip(sel.a || sel.start), b = clip(sel.b || sel.end);
    if (a.p > b.p || (a.p === b.p && a.off > b.off)) { var t = a; a = b; b = t; }
    return { a: a, b: b };
  }
  function collapsed(sel) { return sel.a.p === sel.b.p && sel.a.off === sel.b.off; }
  function splitPara(p, off) {
    off = Math.max(0, Math.min(paraText(p).length, off | 0));
    var left = [], right = [], n = 0;
    (p.runs || []).forEach(function (r) {
      var t = r.text || '', a = n, b = n + t.length;
      if (b <= off) left.push(Object.assign({}, r));
      else if (a >= off) right.push(Object.assign({}, r));
      else {
        if (off > a) left.push(Object.assign({}, r, { text: t.slice(0, off - a) }));
        if (b > off) right.push(Object.assign({}, r, { text: t.slice(off - a) }));
      }
      n = b;
    });
    function wrap(runs) { return Object.assign({}, p, { runs: mergeRuns(runs.length ? runs : [{ text: '' }]) }); }
    return { left: wrap(left), right: wrap(right) };
  }
  function applyMarks(run, fmt) {
    var r = Object.assign({}, run);
    if (fmt.clear) { delete r.b; delete r.i; delete r.u; delete r.s; delete r.size; delete r.color; delete r.hl; return cleanRun(r); }
    ['b', 'i', 'u', 's'].forEach(function (k) {
      if (fmt[k] === 'toggle') r[k] = !r[k];
      else if (fmt[k] === true) r[k] = true;
      else if (fmt[k] === false) delete r[k];
    });
    if (fmt.size != null) { var sz = cleanSize(fmt.size); if (sz) r.size = sz; else delete r.size; }
    if (fmt.color != null) { var c = fmt.color === '' ? '' : cleanColor(fmt.color); if (c) r.color = c; else delete r.color; }
    if (fmt.hl != null) { var h = fmt.hl === '' ? '' : cleanColor(fmt.hl); if (h) r.hl = h; else delete r.hl; }
    return cleanRun(r);
  }
  function applyRun(doc, sel, fmt) {
    doc = cleanDoc(doc); sel = normSel(doc, sel); fmt = fmt || {};
    var paras = doc.paragraphs.slice();
    if (collapsed(sel)) return { paragraphs: paras };
    for (var i = sel.a.p; i <= sel.b.p; i++) {
      var p = paras[i], from = i === sel.a.p ? sel.a.off : 0, to = i === sel.b.p ? sel.b.off : paraText(p).length;
      if (from === to) continue;
      var L = splitPara(p, from), mid = splitPara(L.right, to - from);
      paras[i] = Object.assign({}, p, { runs: mergeRuns(L.left.runs.concat(mid.left.runs.map(function (r) { return applyMarks(r, fmt); }), mid.right.runs)) });
    }
    return { paragraphs: paras };
  }
  function marksAt(doc, sel) {
    doc = cleanDoc(doc); sel = normSel(doc, sel);
    var p = doc.paragraphs[sel.a.p], off = sel.a.off, n = 0, hit = p.runs[0] || { text: '' };
    if (collapsed(sel) && off > 0) {
      p.runs.forEach(function (r) { var b = n + r.text.length; if (off > n && off <= b) hit = r; n = b; });
    } else {
      var from = sel.a.off, to = sel.a.p === sel.b.p ? sel.b.off : paraText(p).length;
      p.runs.forEach(function (r) {
        var a = n, b = n + r.text.length; n = b;
        if (b > from && a < to) hit = r;
      });
    }
    return { b: !!hit.b, i: !!hit.i, u: !!hit.u, s: !!hit.s, size: hit.size || 0, color: hit.color || '', hl: hit.hl || '',
      align: p.align || '', list: normList(p.list, 'none'), level: p.level || 0 };
  }
  function applyPara(doc, sel, props) {
    doc = cleanDoc(doc); sel = normSel(doc, sel); props = props || {};
    var paras = doc.paragraphs.map(function (p, i) {
      if (i < sel.a.p || i > sel.b.p) return p;
      var q = Object.assign({}, p);
      if (props.align != null) q.align = ALIGNS[props.align] ? props.align : (props.align === '' ? '' : q.align);
      if (props.list != null) q.list = normList(props.list, q.list);
      if (props.level != null) q.level = Math.max(0, Math.min(2, props.level | 0));
      if (props.indent === 1) q.level = Math.min(2, (q.level || 0) + 1);
      if (props.indent === -1) q.level = Math.max(0, (q.level || 0) - 1);
      return q;
    });
    return { paragraphs: paras };
  }
  function nextSize(px, dir, def) {
    px = +px || 0;
    if (!px && def) px = +def || 0;
    if (dir > 0) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i] > px) return SIZES[i]; return SIZES[SIZES.length - 1]; }
    for (var j = SIZES.length - 1; j >= 0; j--) if (SIZES[j] < px) return SIZES[j];
    return SIZES[0];
  }

  function insertParas(doc, sel, add, o) {
    doc = cleanDoc(doc); sel = normSel(doc, sel); o = o || {};
    var paras = doc.paragraphs, start = paras[sel.a.p];
    var head = splitPara(start, sel.a.off).left;
    var tailSrc = paras[sel.b.p], tail = splitPara(tailSrc, sel.b.off).right;
    var mid = (add && add.paragraphs ? add.paragraphs : []).map(function (p, i) {
      var q = cleanPara(p, { list: p.list || start.list });
      if (i === 0 && !q.align) q.align = start.align;
      if (i === 0 && o.inheritFirst) { q.level = start.level; q.list = start.list; }
      return q;
    });
    if (!mid.length) mid = [emptyPara(start.list, start.align)];
    mid[0] = Object.assign({}, mid[0], { runs: mergeRuns(head.runs.concat(mid[0].runs)), level: mid[0].level, list: mid[0].list, align: mid[0].align || start.align });
    var last = mid[mid.length - 1];
    mid[mid.length - 1] = Object.assign({}, last, { runs: mergeRuns(last.runs.concat(tail.runs)) });
    var out = paras.slice(0, sel.a.p).concat(mid, paras.slice(sel.b.p + 1));
    if (out.length > MAX_PARAS) out = out.slice(0, MAX_PARAS);
    return { paragraphs: out };
  }
  function insertText(doc, sel, text, marks) {
    var p = { runs: [Object.assign({ text: String(text == null ? '' : text).replace(/\r/g, '').replace(/\n/g, ' ') }, marks || {})] };
    return insertParas(doc, sel, { paragraphs: [p] }, { inheritFirst: true });
  }
  function pastePlain(doc, sel, text, o) {
    o = o || {};
    text = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (o.single) return insertText(doc, sel, text.replace(/\n+/g, ' '));
    var start = cleanDoc(doc).paragraphs[normSel(doc, sel).a.p];
    return insertParas(doc, sel, fromPlain(text, { list: o.list || (start && start.list) || 'none' }), { inheritFirst: true });
  }

  /* ---------- HTML → model (strict allowlist, no DOM) ---------- */
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', apos: "'" };
  function decEnt(s) {
    return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, function (_, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1);
        if (n === 10 || n === 13) return ' ';
        if (n === 60 || n === 62) return ''; /* never let raw < > back in through a numeric entity in text we will re-escape */
        return (n && n < 0x110000) ? String.fromCharCode(n) : '';
      }
      return ENT[e.toLowerCase()] || '';
    });
  }
  function parseStyle(s, marks) {
    String(s || '').split(';').forEach(function (part) {
      var i = part.indexOf(':'); if (i < 0) return;
      var k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim();
      if (/[(){}]|url|expression|javascript|@/i.test(v) && k !== 'color' && k !== 'background-color' && k !== 'background' && !/^rgba?\(/i.test(v)) return;
      if (k === 'font-weight') { var n = +v; if (v === 'bold' || v === 'bolder' || n >= 600) marks.b = true; else if (v === 'normal' || n && n < 600) marks.b = false; }
      else if (k === 'font-style') { if (v === 'italic' || v === 'oblique') marks.i = true; else if (v === 'normal') marks.i = false; }
      else if (k === 'text-decoration' || k === 'text-decoration-line') {
        if (/\bunderline\b/.test(v)) marks.u = true;
        if (/\bline-through\b/.test(v)) marks.s = true;
        if (/\bnone\b/.test(v)) { marks.u = false; marks.s = false; }
      }
      else if (k === 'font-size') { var sz = cleanSize(v); if (sz) marks.size = sz; }
      else if (k === 'color') { var c = cleanColor(v); if (c) marks.color = c; }
      else if (k === 'background-color' || k === 'background') {
        if (v === 'transparent' || v === 'none') marks.hl = '';
        else { var h = cleanColor(v); if (h) marks.hl = h; }
      }
      else if (k === 'text-align' && ALIGNS[v]) marks._align = v;
    });
  }
  function parseAttrs(raw) {
    var o = { style: '', className: '', align: '' };
    String(raw || '').replace(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g, function (_, k, a, b, c) {
      k = k.toLowerCase(); var v = a != null ? a : (b != null ? b : (c != null ? c : ''));
      if (k === 'style') o.style = v;
      else if (k === 'class') o.className = v;
      else if (k === 'align' && ALIGNS[v.toLowerCase()]) o.align = v.toLowerCase();
    });
    return o;
  }
  function parseHtml(html, o) {
    o = o || {};
    html = String(html || '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    html = html.replace(/<(script|style|noscript|iframe|object|embed|svg|math|textarea|select)[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/<(script|style|img|video|audio|source|iframe|object|embed|svg|link|meta|input|hr)[^>]*\/?>/gi, '');
    var paras = [], runs = [], marks = { b: false, i: false, u: false, s: false, size: 0, color: '', hl: '' };
    var stack = [], align = '', list = normList(o.list, 'none'), level = 0, started = false;
    function curList() {
      for (var i = stack.length - 1; i >= 0; i--) { if (stack[i].list) return stack[i].list; }
      return normList(o.list, 'none');
    }
    function curLevel() {
      var lv = 0;
      stack.forEach(function (s) { if (s.tag === 'li' || s.tag === 'ul' || s.tag === 'ol') lv++; });
      return lv >= 3 ? 2 : (lv >= 2 ? 1 : (lv ? 0 : level));
    }
    function pushRun(text) {
      text = decEnt(text).replace(/\r/g, '').replace(/[\t\n]/g, ' ');
      if (!text) return;
      started = true;
      var r = { text: text };
      if (marks.b) r.b = true;
      if (marks.i) r.i = true;
      if (marks.u) r.u = true;
      if (marks.s) r.s = true;
      if (marks.size) r.size = marks.size;
      if (marks.color) r.color = marks.color;
      if (marks.hl) r.hl = marks.hl;
      runs.push(r);
    }
    function flush(force) {
      if (!started && !force && !runs.length) return;
      var p = cleanPara({ runs: runs, level: level, align: align, list: list });
      paras.push(p);
      runs = []; started = false;
    }
    var re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?>|[^<]+/g, m;
    while ((m = re.exec(html))) {
      if (m[1] == null) { pushRun(m[0]); continue; }
      var tag = m[1].toLowerCase(), close = m[0].charAt(1) === '/', raw = m[2] || '', self = /\/>$/.test(m[0]);
      if (tag === 'br') { flush(true); list = curList(); /* keep level */ continue; }
      if (close) {
        if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'tr' || tag === 'blockquote') {
          flush(true); list = curList() || normList(o.list, 'none'); level = 0; align = '';
        }
        for (var i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            var popped = stack.splice(i, 1)[0];
            marks = popped.marks;
            break;
          }
        }
        continue;
      }
      var attrs = parseAttrs(raw), next = Object.assign({}, marks);
      parseStyle(attrs.style, next);
      var cls = ' ' + attrs.className + ' ';
      if (/\bb\b/.test(cls) || tag === 'b' || tag === 'strong') next.b = true;
      if (/\bi\b/.test(cls) || tag === 'i' || tag === 'em') next.i = true;
      if (/\bu\b/.test(cls) || tag === 'u') next.u = true;
      if (/\bs\b/.test(cls) || tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
      if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'tr' || tag === 'blockquote') {
        flush(false);
        var isLi = tag === 'li';
        list = isLi ? curList() : (/\bbullets?\b/.test(cls) ? 'bullet' : /\bnumbers?\b/.test(cls) ? 'number' : /\bnone\b/.test(cls) ? 'none' : (normList(o.list, 'none')));
        level = /\bl2\b/.test(cls) ? 2 : /\bl1\b/.test(cls) ? 1 : (isLi ? curLevel() : 0);
        align = next._align || attrs.align || '';
        if (!isLi && !/\bl[012]\b/.test(cls)) level = 0;
      }
      if (tag === 'ul' || tag === 'ol') { flush(false); }
      if (!self && tag !== 'br') {
        var frame = { tag: tag, marks: Object.assign({}, marks), list: '' };
        if (tag === 'ul') frame.list = 'bullet';
        if (tag === 'ol') frame.list = 'number';
        stack.push(frame);
        marks = next;
        delete marks._align;
      }
    }
    flush(false);
    if (!paras.length) paras = [emptyPara(normList(o.list, 'none'))];
    if (o.single) return cleanDoc({ paragraphs: paras }, { single: true, max: o.max, list: 'none' });
    return cleanDoc({ paragraphs: paras }, { max: o.max, list: o.list });
  }

  /* ---------- file / storage coercion ---------- */
  function fileRuns(runs) {
    return mergeRuns(runs).map(function (r) {
      var o = { text: r.text };
      if (r.b) o.b = true; if (r.i) o.i = true; if (r.u) o.u = true; if (r.s) o.s = true;
      if (r.size) o.size = r.size; if (r.color) o.color = r.color; if (r.hl) o.hl = r.hl;
      return o;
    });
  }
  function fromFileTitle(x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) return cleanDoc(x, { max: 300, list: 'none', single: true });
    return fromPlain(x == null ? '' : String(x), { max: 300, list: 'none', single: true });
  }
  function fromFileBullets(arr, o) {
    o = o || {};
    var def = normList(o.list, 'bullet');
    if (!Array.isArray(arr)) {
      if (arr && typeof arr === 'object' && Array.isArray(arr.paragraphs)) return cleanDoc(arr, { max: o.max || 5000, list: def });
      if (typeof arr === 'string') return fromPlain(arr, { max: o.max || 5000, list: def });
      return cleanDoc({ paragraphs: [emptyPara(def)] }, { max: o.max || 5000, list: def });
    }
    var paras = arr.slice(0, MAX_PARAS).map(function (b) {
      if (typeof b === 'string') return cleanPara({ text: b.replace(/[\r\n\t]+/g, ' ').slice(0, 1000), level: 0, list: def });
      if (!b || typeof b !== 'object') return emptyPara(def);
      if (Array.isArray(b.runs) || b.list || b.align || b.paragraphs) {
        if (Array.isArray(b.paragraphs)) return cleanPara(b.paragraphs[0] || {}, { list: def });
        var p = cleanPara(b, { list: def });
        /* if runs and text both present and runs are empty, fall back to text */
        if (!paraText(p) && b.text) p = cleanPara({ text: String(b.text).replace(/[\r\n\t]+/g, ' ').slice(0, 1000), level: b.level, list: b.list || def, align: b.align });
        return p;
      }
      var t = String(b.text == null ? '' : b.text).replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
      var lv = +b.level >= 2 ? 2 : +b.level >= 1 ? 1 : 0;
      return cleanPara({ runs: [{ text: t }], level: lv, list: def, align: b.align });
    });
    return cleanDoc({ paragraphs: paras }, { max: o.max || 5000, list: def });
  }
  function toFileTitle(d) { return cleanDoc(d, { max: 300, list: 'none', single: true }); }
  function toFileBullets(d, o) {
    d = cleanDoc(d, { max: 5000, list: (o && o.list) || 'bullet' });
    var paras = d.paragraphs.slice();
    while (paras.length && !paraText(paras[paras.length - 1]) && paras.length > 1) paras.pop();
    return paras.map(function (p) {
      var o = { text: paraText(p), level: p.level || 0 };
      if ((p.runs || []).some(runStyled)) o.runs = fileRuns(p.runs);
      if (p.align) o.align = p.align;
      return o;
    });
  }
  function titleOut(d) {
    d = toFileTitle(d);
    var o = { text: plain(d, { single: true }) };
    var p = d.paragraphs[0];
    if ((p.runs || []).some(runStyled)) o.runs = fileRuns(p.runs);
    if (p.align) o.align = p.align;
    return o;
  }
  function num(x, lo, hi, d) { x = +x; return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 10) / 10)) : d; }
  function cleanBox(t) {
    t = t && typeof t === 'object' ? t : {};
    var defList = 'none';
    var doc;
    if (t.doc != null) doc = cleanDoc(t.doc, { max: 2000, list: defList });
    else if (Array.isArray(t.paragraphs)) doc = cleanDoc({ paragraphs: t.paragraphs }, { max: 2000, list: t.list || defList });
    else if (Array.isArray(t.lines)) {
      doc = cleanDoc({ paragraphs: t.lines.map(function (ln) {
        return { runs: ln.runs || [{ text: ln.text || '' }], level: ln.level, list: t.list || defList, align: ln.align || t.align };
      }) }, { max: 2000, list: t.list || defList });
    } else doc = fromPlain(t.text || t.body || '', { max: 2000, list: t.list || defList });
    if (t.list) doc = setList(doc, t.list);
    if (t.align) doc = setAlign(doc, t.align);
    var fill = cleanColor(t.fill || ''), border = cleanColor(t.border || '');
    var o = { id: str(t.id, 20), x: num(t.x, -4000, 4000, 80), y: num(t.y, -4000, 4000, 80),
      w: num(t.w, 40, 4000, 320), h: num(t.h, 32, 4000, 120), doc: doc, z: isFinite(+t.z) ? Math.round(+t.z) : 1 };
    if (fill) o.fill = fill;
    if (border) o.border = border;
    return o;
  }
  function cleanBoxes(arr) {
    return (Array.isArray(arr) ? arr : []).slice(0, MAX_BOX).map(cleanBox).filter(function (t) { return !!t; });
  }

  var API = {
    SIZES: SIZES, MAX_PARAS: MAX_PARAS, MAX_BOX: MAX_BOX,
    cleanColor: cleanColor, cleanSize: cleanSize, esc: esc, escq: escq, normList: normList, normAlign: normAlign,
    empty: function (list) { return { paragraphs: [emptyPara(list || 'none')] }; },
    emptyPara: emptyPara, cleanRun: cleanRun, cleanPara: cleanPara, clean: cleanDoc, clone: clone,
    fromPlain: fromPlain, plain: plain, has: has, equal: equal, concat: concat, charCount: charCount, isStyled: isStyled,
    paraText: paraText, numbers: numbers, letter: letter, roman: roman, marker: marker,
    html: html, inlineHtml: inlineHtml, paraHtml: paraHtml, runHtml: runHtml,
    setList: setList, setAlign: setAlign, boxList: boxList, boxAlign: boxAlign,
    normSel: normSel, applyRun: applyRun, applyPara: applyPara, marksAt: marksAt, nextSize: nextSize,
    insertParas: insertParas, insertText: insertText, pastePlain: pastePlain, parseHtml: parseHtml,
    fromFileTitle: fromFileTitle, fromFileBullets: fromFileBullets, toFileTitle: toFileTitle, toFileBullets: toFileBullets,
    titleOut: titleOut, cleanBox: cleanBox, cleanBoxes: cleanBoxes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLText = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
