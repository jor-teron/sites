/* ============================================================
   FILE: modules/draftly-docxgen.js
   PROJECT: Draftly
   ROLE: MM6 real DOCX writer. Turns Draftly's editor HTML into
         WordprocessingML (word/document.xml with <w:p> / <w:r>,
         <w:tbl>, numbering, images, header / footer parts) and
         packs it with Draftly.zip (store-only, works from file://).
         The old vendor/html-docx.js wrote the text as an attached
         HTML chunk (altChunk) that LibreOffice and most viewers do
         not show; this module writes the text itself.
   ENTRY: Draftly.docxgen.build(bodyHtml, opts) -> Blob
          Called only from Draftly.export.makeDocxBlob.
   DEPENDS: Draftly.config, Draftly.zip (at call time), DOMParser
   ISOLATION: Throws on a hard error; makeDocxBlob then falls back
              to html-docx (console.warn). Undecodable images are
              skipped (their alt text is written instead).
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.docxgen = (function () {
  'use strict';

  var NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  var CT_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  var BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|HR|FIGURE|FIGCAPTION|SECTION|ARTICLE|HEADER|FOOTER|ADDRESS|DL|DT|DD|CENTER|FORM|FIELDSET|MAIN|NAV|ASIDE|DETAILS|SUMMARY)$/;
  var SKIP = /^(SCRIPT|STYLE|HEAD|TITLE|META|LINK|TEMPLATE|NOSCRIPT|AUDIO|VIDEO|CANVAS|IFRAME|OBJECT|EMBED|SVG|BUTTON|SELECT|TEXTAREA|INPUT)$/;
  var CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

  /* ------------------------------------------------ small helpers */
  function esc(t) {
    return String(t).replace(CTRL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clone(o) { var c = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  function tw(pt) { return Math.round(pt * 20); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

  /* Length text -> points, or null. basePt is what % and em mean. */
  function lenPt(v, fontPt, basePt) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    var m = /^(-?[\d.]+)\s*(px|pt|cm|mm|in|pc|em|rem|ex|%)?$/.exec(v);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return null;
    switch (m[2] || 'px') {
      case 'px': return n * 0.75;
      case 'pt': return n;
      case 'cm': return n * 28.3465;
      case 'mm': return n * 2.83465;
      case 'in': return n * 72;
      case 'pc': return n * 12;
      case 'em': return n * fontPt;
      case 'rem': return n * 12;
      case 'ex': return n * fontPt * 0.5;
      case '%': return basePt == null ? null : n * basePt / 100;
    }
    return null;
  }

  var NAMED = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
    orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080', silver: 'C0C0C0', maroon: '800000', navy: '000080',
    teal: '008080', lime: '00FF00', aqua: '00FFFF', cyan: '00FFFF', fuchsia: 'FF00FF', magenta: 'FF00FF', pink: 'FFC0CB',
    brown: 'A52A2A', gold: 'FFD700', olive: '808000', lightgray: 'D3D3D3', lightgrey: 'D3D3D3', darkgray: 'A9A9A9', darkgrey: 'A9A9A9' };
  var canvasCtx;
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
  /* CSS colour -> 'RRGGBB', or null (none / transparent / unknown / currentColor). */
  function colour(v) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor' || v === 'auto' || v === 'windowtext') return null;
    var m = /^#([0-9a-f]{3,8})$/.exec(v);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) return (h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2)).toUpperCase();
      if (h.length === 6 || h.length === 8) return h.slice(0, 6).toUpperCase();
      return null;
    }
    m = /^rgba?\(([^)]+)\)$/.exec(v);
    if (m) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean);
      if (p.length >= 4 && num(p[3], 1) === 0) return null;
      var c = p.slice(0, 3).map(function (x) { return /%$/.test(x) ? parseFloat(x) * 2.55 : parseFloat(x); });
      if (c.some(function (x) { return !isFinite(x); })) return null;
      return hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
    }
    if (NAMED[v]) return NAMED[v];
    try {
      if (!canvasCtx) canvasCtx = document.createElement('canvas').getContext('2d');
      canvasCtx.fillStyle = '#010203';
      canvasCtx.fillStyle = v;
      var r = canvasCtx.fillStyle;
      if (r === '#010203' && v !== '#010203') return null;
      return colour(r);
    } catch (e) { return null; }
  }

  var GENERIC = { serif: 'Times New Roman', 'sans-serif': 'Arial', monospace: 'Courier New', cursive: 'Comic Sans MS', fantasy: 'Impact', 'system-ui': 'Arial' };
  function fontName(v) {
    var f = String(v || '').split(',')[0].replace(/^[\s'"]+|[\s'"]+$/g, '');
    if (!f) return null;
    if (/^tinos$/i.test(f)) return 'Times New Roman';
    return GENERIC[f.toLowerCase()] || f;
  }

  var SIZE_KW = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32 };
  var FONT_TAG = [0, 7.5, 10, 12, 13.5, 18, 24, 36];
  /* font-size text -> pt (relative to parentPt), or null. */
  function sizePt(v, parentPt) {
    v = String(v || '').trim().toLowerCase();
    if (!v) return null;
    if (SIZE_KW[v]) return SIZE_KW[v] * 0.75;
    if (v === 'larger') return parentPt * 1.2;
    if (v === 'smaller') return parentPt / 1.2;
    var n = lenPt(v, parentPt, parentPt);
    return n != null && n > 0 ? n : null;
  }

  /* ------------------------------------------------ image helpers */
  function dataUrlBytes(src) {
    var m = /^data:([^;,]*)((?:;[^,;]*)*),([\s\S]*)$/i.exec(String(src || '').trim());
    if (!m) return null;
    var body = m[3], bin;
    try {
      if (/;base64/i.test(m[2])) bin = atob(body.replace(/\s+/g, ''));
      else bin = unescape(body);   /* percent-encoded bytes */
    } catch (e) { return null; }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
  function u32be(b, i) { return ((b[i] * 16777216) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]); }
  /* {ext, type, w, h} in pixels, or null when not a PNG / JPEG / GIF / BMP we can read. */
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
  var MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };

  /* ------------------------------------------------ build state */
  function Builder(opts) {
    this.o = opts;
    this.rels = [];          /* {id, type, target, external} for document.xml.rels (not styles / numbering / hf) */
    this.media = [];         /* {name, data, ext} */
    this.absList = [];       /* numbering abstract definitions: {key, xml} */
    this.absByKey = {};
    this.nums = [];          /* {abs, lvl, start} */
    this.relN = 10;
    this.docPrN = 0;
    this.warned = {};
  }
  Builder.prototype.relId = function () { this.relN++; return 'rId' + this.relN; };
  Builder.prototype.addLink = function (url) {
    for (var i = 0; i < this.rels.length; i++) if (this.rels[i].external && this.rels[i].target === url) return this.rels[i].id;
    var id = this.relId();
    this.rels.push({ id: id, type: REL + 'hyperlink', target: url, external: true });
    return id;
  };
  Builder.prototype.addImage = function (bytes, ext) {
    var name = 'image' + (this.media.length + 1) + '.' + ext, id = this.relId();
    this.media.push({ name: name, data: bytes, ext: ext });
    this.rels.push({ id: id, type: REL + 'image', target: 'media/' + name });
    return { id: id, name: name };
  };
  /* A new w:num for one list. kind: bullet | decimal | lowerLetter | upperLetter | lowerRoman | upperRoman. */
  Builder.prototype.addList = function (kind, suffix, bulletKind, start, lvl) {
    var key = kind + '|' + suffix + '|' + bulletKind, ai = this.absByKey[key];
    if (ai == null) {
      ai = this.absList.length;
      this.absByKey[key] = ai;
      var lv = '', i;
      var BUL = { disc: '\u2022', circle: 'o', square: '\u25AA' };
      var bulOrder = ['disc', 'circle', 'square'];
      for (i = 0; i < 9; i++) {
        var left = 720 * (i + 1), text, fmt, suff = '', rpr = '';
        if (kind === 'bullet') {
          var bk = bulletKind || bulOrder[i % 3];
          fmt = 'bullet'; text = BUL[bk] || BUL.disc;
          rpr = '<w:rPr><w:rFonts w:ascii="' + (bk === 'circle' ? 'Courier New' : 'Times New Roman') + '" w:hAnsi="' + (bk === 'circle' ? 'Courier New' : 'Times New Roman') + '" w:cs="Times New Roman" w:hint="default"/></w:rPr>';
        } else {
          fmt = kind;
          text = '%' + (i + 1) + (suffix === 'none' ? '' : suffix);
          if (suffix === 'none') suff = '<w:suff w:val="space"/>';
        }
        lv += '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/>' + suff + '<w:lvlText w:val="' + esc(text) + '"/><w:lvlJc w:val="left"/>' +
          '<w:pPr><w:ind w:left="' + left + '" w:hanging="360"/></w:pPr>' + rpr + '</w:lvl>';
      }
      this.absList.push({ xml: '<w:abstractNum w:abstractNumId="' + ai + '"><w:multiLevelType w:val="hybridMultilevel"/>' + lv + '</w:abstractNum>' });
    }
    this.nums.push({ abs: ai, lvl: lvl, start: start });
    return this.nums.length;   /* numId, 1-based */
  };

  /* ------------------------------------------------ flows (a body or a table cell) */
  function Flow(availW) {
    this.items = [];       /* {kind:'p', ...} | {kind:'t', xml} */
    this.cur = null;
    this.pending = 0;      /* collapsed margin (twips) waiting for the next paragraph */
    this.pageBreak = false;
    this.availW = availW;
  }

  /* ------------------------------------------------ contexts */
  /* ctx: inherited text and paragraph state. */
  function rootCtx(b) {
    var d = b.o.defaults;
    return {
      rp: { font: d.font, sz: d.sizePt },
      jc: 'left', lh: { val: Math.round(d.lineHeight * 240), rule: 'auto' },
      indL: 0, indR: 0, first: 0, ws: 'pre-wrap',
      num: null, lvl: -1, listKind: null, style: null, shd: null, bdr: null, keepNext: false, link: null, listBase: 0
    };
  }

  /* Apply inline CSS (and legacy attributes) of el to a copy of the run properties. */
  function inlineRun(el, rp, b) {
    var r = clone(rp), s = el.style || {}, tag = el.tagName, v;
    switch (tag) {
      case 'B': case 'STRONG': r.b = true; break;
      case 'I': case 'EM': case 'CITE': case 'DFN': case 'VAR': case 'ADDRESS': r.i = true; break;
      case 'U': case 'INS': r.u = true; break;
      case 'S': case 'STRIKE': case 'DEL': r.strike = true; break;
      case 'SUB': r.vert = 'subscript'; break;
      case 'SUP': r.vert = 'superscript'; break;
      case 'CODE': case 'TT': case 'KBD': case 'SAMP': r.font = 'Courier New'; r.sz = rp.sz * 13 / 16; break;
      case 'MARK': r.shd = 'FFFF00'; break;
      case 'SMALL': r.sz = rp.sz / 1.2; break;
      case 'BIG': r.sz = rp.sz * 1.2; break;
      case 'FONT':
        if (el.getAttribute('face')) r.font = fontName(el.getAttribute('face')) || r.font;
        v = parseInt(el.getAttribute('size'), 10);
        if (v >= 1 && v <= 7) r.sz = FONT_TAG[v];
        else if (/^[+-]\d$/.test(el.getAttribute('size') || '')) r.sz = FONT_TAG[Math.max(1, Math.min(7, 3 + parseInt(el.getAttribute('size'), 10)))];
        if (colour(el.getAttribute('color'))) r.color = colour(el.getAttribute('color'));
        break;
      case 'A':
        break;
    }
    if (s.fontWeight) { v = String(s.fontWeight).toLowerCase(); r.b = v === 'bold' || v === 'bolder' || parseInt(v, 10) >= 600 ? true : (v === 'normal' || v === 'lighter' || parseInt(v, 10) < 600 ? false : r.b); }
    if (s.fontStyle) { v = String(s.fontStyle).toLowerCase(); r.i = v === 'italic' || v === 'oblique' ? true : (v === 'normal' ? false : r.i); }
    v = String(s.textDecorationLine || s.textDecoration || '').toLowerCase();
    if (v) {
      if (/none/.test(v)) { r.u = false; r.strike = false; }
      if (/underline/.test(v)) r.u = true;
      if (/line-through/.test(v)) r.strike = true;
    }
    if (s.verticalAlign) {
      v = String(s.verticalAlign).toLowerCase();
      if (v === 'super') r.vert = 'superscript'; else if (v === 'sub') r.vert = 'subscript'; else if (v === 'baseline') r.vert = null;
    }
    if (s.fontFamily) r.font = fontName(s.fontFamily) || r.font;
    if (s.fontSize) { v = sizePt(s.fontSize, rp.sz); if (v) r.sz = v; }
    if (s.color) { v = colour(s.color); if (v) r.color = v; }
    if (s.backgroundColor) { v = colour(s.backgroundColor); if (v) r.shd = v; }
    if (s.textTransform) { v = String(s.textTransform).toLowerCase(); r.caps = v === 'uppercase' ? true : (v === 'none' ? false : r.caps); }
    if (s.fontVariant) r.smallCaps = /small-caps/i.test(s.fontVariant);
    return r;
  }

  /* <w:rPr> in schema order. */
  function rprXml(r, d) {
    var x = '';
    if (r.style) x += '<w:rStyle w:val="' + r.style + '"/>';
    if (r.font && r.font !== d.font) { var f = esc(r.font); x += '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:eastAsia="' + f + '" w:cs="' + f + '"/>'; }
    if (r.b) x += '<w:b/><w:bCs/>';
    if (r.i) x += '<w:i/><w:iCs/>';
    if (r.caps) x += '<w:caps/>';
    if (r.smallCaps) x += '<w:smallCaps/>';
    if (r.strike) x += '<w:strike/>';
    if (r.color) x += '<w:color w:val="' + r.color + '"/>';
    if (r.sz && Math.abs(r.sz - d.sizePt) > 0.01) { var hp = Math.max(2, Math.min(3276, Math.round(r.sz * 2))); x += '<w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/>'; }
    if (r.u) x += '<w:u w:val="single"/>';
    if (r.shd) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + r.shd + '"/>';
    if (r.vert) x += '<w:vertAlign w:val="' + r.vert + '"/>';
    return x ? '<w:rPr>' + x + '</w:rPr>' : '';
  }

  /* ------------------------------------------------ the walker */
  function Gen(b) {
    this.b = b;
    this.d = b.o.defaults;
  }

  /* Plain text -> run XML pieces. ws: CSS white-space of the context. */
  Gen.prototype.textRuns = function (text, ctx) {
    var pre = /^(pre|pre-wrap|pre-line|break-spaces)$/.test(ctx.ws);
    text = text.replace(/\r\n?/g, '\n');
    if (!pre) text = text.replace(/[ \t\n\f]+/g, ' ');
    else if (ctx.ws === 'pre-line') text = text.replace(/[ \t]+/g, ' ');
    if (!text) return null;
    var rpr = rprXml(ctx.rp, this.d), inner = '', buf = '', i, ch;
    function flush() { if (buf) { inner += '<w:t xml:space="preserve">' + esc(buf) + '</w:t>'; buf = ''; } }
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (ch === '\n') { flush(); inner += '<w:br/>'; }
      else if (ch === '\t') { flush(); inner += '<w:tab/>'; }
      else buf += ch;
    }
    flush();
    var xml = '<w:r>' + rpr + inner + '</w:r>';
    if (ctx.link) xml = '<w:hyperlink r:id="' + ctx.link + '" w:history="1">' + xml + '</w:hyperlink>';
    return { xml: xml, text: /\S/.test(text) };
  };

  Gen.prototype.openCur = function (flow, ctx) {
    if (!flow.cur) flow.cur = { ctx: ctx, runs: [], hasText: false, brOnly: true };
    return flow.cur;
  };

  Gen.prototype.addRun = function (flow, ctx, run, isText) {
    var c = this.openCur(flow, ctx);
    c.runs.push(run);
    if (isText) c.hasText = true;
  };

  Gen.prototype.addBr = function (flow, ctx) {
    var c = this.openCur(flow, ctx);
    var x = '<w:r>' + rprXml(ctx.rp, this.d) + '<w:br/></w:r>';
    c.runs.push({ xml: x, br: true });
  };

  /* Close the open paragraph (if any) and put it in the flow. */
  Gen.prototype.closePara = function (flow) {
    var c = flow.cur;
    if (!c) return;
    flow.cur = null;
    var runs = c.runs;
    if (runs.length && runs[runs.length - 1].br) runs.pop();   /* a browser ignores a final <br> */
    var ctx = c.ctx, p = {
      kind: 'p', ctx: ctx, xml: runs.map(function (r) { return r.xml; }).join(''),
      empty: !runs.length, before: 0, after: 0, pageBreak: false, mark: ctx.rp
    };
    this.emit(flow, p);
  };

  /* Put a finished paragraph or table into the flow and settle the collapsed gap before it. */
  Gen.prototype.emit = function (flow, item) {
    var last = flow.items.length ? flow.items[flow.items.length - 1] : null;
    var gap = flow.pending;
    flow.pending = 0;
    if (flow.pageBreak) { item.pageBreak = true; flow.pageBreak = false; }
    if (item.kind === 'p' && item.ctx.num && !item.ctx.num.used) { item.numApplied = true; item.ctx.num.used = true; }
    if (last && last.kind === 'p') last.after = gap;
    else if (item.kind === 'p') item.before = gap;
    flow.items.push(item);
  };

  Gen.prototype.blockMargins = function (el, base, fontPt, availW) {
    var s = el.style || {}, m = { top: base.top, bottom: base.bottom, left: base.left, right: base.right };
    var self = this;
    function one(prop, key) {
      var v = s[prop];
      if (v != null && v !== '') {
        if (String(v).toLowerCase() === 'auto') { m[key] = 0; m.auto = true; return; }
        var pt = lenPt(v, fontPt, availW / 20);
        if (pt != null) m[key] = pt;
      }
    }
    one('marginTop', 'top'); one('marginBottom', 'bottom'); one('marginLeft', 'left'); one('marginRight', 'right');
    return m;
  };

  /* Walk the children of parent into flow. */
  Gen.prototype.children = function (parent, ctx, flow) {
    var kids = parent.childNodes, i, n, self = this;
    for (i = 0; i < kids.length; i++) {
      n = kids[i];
      if (n.nodeType === 3) this.textNode(n, ctx, flow);
      else if (n.nodeType === 1) this.element(n, ctx, flow);
    }
  };

  function isBlockEl(n) {
    if (!n || n.nodeType !== 1) return false;
    if (BLOCK.test(n.tagName)) return true;
    if (n.classList && n.classList.contains('dr-pagebreak')) return true;
    return !!(n.style && /^(block|list-item|table|flex)$/.test(n.style.display));
  }

  Gen.prototype.textNode = function (n, ctx, flow) {
    var t = n.nodeValue;
    if (!t) return;
    if (!/\S/.test(t)) {
      /* whitespace between blocks (pretty-printed HTML) is not text */
      var atStart = !flow.cur;
      var prev = n.previousSibling, next = n.nextSibling;
      if (atStart && (!prev || isBlockEl(prev) || !next || isBlockEl(next))) return;
      if (isBlockEl(next)) return;
      if (/^(pre|pre-wrap|pre-line|break-spaces)$/.test(ctx.ws) && atStart && t.indexOf('\n') !== -1 && (!next || isBlockEl(next))) return;
    }
    var r = this.textRuns(t, ctx);
    if (!r) return;
    this.addRun(flow, ctx, { xml: r.xml }, r.text);
  };

  /* The paragraph context captured when a paragraph is opened. */
  Gen.prototype.element = function (el, ctx, flow) {
    var tag = el.tagName, s = el.style || {}, v;
    if (SKIP.test(tag)) return;
    if (el.hasAttribute('hidden') || /^none$/i.test(s.display || '')) return;
    if (el.classList && (el.classList.contains(Draftly.config.markClass || 'np-mark') || el.classList.contains('dr-mark'))) return;

    if (el.classList && el.classList.contains('dr-pagebreak')) { this.closePara(flow); flow.pageBreak = true; return; }

    if (tag === 'BR') {
      var pbs = /always|page|left|right/i;
      if (pbs.test(s.pageBreakBefore || '') || pbs.test(s.breakBefore || '') || pbs.test(s.pageBreakAfter || '')) {
        if (flow.cur && flow.cur.runs.some(function (r) { return !r.br; })) {
          this.addRun(flow, ctx, { xml: '<w:r><w:br w:type="page"/></w:r>' }, false);
        } else { this.closePara(flow); flow.pageBreak = true; }
        return;
      }
      this.addBr(flow, ctx);
      return;
    }
    if (tag === 'IMG') { this.image(el, ctx, flow); return; }
    if (tag === 'HR') { this.rule(el, ctx, flow); return; }
    if (tag === 'TABLE') { this.table(el, ctx, flow); return; }
    if (isBlockEl(el)) { this.block(el, ctx, flow); return; }

    /* inline element */
    var c2 = clone(ctx);
    c2.rp = inlineRun(el, ctx.rp, this.b);
    if (s.whiteSpace) c2.ws = String(s.whiteSpace).toLowerCase();
    if (tag === 'A') {
      var href = (el.getAttribute('href') || '').trim();
      if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
        c2.link = this.b.addLink(href);
        var rp = clone(c2.rp);
        if (!rp.color) rp.color = '0563C1';
        if (!rp.u && !/none/i.test(s.textDecorationLine || s.textDecoration || '')) rp.u = true;
        c2.rp = rp;
      }
    }
    var pbA = /always|page/i.test(s.pageBreakBefore || '') || /always|page/i.test(s.breakBefore || '');
    if (pbA) { this.closePara(flow); flow.pageBreak = true; }
    this.children(el, c2, flow);
    if (/always|page/i.test(s.pageBreakAfter || '') || /always|page/i.test(s.breakAfter || '')) { this.closePara(flow); flow.pageBreak = true; }
  };

  /* ----- block elements */
  var H_SIZE = { H1: 2, H2: 1.5, H3: 1.17, H4: 1, H5: 0.83, H6: 0.67 };
  var H_MARGIN = { H1: 0.67, H2: 0.83, H3: 1, H4: 1.33, H5: 1.67, H6: 2.33 };

  Gen.prototype.block = function (el, ctx, flow) {
    var tag = el.tagName, s = el.style || {}, d = this.d, v;
    this.closePara(flow);
    var c2 = clone(ctx);
    var rp = inlineRun(el, ctx.rp, this.b);
    var fontPt = rp.sz, base = { top: 0, bottom: 0, left: 0, right: 0 };
    var isList = tag === 'UL' || tag === 'OL', isLi = tag === 'LI';

    if (/^H[1-6]$/.test(tag)) {
      var hsz = ctx.rp.sz * H_SIZE[tag];
      rp = clone(rp); if (!s.fontSize || !sizePt(s.fontSize, ctx.rp.sz)) rp.sz = hsz;
      if (!s.fontWeight) rp.b = true;
      fontPt = rp.sz;
      base.top = base.bottom = rp.sz * H_MARGIN[tag];
      c2.style = 'Heading' + tag.charAt(1);
      c2.keepNext = true;
    } else if (tag === 'P') { base.bottom = d.paraAfterPt; }
    else if (tag === 'BLOCKQUOTE') { base.top = base.bottom = fontPt; base.left = base.right = 30; }
    else if (tag === 'PRE') {
      rp = clone(rp); if (!s.fontFamily) rp.font = 'Courier New'; if (!s.fontSize) rp.sz = ctx.rp.sz * 13 / 16;
      fontPt = rp.sz; base.top = base.bottom = fontPt; c2.ws = 'pre';
    } else if (tag === 'FIGURE') { base.top = base.bottom = fontPt; base.left = base.right = 30; }
    else if (tag === 'DD') { base.left = 30; }
    else if (tag === 'CENTER') { c2.jc = 'center'; }
    else if (tag === 'ADDRESS') { /* italic via inlineRun */ }
    else if (isList) { base.top = base.bottom = ctx.lvl >= 0 ? 0 : fontPt; }

    c2.rp = rp;
    var m = this.blockMargins(el, base, fontPt, flow.availW);
    var padL = 0, padR = 0, pv;
    if (s.paddingLeft) { pv = lenPt(s.paddingLeft, fontPt, flow.availW / 20); if (pv != null) padL = pv; }
    if (s.paddingRight) { pv = lenPt(s.paddingRight, fontPt, flow.availW / 20); if (pv != null) padR = pv; }
    var availW = flow.availW;

    /* paragraph-level CSS */
    v = (el.getAttribute('align') || '').toLowerCase();
    if (v) c2.jc = jcOf(v, c2.jc);
    if (s.textAlign) c2.jc = jcOf(String(s.textAlign).toLowerCase(), c2.jc);
    if (s.lineHeight) c2.lh = lineHeight(s.lineHeight, c2.lh, fontPt);
    if (s.textIndent) { v = lenPt(s.textIndent, fontPt, availW / 20); if (v != null) c2.first = tw(v); }
    if (s.whiteSpace) c2.ws = String(s.whiteSpace).toLowerCase();
    if (s.backgroundColor && !isList) { v = colour(s.backgroundColor); if (v) c2.shd = v; }
    if (!isList && (s.borderLeftStyle || s.borderBottomStyle || s.borderTopStyle || s.borderRightStyle)) c2.bdr = pBorders(el) || c2.bdr;
    if (m.auto && !isList) { /* margin:auto -> centred block; paragraphs just keep their alignment */ }

    c2.indL = ctx.indL + tw(m.left + padL);
    c2.indR = ctx.indR + tw(m.right + padR);

    var pbBefore = /always|page/i.test(s.pageBreakBefore || '') || /always|page/i.test(s.breakBefore || '');
    var pbAfter = /always|page/i.test(s.pageBreakAfter || '') || /always|page/i.test(s.breakAfter || '');
    if (pbBefore) flow.pageBreak = true;
    flow.pending = Math.max(flow.pending, tw(m.top));

    if (isList) {
      var lvl = ctx.lvl + 1, kind, suffix = '.', bullet = null, start = 1;
      if (tag === 'OL') {
        var st = (el.getAttribute('data-style') || el.getAttribute('type') || '').trim();
        var lst = String(s.listStyleType || '').toLowerCase();
        kind = { '1': 'decimal', a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman' }[st] || 'decimal';
        if (!st && lst) kind = { 'lower-alpha': 'lowerLetter', 'lower-latin': 'lowerLetter', 'upper-alpha': 'upperLetter', 'upper-latin': 'upperLetter',
          'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman' }[lst] || 'decimal';
        suffix = el.getAttribute('data-suffix');
        suffix = suffix === 'none' ? 'none' : (suffix === ',' || suffix === ')' ? suffix : '.');
        start = parseInt(el.getAttribute('start'), 10); if (!isFinite(start) || start < 1) start = 1;
        if (lst === 'none') kind = null;
      } else {
        kind = 'bullet';
        v = String(s.listStyleType || el.getAttribute('type') || '').toLowerCase();
        if (v === 'circle' || v === 'square' || v === 'disc') bullet = v;
        if (v === 'none') kind = null;
      }
      c2.lvl = Math.min(lvl, 8);
      c2.num = null;
      c2.listKind = kind ? { numId: this.b.addList(kind, suffix, bullet, start, c2.lvl) } : { numId: 0 };
      c2.listKind.lvl = c2.lvl;
      c2.listKind.start = start;
      c2.listBase = c2.indL;   /* extra indent of the list itself (indent button), added to the numbering indent */
    }
    if (isLi) {
      var lk = ctx.listKind;
      if (lk && lk.numId) c2.num = { numId: lk.numId, lvl: lk.lvl, used: false };
      else c2.num = null;
      c2.liIndent = true;
    }
    /* children() opens paragraphs lazily with the ctx it is given (c2) */
    this.children(el, c2, flow);
    this.closePara(flow);

    if (isLi && c2.num && !c2.num.used && !el.querySelector('p,div,ul,ol,table,h1,h2,h3,h4,h5,h6,blockquote,pre')) {
      /* an empty bullet still shows its marker */
      var cc = clone(c2); flow.cur = { ctx: cc, runs: [], hasText: false };
      this.closePara(flow);
    }
    flow.pending = Math.max(flow.pending, tw(m.bottom));
    if (pbAfter) flow.pageBreak = true;
  };

  function jcOf(v, dflt) {
    if (v === 'center' || v === '-webkit-center') return 'center';
    if (v === 'right' || v === 'end' || v === '-webkit-right') return 'right';
    if (v === 'justify' || v === 'both') return 'both';
    if (v === 'left' || v === 'start' || v === '-webkit-left') return 'left';
    return dflt;
  }
  function lineHeight(v, dflt, fontPt) {
    v = String(v).trim().toLowerCase();
    if (v === 'normal') return { val: 276, rule: 'auto' };
    if (/^[\d.]+$/.test(v)) return { val: Math.round(parseFloat(v) * 240), rule: 'auto' };
    if (/%$/.test(v)) return { val: Math.round(parseFloat(v) * 2.4), rule: 'auto' };
    if (/em$/.test(v)) return { val: Math.round(parseFloat(v) * 240), rule: 'auto' };
    var pt = lenPt(v, fontPt, fontPt);
    return pt ? { val: tw(pt), rule: 'atLeast' } : dflt;
  }

  /* One border side from inline style: {sz, style, color} or null. */
  function sideOf(el, side) {
    var s = el.style || {}, S = side.charAt(0).toUpperCase() + side.slice(1);
    var st = String(s['border' + S + 'Style'] || '').toLowerCase();
    if (!st || st === 'none' || st === 'hidden') return null;
    var w = lenPt(s['border' + S + 'Width'] || '1px', 12, null);
    if (w == null) w = 0.75;
    if (/^thin$/i.test(s['border' + S + 'Width'])) w = 0.75; else if (/^medium$/i.test(s['border' + S + 'Width'])) w = 2.25; else if (/^thick$/i.test(s['border' + S + 'Width'])) w = 3.75;
    if (w <= 0) return null;
    var map = { dashed: 'dashed', dotted: 'dotted', double: 'double', groove: 'threeDEngrave', ridge: 'threeDEmboss', inset: 'inset', outset: 'outset' };
    return { sz: Math.max(2, Math.min(96, Math.round(w * 8))), val: map[st] || 'single', color: colour(s['border' + S + 'Color']) || 'auto' };
  }
  function borderXml(tagName, sd, space) {
    return '<w:' + tagName + ' w:val="' + sd.val + '" w:sz="' + sd.sz + '" w:space="' + (space || 0) + '" w:color="' + sd.color + '"/>';
  }
  function pBorders(el) {
    var out = '', t = sideOf(el, 'top'), l = sideOf(el, 'left'), bt = sideOf(el, 'bottom'), r = sideOf(el, 'right');
    if (t) out += borderXml('top', t, 1);
    if (l) out += borderXml('left', l, 4);
    if (bt) out += borderXml('bottom', bt, 1);
    if (r) out += borderXml('right', r, 4);
    return out ? '<w:pBdr>' + out + '</w:pBdr>' : null;
  }

  /* ----- horizontal rule */
  Gen.prototype.rule = function (el, ctx, flow) {
    this.closePara(flow);
    var c2 = clone(ctx), fontPt = ctx.rp.sz, m = this.blockMargins(el, { top: fontPt / 2, bottom: fontPt / 2, left: 0, right: 0 }, fontPt, flow.availW);
    flow.pending = Math.max(flow.pending, tw(m.top));
    var rp = clone(ctx.rp); rp.sz = 2; rp.b = false; rp.i = false;
    c2.rp = rp;
    c2.bdr = '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>';
    c2.lh = { val: 240, rule: 'auto' };
    c2.num = null; c2.style = null; c2.shd = null;
    flow.cur = { ctx: c2, runs: [], hasText: false };
    this.closePara(flow);
    flow.pending = Math.max(flow.pending, tw(m.bottom));
  };

  /* ----- image */
  Gen.prototype.image = function (el, ctx, flow) {
    var b = this.b, alt = el.getAttribute('alt') || '';
    var bytes = dataUrlBytes(el.getAttribute('src')), info = bytes && sniffImage(bytes);
    if (!info || !info.w || !info.h) {
      if (!b.warned.img) { b.warned.img = true; console.warn('draftly docx: an image could not be decoded (only data: PNG / JPEG / GIF / BMP); skipped'); }
      if (alt) { var r = this.textRuns('[' + alt + ']', ctx); if (r) this.addRun(flow, ctx, { xml: r.xml }, true); }
      return;
    }
    var s = el.style || {}, wPx = null, hPx = null, v;
    v = s.width || el.getAttribute('width'); if (v) { v = lenPt(String(v), ctx.rp.sz, flow.availW / 20); if (v != null) wPx = v / 0.75; }
    v = s.height || el.getAttribute('height'); if (v) { v = lenPt(String(v), ctx.rp.sz, null); if (v != null) hPx = v / 0.75; }
    if (wPx && !hPx) hPx = wPx * info.h / info.w;
    else if (hPx && !wPx) wPx = hPx * info.w / info.h;
    else if (!wPx && !hPx) { wPx = info.w; hPx = info.h; }
    var maxPx = Math.max(20, (flow.availW - ctx.indL - ctx.indR) / 15);   /* twips -> px */
    if (wPx > maxPx) { hPx = hPx * maxPx / wPx; wPx = maxPx; }
    var cx = Math.max(9525, Math.round(wPx * 9525)), cy = Math.max(9525, Math.round(hPx * 9525));
    var ref = b.addImage(bytes, info.ext), id = ++b.docPrN;
    var xml = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + esc(alt) + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="' + NS_PIC + '"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + ref.name + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + ref.id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    if (ctx.link) xml = '<w:hyperlink r:id="' + ctx.link + '" w:history="1">' + xml + '</w:hyperlink>';
    this.addRun(flow, ctx, { xml: xml }, true);
  };

  /* ----- table */
  Gen.prototype.table = function (tbl, ctx, flow) {
    this.closePara(flow);
    var s = tbl.style || {}, fontPt = ctx.rp.sz, self = this;
    var availW = flow.availW - ctx.indL - ctx.indR;
    var rowEls = [];
    (function collect(parent) {
      for (var n = parent.firstElementChild; n; n = n.nextElementSibling) {
        if (n.tagName === 'TR') rowEls.push(n);
        else if (/^(THEAD|TBODY|TFOOT)$/.test(n.tagName)) collect(n);
      }
    })(tbl);
    var capEl = tbl.querySelector(':scope > caption');
    if (!rowEls.length) {
      /* no rows: keep the text */
      if (capEl) this.block(capEl, ctx, flow);
      return;
    }
    /* grid pass: place every cell, handling colspan / rowspan */
    var rows = [], occ = [], ncols = 0, r, c, k;
    for (r = 0; r < rowEls.length; r++) {
      var tds = [], kids = rowEls[r].children;
      for (k = 0; k < kids.length; k++) if (kids[k].tagName === 'TD' || kids[k].tagName === 'TH') tds.push(kids[k]);
      var row = [];
      c = 0;
      var flushOcc = function () {
        while (occ[c] && occ[c].rem > 0) {
          if (occ[c].origin === c) row.push({ cont: true, col: c, span: occ[c].span, el: occ[c].el });
          occ[c].rem--;
          c++;
        }
      };
      for (k = 0; k < tds.length; k++) {
        flushOcc();
        var td = tds[k];
        var span = Math.max(1, Math.min(63, parseInt(td.getAttribute('colspan'), 10) || 1));
        var rs = parseInt(td.getAttribute('rowspan'), 10); if (!isFinite(rs) || rs < 1) rs = rs === 0 ? rowEls.length - r : 1;
        rs = Math.min(rs, rowEls.length - r);
        row.push({ el: td, col: c, span: span, rowspan: rs });
        if (rs > 1) for (var q = 0; q < span; q++) occ[c + q] = { rem: rs - 1, origin: c, span: span, el: td, first: q === 0 };
        c += span;
      }
      /* trailing phantom cells */
      while (c < occ.length) {
        if (occ[c] && occ[c].rem > 0) {
          if (occ[c].origin === c) row.push({ cont: true, col: c, span: occ[c].span, el: occ[c].el });
          occ[c].rem--;
        }
        c++;
      }
      ncols = Math.max(ncols, c);
      rows.push(row);
    }
    /* clear occupancy records of finished spans so they do not leak (rem hit 0) */
    /* table width and column widths */
    var tblW = availW, wv = s.width || tbl.getAttribute('width');
    if (wv) { var wp = lenPt(String(wv), fontPt, availW / 20); if (wp != null && wp > 0) tblW = Math.min(availW, tw(wp)); }
    var widths = [], known = 0, unknown = 0;
    for (c = 0; c < ncols; c++) widths[c] = null;
    rows[0].forEach(function (cell) {
      if (cell.cont || cell.span !== 1) return;
      var cw = cell.el.style && cell.el.style.width || cell.el.getAttribute('width');
      if (cw) { var pt = lenPt(String(cw), fontPt, tblW / 20); if (pt != null && pt > 0) widths[cell.col] = tw(pt); }
    });
    widths.forEach(function (w) { if (w) known += w; else unknown++; });
    if (unknown) {
      var rest = Math.max(tblW - known, unknown * 360), each = Math.floor(rest / unknown);
      widths = widths.map(function (w) { return w || each; });
    }
    var sum = widths.reduce(function (a, w) { return a + w; }, 0);
    if (sum !== tblW && sum > 0) {
      widths = widths.map(function (w) { return Math.max(180, Math.round(w * tblW / sum)); });
      sum = widths.reduce(function (a, w) { return a + w; }, 0);
      widths[ncols - 1] += tblW - sum;
    }
    tblW = widths.reduce(function (a, w) { return a + w; }, 0);

    var borderAttr = parseInt(tbl.getAttribute('border'), 10) || 0;
    var cellPadAttr = tbl.getAttribute('cellpadding');
    var shadeTbl = colour(s.backgroundColor || tbl.getAttribute('bgcolor'));
    var jc = '';
    if (/^(center|right)$/i.test(tbl.getAttribute('align') || '')) jc = tbl.getAttribute('align').toLowerCase();
    else if (s.marginLeft === 'auto' && s.marginRight === 'auto') jc = 'center';

    var x = '<w:tbl><w:tblPr><w:tblW w:w="' + tblW + '" w:type="dxa"/>' + (jc ? '<w:jc w:val="' + jc + '"/>' : '') +
      (ctx.indL && !jc ? '<w:tblInd w:w="' + ctx.indL + '" w:type="dxa"/>' : '') +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="' + (cellPadAttr != null ? tw(num(cellPadAttr, 1) * 0.75) : 108) + '" w:type="dxa"/><w:right w:w="' + (cellPadAttr != null ? tw(num(cellPadAttr, 1) * 0.75) : 108) + '" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>';
    widths.forEach(function (w) { x += '<w:gridCol w:w="' + w + '"/>'; });
    x += '</w:tblGrid>';

    var firstCellFlow = true;
    for (r = 0; r < rows.length; r++) {
      var trEl = rowEls[r], trStyle = trEl.style || {};
      x += '<w:tr><w:trPr><w:cantSplit/>' + (trEl.parentNode && trEl.parentNode.tagName === 'THEAD' ? '<w:tblHeader/>' : '') + '</w:trPr>';
      rows[r].forEach(function (cell) {
        var el = cell.el, cs = el.style || {}, wsum = 0, q;
        for (q = 0; q < cell.span; q++) wsum += widths[cell.col + q] || 0;
        var pr = '<w:tcW w:w="' + wsum + '" w:type="dxa"/>';
        if (cell.span > 1) pr += '<w:gridSpan w:val="' + cell.span + '"/>';
        if (cell.cont) { x += '<w:tc><w:tcPr>' + pr + '<w:vMerge/></w:tcPr><w:p/></w:tc>'; return; }
        if (cell.rowspan > 1) pr += '<w:vMerge w:val="restart"/>';
        /* borders: cell's own style, else the table's border attribute */
        var bx = '', sides = ['top', 'left', 'bottom', 'right'], tags = ['top', 'left', 'bottom', 'right'], any = false;
        sides.forEach(function (sd, i) {
          var sdv = sideOf(el, sd);
          if (sdv) { bx += borderXml(tags[i], sdv); any = true; }
        });
        if (!any && borderAttr > 0 && !(cs.borderStyle || cs.border || cs.borderTopStyle || cs.borderBottomStyle)) {
          var bsz = Math.max(2, Math.min(96, Math.round(borderAttr * 6)));
          tags.forEach(function (tg) { bx += '<w:' + tg + ' w:val="single" w:sz="' + bsz + '" w:space="0" w:color="auto"/>'; });
          any = true;
        }
        if (!any) tags.forEach(function (tg) { bx += '<w:' + tg + ' w:val="nil"/>'; });
        pr += '<w:tcBorders>' + bx + '</w:tcBorders>';
        var fill = colour(cs.backgroundColor || el.getAttribute('bgcolor')) || colour(trStyle.backgroundColor || trEl.getAttribute('bgcolor')) || shadeTbl;
        if (fill) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>';
        /* padding */
        var padSide = { top: cs.paddingTop, left: cs.paddingLeft, bottom: cs.paddingBottom, right: cs.paddingRight }, mar = '', pAny = false;
        ['top', 'left', 'bottom', 'right'].forEach(function (sd) {
          if (padSide[sd] != null && padSide[sd] !== '') {
            var pt = lenPt(padSide[sd], fontPt, null);
            if (pt != null) { mar += '<w:' + sd + ' w:w="' + tw(pt) + '" w:type="dxa"/>'; pAny = true; }
          }
        });
        if (pAny) pr += '<w:tcMar>' + mar + '</w:tcMar>';
        var va = String(cs.verticalAlign || el.getAttribute('valign') || trEl.getAttribute('valign') || '').toLowerCase();
        if (va === 'middle' || va === 'center') pr += '<w:vAlign w:val="center"/>';
        else if (va === 'bottom') pr += '<w:vAlign w:val="bottom"/>';
        /* content */
        var cellW = Math.max(360, wsum - 216);
        var cf = new Flow(cellW);
        if (firstCellFlow && flow.pageBreak) { cf.pageBreak = true; flow.pageBreak = false; }
        firstCellFlow = false;
        var cc = clone(ctx);
        cc.indL = 0; cc.indR = 0; cc.first = 0; cc.num = null; cc.lvl = -1; cc.listKind = null; cc.shd = null; cc.bdr = null; cc.style = null; cc.keepNext = false;
        if (el.tagName === 'TH') { cc.rp = clone(ctx.rp); if (!(cs.fontWeight)) cc.rp.b = true; cc.jc = 'center'; }
        var ah = String(el.getAttribute('align') || '').toLowerCase();
        if (ah) cc.jc = jcOf(ah, cc.jc);
        if (cs.textAlign) cc.jc = jcOf(String(cs.textAlign).toLowerCase(), cc.jc);
        cc.rp = inlineRun(el, cc.rp, self.b);
        if (cs.lineHeight) cc.lh = lineHeight(cs.lineHeight, cc.lh, cc.rp.sz);
        self.children(el, cc, cf);
        self.closePara(cf);
        x += '<w:tc><w:tcPr>' + pr + '</w:tcPr>' + self.flowXml(cf, true) + '</w:tc>';
      });
      x += '</w:tr>';
    }
    x += '</w:tbl>';
    this.emit(flow, { kind: 't', xml: x });
    flow.pending = Math.max(flow.pending, tw(3));   /* editor tables have a 4px margin */
    if (capEl) this.block(capEl, ctx, flow);
  };

  /* ------------------------------------------------ serialise a flow */
  Gen.prototype.paraXml = function (p) {
    var ctx = p.ctx, d = this.d, x = '';
    if (ctx.style) x += '<w:pStyle w:val="' + ctx.style + '"/>';
    if (ctx.keepNext && ctx.style) x += '<w:keepNext/>';
    if (p.pageBreak) x += '<w:pageBreakBefore/>';
    var num = p.numApplied ? ctx.num : null;
    if (num) x += '<w:numPr><w:ilvl w:val="' + num.lvl + '"/><w:numId w:val="' + num.numId + '"/></w:numPr>';
    if (ctx.bdr) x += ctx.bdr;
    if (ctx.shd) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + ctx.shd + '"/>';
    x += '<w:spacing w:before="' + Math.max(0, Math.round(p.before)) + '" w:after="' + Math.max(0, Math.round(p.after)) + '" w:line="' + ctx.lh.val + '" w:lineRule="' + ctx.lh.rule + '"/>';
    /* indents: inside a list the numbering level gives the base; the paragraph states the full value */
    var left = ctx.indL, hang = 0, first = ctx.first;
    if (ctx.lvl >= 0 && ctx.listKind) {
      left = 720 * (ctx.lvl + 1) + (ctx.listBase || 0);
      if (num) { hang = 360; first = 0; }
    }
    if (left || ctx.indR || first || hang) {
      var ind = '<w:ind w:left="' + Math.max(0, left) + '"';
      if (ctx.indR) ind += ' w:right="' + Math.max(0, ctx.indR) + '"';
      if (hang) ind += ' w:hanging="' + hang + '"';
      else if (first > 0) ind += ' w:firstLine="' + first + '"';
      else if (first < 0) ind += ' w:hanging="' + (-first) + '"';
      x += ind + '/>';
    }
    if (ctx.jc && ctx.jc !== 'left') x += '<w:jc w:val="' + ctx.jc + '"/>';
    if (ctx.style && /^Heading[1-6]$/.test(ctx.style)) x += '<w:outlineLvl w:val="' + (parseInt(ctx.style.charAt(7), 10) - 1) + '"/>';
    if (p.empty) {
      var mk = rprXml(p.mark, d);
      if (mk) x += mk;
    }
    return '<w:p><w:pPr>' + x + '</w:pPr>' + p.xml + '</w:p>';
  };

  /* inCell: a cell must end with a paragraph. */
  Gen.prototype.flowXml = function (flow, inCell) {
    this.closePara(flow);
    var items = flow.items, out = '', i, prev = null;
    if (items.length && items[items.length - 1].kind === 'p') items[items.length - 1].after = Math.max(items[items.length - 1].after, flow.pending);
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 't') {
        if (prev && prev.kind === 't') out += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
        out += it.xml;
      } else out += this.paraXml(it);
      prev = it;
    }
    if (!items.length || items[items.length - 1].kind === 't') {
      out += inCell ? '<w:p/>' : '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
    }
    return out;
  };

  /* ------------------------------------------------ parts */
  function stylesXml(d) {
    var f = esc(d.font), hp = Math.round(d.sizePt * 2);
    var heads = '';
    var sizes = [2, 1.5, 1.17, 1, 0.83, 0.67];
    for (var i = 0; i < 6; i++) {
      heads += '<w:style w:type="paragraph" w:styleId="Heading' + (i + 1) + '"><w:name w:val="heading ' + (i + 1) + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
        '<w:pPr><w:keepNext/><w:outlineLvl w:val="' + i + '"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="' + Math.round(d.sizePt * sizes[i] * 2) + '"/><w:szCs w:val="' + Math.round(d.sizePt * sizes[i] * 2) + '"/></w:rPr></w:style>';
    }
    return XMLDECL + '<w:styles xmlns:w="' + NS_W + '"><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:eastAsia="' + f + '" w:cs="' + f + '"/><w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="' + tw(d.paraAfterPt) + '" w:line="' + Math.round(d.lineHeight * 240) + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/></w:style>' +
      '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
      heads + '</w:styles>';
  }

  function numberingXml(b) {
    var x = XMLDECL + '<w:numbering xmlns:w="' + NS_W + '">';
    b.absList.forEach(function (a) { x += a.xml; });
    b.nums.forEach(function (n, i) {
      x += '<w:num w:numId="' + (i + 1) + '"><w:abstractNumId w:val="' + n.abs + '"/>';
      /* every list gets its own restart, otherwise a second <ol> would carry on counting from the first one */
      x += '<w:lvlOverride w:ilvl="' + n.lvl + '"><w:startOverride w:val="' + (n.start || 1) + '"/></w:lvlOverride>';
      x += '</w:num>';
    });
    return x + '</w:numbering>';
  }

  /* ------------------------------------------------ public */
  /* opts: {landscape, pageW, pageH (portrait twips), margins {top,right,bottom,left,header,footer},
            headerXml, footerXml, defaults {font, sizePt, lineHeight, paraAfterPt}} */
  function build(bodyHtml, opts) {
    if (typeof DOMParser === 'undefined') throw new Error('DOMParser missing');
    if (!Draftly.zip || !Draftly.zip.build) throw new Error('Draftly.zip missing');
    var doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + String(bodyHtml == null ? '' : bodyHtml) + '</body></html>', 'text/html');
    var b = new Builder(opts), g = new Gen(b);
    var pw = opts.landscape ? opts.pageH : opts.pageW, ph = opts.landscape ? opts.pageW : opts.pageH, m = opts.margins;
    var textW = Math.max(720, pw - m.left - m.right);
    var flow = new Flow(textW), ctx = rootCtx(b);
    g.children(doc.body, ctx, flow);
    var bodyXml = g.flowXml(flow, false);

    var hasH = !!opts.headerXml, hasF = !!opts.footerXml;
    var sect = '<w:sectPr>' + (hasH ? '<w:headerReference w:type="default" r:id="rId3"/>' : '') + (hasF ? '<w:footerReference w:type="default" r:id="rId4"/>' : '') +
      '<w:pgSz w:w="' + pw + '" w:h="' + ph + '"' + (opts.landscape ? ' w:orient="landscape"' : '') + '/>' +
      '<w:pgMar w:top="' + m.top + '" w:right="' + m.right + '" w:bottom="' + m.bottom + '" w:left="' + m.left + '" w:header="' + m.header + '" w:footer="' + m.footer + '" w:gutter="0"/></w:sectPr>';
    var docXml = XMLDECL + '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_R + '" xmlns:wp="' + NS_WP + '" xmlns:a="' + NS_A + '" xmlns:pic="' + NS_PIC + '"><w:body>' + bodyXml + sect + '</w:body></w:document>';

    var rels = '<Relationship Id="rId1" Type="' + REL + 'styles" Target="styles.xml"/><Relationship Id="rId2" Type="' + REL + 'numbering" Target="numbering.xml"/>';
    if (hasH) rels += '<Relationship Id="rId3" Type="' + REL + 'header" Target="header1.xml"/>';
    if (hasF) rels += '<Relationship Id="rId4" Type="' + REL + 'footer" Target="footer1.xml"/>';
    b.rels.forEach(function (r) {
      rels += '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + esc(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>';
    });
    var exts = {};
    b.media.forEach(function (mm) { exts[mm.ext] = true; });
    var ct = XMLDECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + MIME[e] + '"/>'; }).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      (hasH ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '') +
      (hasF ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
      '</Types>';

    var enc = new TextEncoder();
    var entries = [
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: 'word/document.xml', data: enc.encode(docXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml(opts.defaults)) },
      { name: 'word/numbering.xml', data: enc.encode(numberingXml(b)) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(XMLDECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>') }
    ];
    if (hasH) entries.push({ name: 'word/header1.xml', data: enc.encode(opts.headerXml) });
    if (hasF) entries.push({ name: 'word/footer1.xml', data: enc.encode(opts.footerXml) });
    b.media.forEach(function (mm) { entries.push({ name: 'word/media/' + mm.name, data: mm.data }); });
    var blob = Draftly.zip.build(entries);
    return new Blob([blob], { type: CT_DOCX });
  }

  return { build: build, colour: colour, sniffImage: sniffImage, lenPt: lenPt };
})();
