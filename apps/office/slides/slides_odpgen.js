/* Hub Office Presentation PN2 — ODP export (SLOdpgen). No DOM, safe to load in Node.
   build(deck) → { files, warnings }. Mirrors the input shape of SLPptx.build.
   Writes a 16:9 OpenDocument presentation (28cm × 15.75cm, same ratio as the
   960×540 canvas). Zip packing is left to SLZip (mimetype first, flags 0). */
(function (root) {
  'use strict';
  var W = 960, H = 540, PW = 28, PH = 15.75;
  var MIME = 'application/vnd.oasis.opendocument.presentation';
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8"?>';
  var OFFICE_NS =
    ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
    ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
    ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"' +
    ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
    ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
    ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ' xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"';
  var THEMES = {
    light:     { bg: '#ffffff', tc: '#111827', fg: '#1f2430' },
    dark:      { bg: '#16181d', tc: '#f3f4f6', fg: '#d1d5db' },
    ocean:     { bg: '#f0f9ff', tc: '#0c4a6e', fg: '#0f172a' },
    forest:    { bg: '#f4f7ef', tc: '#1a2e14', fg: '#243022' },
    sunset:    { bg: '#fff7ed', tc: '#7c2d12', fg: '#431407' },
    slate:     { bg: '#f4f5f7', tc: '#0f172a', fg: '#1e293b' },
    paper:     { bg: '#faf6ee', tc: '#1c1917', fg: '#292524' },
    midnight:  { bg: '#0b1220', tc: '#f8fafc', fg: '#e2e8f0' }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hex(c) {
    c = String(c || '').trim();
    if (!c || c === 'transparent' || c === 'none') return '';
    c = c.replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(c)) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    if (/^[0-9a-f]{8}$/.test(c)) c = c.slice(0, 6);
    return /^[0-9a-f]{6}$/.test(c) ? '#' + c : '';
  }
  function themeOf(id) { return THEMES[id] || THEMES.light; }
  function cmNum(n) {
    n = Math.round((+n || 0) * 10000) / 10000;
    var s = n.toFixed(4);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function cm(n) { return cmNum(n) + 'cm'; }
  function cmX(px) { return cm((+px || 0) * PW / W); }
  function cmY(px) { return cm((+px || 0) * PH / H); }
  function ptOf(px, fallback) {
    var n = +px || 0;
    if (!n) n = fallback || 18;
    return Math.round(n * 0.75 * 100) / 100;
  }
  function b64decode(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = (typeof atob === 'function' ? atob(s) : ''), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function mediaFromSrc(src) {
    var P = root.SLPptx;
    if (P && P.mediaFromSrc) return P.mediaFromSrc(src);
    var m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(src || ''));
    if (!m) return null;
    var ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    return { ext: ext, bytes: b64decode(m[2].replace(/\s+/g, '')) };
  }
  function layoutBoxes(lay) {
    var P = root.SLPptx;
    if (P && P.layoutBoxes) return P.layoutBoxes(lay);
    var padX = 64, padY = 44, iw = W - padX * 2;
    if (lay === 'blank') return {};
    if (lay === 'to') return { title: { x: padX, y: 200, w: iw, h: 140 } };
    if (lay === 'title') return { title: { x: padX, y: 170, w: iw, h: 110 }, body: { x: padX, y: 300, w: iw, h: 120 } };
    if (lay === 'sec') return { title: { x: padX, y: 190, w: iw, h: 90 }, body: { x: padX, y: 300, w: iw, h: 120 } };
    if (lay === 'two') return { title: { x: padX, y: padY, w: iw, h: 90 }, body: { x: padX, y: 150, w: 392, h: 330 }, body2: { x: 504, y: 150, w: 392, h: 330 } };
    if (lay === 'pic') return { title: { x: padX, y: padY, w: iw, h: 70 }, body: { x: padX, y: 400, w: iw, h: 80 } };
    return { title: { x: padX, y: padY, w: iw, h: 90 }, body: { x: padX, y: 150, w: iw, h: 330 } };
  }
  function hasDoc(doc) {
    var T = root.SLText;
    if (T && T.has) return T.has(doc);
    var i, j, p;
    for (i = 0; i < ((doc && doc.paragraphs) || []).length; i++) {
      p = doc.paragraphs[i];
      for (j = 0; j < (p.runs || []).length; j++) if (String(p.runs[j].text || '').replace(/\s+/g, '')) return true;
    }
    return false;
  }
  function cleanDoc(doc, defList) {
    var T = root.SLText;
    if (T && T.clean) return T.clean(doc, { list: defList || 'none' });
    return doc || { paragraphs: [{ runs: [{ text: '' }], list: defList || 'none', level: 0 }] };
  }

  function Styles() {
    this.parts = [];
    this.map = {};
    this.n = { dp: 0, gr: 0, P: 0, T: 0, L: 0 };
  }
  Styles.prototype.add = function (prefix, key, xmlFn) {
    if (this.map[key]) return this.map[key];
    var name = prefix + (++this.n[prefix]);
    this.map[key] = name;
    this.parts.push(xmlFn(name));
    return name;
  };
  Styles.prototype.xml = function () { return this.parts.join(''); };

  function pageStyle(st, bg, hide) {
    var color = hex(bg) || '#ffffff';
    var key = 'dp|' + color + '|' + (hide ? 1 : 0);
    return st.add('dp', key, function (name) {
      var vis = hide ? ' presentation:visibility="hidden"' : '';
      return '<style:style style:name="' + name + '" style:family="drawing-page">' +
        '<style:drawing-page-properties draw:fill="solid" draw:fill-color="' + color + '"' +
        ' presentation:background-visible="true" presentation:background-objects-visible="true"' + vis + '/>' +
        '</style:style>';
    });
  }
  function graphicStyle(st, o) {
    o = o || {};
    var fill = hex(o.fill);
    var stroke = hex(o.stroke || o.border);
    var sw = o.sw != null ? +o.sw : (stroke && o.border ? 1 : (o.sw || 0));
    if (stroke && !(sw > 0)) sw = 1;
    var key = 'gr|' + (fill || 'none') + '|' + (stroke || 'none') + '|' + (sw || 0);
    return st.add('gr', key, function (name) {
      var fp = fill ? ' draw:fill="solid" draw:fill-color="' + fill + '"' : ' draw:fill="none"';
      var sp;
      if (stroke && sw > 0) sp = ' draw:stroke="solid" svg:stroke-color="' + stroke + '" svg:stroke-width="' + cm(sw * PW / W) + '"';
      else sp = ' draw:stroke="none"';
      return '<style:style style:name="' + name + '" style:family="graphic">' +
        '<style:graphic-properties' + fp + sp + '/>' +
        '</style:style>';
    });
  }
  function paraStyle(st, align) {
    var a = align === 'center' ? 'center' : (align === 'right' ? 'end' : 'start');
    var key = 'P|' + a;
    return st.add('P', key, function (name) {
      return '<style:style style:name="' + name + '" style:family="paragraph">' +
        '<style:paragraph-properties fo:text-align="' + a + '"/>' +
        '</style:style>';
    });
  }
  function textStyle(st, r, defSize, defColor) {
    r = r || {};
    var size = r.size ? ptOf(r.size, defSize) : (defSize ? ptOf(defSize, 18) : 0);
    var color = hex(r.color || defColor);
    var key = 'T|' + (r.b ? 1 : 0) + (r.i ? 1 : 0) + (r.u ? 1 : 0) + (r.s ? 1 : 0) + '|' + (size || '') + '|' + (color || '');
    return st.add('T', key, function (name) {
      var props = '';
      if (r.b) props += ' fo:font-weight="bold"';
      if (r.i) props += ' fo:font-style="italic"';
      if (r.u) props += ' style:text-underline-style="solid"';
      if (r.s) props += ' style:text-line-through-style="solid"';
      if (size) props += ' fo:font-size="' + size + 'pt"';
      if (color) props += ' fo:color="' + color + '"';
      return '<style:style style:name="' + name + '" style:family="text">' +
        (props ? '<style:text-properties' + props + '/>' : '') +
        '</style:style>';
    });
  }
  function listStyle(st, kind) {
    kind = kind === 'number' ? 'number' : 'bullet';
    var key = 'L|' + kind;
    return st.add('L', key, function (name) {
      var levels = '', i;
      for (i = 1; i <= 9; i++) {
        var left = (i * 0.8).toFixed(2);
        var space = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">' +
          '<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + left + 'cm" fo:text-indent="-0.4cm" fo:margin-left="' + left + 'cm"/>' +
          '</style:list-level-properties>';
        if (kind === 'bullet') {
          levels += '<text:list-level-style-bullet text:level="' + i + '" text:bullet-char="•">' + space + '</text:list-level-style-bullet>';
        } else {
          levels += '<text:list-level-style-number text:level="' + i + '" style:num-format="1" style:num-suffix=".">' + space + '</text:list-level-style-number>';
        }
      }
      return '<text:list-style style:name="' + name + '">' + levels + '</text:list-style>';
    });
  }

  function textBits(t) {
    t = String(t == null ? '' : t).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var out = '', i = 0, n = t.length;
    while (i < n) {
      var ch = t.charAt(i);
      if (ch === '\n') { out += '<text:line-break/>'; i++; continue; }
      if (ch === '\t') { out += '<text:tab/>'; i++; continue; }
      if (ch === ' ') {
        var j = i;
        while (j < n && t.charAt(j) === ' ') j++;
        var cnt = j - i;
        if (cnt === 1) out += ' ';
        else out += '<text:s text:c="' + cnt + '"/>';
        i = j;
        continue;
      }
      var k = i + 1;
      while (k < n && t.charAt(k) !== '\n' && t.charAt(k) !== '\t' && t.charAt(k) !== ' ') k++;
      out += esc(t.slice(i, k));
      i = k;
    }
    return out;
  }
  function runXml(r, st, defSize, defColor) {
    r = r || {};
    var bits = textBits(r.text);
    if (!bits) return '';
    var name = textStyle(st, r, defSize, defColor);
    return '<text:span text:style-name="' + name + '">' + bits + '</text:span>';
  }
  function paraXml(p, st, defSize, defColor) {
    p = p || {};
    var name = paraStyle(st, p.align);
    var body = '', runs = p.runs && p.runs.length ? p.runs : [{ text: '' }], i;
    for (i = 0; i < runs.length; i++) body += runXml(runs[i], st, defSize, defColor);
    return '<text:p text:style-name="' + name + '">' + body + '</text:p>';
  }
  function listXml(items, kind, st, defSize, defColor, level) {
    var name = listStyle(st, kind);
    var xml = '<text:list text:style-name="' + name + '">', i = 0;
    while (i < items.length) {
      var p = items[i];
      var lvl = Math.max(0, p.level | 0);
      if (lvl < level) break;
      if (lvl > level) {
        var inner = [];
        while (i < items.length && (items[i].level | 0) > level) { inner.push(items[i]); i++; }
        xml += '<text:list-item>' + listXml(inner, kind, st, defSize, defColor, level + 1) + '</text:list-item>';
        continue;
      }
      i++;
      var nest = [];
      while (i < items.length && (items[i].level | 0) > level) { nest.push(items[i]); i++; }
      xml += '<text:list-item>' + paraXml(p, st, defSize, defColor) +
        (nest.length ? listXml(nest, kind, st, defSize, defColor, level + 1) : '') +
        '</text:list-item>';
    }
    return xml + '</text:list>';
  }
  function docXml(doc, st, defSize, defColor, defList) {
    doc = cleanDoc(doc, defList);
    var paras = (doc && doc.paragraphs) || [];
    if (!paras.length) return paraXml({ runs: [{ text: '' }], list: 'none' }, st, defSize, defColor);
    var out = '', i = 0;
    while (i < paras.length) {
      var p = paras[i];
      var list = p.list || defList || 'none';
      if (list === 'none') { out += paraXml(p, st, defSize, defColor); i++; continue; }
      var kind = list === 'number' ? 'number' : 'bullet';
      var items = [];
      while (i < paras.length && (paras[i].list || defList || 'none') === kind) { items.push(paras[i]); i++; }
      var start = items.length ? Math.max(0, items[0].level | 0) : 0;
      out += listXml(items, kind, st, defSize, defColor, start);
    }
    return out;
  }

  function boxAttrs(box) {
    return ' svg:x="' + cmX(box.x) + '" svg:y="' + cmY(box.y) +
      '" svg:width="' + cmX(Math.max(0, box.w)) + '" svg:height="' + cmY(Math.max(0, box.h)) + '"';
  }
  function frameXml(st, box, doc, style, cls, name) {
    style = style || {};
    var gs = graphicStyle(st, { fill: style.fill, border: style.border, stroke: style.stroke, sw: style.sw });
    var clsAttr = cls ? ' presentation:class="' + esc(cls) + '"' : '';
    var nm = name ? ' draw:name="' + esc(name) + '"' : '';
    return '<draw:frame draw:style-name="' + gs + '"' + nm + clsAttr + boxAttrs(box) + '>' +
      '<draw:text-box>' + docXml(doc, st, style.size || 18, style.color, style.list || 'none') + '</draw:text-box>' +
      '</draw:frame>';
  }
  function picXml(st, box, href) {
    var gs = graphicStyle(st, {});
    return '<draw:frame draw:style-name="' + gs + '" draw:name="Picture" svg:x="' + cmX(box.x) + '" svg:y="' + cmY(box.y) +
      '" svg:width="' + cmX(Math.max(0, box.w)) + '" svg:height="' + cmY(Math.max(0, box.h)) + '">' +
      '<draw:image xlink:href="' + esc(href) + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' +
      '</draw:frame>';
  }
  function tableXml(st, tb, defColor) {
    var rows = tb.rows || (tb.cells && tb.cells.length) || 1;
    var cols = tb.cols || (tb.cells && tb.cells[0] && tb.cells[0].length) || 1;
    var gs = graphicStyle(st, { fill: tb.fill, stroke: tb.border, sw: tb.border ? 1 : 0 });
    var h = '<draw:frame draw:style-name="' + gs + '" draw:name="Table"' + boxAttrs(tb) + '>';
    h += '<table:table>';
    if (cols) h += '<table:table-column table:number-columns-repeated="' + cols + '"/>';
    var r, c;
    for (r = 0; r < rows; r++) {
      h += '<table:table-row>';
      for (c = 0; c < cols; c++) {
        var cell = tb.cells && tb.cells[r] && tb.cells[r][c];
        h += '<table:table-cell>' + docXml(cell && cell.doc, st, 16, defColor, 'none') + '</table:table-cell>';
      }
      h += '</table:table-row>';
    }
    return h + '</table:table></draw:frame>';
  }
  function shapeXml(st, sh, defColor, warnings, n) {
    var kind = sh.kind || 'rect';
    if (kind === 'line' || kind === 'arrow') {
      var gs = graphicStyle(st, { fill: '', stroke: sh.stroke || '#111827', sw: sh.sw || 3 });
      var x1, y1, x2, y2;
      if (sh.flip) { x1 = sh.x; y1 = sh.y + sh.h; x2 = sh.x + sh.w; y2 = sh.y; }
      else { x1 = sh.x; y1 = sh.y; x2 = sh.x + sh.w; y2 = sh.y + sh.h; }
      var mark = kind === 'arrow' ? ' draw:marker-end="arrow"' : '';
      return '<draw:line draw:style-name="' + gs + '" draw:name="' + esc(kind) + '"' + mark +
        ' svg:x1="' + cmX(x1) + '" svg:y1="' + cmY(y1) + '" svg:x2="' + cmX(x2) + '" svg:y2="' + cmY(y2) + '"/>';
    }
    if (kind !== 'rect' && kind !== 'ellipse' && kind !== 'round' && kind !== 'square' && kind !== 'circle') {
      if (warnings) warnings.push('Slide ' + n + ': a ' + kind + ' was written as a rectangle.');
      kind = 'rect';
    }
    var gs2 = graphicStyle(st, { fill: sh.fill, stroke: sh.stroke, sw: sh.sw != null ? sh.sw : 1 });
    var inner = hasDoc(sh.doc) ? docXml(sh.doc, st, 18, defColor, 'none') : '';
    if (kind === 'ellipse' || kind === 'circle') {
      return '<draw:ellipse draw:style-name="' + gs2 + '" draw:name="ellipse"' + boxAttrs(sh) + '>' + inner + '</draw:ellipse>';
    }
    if (kind === 'round') {
      return '<draw:custom-shape draw:style-name="' + gs2 + '" draw:name="round"' + boxAttrs(sh) + '>' +
        inner + '<draw:enhanced-geometry draw:type="rounded-rectangle"/>' +
        '</draw:custom-shape>';
    }
    return '<draw:rect draw:style-name="' + gs2 + '" draw:name="rect"' + boxAttrs(sh) + '>' + inner + '</draw:rect>';
  }
  function notesXml(st, text) {
    text = String(text || '');
    if (!text.replace(/\s+/g, '')) return '';
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var doc = { paragraphs: lines.map(function (line) { return { runs: [{ text: line }], list: 'none', level: 0 }; }) };
    var gs = graphicStyle(st, {});
    return '<presentation:notes><draw:page draw:name="notes">' +
      '<draw:frame presentation:class="notes" draw:style-name="' + gs + '" svg:x="1cm" svg:y="1cm" svg:width="19cm" svg:height="12cm">' +
      '<draw:text-box>' + docXml(doc, st, 18, '#111827', 'none') + '</draw:text-box></draw:frame>' +
      '</draw:page></presentation:notes>';
  }

  function slideInner(s, i, deck, st, media, warnings) {
    var th = themeOf(deck.theme), T = root.SLText;
    var lay = s.layout || 'tc', boxes = layoutBoxes(lay);
    var n = i + 1, body = '';
    var defBodyList = (lay === 'title' || lay === 'sec' || lay === 'pic') ? 'none' : 'bullet';
    if (boxes.title && hasDoc(s.title)) {
      body += frameXml(st, boxes.title, s.title, { size: 44, color: th.tc, list: 'none' }, 'title', 'Title');
    }
    if (boxes.body && hasDoc(s.body)) {
      body += frameXml(st, boxes.body, s.body, { size: 28, color: th.fg, list: defBodyList }, 'outline', 'Content');
    }
    if (boxes.body2 && hasDoc(s.body2)) {
      body += frameXml(st, boxes.body2, s.body2, { size: 28, color: th.fg, list: 'bullet' }, '', 'Content 2');
    }
    var items = [];
    (s.pics || []).forEach(function (p) { items.push({ z: p.z || 0, kind: 'pic', obj: p }); });
    (s.texts || s.tboxes || []).forEach(function (t) { items.push({ z: t.z || 1, kind: 'tbox', obj: t }); });
    (s.shapes || []).forEach(function (sh) { items.push({ z: sh.z || 2, kind: 'shape', obj: sh }); });
    (s.tables || []).forEach(function (tb) { items.push({ z: tb.z || 3, kind: 'table', obj: tb }); });
    items.sort(function (a, b) { return a.z - b.z; });
    items.forEach(function (it) {
      var o = it.obj;
      if (it.kind === 'pic') {
        if (o && o._href) body += picXml(st, o, o._href);
        return;
      }
      if (it.kind === 'tbox') {
        body += frameXml(st, o, o.doc, { size: 18, color: th.fg, fill: o.fill, border: o.border, list: 'none' }, '', 'Text box');
        return;
      }
      if (it.kind === 'shape') {
        body += shapeXml(st, o, th.fg, warnings, n);
        return;
      }
      if (it.kind === 'table') body += tableXml(st, o, th.fg);
    });
    body += notesXml(st, s.notes);
    void T;
    return body;
  }

  function stylesXml() {
    return XMLDECL + '\n' +
      '<office:document-styles' + OFFICE_NS + ' office:version="1.2">' +
      '<office:automatic-styles>' +
      '<style:page-layout style:name="PM1">' +
      '<style:page-layout-properties fo:page-width="' + cmNum(PW) + 'cm" fo:page-height="' + cmNum(PH) + 'cm" style:print-orientation="landscape"/>' +
      '</style:page-layout>' +
      '</office:automatic-styles>' +
      '<office:master-styles>' +
      '<style:master-page style:name="Default" style:page-layout-name="PM1"/>' +
      '</office:master-styles>' +
      '</office:document-styles>';
  }
  function metaXml(deck) {
    return XMLDECL + '\n' +
      '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">' +
      '<office:meta><dc:title>' + esc(deck.name || 'Presentation') + '</dc:title>' +
      '<meta:generator>Hub Office Presentation PN2</meta:generator></office:meta></office:document-meta>';
  }
  function manifestXml(paths) {
    var body = '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="' + MIME + '"/>';
    var i, mime;
    for (i = 0; i < paths.length; i++) {
      mime = paths[i].mime || 'text/xml';
      body += '<manifest:file-entry manifest:full-path="' + esc(paths[i].path) + '" manifest:media-type="' + esc(mime) + '"/>';
    }
    return XMLDECL + '\n' +
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
      body + '</manifest:manifest>';
  }

  function build(deck, o) {
    o = o || {};
    deck = deck || {};
    var slides = deck.slides || [], warnings = [], st = new Styles();
    var media = [], mediaN = 0, i, s, pages = '';
    var th = themeOf(deck.theme);
    for (i = 0; i < slides.length; i++) {
      s = slides[i] || {};
      var n = i + 1;
      (s.pics || []).forEach(function (p) {
        var med = mediaFromSrc(p.src);
        if (!med) {
          if (p.src || p.key) warnings.push('Slide ' + n + ': a picture had no bitmap in memory and was skipped (export after pictures have loaded, or use Export .hop).');
          p._href = '';
          return;
        }
        if (med.ext === 'webp') {
          if (o.webpToPng && typeof o.webpToPng === 'function') {
            var conv = o.webpToPng(med.bytes);
            if (conv && conv.bytes) med = { ext: 'png', bytes: conv.bytes };
            else warnings.push('Slide ' + n + ': a WebP picture could not be converted and was stored as WebP (some apps may not open it).');
          } else {
            warnings.push('Slide ' + n + ': a WebP picture was stored as WebP (some apps may not open it).');
          }
        }
        mediaN++;
        var fname = 'Pictures/image' + mediaN + '.' + (med.ext === 'jpeg' ? 'jpeg' : med.ext);
        var mime = med.ext === 'jpeg' ? 'image/jpeg' : (med.ext === 'gif' ? 'image/gif' : (med.ext === 'webp' ? 'image/webp' : 'image/png'));
        media.push({ path: fname, data: med.bytes, mime: mime });
        p._href = fname;
      });
      var bg = hex(s.bg) || th.bg;
      var dp = pageStyle(st, bg, !!s.hide);
      pages += '<draw:page draw:name="page' + n + '" draw:style-name="' + dp + '" draw:master-page-name="Default">' +
        slideInner(s, i, deck, st, media, warnings) + '</draw:page>';
    }
    if (deck.sections && deck.sections.length) warnings.push('Named sections are not written into the LibreOffice file.');
    if (slides.some(function (sl) { return sl.trans && sl.trans !== 'none' && sl.trans !== ''; })) {
      warnings.push('Slide transitions are not written into the LibreOffice file.');
    }
    if (slides.some(function (sl) { return sl.ink && sl.ink.length; })) {
      warnings.push('Pen and laser ink is not written into the LibreOffice file.');
    }
    var content = XMLDECL + '\n' +
      '<office:document-content' + OFFICE_NS + ' office:version="1.2">' +
      '<office:automatic-styles>' + st.xml() + '</office:automatic-styles>' +
      '<office:body><office:presentation>' + pages + '</office:presentation></office:body>' +
      '</office:document-content>';
    var listed = [
      { path: 'META-INF/manifest.xml', mime: 'text/xml' },
      { path: 'content.xml', mime: 'text/xml' },
      { path: 'styles.xml', mime: 'text/xml' },
      { path: 'meta.xml', mime: 'text/xml' }
    ].concat(media.map(function (m) { return { path: m.path, mime: m.mime }; }));
    var files = {};
    files['mimetype'] = { data: MIME, flags: 0 };
    files['META-INF/manifest.xml'] = manifestXml(listed);
    files['content.xml'] = content;
    files['styles.xml'] = stylesXml();
    files['meta.xml'] = metaXml(deck);
    for (i = 0; i < media.length; i++) files[media[i].path] = media[i].data;
    /* drop temporary href stamps so the caller's deck is unchanged */
    slides.forEach(function (sl) {
      (sl.pics || []).forEach(function (p) { if (p && Object.prototype.hasOwnProperty.call(p, '_href')) delete p._href; });
    });
    return { files: files, warnings: warnings };
  }

  var API = {
    W: W, H: H, PW: PW, PH: PH, MIME: MIME, hex: hex, themeOf: themeOf,
    layoutBoxes: layoutBoxes, mediaFromSrc: mediaFromSrc, build: build
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLOdpgen = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
