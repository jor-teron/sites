/* ============================================================
   FILE: modules/draftly-marks.js
   PROJECT: Draftly
   ROLE: Non-printing marks ("Show format"): ¶ at the end of
         every paragraph, ↵ at every Shift+Enter line break.
   HOW: Drawn on an overlay layer (.np-layer) inside each paper,
        positioned from layout rects. Nothing is ever inserted
        into the editable content, so marks cannot be saved,
        printed, exported, or change line wrapping.
   DEPENDS: Draftly.config, Draftly.ui
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.marks = {};
Draftly.marks.timer = 0;

Draftly.marks.on = function on() { return !!(Draftly.ui && Draftly.ui.isNonPrinting()); };

Draftly.marks.schedule = function schedule() {
  clearTimeout(Draftly.marks.timer);
  Draftly.marks.timer = setTimeout(Draftly.marks.redraw, Draftly.config.marksDelayMs);
};

/* True when nothing but whitespace / placeholder follows `node` inside `block`. */
Draftly.marks.isTrailing = function isTrailing(node, block) {
  var n = node;
  while (n && n !== block) {
    var s = n.nextSibling;
    while (s) {
      if (s.nodeType === 3 ? s.nodeValue.length : (s.nodeType === 1 && !s.hasAttribute('data-np'))) return false;
      s = s.nextSibling;
    }
    n = n.parentNode;
  }
  return true;
};

Draftly.marks.layerFor = function layerFor(paper) {
  var layer = paper.querySelector(':scope > .np-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'np-layer';
    layer.setAttribute('aria-hidden', 'true');
    paper.appendChild(layer);
  }
  return layer;
};

Draftly.marks.put = function put(layer, base, glyph, x, top, h) {
  var s = document.createElement('span');
  s.className = 'np-glyph';
  s.textContent = glyph;
  var z = (Draftly.view && Draftly.view.zoom) || 1;   // rects are scaled; the layer is not
  s.style.left = (x - base.left) / z + 'px';
  s.style.top = (top - base.top) / z + 'px';
  s.style.height = h / z + 'px';
  s.style.lineHeight = h / z + 'px';
  layer.appendChild(s);
};

/* Rect at the end of a block's last line. */
Draftly.marks.endRect = function endRect(block) {
  var last = block.lastChild;
  while (last && last.nodeType === 3 && !last.nodeValue.length) last = last.previousSibling;
  while (last && last.nodeType === 1 && last.tagName !== 'BR' && last.lastChild) last = last.lastChild;
  var r = document.createRange();
  if (last && last.nodeType === 3 && last.nodeValue.length) {
    r.setStart(last, last.nodeValue.length - 1);
    r.setEnd(last, last.nodeValue.length);
    var rects = r.getClientRects();
    var rc = rects[rects.length - 1];
    if (rc) return { x: rc.right, top: rc.top, h: rc.height };
  }
  if (last && last.nodeType === 1 && last.tagName === 'BR') {
    var b = last.getBoundingClientRect();
    if (b.height) return { x: b.left, top: b.top, h: b.height };
  }
  var br = block.getBoundingClientRect();
  return { x: br.left, top: br.top, h: Math.min(br.height, Draftly.flow ? Draftly.flow.lineHeightPx(block) : br.height) };
};

Draftly.marks.redraw = function redraw() {
  var papers = document.querySelectorAll('.paper');
  var on = Draftly.marks.on();
  var i, j, layer, ed, base, blocks, brs, br, rc, block;
  for (i = 0; i < papers.length; i++) {
    layer = papers[i].querySelector(':scope > .np-layer');
    if (!on) { if (layer) layer.remove(); continue; }
    layer = Draftly.marks.layerFor(papers[i]);
    layer.textContent = '';
    ed = papers[i].querySelector('.' + Draftly.config.editorClass);
    if (!ed) continue;
    base = papers[i].getBoundingClientRect();
    /* ↵ at real line breaks (a trailing placeholder <br> is not one) */
    brs = ed.querySelectorAll('br');
    for (j = 0; j < brs.length; j++) {
      br = brs[j];
      block = br.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre') || ed;
      if (Draftly.marks.isTrailing(br, block)) continue;
      rc = br.getBoundingClientRect();
      if (!rc.height) continue;
      Draftly.marks.put(layer, base, '↵', rc.left + 1, rc.top, rc.height);
    }
    /* ¶ at the end of each paragraph (not on a piece that continues on the next page) */
    blocks = ed.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, div:not(:has(p, div, li))');
    for (j = 0; j < blocks.length; j++) {
      block = blocks[j];
      if (Draftly.marks.continuesNext(block, ed)) continue;
      rc = Draftly.marks.endRect(block);
      Draftly.marks.put(layer, base, '¶', rc.x + 1, rc.top, rc.h);
    }
  }
};

/* The last block of a page that has a continuation on the next page. */
Draftly.marks.continuesNext = function continuesNext(block, ed) {
  var onLast = false;
  var n = ed.lastElementChild;
  while (n) { if (n === block) { onLast = true; break; } n = n.lastElementChild; }
  if (!onLast) return false;
  var paper = ed.closest('.paper');
  var next = paper && paper.nextElementSibling;
  var ned = next && next.querySelector('.' + Draftly.config.editorClass);
  var first = ned && ned.firstElementChild;
  return !!(first && first.hasAttribute('data-cont'));
};
