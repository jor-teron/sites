/* ============================================================
   FILE: modules/writer-odtgen.js
   PROJECT: Writer
   ROLE: DW8 .odt writer. Turns Writer's editor HTML into an
         OpenDocument Text package (mimetype, META-INF/manifest.xml,
         content.xml, styles.xml, meta.xml, Pictures/*) and packs it
         with Writer.zip (store-only, mimetype first, no extra field).
         DOM-free HTML walk (no DOMParser), so node --test can run it.
         LibreOffice opens the result; Writer.odtread reads it back.
   ENTRY: Writer.odtgen.build(bodyHtml, opts) -> Blob
          Called from Writer.export.exportOdt.
   DEPENDS: Writer.zip (at call time)
   ISOLATION: Throws on a hard error. Undecodable images are skipped
              (their alt text is written instead). Anything Writer
              cannot represent is dropped quietly.
              (before DW11a) Headers, footers and anything Writer cannot represent are dropped quietly.
   DW11a: opts.hf adds the header / footer (DW13c: picture + text lines; was text slots, page fields,
          pictures) to the master page in styles.xml.
   ============================================================ */
(function (root) {
  'use strict';

  var MIME_ODT = 'application/vnd.oasis.opendocument.text';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8"?>';
  var OFFICE_NS =
    ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
    ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
    ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"' +
    ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
    ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
    ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var SKIP = { script: 1, style: 1, head: 1, title: 1, meta: 1, link: 1, template: 1, noscript: 1, audio: 1, video: 1, canvas: 1, iframe: 1, object: 1, embed: 1, svg: 1, button: 1, select: 1, textarea: 1, input: 1 };
  var BLOCK = { p: 1, div: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, ul: 1, ol: 1, li: 1, blockquote: 1, pre: 1, table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, td: 1, th: 1, hr: 1, figure: 1, figcaption: 1, section: 1, article: 1, header: 1, footer: 1, address: 1, dl: 1, dt: 1, dd: 1, center: 1, form: 1, fieldset: 1, main: 1, nav: 1, aside: 1, details: 1, summary: 1 };
  var H_SIZE = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };
  var NAMED = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
    orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080', silver: 'C0C0C0', maroon: '800000', navy: '000080',
    teal: '008080', lime: '00FF00', aqua: '00FFFF', cyan: '00FFFF', fuchsia: 'FF00FF', magenta: 'FF00FF', pink: 'FFC0CB',
    brown: 'A52A2A', gold: 'FFD700', olive: '808000', lightgray: 'D3D3D3', lightgrey: 'D3D3D3', darkgray: 'A9A9A9', darkgrey: 'A9A9A9' };
  var MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
  var GENERIC = { serif: 'Times New Roman', 'sans-serif': 'Arial', monospace: 'Courier New', cursive: 'Comic Sans MS', fantasy: 'Impact', 'system-ui': 'Arial' };

  function esc(t) {
    return String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clone(o) { var c = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function cm3(n) { return (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, function (s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }); }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }

  /* CSS colour -> '#RRGGBB', or null. No canvas (DOM-free). */
  function colour(v) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor' || v === 'auto' || v === 'windowtext') return null;
    var m = /^#([0-9a-f]{3,8})$/.exec(v);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) return ('#' + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2)).toUpperCase();
      if (h.length === 6 || h.length === 8) return ('#' + h.slice(0, 6)).toUpperCase();
      return null;
    }
    m = /^rgba?\(([^)]+)\)$/.exec(v);
    if (m) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean);
      if (p.length >= 4 && num(p[3], 1) === 0) return null;
      var c = p.slice(0, 3).map(function (x) { return /%$/.test(x) ? parseFloat(x) * 2.55 : parseFloat(x); });
      if (c.some(function (x) { return !isFinite(x); })) return null;
      return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
    }
    if (NAMED[v]) return '#' + NAMED[v];
    return null;
  }

  function fontName(v) {
    var f = String(v || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
    if (!f) return null;
    if (/^tinos$/i.test(f)) return 'Times New Roman';
    return GENERIC[f.toLowerCase()] || f;
  }

  /* Length text -> centimetres, or null. fontPt / baseCm are what em and % mean. */
  function lenCm(v, fontPt, baseCm) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    var m = /^(-?[\d.]+)\s*(px|pt|cm|mm|in|pc|em|rem|ex|%)?$/.exec(v);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    switch (m[2] || 'px') {
      case 'px': return n * 2.54 / 96;
      case 'pt': return n * 2.54 / 72;
      case 'cm': return n;
      case 'mm': return n / 10;
      case 'in': return n * 2.54;
      case 'pc': return n * 12 * 2.54 / 72;
      case 'em': return (n * (fontPt || 12)) * 2.54 / 72;
      case 'rem': return n * 12 * 2.54 / 72;
      case 'ex': return n * (fontPt || 12) * 0.5 * 2.54 / 72;
      case '%': return baseCm == null ? null : n * baseCm / 100;
    }
    return null;
  }
  function lenPt(v, fontPt, basePt) {
    var cm = lenCm(v, fontPt, basePt == null ? null : basePt * 2.54 / 72);
    return cm == null ? null : cm * 72 / 2.54;
  }
  var SIZE_KW = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32 };
  function sizePt(v, parentPt) {
    v = String(v || '').trim().toLowerCase();
    if (!v) return null;
    if (SIZE_KW[v]) return SIZE_KW[v] * 0.75;
    if (v === 'larger') return parentPt * 1.2;
    if (v === 'smaller') return parentPt / 1.2;
    var n = lenPt(v, parentPt, parentPt);
    return n != null && n > 0 ? n : null;
  }

  function dataUrlBytes(src) {
    var m = /^data:([^;,]*)((?:;[^,;]*)*),([\s\S]*)$/i.exec(String(src || '').trim());
    if (!m) return null;
    var body = m[3], bin, i, out;
    try {
      if (/;base64/i.test(m[2])) {
        var b64 = body.replace(/\s+/g, '');
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
        bin = atob(b64);
      } else {
        bin = decodeURIComponent(body);
      }
    } catch (e) { return null; }
    out = new Uint8Array(bin.length);
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
  function u32be(b, i) { return ((b[i] * 16777216) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]); }
  function sniffImage(b) {
    if (!b || b.length < 24) return null;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return { ext: 'png', w: u32be(b, 16), h: u32be(b, 20) };
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: 'gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
    if (b[0] === 0x42 && b[1] === 0x4D) {
      var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return { ext: 'bmp', w: Math.abs(dv.getInt32(18, true)), h: Math.abs(dv.getInt32(22, true)) };
    }
    if (b[0] === 0xFF && b[1] === 0xD8) {
      var i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        var mk = b[i + 1];
        if (mk === 0xFF) { i++; continue; }
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { ext: 'jpeg', h: u16be(b, i + 5), w: u16be(b, i + 7) };
        if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01) { i += 2; continue; }
        i += 2 + u16be(b, i + 2);
      }
    }
    return null;
  }

  function decodeEntities(t) {
    return String(t).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp|emsp);/g, function (_, e) {
      if (e === 'amp') return '&';
      if (e === 'lt') return '<';
      if (e === 'gt') return '>';
      if (e === 'quot') return '"';
      if (e === 'apos') return "'";
      if (e === 'nbsp') return '\u00A0';
      if (e === 'emsp') return '\u2003';
      var c = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(c) ? String.fromCharCode(c) : _;
    });
  }
  function parseStyle(s) {
    var o = {};
    String(s || '').split(';').forEach(function (part) {
      var i = part.indexOf(':');
      if (i < 0) return;
      var k = part.slice(0, i).trim().toLowerCase();
      var v = part.slice(i + 1).trim();
      if (!k) return;
      o[k] = v;
      o[k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = v;
    });
    return o;
  }
  function parseClass(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean);
  }

  /* Lightweight HTML tree. Tags are lower-case; void tags have no children. */
  function parseHtml(src) {
    var s = String(src == null ? '' : src), i = 0, n = s.length;
    function peek() { return s.charAt(i); }
    function starts(t) { return s.substr(i, t.length) === t; }
    function skipWs() { while (i < n && s.charCodeAt(i) <= 32) i++; }
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
          } else {
            var j = i;
            while (j < n && !/[\s>]/.test(s.charAt(j))) j++;
            val = decodeEntities(s.slice(i, j));
            i = j;
          }
        }
        attrs[name.toLowerCase()] = val;
      }
      return attrs;
    }
    function skipUntilTag(close) {
      var t = close.toLowerCase(), j;
      while (i < n) {
        j = s.indexOf('<', i);
        if (j < 0) { i = n; return; }
        i = j;
        if (starts('</')) {
          var save = i;
          i += 2;
          var name = parseName();
          skipWs();
          if (peek() === '>') i++;
          if (name.toLowerCase() === t) return;
          i = save + 1;
        } else i++;
      }
    }
    function parseNode() {
      if (starts('<?')) { var q = s.indexOf('?>', i); i = q < 0 ? n : q + 2; return null; }
      if (starts('<!--')) { var c = s.indexOf('-->', i); i = c < 0 ? n : c + 3; return null; }
      if (starts('<!')) { var d = s.indexOf('>', i); i = d < 0 ? n : d + 1; return null; }
      if (peek() !== '<') {
        var j = s.indexOf('<', i);
        if (j < 0) j = n;
        var t = decodeEntities(s.slice(i, j));
        i = j;
        return t ? { type: 'text', text: t } : null;
      }
      if (starts('</')) return null;
      i++;
      var raw = parseName();
      if (!raw) return null;
      var tag = raw.toLowerCase();
      var attrs = parseAttrs();
      skipWs();
      var self = VOID[tag];
      if (peek() === '/') { self = true; i++; }
      if (peek() === '>') i++;
      var style = parseStyle(attrs.style);
      var cls = parseClass(attrs['class']);
      var node = { type: 'el', tag: tag, attrs: attrs, style: style, cls: cls, children: [] };
      if (self) return node;
      if (SKIP[tag] && (tag === 'script' || tag === 'style')) { skipUntilTag(tag); return null; }
      while (i < n) {
        if (starts('</')) {
          var save = i;
          i += 2;
          var cname = parseName().toLowerCase();
          skipWs();
          if (peek() === '>') i++;
          if (cname === tag || !cname) break;
          /* stray closer for another tag: leave it for the parent */
          i = save;
          break;
        }
        var child = parseNode();
        if (child) node.children.push(child);
        else if (starts('</')) continue;
        else if (i < n && peek() === '<') {
          if (!starts('</')) i++;
        } else break;
      }
      return node;
    }
    var root = { type: 'el', tag: 'body', attrs: {}, style: {}, cls: [], children: [] };
    while (i < n) {
      if (starts('</')) {
        i += 2; parseName(); skipWs(); if (peek() === '>') i++;
        continue;
      }
      var node = parseNode();
      if (node) root.children.push(node);
      else if (i < n && peek() === '<' && !starts('</')) i++;
      else if (!starts('<')) break;
    }
    return root;
  }

  function hasClass(el, name) {
    var c = el && el.cls, i;
    if (!c) return false;
    for (i = 0; i < c.length; i++) if (c[i] === name) return true;
    return false;
  }
  function isBlockEl(el) {
    if (!el || el.type !== 'el') return false;
    if (BLOCK[el.tag]) return true;
    if (hasClass(el, 'dr-pagebreak')) return true;
    var d = String((el.style && (el.style.display || el.style['display'])) || '').toLowerCase();
    return d === 'block' || d === 'list-item' || d === 'table' || d === 'flex';
  }
  function att(el, name) { return el && el.attrs && el.attrs[name] != null ? el.attrs[name] : ''; }

  /* Consecutive spaces / tabs / nbsp become ODF text:s / text:tab. */
  function textBits(t) {
    t = String(t || '').replace(/\r\n|\r/g, '\n');
    var out = '', i = 0, n = t.length, ch, run, tag;
    while (i < n) {
      ch = t.charAt(i);
      if (ch === '\t') { out += '<text:tab/>'; i++; continue; }
      if (ch === '\n') { out += '<text:line-break/>'; i++; continue; }
      if (ch === ' ' || ch === '\u00A0') {
        run = 1; i++;
        while (i < n && (t.charAt(i) === ' ' || t.charAt(i) === '\u00A0')) { run++; i++; }
        if (run === 1 && ch === ' ') out += ' ';
        else {
          tag = run === 1 ? '<text:s/>' : ('<text:s text:c="' + run + '"/>');
          out += tag;
        }
        continue;
      }
      var j = i + 1;
      while (j < n && t.charAt(j) !== ' ' && t.charAt(j) !== '\u00A0' && t.charAt(j) !== '\t' && t.charAt(j) !== '\n') j++;
      out += esc(t.slice(i, j));
      i = j;
    }
    return out;
  }

  function alignOf(v) {
    v = String(v || '').toLowerCase();
    if (v === 'center' || v === '-webkit-center') return 'center';
    if (v === 'right' || v === 'end' || v === '-webkit-right') return 'end';
    if (v === 'justify' || v === 'both') return 'justify';
    if (v === 'left' || v === 'start' || v === '-webkit-left') return 'start';
    return null;
  }

  function mergeRun(rp, el) {
    var r = clone(rp), s = el.style || {}, tag = el.tag, v, dec;
    switch (tag) {
      case 'b': case 'strong': r.b = true; break;
      case 'i': case 'em': case 'cite': case 'dfn': case 'var': case 'address': r.i = true; break;
      case 'u': case 'ins': r.u = true; break;
      case 's': case 'strike': case 'del': r.strike = true; break;
      case 'sub': r.vert = 'sub'; break;
      case 'sup': r.vert = 'super'; break;
      case 'code': case 'tt': case 'kbd': case 'samp': r.font = 'Courier New'; r.sz = rp.sz * 13 / 16; break;
      case 'mark': r.bg = '#FFFF00'; break;
      case 'small': r.sz = rp.sz / 1.2; break;
      case 'big': r.sz = rp.sz * 1.2; break;
      case 'font':
        if (att(el, 'face')) r.font = fontName(att(el, 'face')) || r.font;
        v = parseInt(att(el, 'size'), 10);
        if (v >= 1 && v <= 7) r.sz = [0, 7.5, 10, 12, 13.5, 18, 24, 36][v];
        if (colour(att(el, 'color'))) r.color = colour(att(el, 'color'));
        break;
    }
    v = s.fontWeight || s['font-weight'];
    if (v) {
      v = String(v).toLowerCase();
      if (v === 'bold' || v === 'bolder' || parseInt(v, 10) >= 700) r.b = true;
      if (v === 'normal' || v === 'lighter' || parseInt(v, 10) === 400) r.b = false;
    }
    v = s.fontStyle || s['font-style'];
    if (v) {
      v = String(v).toLowerCase();
      if (v === 'italic' || v === 'oblique') r.i = true;
      if (v === 'normal') r.i = false;
    }
    dec = String(s.textDecorationLine || s['text-decoration-line'] || s.textDecoration || s['text-decoration'] || '').toLowerCase();
    if (dec) {
      if (dec.indexOf('none') >= 0) { r.u = false; r.strike = false; }
      if (dec.indexOf('underline') >= 0) r.u = true;
      if (dec.indexOf('line-through') >= 0) r.strike = true;
    }
    v = s.verticalAlign || s['vertical-align'];
    if (v) {
      v = String(v).toLowerCase();
      if (v === 'super' || v === 'superscript') r.vert = 'super';
      else if (v === 'sub' || v === 'subscript') r.vert = 'sub';
      else if (v === 'baseline') r.vert = null;
    }
    v = sizePt(s.fontSize || s['font-size'], rp.sz);
    if (v) r.sz = v;
    if (colour(s.color || s['color'])) r.color = colour(s.color || s['color']);
    if (colour(s.backgroundColor || s['background-color'])) r.bg = colour(s.backgroundColor || s['background-color']);
    if (s.fontFamily || s['font-family']) r.font = fontName(s.fontFamily || s['font-family']) || r.font;
    return r;
  }

  function Builder(opts) {
    this.o = opts || {};
    this.d = this.o.defaults || {};
    if (!this.d.font) this.d.font = 'Times New Roman';
    if (!this.d.sizePt) this.d.sizePt = 12;
    if (!this.d.lineHeight) this.d.lineHeight = 1.6;
    if (this.d.paraAfterPt == null) this.d.paraAfterPt = 6;
    this.auto = [];
    this.autoKey = {};
    this.tN = 0;
    this.pN = 0;
    this.lN = 0;
    this.tblN = 0;
    this.frN = 0;
    this.media = [];
    this.fonts = {};
    this.fonts[this.d.font] = true;
    this.pendingBreak = false;
  }
  Builder.prototype.autoName = function (prefix, n) { return prefix + n; };
  Builder.prototype.addAuto = function (key, namePrefix, xmlFn) {
    if (this.autoKey[key]) return this.autoKey[key];
    var name, xml;
    if (namePrefix === 'T') { this.tN++; name = 'T' + this.tN; }
    else if (namePrefix === 'P') { this.pN++; name = 'P' + this.pN; }
    else if (namePrefix === 'L') { this.lN++; name = 'L' + this.lN; }
    else if (namePrefix === 'Table') { this.tblN++; name = 'Table' + this.tblN; }
    else if (namePrefix === 'fr') { this.frN++; name = 'fr' + this.frN; }
    else { this.tN++; name = namePrefix + this.tN; }
    xml = xmlFn(name);
    this.auto.push(xml);
    this.autoKey[key] = name;
    return name;
  };
  Builder.prototype.textStyle = function (rp, base) {
    var d = base || { font: this.d.font, sz: this.d.sizePt };
    var props = '';
    if (rp.b) props += ' fo:font-weight="bold"';
    if (rp.i) props += ' fo:font-style="italic"';
    if (rp.u) props += ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"';
    if (rp.strike) props += ' style:text-line-through-style="solid"';
    if (rp.vert === 'super') props += ' style:text-position="super 58%"';
    else if (rp.vert === 'sub') props += ' style:text-position="sub 58%"';
    if (rp.sz && Math.round(rp.sz * 100) !== Math.round((d.sz || this.d.sizePt) * 100)) props += ' fo:font-size="' + (Math.round(rp.sz * 100) / 100) + 'pt"';
    if (rp.color && rp.color !== '#000000' && rp.color !== '#000') props += ' fo:color="' + rp.color + '"';
    if (rp.bg) props += ' fo:background-color="' + rp.bg + '"';
    if (rp.font && rp.font !== d.font) {
      props += ' style:font-name="' + esc(rp.font) + '" fo:font-family="' + esc(rp.font) + '"';
      this.fonts[rp.font] = true;
    }
    if (!props) return null;
    var key = 'T|' + props;
    return this.addAuto(key, 'T', function (name) {
      return '<style:style style:name="' + name + '" style:family="text"><style:text-properties' + props + '/></style:style>';
    });
  };
  Builder.prototype.paraStyle = function (p, parent) {
    var props = '';
    if (p.align) props += ' fo:text-align="' + p.align + '"';
    if (p.ml) props += ' fo:margin-left="' + cm3(p.ml) + 'cm"';
    if (p.mr) props += ' fo:margin-right="' + cm3(p.mr) + 'cm"';
    if (p.ind) props += ' fo:text-indent="' + cm3(p.ind) + 'cm"';
    if (p.breakBefore) props += ' fo:break-before="page"';
    if (!props && !parent) return null;
    var key = 'P|' + (parent || 'Standard') + '|' + props;
    return this.addAuto(key, 'P', function (name) {
      return '<style:style style:name="' + name + '" style:family="paragraph" style:parent-style-name="' + (parent || 'Standard') + '">' +
        (props ? '<style:paragraph-properties' + props + '/>' : '') + '</style:style>';
    });
  };
  Builder.prototype.listStyle = function (kind, bullet, numFmt, suffix) {
    var key = 'L|' + kind + '|' + (bullet || '') + '|' + (numFmt || '') + '|' + (suffix || '');
    var self = this;
    return this.addAuto(key, 'L', function (name) {
      var levels = '', i, left, BUL = { disc: '\u2022', circle: '\u25E6', square: '\u25AA' };
      var order = ['disc', 'circle', 'square'];
      for (i = 1; i <= 10; i++) {
        left = (i * 1.27).toFixed(2);
        var space = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">' +
          '<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + left + 'cm" fo:text-indent="-0.635cm" fo:margin-left="' + left + 'cm"/>' +
          '</style:list-level-properties>';
        if (kind === 'bullet') {
          var ch = BUL[bullet] || BUL[order[(i - 1) % 3]] || BUL.disc;
          levels += '<text:list-level-style-bullet text:level="' + i + '" text:bullet-char="' + esc(ch) + '">' + space + '</text:list-level-style-bullet>';
        } else {
          levels += '<text:list-level-style-number text:level="' + i + '" style:num-format="' + esc(numFmt || '1') + '" style:num-suffix="' + esc(suffix == null ? '.' : suffix) + '">' + space + '</text:list-level-style-number>';
        }
      }
      return '<text:list-style style:name="' + name + '">' + levels + '</text:list-style>';
    });
  };
  Builder.prototype.addImage = function (bytes, ext) {
    var name = 'Pictures/image' + (this.media.length + 1) + '.' + ext;
    this.media.push({ name: name, data: bytes, ext: ext, mime: MIME[ext] || ('image/' + ext) });
    return name;
  };
  Builder.prototype.frameStyle = function () {
    return this.addAuto('fr|as-char', 'fr', function (name) {
      return '<style:style style:name="' + name + '" style:family="graphic">' +
        '<style:graphic-properties text:anchor-type="as-char" svg:x="0cm" svg:y="0cm" fo:clip="rect(0cm, 0cm, 0cm, 0cm)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>' +
        '</style:style>';
    });
  };

  function contentWidth(b) {
    var o = b.o, w = o.pageWidthCm || 21, m = o.margins || {};
    return Math.max(1, w - (m.left || 0) - (m.right || 0));
  }

  function wrapRun(inner, rp, b, base, skipDefault) {
    if (!inner) return '';
    var name = skipDefault ? b.textStyle(rp, base) : b.textStyle(rp, base);
    if (skipDefault) {
      /* Headings already carry bold / size on Heading_20_N; only extra props get a span. */
      var extra = clone(rp);
      extra.b = false;
      if (base && Math.abs((extra.sz || 0) - (base.sz || 0)) < 0.05) extra.sz = base.sz;
      name = b.textStyle(extra, base);
    }
    if (!name) return inner;
    return '<text:span text:style-name="' + name + '">' + inner + '</text:span>';
  }

  function inlines(el, rp, b, base, isHead) {
    var xml = '', kids = el.children || [], i, c;
    for (i = 0; i < kids.length; i++) {
      c = kids[i];
      if (c.type === 'text') {
        if (!c.text) continue;
        xml += wrapRun(textBits(c.text), rp, b, base, isHead);
        continue;
      }
      if (c.type !== 'el') continue;
      if (SKIP[c.tag]) continue;
      if (hasClass(c, 'np-mark') || hasClass(c, 'dr-mark')) continue;
      if (c.tag === 'br') { xml += '<text:line-break/>'; continue; }
      if (c.tag === 'img') { xml += imageXml(c, b); continue; }
      if (c.tag === 'a' && att(c, 'href') && /^(https?:|mailto:|tel:|ftp:)/i.test(att(c, 'href'))) {
        xml += '<text:a xlink:type="simple" xlink:href="' + esc(att(c, 'href')) + '">' + inlines(c, mergeRun(rp, c), b, base, isHead) + '</text:a>';
        continue;
      }
      if (isBlockEl(c) && c.tag !== 'br') continue;
      xml += inlines(c, mergeRun(rp, c), b, base, isHead);
    }
    return xml;
  }

  function imageXml(el, b) {
    var bytes = dataUrlBytes(att(el, 'src')), info = bytes && sniffImage(bytes);
    var alt = att(el, 'alt') || '';
    if (!info || !info.w || !info.h) return alt ? textBits('[' + alt + ']') : '';
    var path = b.addImage(bytes, info.ext);
    var cw = contentWidth(b);
    var s = el.style || {}, wCm = null, hCm = null, v;
    v = s.width || s['width'] || att(el, 'width');
    if (v) wCm = lenCm(v, b.d.sizePt, cw);
    v = s.height || s['height'] || att(el, 'height');
    if (v) hCm = lenCm(v, b.d.sizePt, null);
    if (wCm && !hCm) hCm = wCm * info.h / info.w;
    else if (hCm && !wCm) wCm = hCm * info.w / info.h;
    else if (!wCm && !hCm) {
      wCm = info.w * 2.54 / 96;
      hCm = info.h * 2.54 / 96;
    }
    if (wCm > cw) { hCm = hCm * cw / wCm; wCm = cw; }
    if (wCm < 0.2) { hCm = hCm * 0.2 / Math.max(wCm, 0.01); wCm = 0.2; }
    var fr = b.frameStyle();
    var name = 'Image' + b.media.length;
    return '<draw:frame draw:style-name="' + fr + '" draw:name="' + name + '" text:anchor-type="as-char" svg:width="' + cm3(wCm) + 'cm" svg:height="' + cm3(hCm) + 'cm" draw:z-index="0">' +
      '<draw:image xlink:href="' + esc(path) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' +
      '</draw:frame>';
  }

  function paraProps(el, b) {
    var s = el.style || {}, p = {}, v, fontPt = b.d.sizePt;
    v = alignOf(att(el, 'align') || s.textAlign || s['text-align']);
    if (v) p.align = v;
    v = lenCm(s.marginLeft || s['margin-left'], fontPt, contentWidth(b));
    if (v) p.ml = v;
    v = lenCm(s.marginRight || s['margin-right'], fontPt, contentWidth(b));
    if (v) p.mr = v;
    v = lenCm(s.textIndent || s['text-indent'], fontPt, contentWidth(b));
    if (v) p.ind = v;
    if (b.pendingBreak) { p.breakBefore = true; b.pendingBreak = false; }
    return p;
  }

  function paraXml(el, b, rp, parentStyle, isHead, outline) {
    var p = paraProps(el, b);
    var style = b.paraStyle(p, parentStyle);
    var base = isHead ? { font: b.d.font, sz: b.d.sizePt * (H_SIZE['h' + outline] || 1), b: true } : { font: b.d.font, sz: b.d.sizePt };
    var inner = inlines(el, rp, b, base, isHead);
    /* Images sitting alone in a paragraph still need the paragraph wrapper. */
    var kids = el.children || [], i, c, onlyImg = !inner;
    if (onlyImg) {
      for (i = 0; i < kids.length; i++) {
        c = kids[i];
        if (c.type === 'el' && c.tag === 'img') inner += imageXml(c, b);
        else if (c.type === 'el' && !isBlockEl(c)) inner += inlines(c, mergeRun(rp, c), b, base, isHead);
      }
    }
    var tag, attrs;
    if (isHead) {
      tag = 'text:h';
      attrs = ' text:outline-level="' + outline + '"' + (style ? ' text:style-name="' + style + '"' : ' text:style-name="' + parentStyle + '"');
    } else {
      tag = 'text:p';
      attrs = style ? ' text:style-name="' + style + '"' : '';
    }
    return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
  }

  function emptyPara(b, breakBefore) {
    var p = {};
    if (breakBefore || b.pendingBreak) { p.breakBefore = true; b.pendingBreak = false; }
    var style = b.paraStyle(p, 'Standard');
    return '<text:p' + (style ? ' text:style-name="' + style + '"' : '') + '/>';
  }

  function isPageBreak(el) {
    if (!el || el.type !== 'el') return false;
    if (hasClass(el, 'dr-pagebreak')) return true;
    var s = el.style || {};
    var v = String(s.pageBreakBefore || s['page-break-before'] || s.breakBefore || s['break-before'] || '').toLowerCase();
    if (v === 'always' || v === 'page' || v === 'left' || v === 'right') return true;
    if (el.tag === 'br') {
      v = String(s.pageBreakBefore || s['page-break-before'] || s.breakBefore || s['break-before'] || s.pageBreakAfter || s['page-break-after'] || '').toLowerCase();
      if (v === 'always' || v === 'page') return true;
    }
    return false;
  }

  function whitespaceOnly(el) {
    if (!el) return true;
    if (el.type === 'text') return !/\S/.test(el.text || '');
    return false;
  }

  function listKind(el) {
    var s = el.style || {}, lst = String(s.listStyleType || s['list-style-type'] || '').toLowerCase();
    if (el.tag === 'ol') {
      var st = (att(el, 'data-style') || att(el, 'type') || '').trim();
      var kind = { '1': '1', a: 'a', A: 'A', i: 'i', I: 'I' }[st] || '1';
      if (!st && lst) kind = { 'lower-alpha': 'a', 'lower-latin': 'a', 'upper-alpha': 'A', 'upper-latin': 'A', 'lower-roman': 'i', 'upper-roman': 'I', decimal: '1' }[lst] || '1';
      var suffix = att(el, 'data-suffix');
      suffix = suffix === 'none' ? '' : (suffix === ',' || suffix === ')' ? suffix : '.');
      var start = parseInt(att(el, 'start'), 10);
      if (!isFinite(start) || start < 1) start = 1;
      return { kind: 'number', numFmt: kind, suffix: suffix, start: start };
    }
    var bullet = 'disc';
    var v = lst || String(att(el, 'type') || '').toLowerCase();
    if (v === 'circle' || v === 'square' || v === 'disc') bullet = v;
    return { kind: 'bullet', bullet: bullet, start: 1 };
  }

  function emitList(el, b, rp) {
    var info = listKind(el);
    var style = info.kind === 'bullet'
      ? b.listStyle('bullet', info.bullet)
      : b.listStyle('number', null, info.numFmt, info.suffix);
    var xml = '<text:list text:style-name="' + style + '">';
    var items = el.children || [], i, item, first = true;
    for (i = 0; i < items.length; i++) {
      item = items[i];
      if (item.type !== 'el') continue;
      if (item.tag !== 'li') {
        if (item.tag === 'ol' || item.tag === 'ul') {
          /* loose nested list: wrap in an item */
          xml += '<text:list-item>' + emitList(item, b, rp) + '</text:list-item>';
        }
        continue;
      }
      var startAttr = '';
      if (first && info.start && info.start !== 1) startAttr = ' text:start-value="' + info.start + '"';
      first = false;
      xml += '<text:list-item' + startAttr + '>';
      xml += emitListItem(item, b, rp);
      xml += '</text:list-item>';
    }
    xml += '</text:list>';
    return xml;
  }

  /* A list-item: leading inlines become one text:p; nested lists / tables / blocks follow. */
  function emitListItem(el, b, rp) {
    var kids = el.children || [], i, c, buf = [], xml = '', saw = false;
    function flush() {
      if (!buf.length && saw) return;
      var holder = { type: 'el', tag: 'p', attrs: {}, style: el.style || {}, cls: [], children: buf };
      xml += paraXml(holder, b, rp, 'Standard', false, 0);
      buf = [];
      saw = true;
    }
    for (i = 0; i < kids.length; i++) {
      c = kids[i];
      if (c.type === 'text') {
        if (!/\S/.test(c.text || '') && buf.length === 0) continue;
        buf.push(c);
        continue;
      }
      if (c.type !== 'el') continue;
      if (c.tag === 'ul' || c.tag === 'ol') {
        if (buf.length || !saw) flush();
        xml += emitList(c, b, rp);
        continue;
      }
      if (c.tag === 'table') {
        if (buf.length || !saw) flush();
        xml += emitTable(c, b, rp);
        continue;
      }
      if (c.tag === 'p' || c.tag === 'div' || /^h[1-6]$/.test(c.tag)) {
        if (buf.length) flush();
        if (!saw) {
          /* first block supplies the item's paragraph */
          xml += emitBlock(c, b, rp);
          saw = true;
        } else xml += emitBlock(c, b, rp);
        continue;
      }
      if (isPageBreak(c)) { b.pendingBreak = true; continue; }
      if (isBlockEl(c)) {
        if (buf.length || !saw) flush();
        xml += emitBlock(c, b, rp);
        continue;
      }
      buf.push(c);
    }
    if (buf.length || !saw) flush();
    return xml;
  }

  function tableRows(tbl) {
    var rows = [], kids = tbl.children || [], i, c, j, sub;
    function take(el) {
      (el.children || []).forEach(function (tr) {
        if (tr.type === 'el' && tr.tag === 'tr') rows.push(tr);
        else if (tr.type === 'el' && (tr.tag === 'thead' || tr.tag === 'tbody' || tr.tag === 'tfoot')) take(tr);
      });
    }
    for (i = 0; i < kids.length; i++) {
      c = kids[i];
      if (c.type !== 'el') continue;
      if (c.tag === 'tr') rows.push(c);
      else if (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot') take(c);
    }
    return rows;
  }

  function emitTable(tbl, b, rp) {
    var rows = tableRows(tbl);
    var occupy = [], grid = [], r, c, cells, cell, span, rs, k, colCount = 0;
    for (r = 0; r < rows.length; r++) {
      if (!occupy[r]) occupy[r] = {};
      grid[r] = [];
      cells = (rows[r].children || []).filter(function (x) { return x.type === 'el' && (x.tag === 'td' || x.tag === 'th'); });
      c = 0;
      for (k = 0; k < cells.length; k++) {
        while (occupy[r][c]) c++;
        cell = cells[k];
        span = Math.max(1, parseInt(att(cell, 'colspan'), 10) || 1);
        rs = parseInt(att(cell, 'rowspan'), 10);
        if (!isFinite(rs) || rs < 1) rs = 1;
        grid[r].push({ el: cell, col: c, span: span, rowspan: rs });
        var rr, cc;
        for (rr = 0; rr < rs; rr++) {
          if (!occupy[r + rr]) occupy[r + rr] = {};
          for (cc = 0; cc < span; cc++) occupy[r + rr][c + cc] = (rr === 0 && cc === 0) ? 'cell' : 'cover';
        }
        c += span;
      }
      while (occupy[r][c]) c++;
      if (c > colCount) colCount = c;
    }
    if (!colCount) colCount = 1;
    var cw = contentWidth(b);
    var colW = cw / colCount;
    var tName = b.addAuto('Table|' + colCount + '|' + cm3(cw), 'Table', function (name) {
      return '<style:style style:name="' + name + '" style:family="table"><style:table-properties style:width="' + cm3(cw) + 'cm" table:align="margins"/></style:style>';
    });
    var colName = b.addAuto('Col|' + cm3(colW), 'Table', function (name) {
      return '<style:style style:name="' + name + '" style:family="table-column"><style:table-column-properties style:column-width="' + cm3(colW) + 'cm"/></style:style>';
    });
    var cellName = b.addAuto('TDC|border', 'Table', function (name) {
      return '<style:style style:name="' + name + '" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #000000" fo:padding="0.1cm" style:vertical-align="top"/></style:style>';
    });
    var xml = '<table:table table:name="' + tName + '" table:style-name="' + tName + '">';
    xml += '<table:table-column table:style-name="' + colName + '" table:number-columns-repeated="' + colCount + '"/>';
    for (r = 0; r < rows.length; r++) {
      xml += '<table:table-row>';
      var placed = {};
      grid[r].forEach(function (g) { placed[g.col] = g; });
      for (c = 0; c < colCount; c++) {
        if (occupy[r] && occupy[r][c] === 'cover' && !placed[c]) {
          xml += '<table:covered-table-cell/>';
          continue;
        }
        if (!placed[c]) {
          /* sparse row: empty cell so the column count stays honest */
          xml += '<table:table-cell table:style-name="' + cellName + '" office:value-type="string"><text:p/></table:table-cell>';
          continue;
        }
        cell = placed[c];
        var extra = '';
        if (cell.span > 1) extra += ' table:number-columns-spanned="' + cell.span + '"';
        if (cell.rowspan > 1) extra += ' table:number-rows-spanned="' + cell.rowspan + '"';
        var body = emitBlocks(cell.el, b, rp, true);
        if (!body) body = '<text:p/>';
        xml += '<table:table-cell table:style-name="' + cellName + '" office:value-type="string"' + extra + '>' + body + '</table:table-cell>';
        if (cell.span > 1) {
          var cc;
          for (cc = 1; cc < cell.span; cc++) xml += '<table:covered-table-cell/>';
          c += cell.span - 1;
        }
      }
      xml += '</table:table-row>';
    }
    xml += '</table:table>';
    return xml;
  }

  function defaultRun(b) { return { font: b.d.font, sz: b.d.sizePt }; }

  function emitBlock(el, b, rp) {
    if (!el || el.type !== 'el') return '';
    if (SKIP[el.tag]) return '';
    if (hasClass(el, 'np-mark') || hasClass(el, 'dr-mark')) return '';
    if (isPageBreak(el)) { b.pendingBreak = true; return ''; }
    var tag = el.tag, s = el.style || '';
    if (tag === 'ul' || tag === 'ol') return emitList(el, b, rp);
    if (tag === 'table') return emitTable(el, b, rp);
    if (tag === 'hr') return emptyPara(b, false);
    if (/^h[1-6]$/.test(tag)) {
      var lvl = parseInt(tag.charAt(1), 10);
      var parent = 'Heading_20_' + lvl;
      var hrp = clone(rp);
      hrp.b = true;
      hrp.sz = b.d.sizePt * (H_SIZE[tag] || 1);
      hrp = mergeRun(hrp, el);
      return paraXml(el, b, hrp, parent, true, lvl);
    }
    if (tag === 'li') {
      /* a stray li outside a list: treat as a paragraph */
      return paraXml(el, b, rp, 'Standard', false, 0);
    }
    if (tag === 'blockquote' || tag === 'figure' || tag === 'dd') {
      var inner = hasBlockChild(el) ? emitBlocks(el, b, rp, false) : paraXml(el, b, rp, 'Standard', false, 0);
      return inner;
    }
    if (tag === 'pre') {
      var pr = clone(rp);
      pr.font = 'Courier New';
      return paraXml(el, b, pr, 'Standard', false, 0);
    }
    if (tag === 'center') {
      var holder = { type: 'el', tag: 'p', attrs: el.attrs, style: clone(el.style || {}), cls: el.cls, children: el.children };
      holder.style.textAlign = 'center';
      holder.style['text-align'] = 'center';
      return hasBlockChild(el) ? emitBlocks(el, b, rp, false) : paraXml(holder, b, rp, 'Standard', false, 0);
    }
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' ||
        tag === 'main' || tag === 'aside' || tag === 'nav' || tag === 'form' || tag === 'fieldset' ||
        tag === 'dl' || tag === 'details' || tag === 'summary' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      if (hasBlockChild(el)) return emitBlocks(el, b, rp, false);
      return paraXml(el, b, rp, 'Standard', false, 0);
    }
    /* p, figcaption, address, dt, and unknown blocks */
    if (hasBlockChild(el)) return emitBlocks(el, b, rp, false);
    return paraXml(el, b, mergeRun(rp, el), 'Standard', false, 0);
  }

  function hasBlockChild(el) {
    var c = el && el.children, i;
    if (!c) return false;
    for (i = 0; i < c.length; i++) if (isBlockEl(c[i])) return true;
    return false;
  }

  function emitBlocks(el, b, rp, inCell) {
    var kids = el.children || [], i, c, xml = '', buf = [];
    function flushInlines() {
      if (!buf.length) return;
      var holder = { type: 'el', tag: 'p', attrs: {}, style: {}, cls: [], children: buf };
      xml += paraXml(holder, b, rp, 'Standard', false, 0);
      buf = [];
    }
    for (i = 0; i < kids.length; i++) {
      c = kids[i];
      if (c.type === 'text') {
        if (!/\S/.test(c.text || '')) continue;
        buf.push(c);
        continue;
      }
      if (c.type !== 'el') continue;
      if (isPageBreak(c)) {
        flushInlines();
        b.pendingBreak = true;
        continue;
      }
      if (isBlockEl(c)) {
        flushInlines();
        xml += emitBlock(c, b, rp);
        continue;
      }
      if (c.tag === 'img') {
        flushInlines();
        var holder = { type: 'el', tag: 'p', attrs: {}, style: {}, cls: ['dl-img-block'], children: [c] };
        xml += paraXml(holder, b, rp, 'Standard', false, 0);
        continue;
      }
      buf.push(c);
    }
    flushInlines();
    if (b.pendingBreak && !inCell) xml += emptyPara(b, true);
    return xml;
  }

  function fontDecls(fonts) {
    var xml = '<office:font-face-decls>', name;
    for (name in fonts) {
      if (!fonts[name]) continue;
      var generic = /courier|mono/i.test(name) ? 'modern' : (/arial|helvetica|sans/i.test(name) ? 'swiss' : 'roman');
      xml += '<style:font-face style:name="' + esc(name) + '" svg:font-family="' + esc(name) + '" style:font-family-generic="' + generic + '" style:font-pitch="variable"/>';
    }
    return xml + '</office:font-face-decls>';
  }

  /* DW11a: header / footer of the master page. part = opts.hf.head / foot:
     (before DW13c) { slots: [3 text], pics: [3 x {bytes, ext, w, h (mm)} | null], edgeMm }:
     left / centre / right on a centre and a right tab stop (as in the .docx),
     each picture an as-char frame before its slot's text.
     DW13c: { lines: [{ t, a }], pic: { bytes, ext, w, h (mm), a } | null }:
     the picture in its own aligned paragraph on top (as-char frame, file in
     Pictures/), then one paragraph per line with its alignment (automatic
     styles <style>_l / _c / _r). {page} / {pages} become page-number / page-count. */
  function hfParaXml(part, b, style) {
    var xml = '', al = function (a) { return style + '_' + (a === 'l' || a === 'r' ? a : 'c'); };
    var p = part.pic;
    if (p && p.bytes) {
      var path = b.addImage(p.bytes, p.ext);
      xml += '<text:p text:style-name="' + al(p.a) + 'P">' +
        '<draw:frame draw:style-name="MFr1" draw:name="' + style + 'Picture" text:anchor-type="as-char"' +
        ' svg:width="' + cm3(p.w / 10) + 'cm" svg:height="' + cm3(p.h / 10) + 'cm" draw:z-index="0">' +
        '<draw:image xlink:href="' + esc(path) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>';
    }
    var lines = part.lines || [];
    lines.forEach(function (l) {
      var inner = '';
      String(l.t || '').split(/(\{page\}|\{pages\})/).forEach(function (bit) {
        if (bit === '{page}') inner += '<text:page-number text:select-page="current">1</text:page-number>';
        else if (bit === '{pages}') inner += '<text:page-count>1</text:page-count>';
        else if (bit) inner += textBits(bit);
      });
      xml += '<text:p text:style-name="' + al(l.a) + '">' + inner + '</text:p>';
    });
    if (!lines.length && !xml) xml = '<text:p text:style-name="' + style + '"/>';
    return xml;
  }
  function hfStyles(b) {
    var o = b.o, w = o.pageWidthCm || 21, m = o.margins || {};
    var cw = Math.max(1, w - (m.left != null ? m.left : 2) - (m.right != null ? m.right : 2));
    var para = function (name, disp) {
      return '<style:style style:name="' + name + '" style:display-name="' + disp + '" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">' +
        '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:line-height="100%"><style:tab-stops>' +
        '<style:tab-stop style:position="' + cm3(cw / 2) + 'cm" style:type="center"/><style:tab-stop style:position="' + cm3(cw) + 'cm" style:type="right"/>' +
        '</style:tab-stops></style:paragraph-properties><style:text-properties fo:font-size="10pt"/></style:style>';
    };
    var fr = function (name, gap) {
      return '<style:style style:name="' + name + '" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" style:vertical-pos="middle" style:vertical-rel="line"' +
        ' fo:margin-left="0cm" fo:margin-right="' + gap + 'cm" fo:margin-top="0cm" fo:margin-bottom="0cm" draw:luminance="0%" draw:contrast="0%" draw:gamma="100%" draw:color-mode="standard"/></style:style>';
    };
    /* (before DW13c) return { para: para('Header', 'Header') + para('Footer', 'Footer'), frames: fr('MFr1', '0') + fr('MFr2', '0.15') }; */
    /* DW13c: aligned line paragraphs, and the picture paragraph (1.5 mm gap under it). */
    var aligned = '';
    ['Header', 'Footer'].forEach(function (parent) {
      [['l', 'start'], ['c', 'center'], ['r', 'end']].forEach(function (x) {
        aligned += '<style:style style:name="' + parent + '_' + x[0] + '" style:family="paragraph" style:parent-style-name="' + parent + '">' +
          '<style:paragraph-properties fo:text-align="' + x[1] + '"/></style:style>' +
          '<style:style style:name="' + parent + '_' + x[0] + 'P" style:family="paragraph" style:parent-style-name="' + parent + '">' +
          '<style:paragraph-properties fo:text-align="' + x[1] + '" fo:margin-bottom="0.15cm"/></style:style>';
      });
    });
    return { para: para('Header', 'Header') + para('Footer', 'Footer'), frames: fr('MFr1', '0') + fr('MFr2', '0.15') + aligned };
  }

  function stylesXml(b) {
    var d = b.d, o = b.o, i, heads = '';
    var sizes = [2, 1.5, 1.17, 1, 0.83, 0.67];
    for (i = 1; i <= 6; i++) {
      heads += '<style:style style:name="Heading_20_' + i + '" style:display-name="Heading ' + i + '" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="' + i + '" style:class="text">' +
        '<style:text-properties fo:font-size="' + (Math.round(d.sizePt * sizes[i - 1] * 100) / 100) + 'pt" fo:font-weight="bold"/>' +
        '</style:style>';
    }
    var w = o.pageWidthCm || 21, h = o.pageHeightCm || 29.7, m = o.margins || {};
    var orient = o.landscape ? 'landscape' : 'portrait';
    /* DW11a: with a header / footer the page margin is the gap to its box and
       the box (min height) fills the rest, so the body starts where Writer has it. */
    var hf = o.hf || null, hd = hf && hf.head, ft = hf && hf.foot;
    var mt = m.top != null ? m.top : 0.5, mb = m.bottom != null ? m.bottom : 0.6;
    var edgeT = hd ? (hd.edgeMm != null ? hd.edgeMm / 10 : mt * 0.4) : mt;
    var edgeB = ft ? (ft.edgeMm != null ? ft.edgeMm / 10 : mb * 0.4) : mb;
    var page = '<style:page-layout style:name="Mpm1">' +
      '<style:page-layout-properties fo:page-width="' + cm3(w) + 'cm" fo:page-height="' + cm3(h) + 'cm" style:num-format="1" style:print-orientation="' + orient + '"' +
      /* (before DW11a) ' fo:margin-top="' + cm3(m.top != null ? m.top : 0.5) + 'cm" fo:margin-bottom="' + cm3(m.bottom != null ? m.bottom : 0.6) + 'cm"' + */
      ' fo:margin-top="' + cm3(edgeT) + 'cm" fo:margin-bottom="' + cm3(edgeB) + 'cm"' +
      ' fo:margin-left="' + cm3(m.left != null ? m.left : 2) + 'cm" fo:margin-right="' + cm3(m.right != null ? m.right : 2) + 'cm" style:writing-mode="lr-tb"/>' +
      (hd ? '<style:header-style><style:header-footer-properties fo:min-height="' + cm3(Math.max(0.1, mt - edgeT)) + 'cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" style:dynamic-spacing="false"/></style:header-style>' : '') +
      (ft ? '<style:footer-style><style:header-footer-properties fo:min-height="' + cm3(Math.max(0.1, mb - edgeB)) + 'cm" fo:margin-top="0cm" fo:margin-left="0cm" fo:margin-right="0cm" style:dynamic-spacing="false"/></style:footer-style>' : '') +
      '</style:page-layout>';
    var hs = hf ? hfStyles(b) : { para: '', frames: '' };
    var master = '<style:master-page style:name="Standard" style:page-layout-name="Mpm1">' +
      (hd ? '<style:header>' + hfParaXml(hd, b, 'Header') + '</style:header>' : '') +
      (ft ? '<style:footer>' + hfParaXml(ft, b, 'Footer') + '</style:footer>' : '') +
      '</style:master-page>';
    var lh = Math.round((d.lineHeight || 1.6) * 100);
    return XMLDECL + '<office:document-styles' + OFFICE_NS + ' office:version="1.2">' +
      fontDecls(b.fonts) +
      '<office:styles>' +
      '<style:default-style style:family="paragraph">' +
      '<style:paragraph-properties fo:line-height="' + lh + '%" fo:text-align="start"/>' +
      '<style:text-properties style:font-name="' + esc(d.font) + '" fo:font-family="' + esc(d.font) + '" fo:font-size="' + d.sizePt + 'pt"/>' +
      '</style:default-style>' +
      '<style:style style:name="Standard" style:family="paragraph" style:class="text">' +
      '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="' + d.paraAfterPt + 'pt" fo:line-height="' + lh + '%"/>' +
      '</style:style>' +
      '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text">' +
      '<style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/>' +
      '<style:text-properties fo:font-weight="bold"/>' +
      '</style:style>' +
      heads +
      hs.para +   /* DW11a */
      '</office:styles>' +
      /* (before DW11a) '<office:automatic-styles>' + page + '</office:automatic-styles>' + */
      '<office:automatic-styles>' + page + hs.frames + '</office:automatic-styles>' +
      /* (before DW11a) '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Mpm1"/></office:master-styles>' + */
      '<office:master-styles>' + (hf ? master : '<style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>') + '</office:master-styles>' +
      '</office:document-styles>';
  }

  function metaXml() {
    return XMLDECL + '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">' +
      '<office:meta><meta:generator>Hub Writer DW8</meta:generator></office:meta></office:document-meta>';
  }

  function manifestXml(files) {
    var body = '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="' + MIME_ODT + '"/>';
    files.forEach(function (f) {
      body += '<manifest:file-entry manifest:full-path="' + esc(f.path) + '" manifest:media-type="' + esc(f.mime) + '"/>';
    });
    return XMLDECL + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' + body + '</manifest:manifest>';
  }

  function getZip(rootObj) {
    var W = (rootObj && rootObj.Writer) || (typeof Writer !== 'undefined' ? Writer : null);
    if (!W || !W.zip || !W.zip.build) throw new Error('Writer.zip missing');
    return W.zip;
  }

  function encodeUtf8(s) { return new TextEncoder().encode(s); }

  /* opts: {landscape, pageWidthCm, pageHeightCm, margins {top,right,bottom,left},
            defaults {font, sizePt, lineHeight, paraAfterPt},
            DW11a: hf {head, foot} each null or {slots, pics, edgeMm} (see hfParaXml)
            DW13c: each null or {lines, pic, edgeMm} (see hfParaXml)} */
  function build(bodyHtml, opts) {
    var zip = getZip(root);
    opts = opts || {};
    var b = new Builder(opts);
    var tree = parseHtml(String(bodyHtml == null ? '' : bodyHtml));
    var body = emitBlocks(tree, b, defaultRun(b), false);
    if (b.pendingBreak) body += emptyPara(b, true);
    if (!body) body = '<text:p/>';
    var content = XMLDECL + '<office:document-content' + OFFICE_NS + ' office:version="1.2">' +
      fontDecls(b.fonts) +
      '<office:automatic-styles>' + b.auto.join('') + '</office:automatic-styles>' +
      '<office:body><office:text>' + body + '</office:text></office:body>' +
      '</office:document-content>';
    var styles = stylesXml(b);
    var meta = metaXml();
    var parts = [
      { path: 'content.xml', mime: 'text/xml', data: encodeUtf8(content) },
      { path: 'styles.xml', mime: 'text/xml', data: encodeUtf8(styles) },
      { path: 'meta.xml', mime: 'text/xml', data: encodeUtf8(meta) }
    ];
    b.media.forEach(function (mm) {
      parts.push({ path: mm.name, mime: mm.mime, data: mm.data });
    });
    var manifest = manifestXml([{ path: 'META-INF/manifest.xml', mime: 'text/xml' }].concat(parts));
    var entries = [
      { name: 'mimetype', data: encodeUtf8(MIME_ODT), flags: 0 }
    ];
    entries.push({ name: 'META-INF/manifest.xml', data: encodeUtf8(manifest) });
    parts.forEach(function (p) { entries.push({ name: p.path, data: p.data }); });
    var blob = zip.build(entries);
    return new Blob([blob], { type: MIME_ODT });
  }

  var api = { build: build, parseHtml: parseHtml, colour: colour, sniffImage: sniffImage, lenCm: lenCm };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.odtgen = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
