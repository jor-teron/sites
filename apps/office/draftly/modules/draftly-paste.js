/* ==========================================================================
   Draftly - draftly-paste.js  (DF16)
   ROLE: Formatted paste. Clipboard HTML is parsed with DOMParser (inert,
         nothing runs) and rebuilt from an allow-list: b/i/u/s/sup/sub,
         safe links, headings, paragraphs, lists, tables, data: images and
         a few inline styles. Everything else is dropped.
   PLAIN: text/plain only, Ctrl+Shift+V, or HTML over MAX_HTML -> plain text.
   UNDO:  Draftly.editor.onPaste is wrapped by draftly-history.js, so the
          whole paste is one step. "Paste as text" chip swaps it for plain.
   ========================================================================== */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;
Draftly.paste = {};

Draftly.paste.MAX_HTML = 2 * 1024 * 1024;
Draftly.paste.CHIP_MS = 8000;
Draftly.paste.SIZES = [8, 10, 12, 14, 18, 24, 36];
Draftly.paste.HEAD = { H1: 24, H2: 18, H3: 14, H4: 12, H5: 12, H6: 12 };
Draftly.paste.DROP = /^(SCRIPT|STYLE|META|LINK|IFRAME|FRAME|OBJECT|EMBED|SVG|MATH|FORM|INPUT|BUTTON|SELECT|TEXTAREA|TITLE|HEAD|NOSCRIPT|TEMPLATE|CANVAS|VIDEO|AUDIO|XML|O:SMARTTAGTYPE)$/;
Draftly.paste.INLINE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUP: 'sup', SUB: 'sub' };
Draftly.paste.BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|TABLE|TR|TD|TH|TBODY|THEAD|TFOOT|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|FIGURE|DL|DT|DD|HR)$/;
Draftly.paste.IMG = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=\s]+$/i;

Draftly.paste.shiftUntil = 0;

/* Nearest Draftly point size for a CSS font-size. */
Draftly.paste.sizePt = function sizePt(v) {
  var m = /^([\d.]+)\s*(pt|px)?$/i.exec(String(v || '').trim());
  if (!m) return 0;
  var pt = parseFloat(m[1]) * ((m[2] || 'px').toLowerCase() === 'px' ? 0.75 : 1);
  if (!(pt > 0)) return 0;
  var best = 12, d = 1e9;
  Draftly.paste.SIZES.forEach(function (s) { if (Math.abs(s - pt) < d) { d = Math.abs(s - pt); best = s; } });
  return best;
};

/* Safe colour only: #hex, rgb(a), or a plain word. */
Draftly.paste.colour = function colour(v) {
  v = String(v || '').trim();
  if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(v) && !/^(inherit|initial|unset|transparent|windowtext|auto|currentcolor)$/i.test(v)) return v;
  return '';
};

