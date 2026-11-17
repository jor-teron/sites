/* Hub Office Presentation PN1 — ODP import (SLOdp). No DOM, safe to load in Node.
   parse(files) → { deck, warnings } or { error, warnings }.
   Best-effort LibreOffice / OpenDocument presentation: draw:page → slide,
   text frames, pictures, simple rect / ellipse shapes, tables, notes,
   and a solid slide background. Positions are scaled from the .odp page
   size onto the 16:9 960×540 canvas. Zip packing is left to SLZip. */
(function (root) {
  'use strict';
  var W = 960, H = 540;
  var DEFAULT_PW = 28, DEFAULT_PH = 15.75; /* cm, typical 16:9 in LibreOffice */
  var SKIP_CLASS = { footer: 1, header: 1, 'date-time': 1, 'page-number': 1, handout: 1 };
  var RECT_TYPES = { rectangle: 1, rect: 1, square: 1, 'rounded-rectangle': 1, 'round-rectangle': 1, 'round-rect': 1, 'rectangle-bevel': 1 };
  var ELLIPSE_TYPES = { ellipse: 1, circle: 1, oval: 1, ring: 1 };

  function fileOf(files, path) {
    path = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (files[path]) return files[path];
    var low = path.toLowerCase(), k;
    for (k in files) {
      var n = k.replace(/^\/+/, '').replace(/\\/g, '/');
      if (n.toLowerCase() === low) return files[k];
    }
    return null;
  }
  function textOf(files, path) {
    var v = fileOf(files, path);
    return v == null ? '' : (root.SLZip ? SLZip.asText(v) : (typeof v === 'string' ? v : ''));
  }
  function b64encode(u) {
    u = u instanceof Uint8Array ? u : new Uint8Array(u || 0);
    if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
    var s = '', i;
    for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return (typeof btoa === 'function') ? btoa(s) : '';
  }
  function asBytes(v) {
    if (v instanceof Uint8Array) return v;
    if (root.SLZip) return SLZip.u8(v);
    if (typeof v === 'string') {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(v);
      var out = [], i, c;
      for (i = 0; i < v.length; i++) {
        c = v.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
        else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
      return new Uint8Array(out);
    }
    return new Uint8Array(v || 0);
  }
  function attr(tag, name) {
    var m = new RegExp('\\b' + name.replace(/:/g, '\\:') + '="([^"]*)"', 'i').exec(tag || '');
    return m ? m[1] : '';
  }
  function attrAny(tag, names) {
    var i, v;
    for (i = 0; i < names.length; i++) { v = attr(tag, names[i]); if (v) return v; }
    return '';
  }
  function decode(t) {
    return String(t || '').replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (_, e) {
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      var c = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(c) ? String.fromCharCode(c) : _;
    });
  }
  function hex(c) {
    c = String(c || '').trim();
    if (!c || c === 'transparent' || c === 'none') return '';
    var rgb = /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(c);
    if (rgb) {
      function to(n) { n = Math.max(0, Math.min(255, +n)); var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
      return '#' + to(rgb[1]) + to(rgb[2]) + to(rgb[3]);
    }
    c = c.replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(c)) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    if (/^[0-9a-f]{8}$/.test(c)) c = c.slice(0, 6);
    return /^[0-9a-f]{6}$/.test(c) ? '#' + c : '';
  }
  /* ODF lengths → centimetres (unitless is treated as cm). */
  function toCm(v) {
    v = String(v == null ? '' : v).trim();
    var m = /^(-?[\d.]+)\s*(cm|mm|in|inch|pt|pc|px|m)?$/i.exec(v);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return 0;
    var u = (m[2] || 'cm').toLowerCase();
    if (u === 'mm') return n / 10;
    if (u === 'in' || u === 'inch') return n * 2.54;
    if (u === 'pt') return n * 2.54 / 72;
    if (u === 'pc') return n * 2.54 / 6;
    if (u === 'px') return n * 2.54 / 96;
    if (u === 'm') return n * 100;
    return n;
  }
  function scale(v, pageCm, canvas) {
    var len = pageCm || 1;
    return Math.round(toCm(v) / len * canvas);
  }
  function boxOf(tag, page) {
    var x = attrAny(tag, ['svg:x', 'draw:x', 'x']);
    var y = attrAny(tag, ['svg:y', 'draw:y', 'y']);
    var w = attrAny(tag, ['svg:width', 'draw:width', 'width', 'fo:min-width']);
    var h = attrAny(tag, ['svg:height', 'draw:height', 'height', 'fo:min-height']);
    return {
      x: scale(x, page.w, W),
      y: scale(y, page.h, H),
      w: Math.max(8, scale(w, page.w, W) || 100),
      h: Math.max(8, scale(h, page.h, H) || 40)
    };
  }
  function fontPx(v) {
    if (v == null || v === '') return 0;
    var cm = toCm(v);
    /* fo:font-size is usually pt; 1 px ≈ 0.75 pt at 96 dpi (same as SLPptx). */
    var pt = cm * 72 / 2.54;
    var n = Math.round(pt / 0.75);
    return n > 0 ? n : 0;
  }

  /* Depth-aware tag finder. name is a local or prefixed name (e.g. draw:page). */
  function findTags(xml, name) {
    xml = xml || '';
    var out = [], i = 0, n = xml.length;
    var openRe = new RegExp('<' + name.replace(/:/g, '\\:') + '\\b([^>]*?)(\\/\\s*>|>)', 'g');
    var closeTok = '</' + name + '>';
    var openTok = '<' + name;
    while (i < n) {
      openRe.lastIndex = i;
      var m = openRe.exec(xml);
      if (!m) break;
      var attrs = m[1] || '';
      var start = m.index, after = m.index + m[0].length;
      if (m[2].indexOf('/') >= 0) {
        out.push({ attrs: attrs, inner: '', all: m[0], start: start, end: after });
        i = after;
        continue;
      }
      var depth = 1, j = after;
      while (j < n && depth > 0) {
        var nextOpen = xml.indexOf(openTok, j);
        var nextClose = xml.indexOf(closeTok, j);
        if (nextClose < 0) { j = n; break; }
        if (nextOpen >= 0 && nextOpen < nextClose) {
          var ch = xml.charAt(nextOpen + openTok.length);
          if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '>' || ch === '/') {
            var gt = xml.indexOf('>', nextOpen);
            if (gt < 0) { j = n; break; }
            var slice = xml.slice(nextOpen, gt + 1);
            if (!/\/\s*>$/.test(slice)) depth++;
            j = gt + 1;
            continue;
          }
          j = nextOpen + openTok.length;
          continue;
        }
        depth--;
        j = nextClose + closeTok.length;
      }
      out.push({ attrs: attrs, inner: xml.slice(after, j - closeTok.length), all: xml.slice(start, j), start: start, end: j });
      i = j;
    }
    return out;
  }
  function firstTag(xml, name) {
    var a = findTags(xml, name);
    return a.length ? a[0] : null;
  }
  function stripTags(xml, name) {
    var a = findTags(xml, name), i, out = xml || '', off = 0;
    /* findTags returns non-overlapping outer matches, so we can splice from the end. */
    for (i = a.length - 1; i >= 0; i--) {
      out = out.slice(0, a[i].start) + out.slice(a[i].end);
      off++;
    }
    return out;
  }

  function parseStyleProps(inner, into) {
    into = into || {};
    if (!inner) return into;
    var re = /<style:[a-z-]+-properties\b([^>]*?)(\/\s*>|>)/g, m;
    while ((m = re.exec(inner))) {
      var attrs = m[1] || '', pairs = /\b([a-zA-Z0-9:-]+)="([^"]*)"/g, p;
      while ((p = pairs.exec(attrs))) into[p[1]] = p[2];
    }
    return into;
  }
  function parseStyles(xml, bag) {
    bag = bag || { styles: {}, lists: {}, layouts: {}, masters: {} };
    findTags(xml, 'style:style').forEach(function (t) {
      var name = attr(t.attrs, 'style:name');
      if (!name) return;
      var st = { parent: attr(t.attrs, 'style:parent-style-name'), family: attr(t.attrs, 'style:family'), props: {} };
      var ls = attr(t.attrs, 'style:list-style-name');
      if (ls) st.list = ls;
      parseStyleProps(t.all, st.props);
      bag.styles[name] = st;
    });
    findTags(xml, 'text:list-style').forEach(function (t) {
      var name = attr(t.attrs, 'style:name');
      if (!name) return;
      var kind = /<text:list-level-style-number\b/.test(t.all) ? 'number' :
        (/<text:list-level-style-bullet\b/.test(t.all) ? 'bullet' : 'bullet');
      bag.lists[name] = kind;
    });
    findTags(xml, 'style:page-layout').forEach(function (t) {
      var name = attr(t.attrs, 'style:name');
      if (!name) return;
      var props = {};
      parseStyleProps(t.all, props);
      bag.layouts[name] = {
        w: toCm(props['fo:page-width']) || 0,
        h: toCm(props['fo:page-height']) || 0
      };
    });
    findTags(xml, 'style:master-page').forEach(function (t) {
      var name = attr(t.attrs, 'style:name');
      if (!name) return;
      bag.masters[name] = attr(t.attrs, 'style:page-layout-name');
    });
    return bag;
  }
  function resolveStyle(bag, name, seen) {
    if (!name || !bag.styles[name]) return {};
    seen = seen || {};
    if (seen[name]) return bag.styles[name].resolved || bag.styles[name].props || {};
    seen[name] = 1;
    var st = bag.styles[name];
    var out = {};
    var i, k, parent = st.parent ? resolveStyle(bag, st.parent, seen) : {};
    for (k in parent) out[k] = parent[k];
    for (k in st.props) out[k] = st.props[k];
    if (st.list && !out._list) out._list = st.list;
    st.resolved = out;
    return out;
  }
  function mergeProps(a, b) {
    var out = {}, k;
    a = a || {}; b = b || {};
    for (k in a) out[k] = a[k];
    for (k in b) out[k] = b[k];
    return out;
  }
  function applyRunStyle(run, props) {
    if (!props) return run;
    var w = String(props['fo:font-weight'] || '');
    if (w === 'bold' || w === 'bolder' || (+w >= 700)) run.b = true;
    var fs = String(props['fo:font-style'] || '');
    if (fs === 'italic' || fs === 'oblique') run.i = true;
    var u = String(props['style:text-underline-style'] || '');
    if (u && u !== 'none') run.u = true;
    var sk = String(props['style:text-line-through-style'] || props['style:text-line-through-type'] || '');
    if (sk && sk !== 'none') run.s = true;
    var sz = fontPx(props['fo:font-size']);
    if (sz) run.size = sz;
    var col = hex(props['fo:color']);
    if (col) run.color = col;
    return run;
  }
  function alignOf(props) {
    var a = String((props && (props['fo:text-align'] || props['style:text-align'])) || '').toLowerCase();
    if (a === 'center' || a === 'centre' || a === 'middle') return 'center';
    if (a === 'end' || a === 'right') return 'right';
    return '';
  }
  function fillOf(props) {
    if (!props) return '';
    var fill = String(props['draw:fill'] || '').toLowerCase();
    if (fill === 'none') return '';
    return hex(props['draw:fill-color'] || props['fo:background-color'] || props['draw:background-color']);
  }
  function strokeOf(props) {
    if (!props) return '';
    var st = String(props['draw:stroke'] || '').toLowerCase();
    if (st === 'none') return '';
    return hex(props['svg:stroke-color'] || props['draw:stroke-color']);
  }
  function pageBg(props) {
    if (!props) return '';
    var vis = String(props['presentation:background-visible'] || 'true').toLowerCase();
    if (vis === 'false') return '';
    var fill = String(props['draw:fill'] || '').toLowerCase();
    if (fill === 'none') return '';
    return hex(props['draw:fill-color'] || props['fo:background-color'] || props['draw:background-color']);
  }

  function collectRuns(xml, base, bag) {
    var runs = [], i = 0, s = xml || '', n = s.length;
    function push(text, props) {
      if (text == null || text === '') return;
      var run = { text: text };
      applyRunStyle(run, props);
      var last = runs[runs.length - 1];
      if (last && last.b === run.b && last.i === run.i && last.u === run.u && last.s === run.s && last.size === run.size && last.color === run.color) {
        last.text += text;
        return;
      }
      runs.push(run);
    }
    while (i < n) {
      if (s.charAt(i) !== '<') {
        var j = s.indexOf('<', i);
        if (j < 0) j = n;
        push(decode(s.slice(i, j)), base);
        i = j;
        continue;
      }
      if (s.substr(i, 4) === '<!--') { var c = s.indexOf('-->', i + 4); i = c < 0 ? n : c + 3; continue; }
      if (s.substr(i, 2) === '<?') { var q = s.indexOf('?>', i + 2); i = q < 0 ? n : q + 2; continue; }
      var rest = s.slice(i);
      var sm = /^<text:s\b([^>]*)\/\s*>/.exec(rest) || /^<text:s\b([^>]*)>/.exec(rest);
      if (sm) {
        var cnt = +(attrAny(sm[1], ['text:c', 'c']) || 1);
        if (!isFinite(cnt) || cnt < 1) cnt = 1;
        var sp = '';
        while (sp.length < cnt) sp += ' ';
        push(sp, base);
        if (/\/\s*>$/.test(sm[0])) i += sm[0].length;
        else {
          var sc = s.indexOf('</text:s>', i);
          i = sc < 0 ? n : sc + 9;
        }
        continue;
      }
      if (/^<text:tab\b/.test(rest)) { push('\t', base); i += (s.indexOf('>', i) + 1) || n; if (rest.indexOf('/>') < 0 && rest.indexOf('>') < rest.indexOf('/>')) { var tc = s.indexOf('</text:tab>', i); if (tc >= 0) i = tc + 11; } continue; }
      if (/^<text:line-break\b/.test(rest)) { push('\n', base); i += (s.indexOf('>', i) + 1) || n; continue; }
      var span = null;
      if (/^<text:span\b/.test(rest)) span = findTags(s.slice(i), 'text:span')[0];
      if (span && span.start === 0) {
        var stName = attr(span.attrs, 'text:style-name');
        var st = mergeProps(base, resolveStyle(bag, stName));
        var innerRuns = collectRuns(span.inner, st, bag), r;
        for (r = 0; r < innerRuns.length; r++) {
          var ir = innerRuns[r], last2 = runs[runs.length - 1];
          if (last2 && last2.b === ir.b && last2.i === ir.i && last2.u === ir.u && last2.s === ir.s && last2.size === ir.size && last2.color === ir.color) last2.text += ir.text;
          else runs.push(ir);
        }
        i += span.end;
        continue;
      }
      var skip = /^<\/?[a-zA-Z0-9:_-]+[^>]*>/.exec(rest);
      if (skip) {
        var tag = skip[0];
        if (/^<\//.test(tag) || /\/\s*>$/.test(tag)) { i += tag.length; continue; }
        var ln = /^<\/?([a-zA-Z0-9:_-]+)/.exec(tag);
        var kids = findTags(s.slice(i), ln[1]);
        if (kids[0] && kids[0].start === 0) {
          var more = collectRuns(kids[0].inner, base, bag), k;
          for (k = 0; k < more.length; k++) {
            var mr = more[k], last3 = runs[runs.length - 1];
            if (last3 && last3.b === mr.b && last3.i === mr.i && last3.u === mr.u && last3.s === mr.s && last3.size === mr.size && last3.color === mr.color) last3.text += mr.text;
            else runs.push(mr);
          }
          i += kids[0].end;
          continue;
        }
        i += tag.length;
        continue;
      }
      i++;
    }
    return runs;
  }

  function listKind(bag, name) {
    if (name && bag.lists[name]) return bag.lists[name];
    return 'bullet';
  }

  function parasFrom(xml, bag, ctx) {
    ctx = ctx || { level: 0, list: 'none' };
    var paras = [], s = xml || '';
    /* Walk top-level text:list / text:p / text:h in document order. */
    var hits = [];
    function collect(name) {
      findTags(s, name).forEach(function (t) { hits.push({ name: name, t: t }); });
    }
    collect('text:list'); collect('text:p'); collect('text:h');
    hits.sort(function (a, b) { return a.t.start - b.t.start; });
    var used = [];
    function covered(t) {
      var i;
      for (i = 0; i < used.length; i++) if (t.start >= used[i].start && t.end <= used[i].end) return true;
      return false;
    }
    hits.forEach(function (h) {
      if (covered(h.t)) return;
      used.push(h.t);
      if (h.name === 'text:list') {
        var lk = listKind(bag, attr(h.t.attrs, 'text:style-name') || ctx.style);
        findTags(h.t.inner, 'text:list-item').forEach(function (item) {
          var childList = firstTag(item.inner, 'text:list');
          var body = childList ? item.inner.slice(0, childList.start) : item.inner;
          var innerCtx = { level: ctx.level, list: lk, style: attr(h.t.attrs, 'text:style-name') || ctx.style };
          var got = parasFrom(body, bag, innerCtx);
          if (!got.length) paras.push({ runs: [{ text: '' }], level: ctx.level, list: lk });
          else {
            got.forEach(function (p) { p.level = ctx.level; p.list = lk; paras.push(p); });
          }
          if (childList) {
            parasFrom(childList.all, bag, { level: ctx.level + 1, list: lk, style: attr(childList.attrs, 'text:style-name') || innerCtx.style })
              .forEach(function (p) { paras.push(p); });
          }
        });
        return;
      }
      var pStyle = attr(h.t.attrs, 'text:style-name');
      var props = mergeProps({}, resolveStyle(bag, pStyle));
      var runs = collectRuns(h.t.inner, props, bag);
      var para = { runs: runs.length ? runs : [{ text: '' }], level: ctx.level, list: ctx.list || 'none' };
      var al = alignOf(props);
      if (al) para.align = al;
      paras.push(para);
    });
    return paras;
  }
  function docFrom(xml, bag) {
    var T = root.SLText;
    var paras = parasFrom(xml, bag, { level: 0, list: 'none' });
    if (!paras.length) paras = [{ runs: [{ text: '' }], list: 'none', level: 0 }];
    var doc = { paragraphs: paras };
    return T && T.clean ? T.clean(doc, { list: paras[0].list || 'none' }) : doc;
  }
  function plainFrom(xml, bag) {
    var T = root.SLText, doc = docFrom(xml, bag);
    if (T && T.plain) return T.plain(doc);
    var parts = [], i, j, p;
    for (i = 0; i < (doc.paragraphs || []).length; i++) {
      p = doc.paragraphs[i];
      var line = '';
      for (j = 0; j < (p.runs || []).length; j++) line += p.runs[j].text || '';
      parts.push(line);
    }
    return parts.join('\n').replace(/^\s+|\s+$/g, '');
  }
  function hasText(doc) {
    var T = root.SLText;
    if (T && T.has) return T.has(doc);
    var i, j, p;
    for (i = 0; i < ((doc && doc.paragraphs) || []).length; i++) {
      p = doc.paragraphs[i];
      for (j = 0; j < (p.runs || []).length; j++) if (String(p.runs[j].text || '').replace(/\s+/g, '')) return true;
    }
    return false;
  }

  function mimeOf(path) {
    var ext = (String(path || '').split('.').pop() || 'png').toLowerCase();
    if (ext === 'jpg') ext = 'jpeg';
    if (ext !== 'png' && ext !== 'jpeg' && ext !== 'gif' && ext !== 'webp') ext = 'png';
    return ext;
  }
  function picSrc(files, href) {
    if (!href) return '';
    href = String(href).replace(/^\.\//, '').replace(/^\/+/, '').split('?')[0];
    if (/^https?:/i.test(href)) return '';
    var bytes = fileOf(files, href);
    if (!bytes) return '';
    var ext = mimeOf(href);
    return 'data:image/' + ext + ';base64,' + b64encode(asBytes(bytes));
  }

  function parseTable(xml, bag, box) {
    var rows = [];
    findTags(xml, 'table:table-row').forEach(function (tr) {
      var row = [];
      findTags(tr.inner, 'table:table-cell').forEach(function (tc) {
        var span = +(attr(tc.attrs, 'table:number-columns-repeated') || 1);
        if (!isFinite(span) || span < 1) span = 1;
        if (span > 12) span = 12;
        var cell = { doc: docFrom(tc.inner, bag) };
        var i;
        for (i = 0; i < span; i++) row.push(cell);
      });
      if (row.length) rows.push(row);
    });
    if (!rows.length) return null;
    var cols = 0, r;
    for (r = 0; r < rows.length; r++) if (rows[r].length > cols) cols = rows[r].length;
    return { x: box.x, y: box.y, w: box.w || 480, h: box.h || 200, cells: rows, rows: rows.length, cols: cols, header: false, z: 3 };
  }

  function shapeKind(el, all) {
    if (el === 'draw:rect' || el === 'draw:square') return 'rect';
    if (el === 'draw:ellipse' || el === 'draw:circle') return 'ellipse';
    if (el === 'draw:custom-shape' || el === 'draw:regular-polygon') {
      var typ = (attr((firstTag(all, 'draw:enhanced-geometry') || { attrs: '' }).attrs, 'draw:type') || '').toLowerCase();
      if (!typ) typ = (attr((firstTag(all, 'draw:enhanced-geometry') || { attrs: all }).all, 'draw:type') || '').toLowerCase();
      if (RECT_TYPES[typ]) return typ.indexOf('round') >= 0 ? 'round' : 'rect';
      if (ELLIPSE_TYPES[typ]) return 'ellipse';
      return '';
    }
    return '';
  }

  function parseSlide(openAttrs, inner, bag, files, page, warnings, n) {
    var s = { layout: 'blank', pics: [], texts: [], shapes: [], tables: [], hide: false };
    var notesXml = '';
    var notes = firstTag(inner, 'presentation:notes');
    if (notes) {
      notesXml = notes.all;
      inner = inner.slice(0, notes.start) + inner.slice(notes.end);
    }
    var styleName = attr(openAttrs, 'draw:style-name');
    var bg = pageBg(resolveStyle(bag, styleName));
    if (bg) s.bg = bg;
    if (/<draw:object\b|<draw:object-ole\b|<draw:plugin\b|<draw:chart\b|presentation:class="chart"|<anim:|<presentation:animation/i.test(inner)) {
      warnings.push('Slide ' + n + ': a chart, object, animation or similar part was skipped.');
    }

    function frameClass(a) { return (attr(a, 'presentation:class') || '').toLowerCase(); }

    findTags(inner, 'draw:frame').forEach(function (fr) {
      var cls = frameClass(fr.attrs);
      if (SKIP_CLASS[cls]) return;
      var box = boxOf(fr.attrs, page);
      var gprops = resolveStyle(bag, attr(fr.attrs, 'draw:style-name'));
      var img = firstTag(fr.inner, 'draw:image');
      if (img) {
        var href = attrAny(img.attrs, ['xlink:href', 'href']);
        var src = picSrc(files, href);
        if (!src) { warnings.push('Slide ' + n + ': a picture file was missing from the package.'); return; }
        s.pics.push({ x: box.x, y: box.y, w: box.w, h: box.h, src: src, fit: 'contain', z: 0 });
        return;
      }
      var tbl = firstTag(fr.inner, 'table:table');
      if (tbl) {
        var tb = parseTable(tbl.all, bag, box);
        if (tb) s.tables.push(tb);
        return;
      }
      if (/<draw:object\b|<draw:object-ole\b|<draw:plugin\b|<draw:chart\b/.test(fr.inner)) return;
      var doc = docFrom(fr.inner, bag);
      var fill = fillOf(gprops);
      if (cls === 'title' || cls === 'subtitle') {
        if (!s.title && hasText(doc)) { s.title = doc; s.layout = s.layout === 'blank' ? (cls === 'title' ? 'to' : 'tc') : s.layout; return; }
      }
      if (cls === 'outline' || cls === 'subtitle' || cls === 'object') {
        if (!s.body && hasText(doc) && cls !== 'subtitle') { s.body = doc; s.layout = 'tc'; return; }
      }
      if (!s.title && hasText(doc) && box.y < 160 && box.h <= 160) {
        s.title = doc; s.layout = s.layout === 'blank' ? 'tc' : s.layout; return;
      }
      if (!s.body && hasText(doc) && box.w > 300 && box.y >= 120) {
        s.body = doc; s.layout = s.layout === 'blank' ? 'tc' : s.layout; return;
      }
      s.texts.push({ x: box.x, y: box.y, w: box.w, h: box.h, doc: doc, fill: fill || '', z: 1 });
    });

    function addShape(elName) {
      findTags(inner, elName).forEach(function (sh) {
        var kind = shapeKind(elName, sh.all);
        if (!kind) return;
        var box = boxOf(sh.attrs, page);
        var props = resolveStyle(bag, attr(sh.attrs, 'draw:style-name'));
        var fill = fillOf(props) || hex(attrAny(sh.attrs, ['draw:fill-color', 'fo:background-color']));
        var stroke = strokeOf(props) || hex(attrAny(sh.attrs, ['svg:stroke-color', 'draw:stroke-color']));
        var doc = docFrom(sh.inner, bag);
        var rec = { kind: kind, x: box.x, y: box.y, w: box.w, h: box.h, fill: fill || '', stroke: stroke || '', sw: 1, z: 2 };
        if (hasText(doc)) rec.doc = doc;
        s.shapes.push(rec);
      });
    }
    addShape('draw:rect');
    addShape('draw:square');
    addShape('draw:ellipse');
    addShape('draw:circle');
    addShape('draw:custom-shape');

    if (notesXml) {
      var nf = null;
      findTags(notesXml, 'draw:frame').forEach(function (fr) {
        if (frameClass(fr.attrs) === 'notes') nf = fr;
      });
      var nt = plainFrom(nf ? nf.inner : notesXml, bag);
      if (nt) s.notes = nt;
    }
    if (s.title && s.body) s.layout = 'tc';
    else if (s.title && !s.body) s.layout = 'to';
    else if (!s.title && s.body) {
      s.title = root.SLText && root.SLText.empty ? root.SLText.empty('none') : { paragraphs: [{ runs: [{ text: '' }], list: 'none' }] };
      s.layout = 'tc';
    }
    return s;
  }

  function pageSize(bag, firstAttrs) {
    var master = attr(firstAttrs || '', 'draw:master-page-name');
    var layoutName = master && bag.masters[master];
    var lay = (layoutName && bag.layouts[layoutName]) || null;
    if (!lay || !(lay.w && lay.h)) {
      var k;
      for (k in bag.layouts) { if (bag.layouts[k].w && bag.layouts[k].h) { lay = bag.layouts[k]; break; } }
    }
    return { w: (lay && lay.w) || DEFAULT_PW, h: (lay && lay.h) || DEFAULT_PH };
  }

  function parse(files) {
    files = files || {};
    var warnings = [];
    var manifest = textOf(files, 'META-INF/manifest.xml');
    if (/<manifest:encryption-data\b/.test(manifest)) {
      return { error: 'This presentation is password protected.', warnings: warnings };
    }
    var mime = String(textOf(files, 'mimetype') || '').replace(/\s+/g, '');
    if (mime && mime !== 'application/vnd.oasis.opendocument.presentation' && /opendocument/.test(mime) && !/presentation/.test(mime)) {
      return { error: 'This is not a LibreOffice presentation (.odp).', warnings: warnings };
    }
    var content = textOf(files, 'content.xml');
    if (!content) return { error: 'This is not a valid LibreOffice presentation (content.xml is missing).', warnings: warnings };
    var stylesXml = textOf(files, 'styles.xml');
    var bag = parseStyles(stylesXml || '');
    parseStyles(content, bag);
    var body = (firstTag(content, 'office:presentation') || firstTag(content, 'office:body') || { inner: content }).inner;
    /* Top-level draw:page only: notes contain a nested draw:page, consumed with the outer page. */
    var pages = findTags(body, 'draw:page');
    if (!pages.length) return { error: 'This presentation has no slides I could read.', warnings: warnings };
    var page = pageSize(bag, pages[0].attrs);
    var slides = [], i;
    for (i = 0; i < pages.length; i++) {
      slides.push(parseSlide(pages[i].attrs, pages[i].inner, bag, files, page, warnings, i + 1));
    }
    if (!slides.length) return { error: 'This presentation has no slides I could read.', warnings: warnings };
    if (slides.length > 500) { slides = slides.slice(0, 500); warnings.push('Only the first 500 slides were imported.'); }
    var name = 'Imported deck';
    var meta = textOf(files, 'meta.xml');
    var tm = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(meta);
    if (tm) name = decode(tm[1]).replace(/\s+/g, ' ').trim().slice(0, 80) || name;
    return { deck: { name: name, theme: 'light', slides: slides }, warnings: warnings, page: page };
  }

  var API = {
    W: W, H: H, parse: parse, toCm: toCm, scale: scale, hex: hex, fontPx: fontPx,
    findTags: findTags, fileOf: fileOf, DEFAULT_PW: DEFAULT_PW, DEFAULT_PH: DEFAULT_PH
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLOdp = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
