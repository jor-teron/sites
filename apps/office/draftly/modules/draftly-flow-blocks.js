/* ============================================================
   FILE: modules/draftly-flow-blocks.js
   PROJECT: Draftly
   ROLE: Block helpers for draftly-flow.js: measuring, joining
         continuation pieces, text maps, and splitting a block at
         the last line that fits. Shares Draftly.flow.
   DEPENDS: Draftly.config
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.flow = Draftly.flow || {};

/* ----- small helpers ----- */
Draftly.flow.editors = function editors() {
  return Array.prototype.slice.call(document.querySelectorAll('.' + Draftly.config.editorClass));
};
Draftly.flow.CONT = 'data-cont';
Draftly.flow.BREAK = 'dr-pagebreak';
Draftly.flow.isBreak = function isBreak(n) {
  return !!(n && n.nodeType === 1 && n.classList.contains(Draftly.flow.BREAK));
};
/* First top-level page-break marker on a page, or null. */
Draftly.flow.firstBreak = function firstBreak(ed) {
  for (var c = ed.firstElementChild; c; c = c.nextElementSibling) if (Draftly.flow.isBreak(c)) return c;
  return null;
};

/* Content box height of a page (fixed, from CSS). */
Draftly.flow.boxHeight = function boxHeight(editor) {
  return editor.clientHeight;
};

/* Bottom of the last block, relative to the editor top. */
Draftly.flow.usedHeight = function usedHeight(editor) {
  var last = editor.lastElementChild;
  if (!last) return 0;
  return last.offsetTop + last.offsetHeight;
};
Draftly.flow.overflows = function overflows(editor) {
  return Draftly.flow.usedHeight(editor) > Draftly.flow.boxHeight(editor) + Draftly.config.paginationSlackPx;
};

/* Wrap stray top-level text / inline nodes in <p> so every child is a block. */
Draftly.flow.normalize = function normalize(editor) {
  var BLOCK = /^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR|FIGURE)$/;
  var node = editor.firstChild;
  var p = null;
  var next;
  var c = Draftly.flow.caret;
  while (node) {
    next = node.nextSibling;
    if (node.nodeType === 1 && BLOCK.test(node.tagName)) { p = null; node = next; continue; }
    if (node.nodeType === 3 && !node.nodeValue.length) { node.remove(); node = next; continue; }
    if (node.nodeType !== 1 && node.nodeType !== 3) { node.remove(); node = next; continue; }
    if (!p) { p = document.createElement('p'); editor.insertBefore(p, node); }
    p.appendChild(node);
    node = next;
  }
  /* data-cont is only valid on the first-child chain (Enter can copy it onto new blocks) */
  var CONT = Draftly.flow.CONT;
  var keep = [];
  var k = editor.firstElementChild;
  while (k && k.hasAttribute(CONT)) { keep.push(k); k = k.firstChild && k.firstChild.nodeType === 1 ? k.firstChild : null; }
  var all = editor.querySelectorAll('[' + CONT + ']');
  for (var a = 0; a < all.length; a++) if (keep.indexOf(all[a]) === -1) all[a].removeAttribute(CONT);
  if (c && c.node === editor) {           // caret was between top-level nodes: put it at the end
    var last = editor.lastChild;
    if (last) { c.node = last; c.offset = last.childNodes.length; }
  }
};

/* Move every child of `from` into `to` (at the end), re-joining partial wrappers. */
Draftly.flow.join = function join(to, from) {
  var c = Draftly.flow.caret;
  var CONT = Draftly.flow.CONT;
  if (c && c.node === from) { c.node = to; c.offset = to.childNodes.length + c.offset; }
  var child;
  var tail;
  while (from.firstChild) {
    child = from.firstChild;
    tail = to.lastChild;
    if (child.nodeType === 1 && child.hasAttribute(CONT) && tail && tail.nodeType === 1 && tail.tagName === child.tagName) {
      Draftly.flow.join(tail, child);
      child.remove();
    } else {
      to.appendChild(child);
    }
  }
};

/* Put `block` at the top of `editor`; merges with a continuation already there. */
Draftly.flow.prepend = function prepend(editor, block) {
  var first = editor.firstElementChild;
  editor.insertBefore(block, editor.firstChild);
  if (first && first.hasAttribute(Draftly.flow.CONT)) {
    Draftly.flow.join(block, first);
    first.remove();
  }
};

/* Character list of a block: [{node, start}] and total length. */
Draftly.flow.textMap = function textMap(block) {
  var w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  var list = [];
  var total = 0;
  var n = w.nextNode();
  while (n) {
    if (n.nodeValue.length) { list.push({ node: n, start: total }); total += n.nodeValue.length; }
    n = w.nextNode();
  }
  return { list: list, total: total };
};
Draftly.flow.locate = function locate(map, k) {
  var lo = 0, hi = map.list.length - 1, mid;
  while (lo < hi) {
    mid = (lo + hi + 1) >> 1;
    if (map.list[mid].start <= k) lo = mid; else hi = mid - 1;
  }
  return { node: map.list[lo].node, offset: k - map.list[lo].start };
};
Draftly.flow.charRect = function charRect(map, k, range) {
  var p = Draftly.flow.locate(map, k);
  range.setStart(p.node, p.offset);
  range.setEnd(p.node, p.offset + 1);
  var rects = range.getClientRects();
  return rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
};

/* Char index where the first line that does not fit starts; 0 = whole block; -1 = none. */
Draftly.flow.splitIndex = function splitIndex(block, limitY) {
  var map = Draftly.flow.textMap(block);
  if (!map.total) return -1;
  var range = document.createRange();
  var lo = 0, hi = map.total - 1, mid, r;
  if (Draftly.flow.charRect(map, hi, range).bottom <= limitY) return -1;
  while (lo < hi) {                       // first char whose bottom is past the limit
    mid = (lo + hi) >> 1;
    r = Draftly.flow.charRect(map, mid, range);
    if (r.bottom > limitY) hi = mid; else lo = mid + 1;
  }
  var top = Draftly.flow.charRect(map, lo, range).top;
  var a = 0, b = lo;
  while (a < b) {                         // first char on that line
    mid = (a + b) >> 1;
    r = Draftly.flow.charRect(map, mid, range);
    if (r.top >= top - 1) b = mid; else a = mid + 1;
  }
  return { index: a, map: map };
};

/* Cut `block` at char index k; returns the continuation clone (not yet inserted). */
Draftly.flow.cut = function cut(block, map, k) {
  var p = Draftly.flow.locate(map, k);
  var c = Draftly.flow.caret;
  var start = p.node;
  if (p.offset > 0) {
    start = p.node.splitText(p.offset);
    if (c && c.node === p.node && c.offset > p.offset) { c.node = start; c.offset -= p.offset; }
  }
  var range = document.createRange();
  range.setStartBefore(start);
  range.setEndAfter(block.lastChild);
  var frag = range.extractContents();
  var cont = block.cloneNode(false);
  cont.removeAttribute('id');
  cont.setAttribute(Draftly.flow.CONT, '1');
  cont.appendChild(frag);
  /* partial wrappers (cloned by extractContents) lead down to `start` */
  var el = cont.firstChild;
  while (el && el.nodeType === 1 && el !== start && el.contains(start)) {
    el.setAttribute(Draftly.flow.CONT, '1');
    el = el.firstChild;
  }
  /* the piece left behind must not end in a dangling partial wrapper */
  return cont;
};

/* Push whatever does not fit on page `i` to the top of page i+1. Returns true if it moved anything. */