/* Read the allowed inline styles of one source element. */
Draftly.paste.styles = function styles(el) {
  var st = el.style, o = {};
  if (!st) return o;
  var c = Draftly.paste.colour(st.color); if (c && !/^(black|#000|#000000|rgb\(0,\s*0,\s*0\))$/i.test(c)) o.color = c;
  var bg = Draftly.paste.colour(st.backgroundColor); if (bg && !/^(white|#fff|#ffffff|rgb\(255,\s*255,\s*255\))$/i.test(bg)) o.bg = bg;
  var fw = st.fontWeight;
  if (fw) o.bold = (fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600);
  if (st.fontStyle) o.italic = /italic|oblique/.test(st.fontStyle);
  var td = (st.textDecorationLine || st.textDecoration || '');
  if (/underline/.test(td)) o.u = true;
  if (/line-through/.test(td)) o.s = true;
  var sz = Draftly.paste.sizePt(st.fontSize); if (sz && sz !== 12) o.size = sz;
  if (/super/.test(st.verticalAlign)) o.sup = true;
  if (/sub/.test(st.verticalAlign)) o.sub = true;
  return o;
};

/* Wrap the built children of a node with inline format tags. */
Draftly.paste.wrapInline = function wrapInline(doc, frag, o) {
  var node = frag;
  function wrap(tag, css) {
    var w = doc.createElement(tag);
    if (css) w.setAttribute('style', css);
    w.appendChild(node); node = w;
  }
  var css = '';
  if (o.color) css += 'color:' + o.color + ';';
  if (o.bg) css += 'background-color:' + o.bg + ';';
  if (o.size) css += 'font-size:' + o.size + 'pt;';
  if (css) wrap('span', css);
  if (o.bold === true) wrap('b');
  if (o.italic === true) wrap('i');
  if (o.u) wrap('u');
  if (o.s) wrap('s');
  if (o.sup) wrap('sup');
  if (o.sub) wrap('sub');
  return node;
};

Draftly.paste.safeHref = function safeHref(h) {
  h = String(h || '').trim();
  return /^(https?:|mailto:)/i.test(h) ? h : '';
};

/* Word list paragraph: returns 'ul' / 'ol' or ''. */
Draftly.paste.wordList = function wordList(el) {
  var cls = el.getAttribute('class') || '', sty = el.getAttribute('style') || '';
  if (!/MsoListParagraph/i.test(cls) && !/mso-list:\s*l\d/i.test(sty)) return '';
  var t = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
  return /^([0-9]+|[a-z]|[ivxlc]+)[.)]\s/i.test(t) ? 'ol' : 'ul';
};

/* Build sanitized children of src into out (a node in doc). ctx: {cell} */
Draftly.paste.build = function build(doc, src, out, ctx) {
  var P = Draftly.paste, n, kids = Array.prototype.slice.call(src.childNodes), i;
  for (i = 0; i < kids.length; i++) {
    n = kids[i];
    if (n.nodeType === 3) { out.appendChild(doc.createTextNode(n.nodeValue.replace(/[\r\n]+/g, ' '))); continue; }
    if (n.nodeType !== 1) continue;           /* comments, conditional comments */
    var tag = n.tagName.toUpperCase();
    if (P.DROP.test(tag)) continue;
    var sty = n.getAttribute('style') || '';
    if (/mso-list:\s*Ignore/i.test(sty)) continue;               /* Word bullet text */
    if (/display:\s*none/i.test(sty)) continue;
    if (tag === 'BR') { out.appendChild(doc.createElement('br')); continue; }
    if (tag === 'IMG') {
      var srcv = n.getAttribute('src') || '';
      if (ctx.cell || !P.IMG.test(srcv)) continue;               /* remote / file: images skipped */
      var bp = doc.createElement('p'); bp.className = 'dl-img-block';
      var im = doc.createElement('img'); im.setAttribute('src', srcv.replace(/\s+/g, '')); im.setAttribute('alt', '');
      im.setAttribute('style', 'width:100%;max-width:100%;');
      bp.appendChild(im); out.appendChild(bp); continue;
    }
    if (tag === 'A') {
      var href = P.safeHref(n.getAttribute('href'));
      var f = doc.createDocumentFragment(); P.build(doc, n, f, ctx);
      if (href) { var a = doc.createElement('a'); a.setAttribute('href', href); a.appendChild(f); out.appendChild(P.wrapInline(doc, a, P.styles(n))); }
      else out.appendChild(P.wrapInline(doc, f, P.styles(n)));
      continue;
    }
    /* Google Docs wrapper: <b id="docs-internal-guid-..." style="font-weight:normal"> */
    if (tag === 'B' && /^docs-internal-guid/.test(n.getAttribute('id') || '')) { P.build(doc, n, out, ctx); continue; }
    if (P.INLINE[tag]) {
      var o = P.styles(n);
      var ff = doc.createDocumentFragment(); P.build(doc, n, ff, ctx);
      var it = P.INLINE[tag];
      if ((it === 'b' && o.bold === false) || (it === 'i' && o.italic === false)) { out.appendChild(P.wrapInline(doc, ff, o)); continue; }
      var w = doc.createElement(it); w.appendChild(ff);
      out.appendChild(P.wrapInline(doc, w, o)); continue;
    }
    if (tag === 'TABLE') {
      if (ctx.cell) { P.flattenTable(doc, n, out, ctx); continue; }
      out.appendChild(P.table(doc, n, ctx)); continue;
    }
    if (tag === 'UL' || tag === 'OL') {
      if (ctx.cell) { P.build(doc, n, out, ctx); continue; }
      var l = doc.createElement(tag.toLowerCase());
      if (tag === 'OL' && /^[aAiI1]$/.test(n.getAttribute('type') || '')) l.setAttribute('data-style', n.getAttribute('type'));
      P.build(doc, n, l, ctx);
      P.tidyList(doc, l); out.appendChild(l); continue;
    }
    if (tag === 'LI') {
      if (ctx.cell) { P.build(doc, n, out, ctx); out.appendChild(doc.createElement('br')); continue; }
      var li = doc.createElement('li'); var lf = doc.createDocumentFragment(); P.build(doc, n, lf, { cell: false, inLi: true });
      P.unblock(doc, lf); li.appendChild(P.wrapInline(doc, lf, P.styles(n))); out.appendChild(li); continue;
    }
    if (/^H[1-6]$/.test(tag)) {
      var hf = doc.createDocumentFragment(); P.build(doc, n, hf, ctx);
      var ho = P.styles(n); ho.bold = true; if (!ho.size) ho.size = P.HEAD[tag];
      if (ho.size === 12) delete ho.size;
      P.blockOut(doc, out, P.wrapInline(doc, hf, ho), ctx); continue;
    }
    if (tag === 'P' || tag === 'DIV' || P.BLOCK.test(tag)) {
      var kind = tag === 'P' ? P.wordList(n) : '';
      if (kind && !ctx.cell) {
        var lif = doc.createDocumentFragment(); P.build(doc, n, lif, ctx);
        var item = doc.createElement('li'); item.appendChild(P.wrapInline(doc, lif, P.styles(n)));
        var last = out.lastChild;
        if (!last || last.nodeName.toLowerCase() !== kind || !last.getAttribute('data-word')) {
          last = doc.createElement(kind); last.setAttribute('data-word', '1'); out.appendChild(last);
        }
        last.appendChild(item); continue;
      }
      if (tag === 'HR') continue;
      var hasBlock = Array.prototype.some.call(n.children, function (c) { return P.BLOCK.test(c.tagName.toUpperCase()) || c.tagName === 'IMG'; });
      var bf = doc.createDocumentFragment(); P.build(doc, n, bf, ctx);
      var bo = P.styles(n);
      if (hasBlock && tag !== 'P') { out.appendChild(P.wrapInline(doc, bf, bo)); continue; }
      P.blockOut(doc, out, P.wrapInline(doc, bf, bo), ctx); continue;
    }
    /* span, font, section wrappers, o:p, LibreOffice <font> etc: unwrap, keep allowed styles */
    var sf = doc.createDocumentFragment(); P.build(doc, n, sf, ctx);
    var so = P.styles(n);
    if (tag === 'FONT' && n.getAttribute('color')) so.color = so.color || P.colour(n.getAttribute('color'));
    out.appendChild(P.wrapInline(doc, sf, so));
  }
  return out;
};

/* A paragraph (or line inside a cell / list item). */
Draftly.paste.blockOut = function blockOut(doc, out, content, ctx) {
  if (ctx.cell || ctx.inLi) { out.appendChild(content); out.appendChild(doc.createElement('br')); return; }
  var p = doc.createElement('p'); p.appendChild(content);
  if (!p.textContent.replace(/\u00a0/g, ' ').trim() && !p.querySelector('img')) p.innerHTML = '<br>';
  out.appendChild(p);
};

/* Strip block wrappers inside a list item fragment. */
Draftly.paste.unblock = function unblock(doc, frag) {
  frag.querySelectorAll && Array.prototype.forEach.call(frag.querySelectorAll('p'), function (p) {
    while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p); p.remove();
  });
  while (frag.lastChild && frag.lastChild.nodeName === 'BR') frag.removeChild(frag.lastChild);
};

/* Lists: loose text becomes li; nested lists stay inside the previous li. */
Draftly.paste.tidyList = function tidyList(doc, l) {
  Array.prototype.slice.call(l.childNodes).forEach(function (c) {
    if (c.nodeType === 3 && !c.nodeValue.trim()) { c.remove(); return; }
    if (c.nodeName === 'LI') return;
    if ((c.nodeName === 'UL' || c.nodeName === 'OL') && c.previousElementSibling && c.previousElementSibling.nodeName === 'LI') { c.previousElementSibling.appendChild(c); return; }
    var li = doc.createElement('li'); l.insertBefore(li, c); li.appendChild(c);
  });
};

/* Table in Draftly's FT7 shape: inline TBL / TD styles, tbody, no spans. */
Draftly.paste.table = function table(doc, src, ctx) {
  var P = Draftly.paste, T = Draftly.table;
  var t = doc.createElement('table'); t.setAttribute('style', T ? T.TBL : 'border-collapse:collapse;width:100%;table-layout:fixed;');
  var tb = doc.createElement('tbody'); t.appendChild(tb);
  var rows = Array.prototype.filter.call(src.querySelectorAll('tr'), function (r) { return r.closest('table') === src; });
  var maxc = 0;
  rows.forEach(function (r) {
    var tr = doc.createElement('tr');
    Array.prototype.forEach.call(r.children, function (c) {
      if (!/^(TD|TH)$/.test(c.tagName.toUpperCase())) return;
      var span = Math.max(1, Math.min(20, parseInt(c.getAttribute('colspan') || '1', 10) || 1));
      var td = doc.createElement('td'); td.setAttribute('style', T ? T.TD : 'border:1px solid #000;padding:4px 6px;vertical-align:top;');
      var f = doc.createDocumentFragment(); P.build(doc, c, f, { cell: true });
      while (f.lastChild && f.lastChild.nodeName === 'BR') f.removeChild(f.lastChild);
      if (c.tagName.toUpperCase() === 'TH') { var b = doc.createElement('b'); b.appendChild(f); f = b; }
      td.appendChild(f);
      if (!td.textContent.trim()) td.innerHTML = '<br>';
      tr.appendChild(td);
      for (var k = 1; k < span; k++) { var e = doc.createElement('td'); e.setAttribute('style', td.getAttribute('style')); e.innerHTML = '<br>'; tr.appendChild(e); }
    });
    if (tr.children.length) { tb.appendChild(tr); maxc = Math.max(maxc, tr.children.length); }
  });
  Array.prototype.forEach.call(tb.children, function (tr) {
    while (tr.children.length < maxc) { var e = doc.createElement('td'); e.setAttribute('style', T ? T.TD : ''); e.innerHTML = '<br>'; tr.appendChild(e); }
  });
  return t;
};

/* Table pasted into a cell: rows as lines, cells joined by tabs. */
Draftly.paste.flattenTable = function flattenTable(doc, src, out, ctx) {
  Array.prototype.forEach.call(src.querySelectorAll('tr'), function (r) {
    var first = true;
    Array.prototype.forEach.call(r.children, function (c) {
      if (!first) out.appendChild(doc.createTextNode('\t'));
      first = false;
      var f = doc.createDocumentFragment(); Draftly.paste.build(doc, c, f, ctx);
      while (f.lastChild && f.lastChild.nodeName === 'BR') f.removeChild(f.lastChild);
      out.appendChild(f);
    });
    out.appendChild(doc.createElement('br'));
  });
};

/* Clipboard HTML -> safe HTML string. */
Draftly.paste.sanitize = function sanitize(html, inCell) {
  var src = new DOMParser().parseFromString(String(html), 'text/html');
  var doc = document.implementation.createHTMLDocument('');
  var box = doc.createElement('div');
  var body = src.body || src.documentElement;
  /* Chrome copy markers */
  Draftly.paste.build(doc, body, box, { cell: !!inCell });
  Array.prototype.forEach.call(box.querySelectorAll('[data-word]'), function (e) { e.removeAttribute('data-word'); });
  /* Final guard: nothing with on* or javascript: survives. */
  Array.prototype.forEach.call(box.querySelectorAll('*'), function (e) {
    Array.prototype.slice.call(e.attributes).forEach(function (a) {
      if (!/^(style|href|src|alt|class|data-style)$/.test(a.name)) e.removeAttribute(a.name);
    });
    if (e.hasAttribute('class') && e.getAttribute('class') !== 'dl-img-block') e.removeAttribute('class');
    if (e.hasAttribute('href') && !Draftly.paste.safeHref(e.getAttribute('href'))) e.removeAttribute('href');
  });
  while (box.lastChild && box.lastChild.nodeName === 'BR') box.removeChild(box.lastChild);
  return box.innerHTML.trim();
};

Draftly.paste.inCell = function inCell() {
  var sel = window.getSelection();
  if (!sel || !sel.anchorNode) return false;
  var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  return !!(el && el.closest && el.closest('td,th'));
};

Draftly.paste.toast = function toast(m) { if (Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast(m); };

Draftly.paste.insertHtml = function insertHtml(safe) {
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  document.execCommand('insertHTML', false, safe);
  /* insertHTML can drop the table style; restore Draftly's FT7 shape. */
  if (Draftly.table) Array.prototype.forEach.call(document.querySelectorAll('.' + Draftly.config.editorClass + ' table:not([style])'), function (t) { t.setAttribute('style', Draftly.table.TBL); });
  Draftly.editor.saveSelection();
  if (Draftly.breaks && Draftly.breaks.changed) Draftly.breaks.changed();
  else if (Draftly.pages) Draftly.pages.checkPagination();
};

/* Main entry (called by Draftly.editor.onPaste, already one history step). */
Draftly.paste.handle = function handle(e) {
  var P = Draftly.paste;
  e.preventDefault();
  P.hideChip();
  var cd = e.clipboardData || window.clipboardData;
  if (!cd) return;
  var html = cd.getData('text/html') || '';
  var text = cd.getData('text/plain') || '';
  var plainOnly = Date.now() < P.shiftUntil;
  P.shiftUntil = 0;
  if (!html && !text && cd.files && cd.files.length && Draftly.image) {
    var file = Array.prototype.find.call(cd.files, function (f) { return /^image\//.test(f.type); });
    if (file) {
      Draftly.image.load(file).then(function (url) {
        Draftly.history.checkpoint(); Draftly.image.insert(url); Draftly.history.commit();
      }).catch(function () { P.toast('Could not read the pasted image'); });
    }
    return;
  }
  if (!html || plainOnly) { Draftly.editor.pastePlain(text); return; }
  if (html.length > P.MAX_HTML) { Draftly.editor.pastePlain(text); P.toast('Large paste: pasted as plain text'); return; }
  var safe;
  try { safe = P.sanitize(html, P.inCell()); } catch (err) { safe = ''; }
  if (!safe) { Draftly.editor.pastePlain(text); return; }
  P.insertHtml(safe);
  P.showChip(text);
};

/* "Paste as text" chip near the caret. */
Draftly.paste.chip = null;
Draftly.paste.showChip = function showChip(text) {
  var P = Draftly.paste;
  var b = P.chip;
  if (!b) {
    b = P.chip = document.createElement('button');
    b.type = 'button'; b.id = 'dlPasteChip'; b.textContent = 'Paste as text';
    b.setAttribute('style', 'position:fixed;z-index:9999;font:12px sans-serif;padding:3px 8px;border-radius:12px;border:1px solid #888;background:#fff;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:pointer;');
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    b.addEventListener('click', function (ev) { ev.preventDefault(); P.asText(); });
    document.body.appendChild(b);
  }
  P.lastText = text;
  var sel = window.getSelection(), x = 20, y = 80;
  if (sel && sel.rangeCount) {
    var r = sel.getRangeAt(0).getBoundingClientRect();
    if (r && (r.top || r.left)) { x = r.left; y = r.bottom + 6; }
  }
  b.style.left = Math.max(4, Math.min(window.innerWidth - 120, x)) + 'px';
  b.style.top = Math.max(4, Math.min(window.innerHeight - 30, y)) + 'px';
  b.hidden = false;
  clearTimeout(P.chipTimer);
  P.chipTimer = setTimeout(P.hideChip, P.CHIP_MS);
};
Draftly.paste.hideChip = function hideChip() { if (Draftly.paste.chip) Draftly.paste.chip.hidden = true; };

/* Replace the just-pasted content with plain text (net one undo step). */
Draftly.paste.asText = function asText() {
  var P = Draftly.paste, h = Draftly.history;
  P.hideChip();
  if (P.lastText == null) return;
  h.undo();
  h.checkpoint();
  Draftly.editor.pastePlain(P.lastText);
  h.commit();
  P.lastText = null;
};

document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) Draftly.paste.shiftUntil = Date.now() + 1000;
  else if (Draftly.paste.chip && !Draftly.paste.chip.hidden && !e.ctrlKey && !e.metaKey) Draftly.paste.hideChip();
}, true);
