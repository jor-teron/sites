/* ============================================================
   FILE: modules/writer-odtread.js
   PROJECT: Writer
   ROLE: DW7 .odt reader. Own small unzip (DecompressionStream
         'deflate-raw'; zlib in Node; JSZip from shared/vendor
         when missing), then content.xml + styles.xml + Pictures
         -> Writer editor HTML. DOM-free XML walk (no DOMParser),
         so node --test can run it.
   MAPS: headings (text:h / Heading N / Title), paragraphs,
         bold, italic, underline, strike, bullet / numbered lists,
         tables (column / row span), images as data URLs.
         Anything Writer cannot show is dropped quietly.
   API:  Writer.odtread.read(arrayBuffer) -> Promise<{
           html, page: null, hf: { head:[3], foot:[3] }, notes: [text] }>
   ============================================================ */
(function (root) {
  'use strict';

  var R = { jszipUrl: '../../../shared/vendor/jszip.min.js', maxPart: 150 * 1024 * 1024 };
  var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
  var TBL = 'border-collapse:collapse;width:100%;table-layout:fixed;';
  var TD = 'border:1px solid #000;padding:4px 6px;vertical-align:top;';
  var SKIP_BLOCK = {
    'sequence-decls': 1, 'variable-decls': 1, 'user-field-decls': 1,
    'tracked-changes': 1, 'dde-connection-decls': 1, 'alphabetical-index-auto-mark-file': 1,
    'forms': 1, 'scripts': 1, 'font-face-decls': 1, 'automatic-styles': 1, 'master-styles': 1,
    'settings': 1, 'meta': 1, 'scripts': 1, 'presentation': 1
  };
  var SKIP_INLINE = {
    'bookmark': 1, 'bookmark-start': 1, 'bookmark-end': 1, 'reference-mark': 1,
    'reference-mark-start': 1, 'reference-mark-end': 1, 'toc-mark': 1, 'toc-mark-start': 1,
    'toc-mark-end': 1, 'note': 1, 'note-ref': 1, 'note-citation': 1, 'annotation': 1,
    'annotation-end': 1, 'change': 1, 'change-start': 1, 'change-end': 1,
    'soft-page-break': 1, 'hidden-text': 1, 'hidden-paragraph': 1
  };

  function fail(m) { var e = new Error(m); e.userMessage = m; return e; }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function utf8(x) { return new TextDecoder('utf-8').decode(x).replace(/^\uFEFF/, ''); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function localOf(name) {
    var i = String(name || '').indexOf(':');
    return i >= 0 ? name.slice(i + 1) : name;
  }
  function tblStyle() { return (root && root.Writer && root.Writer.table && root.Writer.table.TBL) || TBL; }
  function tdStyle() { return (root && root.Writer && root.Writer.table && root.Writer.table.TD) || TD; }
  function contentCm() {
    var cfg = (root && root.Writer && root.Writer.config) || {};
    return (cfg.paperWidthCm || 21) - (cfg.marginLeftCm || 2) - (cfg.marginRightCm || 2);
  }

  /* ------------------------------------------------ unzip */
  function nativeOk() { try { new DecompressionStream('deflate-raw'); return true; } catch (e) { return false; } }
  function inflateRaw(data) {
    if (nativeOk()) {
      var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
      w.write(data).catch(function () {}); w.close().catch(function () {});
      return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    try {
      var zlib = require('zlib');
      if (zlib && zlib.inflateRawSync) return Promise.resolve(new Uint8Array(zlib.inflateRawSync(data)));
    } catch (e) { /* no zlib */ }
    return Promise.reject(fail('Unsupported zip compression'));
  }
  function zipNative(buf) {
    var b = new Uint8Array(buf), i = b.length - 22, min = Math.max(0, i - 65535), dir = {};
    for (; i >= min; i--) if (u32(b, i) === 0x06054b50) break;
    if (i < min) throw fail('This is not a valid .odt file');
    var n = u16(b, i + 10), p = u32(b, i + 16), k;
    for (k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) throw fail('This .odt file is damaged');
      var nl = u16(b, p + 28);
      dir[utf8(b.subarray(p + 46, p + 46 + nl))] = { flags: u16(b, p + 8), method: u16(b, p + 10), csize: u32(b, p + 20), usize: u32(b, p + 24), off: u32(b, p + 42) };
      p += 46 + nl + u16(b, p + 30) + u16(b, p + 32);
    }
    function find(name) {
      name = String(name || '').replace(/^\.\//, '').replace(/^\/+/, '');
      if (dir[name]) return name;
      var lower = name.toLowerCase(), key;
      for (key in dir) if (key.toLowerCase() === lower) return key;
      var base = name.split('/').pop().toLowerCase();
      for (key in dir) if (key.split('/').pop().toLowerCase() === base) return key;
      return null;
    }
    function bytes(name) {
      var key = find(name), e = key && dir[key];
      if (!e) return Promise.resolve(null);
      if (e.flags & 1) return Promise.reject(fail('This .odt is password protected'));
      if (e.usize > R.maxPart) return Promise.reject(fail('Part too large: ' + name));
      var s = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28), d = b.subarray(s, s + e.csize);
      if (e.method === 0) return Promise.resolve(d);
      if (e.method !== 8) return Promise.reject(fail('Unsupported zip compression'));
      return inflateRaw(d);
    }
    return { bytes: bytes, text: function (nm) { return bytes(nm).then(function (x) { return x ? utf8(x) : null; }); }, dir: dir, find: find };
  }
  function zipJs(buf) {
    var load = (root && root.JSZip) ? Promise.resolve(root.JSZip) : new Promise(function (res, rej) {
      if (!root || !root.document) return rej(fail('Could not load the zip library'));
      var s = root.document.createElement('script'); s.src = R.jszipUrl;
      s.onload = function () { root.JSZip ? res(root.JSZip) : rej(fail('Could not load the zip library')); };
      s.onerror = function () { rej(fail('Could not load the zip library')); };
      root.document.head.appendChild(s);
    });
    return load.then(function (J) { return J.loadAsync(buf); }).then(function (z) {
      function find(name) {
        name = String(name || '').replace(/^\.\//, '').replace(/^\/+/, '');
        if (z.file(name)) return name;
        var names = Object.keys(z.files || {}), lower = name.toLowerCase(), i;
        for (i = 0; i < names.length; i++) if (names[i].toLowerCase() === lower) return names[i];
        var base = name.split('/').pop().toLowerCase();
        for (i = 0; i < names.length; i++) if (names[i].split('/').pop().toLowerCase() === base) return names[i];
        return null;
      }
      function f(n, t) {
        var key = find(n), x = key && z.file(key);
        return x ? x.async(t) : Promise.resolve(null);
      }
      return { bytes: function (n) { return f(n, 'uint8array'); }, text: function (n) { return f(n, 'string'); }, find: find };
    });
  }
  function openZip(buf) {
    if (nativeOk() || (function () { try { return !!require('zlib'); } catch (e) { return false; } })()) {
      return Promise.resolve().then(function () { return zipNative(buf); });
    }
    return zipJs(buf);
  }

  /* ------------------------------------------------ xml walk (DOM-free) */
  function decodeEntities(t) {
    return String(t).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (_, e) {
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      var c = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(c) ? String.fromCharCode(c) : _;
    });
  }
  function parseXml(src) {
    if (!src) return null;
    var s = String(src).replace(/^\uFEFF/, ''), i = 0, n = s.length;
    function peek() { return s.charAt(i); }
    function starts(t) { return s.substr(i, t.length) === t; }
    function skipWs() { while (i < n && (s.charCodeAt(i) <= 32)) i++; }
    function skipUntil(t) { var j = s.indexOf(t, i); i = j < 0 ? n : j + t.length; }
    function parseName() {
      var j = i;
      if (j >= n || !/[A-Za-z:_]/.test(s.charAt(j))) return '';
      j++;
      while (j < n && /[A-Za-z0-9:._-]/.test(s.charAt(j))) j++;
      var name = s.slice(i, j); i = j; return name;
    }
    function parseAttrs() {
      var attrs = {};
      while (i < n) {
        skipWs();
        if (peek() === '/' || peek() === '>' || peek() === '?') break;
        var name = parseName();
        if (!name) break;
        skipWs();
        var val = '';
        if (peek() === '=') {
          i++; skipWs();
          var q = peek();
          if (q === '"' || q === "'") {
            i++;
            var end = s.indexOf(q, i);
            if (end < 0) end = n;
            val = decodeEntities(s.slice(i, end));
            i = end + 1;
          }
        }
        attrs[name] = val;
        var loc = localOf(name);
        if (!Object.prototype.hasOwnProperty.call(attrs, loc)) attrs[loc] = val;
      }
      return attrs;
    }
    function parseNode() {
      if (starts('<?')) { skipUntil('?>'); return null; }
      if (starts('<!--')) { skipUntil('-->'); return null; }
      if (starts('<![CDATA[')) {
        i += 9;
        var ce = s.indexOf(']]>', i);
        if (ce < 0) ce = n;
        var ct = s.slice(i, ce);
        i = ce < n ? ce + 3 : n;
        return ct ? { type: 'text', text: ct } : null;
      }
      if (starts('<!')) { skipUntil('>'); return null; }
      if (peek() !== '<') {
        var j = s.indexOf('<', i);
        if (j < 0) j = n;
        var t = decodeEntities(s.slice(i, j));
        i = j;
        return t ? { type: 'text', text: t } : null;
      }
      if (starts('</')) return null;
      i++;
      var name = parseName();
      if (!name) return null;
      var attrs = parseAttrs();
      skipWs();
      var self = false;
      if (peek() === '/') { self = true; i++; }
      if (peek() === '>') i++;
      var node = { type: 'el', name: name, local: localOf(name), attrs: attrs, children: [] };
      if (self) return node;
      while (i < n) {
        if (starts('</')) {
          var gt = s.indexOf('>', i);
          i = gt < 0 ? n : gt + 1;
          break;
        }
        var child = parseNode();
        if (child) node.children.push(child);
        else if (starts('</')) continue;
        else if (i < n && peek() === '<') {
          /* malformed leftover: skip one char so we cannot spin */
          if (!starts('</')) i++;
        } else break;
      }
      return node;
    }
    skipWs();
    while (starts('<?') || starts('<!--') || starts('<!')) { parseNode(); skipWs(); }
    var rootEl = parseNode();
    return rootEl && rootEl.type === 'el' ? rootEl : null;
  }
  function kids(el, nm) {
    var o = [], c = el && el.children, i;
    if (!c) return o;
    for (i = 0; i < c.length; i++) if (c[i].type === 'el' && (!nm || c[i].local === nm)) o.push(c[i]);
    return o;
  }
  function first(el, nm) {
    var c = el && el.children, i;
    if (!c) return null;
    for (i = 0; i < c.length; i++) if (c[i].type === 'el' && c[i].local === nm) return c[i];
    return null;
  }
  function deep(el, nm) {
    if (!el) return null;
    if (el.type === 'el' && el.local === nm) return el;
    var c = el.children || [], i, hit;
    for (i = 0; i < c.length; i++) {
      if (c[i].type !== 'el') continue;
      hit = deep(c[i], nm);
      if (hit) return hit;
    }
    return null;
  }
  function att(el, nm) {
    if (!el || !el.attrs) return null;
    if (el.attrs[nm] != null) return el.attrs[nm];
    return null;
  }
  function textOf(el) {
    if (!el) return '';
    if (el.type === 'text') return el.text || '';
    var c = el.children || [], s = '', i;
    for (i = 0; i < c.length; i++) s += textOf(c[i]);
    return s;
  }

  /* ------------------------------------------------ styles */
  function decodeStyleName(n) {
    return String(n || '').replace(/_([0-9a-fA-F]{2})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    });
  }
  function parseLenPt(v) {
    if (v == null || v === '') return null;
    var m = String(v).trim().match(/^(-?[\d.]+)\s*(pt|px|cm|mm|in|pc)?$/i);
    if (!m) return null;
    var n = parseFloat(m[1]), u = (m[2] || 'pt').toLowerCase();
    if (u === 'pt') return n;
    if (u === 'px') return n * 72 / 96;
    if (u === 'cm') return n * 72 / 2.54;
    if (u === 'mm') return n * 72 / 25.4;
    if (u === 'in') return n * 72;
    if (u === 'pc') return n * 12;
    return n;
  }
  function parseLenCm(v) {
    var pt = parseLenPt(v);
    return pt == null ? null : Math.round(pt / 72 * 2.54 * 100) / 100;
  }
  function readTextProps(el, o) {
    if (!el) return o;
    var w = att(el, 'font-weight'), fs = att(el, 'font-style');
    if (w != null) o.b = w === 'bold' || parseInt(w, 10) >= 700;
    if (fs != null) o.i = fs === 'italic' || fs === 'oblique';
    var u = att(el, 'text-underline-style');
    if (u != null) o.u = u !== 'none';
    var s = att(el, 'text-line-through-style') || att(el, 'text-line-through-type');
    if (s != null) o.s = s !== 'none';
    var sz = att(el, 'font-size');
    if (sz) { var pt = parseLenPt(sz); if (pt) o.sz = pt; }
    var col = att(el, 'color');
    if (col && col !== 'transparent') o.color = col;
    var bg = att(el, 'background-color');
    if (bg && bg !== 'transparent') o.bg = bg;
    var pos = att(el, 'text-position');
    if (pos) {
      var pl = pos.toLowerCase();
      if (pl.indexOf('super') === 0 || pl.indexOf('sup') === 0) o.va = 'superscript';
      else if (pl.indexOf('sub') === 0) o.va = 'subscript';
    }
    var font = att(el, 'font-name') || att(el, 'font-family');
    if (font) o.font = font.replace(/["']/g, '').split(',')[0].trim();
    return o;
  }
  function readParaProps(el, o) {
    if (!el) return o;
    var al = att(el, 'text-align');
    if (al === 'center') o.align = 'center';
    else if (al === 'right' || al === 'end') o.align = 'right';
    else if (al === 'justify' || al === 'both') o.align = 'justify';
    else if (al === 'left' || al === 'start') o.align = 'left';
    var ml = parseLenCm(att(el, 'margin-left')), mr = parseLenCm(att(el, 'margin-right'));
    var ind = parseLenCm(att(el, 'text-indent'));
    if (ml) o.ml = ml;
    if (mr) o.mr = mr;
    if (ind) o.ind = ind;
    var lh = att(el, 'line-height');
    if (lh && !/%$/.test(lh) && lh !== 'normal') {
      var lpt = parseLenPt(lh);
      if (lpt) o.lh = lpt + 'pt';
      else if (/^[\d.]+$/.test(lh)) o.lh = lh;
    } else if (lh && /%$/.test(lh)) {
      var p = parseFloat(lh);
      if (p && p !== 100) o.lh = String(Math.round(p) / 100);
    }
    return o;
  }
  function collectStyles(rootEl, bag) {
    if (!rootEl) return bag;
    function takeStyle(s) {
      var name = att(s, 'name');
      if (!name) return;
      var rec = bag.styles[name] || { name: name, parent: null, family: '', display: '', outline: 0, text: {}, para: {} };
      rec.family = att(s, 'family') || rec.family;
      rec.parent = att(s, 'parent-style-name') || rec.parent;
      rec.display = att(s, 'display-name') || rec.display;
      var ol = parseInt(att(s, 'default-outline-level') || '0', 10);
      if (ol) rec.outline = ol;
      readTextProps(first(s, 'text-properties'), rec.text);
      readParaProps(first(s, 'paragraph-properties'), rec.para);
      bag.styles[name] = rec;
    }
    function takeList(ls) {
      var name = att(ls, 'name');
      if (!name) return;
      var levels = bag.lists[name] || {};
      (ls.children || []).forEach(function (c) {
        if (c.type !== 'el') return;
        var lvl = parseInt(att(c, 'level') || '1', 10);
        if (c.local === 'list-level-style-number') levels[lvl] = { ordered: true };
        else if (c.local === 'list-level-style-bullet' || c.local === 'list-level-style-image') levels[lvl] = { ordered: false };
      });
      bag.lists[name] = levels;
    }
    function walk(el) {
      if (!el || el.type !== 'el') return;
      if (el.local === 'style') takeStyle(el);
      else if (el.local === 'list-style') takeList(el);
      else (el.children || []).forEach(walk);
    }
    walk(rootEl);
    return bag;
  }
  function headingOf(style, bag) {
    if (!style) return 0;
    var name = (style.display || decodeStyleName(style.name) || '').toLowerCase().replace(/\s+/g, ' ').trim();
    var m = /^heading\s*([1-6])$/.exec(name);
    if (m) return +m[1];
    if (name === 'title') return 1;
    if (name === 'subtitle') return 2;
    if (style.outline >= 1 && style.outline <= 6) return style.outline;
    if (style.parent && bag && bag.styles[style.parent] && style.parent !== style.name) {
      return headingOf(bag.styles[style.parent], bag);
    }
    return 0;
  }
  function chainStyle(bag, name, kind) {
    var out = {}, g = 0, id = name, seen = {};
    var stack = [];
    while (id && bag.styles[id] && g++ < 12 && !seen[id]) {
      seen[id] = true;
      stack.push(bag.styles[id]);
      id = bag.styles[id].parent;
    }
    while (stack.length) {
      var rec = stack.pop();
      var src = rec[kind] || {};
      Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    }
    return out;
  }

  function wrapRun(html, o, isHead) {
    if (!html) return '';
    var st = '';
    if (o.sz && !isHead) st += 'font-size:' + o.sz + 'pt;';
    if (o.color && o.color !== '#000000' && o.color !== '#000') st += 'color:' + o.color + ';';
    if (o.bg) st += 'background-color:' + o.bg + ';';
    if (o.font && !/^(Calibri|Times New Roman|Arial|Liberation Serif|Liberation Sans)$/.test(o.font)) {
      st += "font-family:'" + String(o.font).replace(/'/g, '') + "';";
    }
    if (st) html = '<span style="' + st + '">' + html + '</span>';
    if (o.va === 'superscript') html = '<sup>' + html + '</sup>';
    else if (o.va === 'subscript') html = '<sub>' + html + '</sub>';
    if (o.s) html = '<s>' + html + '</s>';
    if (o.u) html = '<u>' + html + '</u>';
    if (o.i) html = '<i>' + html + '</i>';
    if (o.b && !isHead) html = '<b>' + html + '</b>';
    return html;
  }

  function dataUrl(bytes, mime) {
    if (!bytes || !bytes.length) return '';
    var b64;
    if (typeof Buffer !== 'undefined') b64 = Buffer.from(bytes).toString('base64');
    else {
      var bin = '', i, chunk = 0x8000;
      for (i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      b64 = btoa(bin);
    }
    return 'data:' + mime + ';base64,' + b64;
  }

  /* ------------------------------------------------ converter */
  function Ctx(bag, notes) {
    this.bag = bag; this.notes = notes; this.jobs = [];
  }
  Ctx.prototype.paraCss = function (p) {
    var css = '';
    if (p.align === 'center') css += 'text-align:center;';
    else if (p.align === 'right') css += 'text-align:right;';
    else if (p.align === 'justify') css += 'text-align:justify;';
    if (p.ml) css += 'margin-left:' + p.ml + 'cm;';
    if (p.mr) css += 'margin-right:' + p.mr + 'cm;';
    if (p.ind) css += 'text-indent:' + p.ind + 'cm;';
    if (p.lh) css += 'line-height:' + p.lh + ';';
    return css;
  };
  Ctx.prototype.inline = function (el, baseText, isHead) {
    var me = this, html = '';
    function takeText(t) {
      if (!t) return '';
      return wrapRun(esc(t).replace(/ {2}/g, ' &nbsp;'), baseText || {}, isHead);
    }
    (el.children || []).forEach(function (c) {
      if (c.type === 'text') { html += takeText(c.text); return; }
      if (c.type !== 'el') return;
      var n = c.local;
      if (n === 's') {
        var count = parseInt(att(c, 'c') || '1', 10);
        if (!isFinite(count) || count < 1) count = 1;
        html += takeText(Array(count + 1).join(' '));
      } else if (n === 'tab') html += wrapRun('&emsp;', baseText || {}, isHead);
      else if (n === 'line-break') html += '<br>';
      else if (n === 'span' || n === 'a' || n === 'ruby' || n === 'ruby-base' || n === 'span') {
        var innerBase = baseText || {};
        if (n === 'span' || n === 'a') {
          var sn = att(c, 'style-name');
          if (sn) {
            var extra = chainStyle(me.bag, sn, 'text');
            innerBase = Object.assign({}, baseText || {}, extra);
          }
        }
        if (n === 'ruby') {
          var base = first(c, 'ruby-base') || c;
          html += me.inline(base, innerBase, isHead);
        } else html += me.inline(c, innerBase, isHead);
      } else if (n === 'frame' || n === 'a' && deep(c, 'image')) {
        html += me.image(c);
      } else if (n === 'image') html += me.image(c);
      else if (SKIP_INLINE[n]) { /* drop quietly */ }
      else if (n === 'p' || n === 'h' || n === 'list' || n === 'table') { /* unexpected here */ }
      else html += me.inline(c, baseText, isHead);
    });
    return html;
  };
  Ctx.prototype.image = function (el) {
    var img = el.local === 'image' ? el : deep(el, 'image');
    var frame = el.local === 'frame' ? el : (el.local === 'image' ? null : el);
    if (!frame && el.local !== 'image') frame = el;
    var href = img ? (att(img, 'href') || '') : '';
    var bin = img && first(img, 'binary-data');
    var key = '\u0001IMG' + this.jobs.length + '\u0001';
    var w = att(frame, 'width') || (frame && att(frame, 'min-width')) || '';
    var cm = parseLenCm(w);
    var widthCm = contentCm();
    var pct = cm && widthCm ? Math.max(5, Math.min(100, Math.round(cm / widthCm * 100))) : 100;
    if (bin) {
      var raw = textOf(bin).replace(/\s+/g, '');
      var mime = 'image/png';
      if (href) {
        var ext = (href.split('.').pop() || '').toLowerCase();
        if (MIME[ext]) mime = MIME[ext];
      }
      this.jobs.push({ key: key, path: '', dataUrl: raw ? ('data:' + mime + ';base64,' + raw) : '', pct: pct });
      return key;
    }
    if (!href || /^https?:/i.test(href) || href.charAt(0) === '#') return '';
    var path = href.replace(/^\.\//, '').replace(/^\/+/, '');
    var ext = (path.split('.').pop() || '').toLowerCase();
    if (!MIME[ext]) return '';
    this.jobs.push({ key: key, path: path, pct: pct });
    return key;
  };
  Ctx.prototype.blocksOf = function (el, inList) {
    var me = this, sid = att(el, 'style-name');
    var st = (sid && me.bag.styles[sid]) || null;
    var head = 0;
    if (el.local === 'h') head = parseInt(att(el, 'outline-level') || '0', 10) || headingOf(st, me.bag) || 1;
    else head = headingOf(st, me.bag);
    if (head > 6) head = 6;
    var text = chainStyle(me.bag, sid, 'text');
    var para = chainStyle(me.bag, sid, 'para');
    var inner = me.inline(el, text, !!head);
    var css = me.paraCss(para);
    var tag = head ? ('h' + head) : 'p';
    var bits = inner.split(/(\u0001IMG\d+\u0001)/), out = [], i;
    var hasImg = bits.length > 1;
    for (i = 0; i < bits.length; i++) {
      if (i % 2) { out.push({ html: bits[i] }); continue; }
      if (!bits[i] && hasImg) continue;
      var x = bits[i];
      out.push({
        html: '<' + tag + (css ? ' style="' + css + '"' : '') + '>' + (x || '<br>') + '</' + tag + '>',
        inner: x || '<br>',
        list: inList && i === 0 ? inList : null
      });
    }
    if (!out.length) out.push({ html: '<' + tag + '><br></' + tag + '>', inner: '<br>', list: inList || null });
    return out;
  };
  Ctx.prototype.table = function (tbl) {
    var me = this, html = '', rows = [];
    function addRow(tr, repeat) {
      var cells = [];
      (tr.children || []).forEach(function (c) {
        if (c.type !== 'el') return;
        if (c.local === 'covered-table-cell') {
          var cr = parseInt(att(c, 'number-columns-repeated') || '1', 10);
          while (cr-- > 0) cells.push({ covered: true });
          return;
        }
        if (c.local !== 'table-cell') return;
        var spanC = parseInt(att(c, 'number-columns-spanned') || '1', 10);
        var spanR = parseInt(att(c, 'number-rows-spanned') || '1', 10);
        var rep = parseInt(att(c, 'number-columns-repeated') || '1', 10);
        var cell = { el: c, span: spanC, rows: spanR };
        while (rep-- > 0) cells.push(cell);
      });
      var rr = repeat || 1;
      while (rr-- > 0) rows.push(cells);
    }
    (tbl.children || []).forEach(function (c) {
      if (c.type !== 'el') return;
      if (c.local === 'table-row') addRow(c, parseInt(att(c, 'number-rows-repeated') || '1', 10));
      else if (c.local === 'table-header-rows' || c.local === 'table-row-group') {
        kids(c, 'table-row').forEach(function (tr) { addRow(tr, parseInt(att(tr, 'number-rows-repeated') || '1', 10)); });
      }
    });
    rows.forEach(function (cells) {
      html += '<tr>';
      cells.forEach(function (c) {
        if (!c || c.covered) return;
        var body = me.body(c.el, true) || '<br>';
        html += '<td style="' + tdStyle() + '"' +
          (c.span > 1 ? ' colspan="' + c.span + '"' : '') +
          (c.rows > 1 ? ' rowspan="' + c.rows + '"' : '') + '>' + body + '</td>';
      });
      html += '</tr>';
    });
    return '<table style="' + tblStyle() + '"><tbody>' + html + '</tbody></table>';
  };
  Ctx.prototype.list = function (el, level, styleName) {
    var me = this, sn = att(el, 'style-name') || styleName;
    var lv = level || 1;
    var info = (sn && me.bag.lists[sn] && (me.bag.lists[sn][lv] || me.bag.lists[sn][1])) || { ordered: false };
    var tag = info.ordered ? 'ol' : 'ul';
    var html = '<' + tag + '>';
    (el.children || []).forEach(function (item) {
      if (item.type !== 'el') return;
      if (item.local !== 'list-item' && item.local !== 'list-header') return;
      html += '<li>';
      var firstBlock = true;
      (item.children || []).forEach(function (c) {
        if (c.type !== 'el') return;
        if (c.local === 'p' || c.local === 'h') {
          var blocks = me.blocksOf(c, null);
          blocks.forEach(function (b) {
            if (b.html && b.html.charAt(0) === '\u0001') html += b.html;
            else if (firstBlock) { html += b.inner; firstBlock = false; }
            else html += b.html;
          });
        } else if (c.local === 'list') html += me.list(c, lv + 1, sn);
        else if (c.local === 'table') html += me.table(c);
      });
      html += '</li>';
    });
    html += '</' + tag + '>';
    return html;
  };
  Ctx.prototype.body = function (el, inCell) {
    var me = this, out = [];
    function walk(node) {
      (node.children || []).forEach(function (c) {
        if (c.type !== 'el') return;
        var n = c.local;
        if (n === 'p' || n === 'h') {
          me.blocksOf(c, null).forEach(function (b) { out.push(b.html); });
        } else if (n === 'list') out.push(me.list(c, 1, att(c, 'style-name')));
        else if (n === 'table') {
          out.push(me.table(c));
          if (!inCell) out.push('<p><br></p>');
        } else if (n === 'soft-page-break') {
          if (!inCell) out.push('<div class="dr-pagebreak" contenteditable="false" data-label="Page break"></div>');
        } else if (n === 'section' || n === 'index-body' || n === 'index-title' || n === 'text' ||
                   n === 'body' || n === 'document-content' || n === 'decoration') {
          walk(c);
        } else if (n === 'table-of-content' || n === 'illustration-index' || n === 'table-index' ||
                   n === 'object-index' || n === 'user-index' || n === 'alphabetical-index' ||
                   n === 'bibliography' || n === 'illustration-index') {
          var body = first(c, 'index-body') || first(c, 'index-title');
          if (body) walk(body);
        } else if (SKIP_BLOCK[n]) { /* drop quietly */ }
        else if (n === 'frame') out.push(me.image(c));
        else if (!SKIP_INLINE[n]) walk(c);
      });
    }
    walk(el);
    return out.join('');
  };

  function manifestEncrypted(xml) {
    if (!xml) return false;
    var src = String(xml);
    return /encryption-data/i.test(src);
  }

  /* ------------------------------------------------ entry */
  R.parseXml = parseXml;
  R.read = function read(buf) {
    var raw = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (raw.length < 4 || !(raw[0] === 0x50 && raw[1] === 0x4B)) {
      return Promise.reject(fail('This is not a valid .odt file'));
    }
    var zip, notes = [];
    return openZip(buf).then(function (z) {
      zip = z;
      return Promise.all([
        z.text('META-INF/manifest.xml'),
        z.text('content.xml'),
        z.text('styles.xml')
      ]);
    }).then(function (t) {
      if (manifestEncrypted(t[0])) throw fail('This .odt is password protected');
      if (!t[1]) throw fail('This .odt has no readable document text');
      var content = parseXml(t[1]);
      if (!content) throw fail('This .odt has no readable document text');
      var bag = { styles: {}, lists: {} };
      collectStyles(parseXml(t[2]), bag);
      collectStyles(content, bag);
      var body = deep(content, 'text') || deep(content, 'body') || content;
      var ctx = new Ctx(bag, notes);
      var html = ctx.body(body, false);
      return Promise.all(ctx.jobs.map(function (j) {
        if (j.dataUrl) return Promise.resolve(j.dataUrl);
        var ext = (j.path.split('.').pop() || '').toLowerCase();
        if (!MIME[ext]) return Promise.resolve('');
        return zip.bytes(j.path).then(function (by) {
          if (!by) return '';
          return dataUrl(by, MIME[ext]);
        }).catch(function () { return ''; });
      })).then(function (urls) {
        ctx.jobs.forEach(function (j, i) {
          var src = urls[i];
          var block = src ? '<p class="dl-img-block"><img src="' + src + '" alt="" style="width:' + j.pct + '%;max-width:100%"></p>' : '';
          html = html.split(j.key).join(block);
        });
        html = html.replace(/<(p|h[1-6])([^>]*)><\/\1>/g, '');
        if (!html) html = '<p><br></p>';
        return { html: html, page: null, hf: { head: ['', '', ''], foot: ['', '', ''] }, notes: notes };
      });
    });
  };

  if (typeof module === 'object' && module.exports) module.exports = R;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.odtread = R;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
