/* ============================================================
   FILE: modules/draftly-docxread.js
   PROJECT: Draftly
   ROLE: DF6 .docx reader. Own small unzip (DecompressionStream
         'deflate-raw'; JSZip from shared/vendor when missing),
         then word/document.xml + styles, numbering, rels, media,
         header / footer -> Draftly editor HTML.
   MAPS: paragraphs, headings (Heading N / Title), b i u strike,
         size, colour, highlight, alignment (justify), indents
         (cm, like DF7), line spacing, bullet / numbered lists,
         tables (gridSpan / vMerge), images (via Draftly.image.load,
         1600px), page breaks, sectPr size / orientation / margins,
         header / footer text (left / centre / right by tabs).
         Anything else becomes plain text and is counted in notes.
   API:  Draftly.docxread.read(arrayBuffer) -> Promise<{
           html, page: { size, orient, margins } | null,
           hf: { head:[3], foot:[3] } | null, notes: [text] }>
   ============================================================ */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.docxread = (function () {
  'use strict';
  var R = { jszipUrl: '../../../shared/vendor/jszip.min.js', maxPart: 150 * 1024 * 1024 };
  function fail(m) { var e = new Error(m); e.userMessage = m; return e; }

  /* ------------------------------------------------ unzip */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function utf8(x) { return new TextDecoder('utf-8').decode(x).replace(/^\uFEFF/, ''); }
  function nativeOk() { try { new DecompressionStream('deflate-raw'); return true; } catch (e) { return false; } }
  function zipNative(buf) {
    var b = new Uint8Array(buf), i = b.length - 22, min = Math.max(0, i - 65535), dir = {};
    for (; i >= min; i--) if (u32(b, i) === 0x06054b50) break;
    if (i < min) throw fail('This is not a valid .docx file');
    var n = u16(b, i + 10), p = u32(b, i + 16), k;
    for (k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) throw fail('This .docx file is damaged');
      var nl = u16(b, p + 28);
      dir[utf8(b.subarray(p + 46, p + 46 + nl))] = { flags: u16(b, p + 8), method: u16(b, p + 10), csize: u32(b, p + 20), usize: u32(b, p + 24), off: u32(b, p + 42) };
      p += 46 + nl + u16(b, p + 30) + u16(b, p + 32);
    }
    function bytes(name) {
      var e = dir[name];
      if (!e) return Promise.resolve(null);
      if (e.flags & 1) return Promise.reject(fail('This .docx is password protected'));
      if (e.usize > R.maxPart) return Promise.reject(fail('Part too large: ' + name));
      var s = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28), d = b.subarray(s, s + e.csize);
      if (e.method === 0) return Promise.resolve(d);
      if (e.method !== 8) return Promise.reject(fail('Unsupported zip compression'));
      var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
      w.write(d).catch(function () {}); w.close().catch(function () {});
      return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return { bytes: bytes, text: function (nm) { return bytes(nm).then(function (x) { return x ? utf8(x) : null; }); } };
  }
  function zipJs(buf) {
    var load = window.JSZip ? Promise.resolve(window.JSZip) : new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = R.jszipUrl;
      s.onload = function () { window.JSZip ? res(window.JSZip) : rej(fail('Could not load the zip library')); };
      s.onerror = function () { rej(fail('Could not load the zip library')); };
      document.head.appendChild(s);
    });
    return load.then(function (J) { return J.loadAsync(buf); }).then(function (z) {
      function f(n, t) { var x = z.file(n); return x ? x.async(t) : Promise.resolve(null); }
      return { bytes: function (n) { return f(n, 'uint8array'); }, text: function (n) { return f(n, 'string'); } };
    });
  }

  /* ------------------------------------------------ xml helpers */
  function xml(t) {
    if (!t) return null;
    var d = new DOMParser().parseFromString(t, 'application/xml');
    return d.getElementsByTagName('parsererror').length ? null : d.documentElement;
  }
  function kids(el, nm) { var o = [], c = el && el.firstElementChild; for (; c; c = c.nextElementSibling) if (!nm || c.localName === nm) o.push(c); return o; }
  function first(el, nm) { var c = el && el.firstElementChild; for (; c; c = c.nextElementSibling) if (c.localName === nm) return c; return null; }
  function deep(el, nm) { if (!el) return null; var l = el.getElementsByTagNameNS('*', nm); return l.length ? l[0] : null; }
  function att(el, nm) {
    if (!el) return null;
    for (var i = 0; i < el.attributes.length; i++) if (el.attributes[i].localName === nm) return el.attributes[i].value;
    return null;
  }
  function on(el) { if (!el) return false; var v = att(el, 'val'); return v === null || !/^(0|false|off|none)$/.test(v); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cm(tw) { return Math.round(parseInt(tw, 10) / 567 * 100) / 100; }
  var HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff' };

  /* ------------------------------------------------ styles / numbering */
  function readStyles(root) {
    var map = {};
    kids(root, 'style').forEach(function (s) {
      var id = att(s, 'styleId'), nm = (att(first(s, 'name'), 'val') || '').toLowerCase();
      var m = /^heading ?([1-6])$/.exec(nm), h = m ? +m[1] : (nm === 'title' ? 1 : (nm === 'subtitle' ? 2 : 0));
      map[id] = { h: h, pPr: first(s, 'pPr'), rPr: first(s, 'rPr'), base: att(first(s, 'basedOn'), 'val') };
    });
    return map;
  }
  function readNumbering(root) {
    var abs = {}, num = {};
    kids(root, 'abstractNum').forEach(function (a) {
      var lv = {};
      kids(a, 'lvl').forEach(function (l) { lv[att(l, 'ilvl')] = att(first(l, 'numFmt'), 'val') || 'decimal'; });
      abs[att(a, 'abstractNumId')] = lv;
    });
    kids(root, 'num').forEach(function (n) { num[att(n, 'numId')] = abs[att(first(n, 'abstractNumId'), 'val')] || {}; });
    return num;
  }

  /* ------------------------------------------------ converter */
  function Ctx(zip, rels, styles, nums, notes) {
    this.zip = zip; this.rels = rels; this.styles = styles; this.nums = nums; this.notes = notes; this.jobs = [];
  }
  Ctx.prototype.note = function (t) { if (this.notes.indexOf(t) === -1) this.notes.push(t); };
  Ctx.prototype.chain = function (id, key) {   /* style chain, nearest first */
    var out = [], g = 0;
    while (id && this.styles[id] && g++ < 10) { if (this.styles[id][key]) out.push(this.styles[id][key]); id = this.styles[id].base; }
    return out;
  };

  function runCss(list) {   /* list of rPr, nearest first */
    var o = {};
    for (var i = list.length - 1; i >= 0; i--) {
      var r = list[i];
      kids(r).forEach(function (c) {
        var n = c.localName;
        if (n === 'b') o.b = on(c); else if (n === 'i') o.i = on(c);
        else if (n === 'u') o.u = att(c, 'val') !== 'none';
        else if (n === 'strike' || n === 'dstrike') o.s = on(c);
        else if (n === 'sz') o.sz = parseInt(att(c, 'val'), 10) / 2;
        else if (n === 'color') { var v = att(c, 'val'); o.color = v && v !== 'auto' ? '#' + v : null; }
        else if (n === 'highlight') o.bg = HL[att(c, 'val')] || null;
        else if (n === 'shd') { var f = att(c, 'fill'); if (f && f !== 'auto' && !/^f{6}$/i.test(f)) o.bg = '#' + f; }
        else if (n === 'vertAlign') o.va = att(c, 'val');
        else if (n === 'rFonts') o.font = att(c, 'ascii') || o.font;
      });
    }
    return o;
  }
  function wrapRun(html, o, isHead) {
    if (!html) return '';
    var st = '';
    if (o.sz && !isHead) st += 'font-size:' + o.sz + 'pt;';
    if (o.color && o.color !== '#000000') st += 'color:' + o.color + ';';
    if (o.bg) st += 'background-color:' + o.bg + ';';
    if (o.font && !/^(Calibri|Times New Roman|Arial)$/.test(o.font)) st += 'font-family:\'' + o.font.replace(/'/g, '') + '\';';
    if (st) html = '<span style="' + st + '">' + html + '</span>';
    if (o.va === 'superscript') html = '<sup>' + html + '</sup>'; else if (o.va === 'subscript') html = '<sub>' + html + '</sub>';
    if (o.s) html = '<s>' + html + '</s>';
    if (o.u) html = '<u>' + html + '</u>';
    if (o.i) html = '<i>' + html + '</i>';
    if (o.b && !isHead) html = '<b>' + html + '</b>';
    return html;
  }

  /* Paragraph -> array of block HTML strings (a page break splits it). */
  Ctx.prototype.para = function (p) {
    var me = this, pPr = first(p, 'pPr'), sid = att(first(pPr, 'pStyle'), 'val');
    var st = this.styles[sid] || {}, head = st.h || 0;
    var ppl = (pPr ? [pPr] : []).concat(this.chain(sid, 'pPr'));
    var prl = this.chain(sid, 'rPr'), parts = [''], breakBefore = false;
    function pp(nm) { for (var i = 0; i < ppl.length; i++) { var x = first(ppl[i], nm); if (x) return x; } return null; }
    function walk(el) {
      kids(el).forEach(function (c) {
        var n = c.localName;
        if (n === 'r') me.run(c, prl, head, parts);
        else if (n === 'hyperlink' || n === 'smartTag' || n === 'ins' || n === 'fldSimple' || n === 'sdt' || n === 'sdtContent' || n === 'customXml') walk(c);
        else if (n === 'del' || n === 'pPr' || n === 'bookmarkStart' || n === 'bookmarkEnd' || n === 'proofErr' || n === 'commentRangeStart' || n === 'commentRangeEnd') { /* skip */ }
        else if (n === 'oMath' || n === 'oMathPara') { me.note('equations became plain text'); parts[parts.length - 1] += esc(c.textContent); }
      });
    }
    walk(p);
    if (on(pp('pageBreakBefore'))) breakBefore = true;
    var css = '', jc = att(pp('jc'), 'val'), ind = pp('ind'), sp = pp('spacing');
    if (jc === 'center') css += 'text-align:center;'; else if (jc === 'right' || jc === 'end') css += 'text-align:right;';
    else if (jc === 'both' || jc === 'distribute') css += 'text-align:justify;';
    var num = first(pPr, 'numPr'), list = null;
    if (!num) { for (var q = 0; q < ppl.length && !num; q++) num = first(ppl[q], 'numPr'); }
    if (num) {
      var nid = att(first(num, 'numId'), 'val'), lvl = parseInt(att(first(num, 'ilvl'), 'val') || '0', 10);
      if (nid && nid !== '0') { var f = (this.nums[nid] || {})[lvl] || 'bullet'; list = { lvl: lvl, ordered: f !== 'bullet' && f !== 'none' }; }
    }
    if (ind && !list) {
      var l = att(ind, 'left') || att(ind, 'start'), r = att(ind, 'right') || att(ind, 'end'), fl = att(ind, 'firstLine'), hg = att(ind, 'hanging');
      if (l && +l) css += 'margin-left:' + cm(l) + 'cm;';
      if (r && +r) css += 'margin-right:' + cm(r) + 'cm;';
      if (hg && +hg) css += 'text-indent:-' + cm(hg) + 'cm;'; else if (fl && +fl) css += 'text-indent:' + cm(fl) + 'cm;';
    }
    if (sp) {
      var ln = att(sp, 'line'), rule = att(sp, 'lineRule');
      if (ln && (!rule || rule === 'auto')) { var v = Math.round(+ln / 240 * 100) / 100; if (v && v !== 1) css += 'line-height:' + v + ';'; }
      else if (ln && +ln) css += 'line-height:' + Math.round(+ln / 20) + 'pt;';
    }
    var tag = head ? 'h' + head : 'p', out = [];
    if (breakBefore) out.push({ br: true });
    parts.forEach(function (h, i) {
      if (i > 0) out.push({ br: true });
      if (i > 0 && !h) return;
      var bits = h.split(/(\u0001IMG\d+\u0001)/), text = bits.filter(function (x, k) { return !(k % 2) && x; });
      bits.forEach(function (x, k) {
        if (k % 2) { out.push({ html: x }); return; }
        if (!x && (text.length || bits.length > 1)) return;
        out.push({ html: '<' + tag + (css ? ' style="' + css + '"' : '') + '>' + (x || '<br>') + '</' + tag + '>', inner: x || '<br>', list: i === 0 && k === 0 ? list : null });
      });
    });
    return out;
  };

  Ctx.prototype.run = function (r, prl, head, parts) {
    var me = this, o = runCss([first(r, 'rPr')].filter(Boolean).concat(prl)), buf = '';
    function flush() { if (buf) { parts[parts.length - 1] += wrapRun(buf, o, head); buf = ''; } }
    kids(r).forEach(function (c) {
      var n = c.localName;
      if (n === 't') buf += esc(c.textContent).replace(/ {2}/g, ' &nbsp;');
      else if (n === 'tab') buf += '&emsp;';
      else if (n === 'br' || n === 'cr') {
        if (att(c, 'type') === 'page') { flush(); parts.push(''); } else buf += '<br>';
      } else if (n === 'noBreakHyphen') buf += '-';
      else if (n === 'sym') buf += '?';
      else if (n === 'drawing' || n === 'pict' || n === 'object') { flush(); parts[parts.length - 1] += me.image(c); }
      else if (n === 'fldChar' || n === 'instrText' || n === 'rPr' || n === 'lastRenderedPageBreak' || n === 'footnoteReference' || n === 'commentReference') {
        if (n === 'footnoteReference') me.note('footnotes were left out');
      }
    });
    flush();
  };

  Ctx.prototype.image = function (el) {
    var blip = deep(el, 'blip'), id = blip ? att(blip, 'embed') : null;
    if (!id) { var im = deep(el, 'imagedata'); id = im ? att(im, 'id') : null; }
    var target = id && this.rels[id];
    if (!target) { this.note('some drawings or shapes were left out'); return esc(el.textContent || ''); }
    var ext = deep(el, 'extent'), cx = ext ? parseInt(att(ext, 'cx'), 10) : 0;
    var contentCm = (Draftly.config.paperWidthCm || 21) - (Draftly.config.marginLeftCm || 2) - (Draftly.config.marginRightCm || 2);
    var pct = cx ? Math.max(5, Math.min(100, Math.round(cx / 360000 / contentCm * 100))) : 100;
    var key = '\u0001IMG' + this.jobs.length + '\u0001';
    this.jobs.push({ key: key, path: target, pct: pct });
    return key;
  };

  Ctx.prototype.table = function (tbl) {
    var me = this, rows = kids(tbl, 'tr'), grid = [], html = '';
    rows.forEach(function (tr, ri) {
      var col = 0, cells = [];
      kids(tr, 'tc').forEach(function (tc) {
        var pr = first(tc, 'tcPr'), span = parseInt(att(first(pr, 'gridSpan'), 'val') || '1', 10), vm = first(pr, 'vMerge');
        var cell = { tc: tc, col: col, span: span, rows: 1, skip: false };
        if (vm && att(vm, 'val') !== 'restart') {
          for (var up = ri - 1; up >= 0; up--) {
            var hit = grid[up].filter(function (c) { return c.col === col && !c.skip; })[0];
            if (hit) { hit.rows++; break; }
          }
          cell.skip = true;
        }
        cells.push(cell); col += span;
      });
      grid.push(cells);
    });
    /* DF10: column widths (gridCol), table width (tblW dxa vs text width), row heights */
    var gcols = kids(first(tbl, 'tblGrid'), 'gridCol').map(function (g) { return parseInt(att(g, 'w'), 10) || 0; });
    var gsum = gcols.reduce(function (a, w) { return a + w; }, 0), pct = gsum ? gcols.map(function (w) { return w / gsum * 100; }) : null;
    var tStyle = Draftly.table.TBL, cfg = Draftly.config || {}, textCm = (cfg.paperWidthCm || 21) - (cfg.marginLeftCm || 2) - (cfg.marginRightCm || 2);
    var tw0 = first(first(tbl, 'tblPr'), 'tblW');
    if (tw0 && att(tw0, 'type') === 'dxa' && textCm > 0) { var tp = Math.min(100, parseInt(att(tw0, 'w'), 10) / 567 / textCm * 100); if (tp > 5 && tp < 99.5) tStyle = tStyle.replace('width:100%', 'width:' + tp.toFixed(2) + '%'); }
    grid.forEach(function (cells, ri) {
      var th = deep(first(rows[ri], 'trPr'), 'trHeight'), hv = th ? parseInt(att(th, 'val'), 10) : 0;
      html += hv ? '<tr style="height:' + Math.round(hv / 15) + 'px">' : '<tr>';
      cells.forEach(function (c) {
        if (c.skip) return;
        var body = me.body(c.tc, true) || '<br>';
        html += '<td style="' + Draftly.table.TD + (pct && c.span === 1 && pct[c.col] != null ? 'width:' + pct[c.col].toFixed(2) + '%;' : '') + '"' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (c.rows > 1 ? ' rowspan="' + c.rows + '"' : '') + '>' + body + '</td>';
      });
      html += '</tr>';
    });
    return '<table style="' + tStyle + '"><tbody>' + html + '</tbody></table>';
  };

  /* Block container (body, cell, header) -> HTML. inCell: plain lines, no page breaks. */
  Ctx.prototype.body = function (el, inCell) {
    var me = this, out = [], stack = [];
    function closeTo(n) { while (stack.length > n) out.push('</li></' + stack.pop() + '>'); }
    function add(b) {
      if (b.br) { closeTo(0); if (!inCell) out.push('<div class="dr-pagebreak" contenteditable="false" data-label="Page break"></div>'); else me.note('page breaks in tables were dropped'); return; }
      if (b.list) {
        var want = b.list.lvl + 1, tag = b.list.ordered ? 'ol' : 'ul';
        if (stack.length > want) closeTo(want);
        if (stack.length === want && stack[want - 1] !== tag) closeTo(want - 1);
        if (stack.length === want) out.push('</li><li>');
        while (stack.length < want) { stack.push(tag); out.push('<' + tag + '><li>'); }
        out.push(b.inner);
        return;
      }
      closeTo(0); out.push(b.html);
    }
    function walk(node) {
      kids(node).forEach(function (c) {
        var n = c.localName;
        if (n === 'p') me.para(c).forEach(add);
        else if (n === 'tbl') { closeTo(0); out.push(me.table(c)); if (!inCell) out.push('<p><br></p>'); }
        else if (n === 'sdt' || n === 'sdtContent' || n === 'customXml' || n === 'ins') walk(c);
        else if (n === 'sectPr' || n === 'tcPr' || n === 'bookmarkStart' || n === 'bookmarkEnd' || n === 'del' || n === 'proofErr') { /* skip */ }
        else if (c.textContent.trim()) { closeTo(0); me.note('some content became plain text'); out.push('<p>' + esc(c.textContent) + '</p>'); }
      });
    }
    walk(el);
    closeTo(0);
    return out.join('');
  };

  /* Header / footer XML -> three slots (left / centre / right). */
  function hfSlots(root) {
    if (!root) return ['', '', ''];
    var lines = kids(root, 'p').map(function (p) {
      var s = '', inFld = false, code = '';
      Array.prototype.forEach.call(p.getElementsByTagNameNS('*', '*'), function (c) {
        var n = c.localName;
        if (n === 'fldSimple') { s += /PAGE\b/.test(att(c, 'instr') || '') && !/NUMPAGES/.test(att(c, 'instr')) ? '{page}' : /NUMPAGES/.test(att(c, 'instr') || '') ? '{pages}' : ''; }
        else if (n === 'fldChar') { var t = att(c, 'fldCharType'); if (t === 'begin') { inFld = true; code = ''; } else if (t === 'separate' || t === 'end') { if (inFld) s += /NUMPAGES/.test(code) ? '{pages}' : /PAGE/.test(code) ? '{page}' : ''; inFld = false; code = '\u0002'; } }
        else if (n === 'instrText') code += c.textContent;
        else if (n === 't' && !inFld && code !== '\u0002' && !(c.parentNode && c.parentNode.parentNode && c.parentNode.parentNode.localName === 'fldSimple')) s += c.textContent;
        else if (n === 't' && code === '\u0002') { /* cached field result: skip */ }
        else if (n === 'tab') s += '\t';
        if (n === 'fldChar' && att(c, 'fldCharType') === 'end') code = '';
      });
      var jc = att(deep(p, 'jc'), 'val');
      return { s: s, jc: jc };
    }).filter(function (l) { return l.s.trim(); });
    var slots = ['', '', ''];
    lines.forEach(function (l) {
      var bits = l.s.split('\t').map(function (x) { return x.trim(); });
      if (bits.length >= 3) { slots[0] += bits[0]; slots[1] += bits[1]; slots[2] += bits.slice(2).join(' '); }
      else if (bits.length === 2) { slots[0] += bits[0]; slots[2] += bits[1]; }
      else { var k = l.jc === 'center' ? 1 : (l.jc === 'right' || l.jc === 'end') ? 2 : 0; slots[k] += (slots[k] ? ' ' : '') + bits[0]; }
    });
    return slots;
  }

  function readRels(root) {
    var m = {};
    kids(root, 'Relationship').forEach(function (r) {
      var t = att(r, 'Target') || '';
      if (att(r, 'TargetMode') === 'External') return;
      m[att(r, 'Id')] = t.charAt(0) === '/' ? t.slice(1) : 'word/' + t.replace(/^\.\//, '');
    });
    return m;
  }
  function pageOf(sect) {
    if (!sect) return null;
    var sz = first(sect, 'pgSz'), mar = first(sect, 'pgMar'), out = { size: 'A4', orient: 'portrait', margins: null };
    if (sz) {
      var w = +att(sz, 'w'), h = +att(sz, 'h');
      if (att(sz, 'orient') === 'landscape' || w > h) { out.orient = 'landscape'; var t = w; w = h; h = t; }
      out.size = Math.abs(h - 20160) < Math.abs(h - 16838) ? 'Legal' : 'A4';
      out.odd = Math.abs(h - 20160) > 300 && Math.abs(h - 16838) > 300;
    }
    if (mar) out.margins = { top: cm(att(mar, 'top') || 1134), bottom: cm(att(mar, 'bottom') || 1134), left: cm(att(mar, 'left') || 1134), right: cm(att(mar, 'right') || 1134) };
    return out;
  }
  var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

  /* ------------------------------------------------ entry */
  R.read = function read(buf) {
    var b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (!(b[0] === 0x50 && b[1] === 0x4B)) return Promise.reject(fail(b[0] === 0xD0 ? 'Old .doc files are not supported, only .docx' : 'This is not a .docx file'));
    var zip, notes = [];
    return (nativeOk() ? Promise.resolve().then(function () { return zipNative(buf); }) : zipJs(buf)).then(function (z) {
      zip = z;
      return Promise.all(['word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels'].map(function (n) { return z.text(n); }));
    }).then(function (t) {
      var doc = xml(t[0]);
      if (!doc) throw fail('This .docx has no readable document text');
      var rels = readRels(xml(t[3])), ctx = new Ctx(zip, rels, readStyles(xml(t[1])), readNumbering(xml(t[2])), notes);
      var body = first(doc, 'body') || doc, sect = first(body, 'sectPr');
      var html = ctx.body(body, false), page = pageOf(sect);
      if (kids(body, 'sectPr').length === 0 && body.getElementsByTagNameNS('*', 'sectPr').length > 0) notes.push('several page sections became one');
      if (page && page.odd) notes.push('paper size set to the nearest (A4 / Legal)');
      function hfPart(kind) {
        var ref = sect ? kids(sect, kind + 'Reference').filter(function (r) { return att(r, 'type') !== 'first' && att(r, 'type') !== 'even'; })[0] : null;
        var path = ref && rels[att(ref, 'id')];
        return path ? zip.text(path).then(function (x) { return hfSlots(xml(x)); }) : Promise.resolve(['', '', '']);
      }
      return Promise.all([hfPart('header'), hfPart('footer')].concat(ctx.jobs.map(function (j) {
        var ext = (j.path.split('.').pop() || '').toLowerCase();
        if (!MIME[ext]) { notes.push('some images (' + ext + ') could not be shown'); return Promise.resolve(''); }
        return zip.bytes(j.path).then(function (by) {
          if (!by) return '';
          return Draftly.image.load(new Blob([by], { type: MIME[ext] })).then(function (src) {
            return '<p class="dl-img-block"><img src="' + src + '" alt="" style="width:' + j.pct + '%;max-width:100%"></p>';
          });
        }).catch(function () { notes.push('an image could not be read'); return ''; });
      }))).then(function (res) {
        ctx.jobs.forEach(function (j, i) { html = html.split(j.key).join(res[i + 2]); });
        html = html.replace(/<(p|h[1-6])([^>]*)><\/\1>/g, '');
        if (!html) html = '<p><br></p>';
        var hf = { head: res[0], foot: res[1] };
        return { html: html, page: page, hf: hf, notes: notes };
      });
    });
  };
  return R;
})();
