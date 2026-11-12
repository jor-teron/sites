/* ============================================================
   FILE: modules/writer-flow-blocks.js
   DF25: was modules/draftly-flow-blocks.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Block helpers for writer-flow.js: measuring, joining
         continuation pieces, text maps, and splitting a block at
         the last line that fits. Shares Writer.flow.
   DEPENDS: Writer.config
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.flow = Writer.flow || {};

/* ----- small helpers ----- */
Writer.flow.editors = function editors() {
  return Array.prototype.slice.call(document.querySelectorAll('.' + Writer.config.editorClass));
};
Writer.flow.CONT = 'data-cont';
Writer.flow.BREAK = 'dr-pagebreak';
Writer.flow.isBreak = function isBreak(n) {
  return !!(n && n.nodeType === 1 && n.classList.contains(Writer.flow.BREAK));
};
/* First top-level page-break marker on a page, or null. */
Writer.flow.firstBreak = function firstBreak(ed) {
  for (var c = ed.firstElementChild; c; c = c.nextElementSibling) if (Writer.flow.isBreak(c)) return c;
  return null;
};

/* Content box height of a page (fixed, from CSS). */
Writer.flow.boxHeight = function boxHeight(editor) {
  return editor.clientHeight;
};

/* Bottom of the last block, relative to the editor top. */
Writer.flow.usedHeight = function usedHeight(editor) {
  var last = editor.lastElementChild;
  if (!last) return 0;
  return last.offsetTop + last.offsetHeight;
};
Writer.flow.overflows = function overflows(editor) {
  return Writer.flow.usedHeight(editor) > Writer.flow.boxHeight(editor) + Writer.config.paginationSlackPx;
};

/* Wrap stray top-level text / inline nodes in <p> so every child is a block. */
Writer.flow.normalize = function normalize(editor) {
  var BLOCK = /^(P|DIV|UL|OL|LI|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR|FIGURE)$/;
  var node = editor.firstChild;
  var p = null;
  var next;
  var c = Writer.flow.caret;
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
  var CONT = Writer.flow.CONT;
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
Writer.flow.join = function join(to, from) {
  var c = Writer.flow.caret;
  var CONT = Writer.flow.CONT;
  if (c && c.node === from) { c.node = to; c.offset = to.childNodes.length + c.offset; }
  var child;
  var tail;
  while (from.firstChild) {
    child = from.firstChild;
    tail = to.lastChild;
    if (child.nodeType === 1 && child.hasAttribute(CONT) && tail && tail.nodeType === 1 && tail.tagName === child.tagName) {
      Writer.flow.join(tail, child);
      child.remove();
    } else {
      to.appendChild(child);
    }
  }
};

/* Put `block` at the top of `editor`; merges with a continuation already there. */
Writer.flow.prepend = function prepend(editor, block) {
  var first = editor.firstElementChild;
  editor.insertBefore(block, editor.firstChild);
  if (first && first.hasAttribute(Writer.flow.CONT)) {
    Writer.flow.join(block, first);
    first.remove();
  }
};

/* Character list of a block: [{node, start}] and total length. */
Writer.flow.textMap = function textMap(block) {
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
Writer.flow.locate = function locate(map, k) {
  var lo = 0, hi = map.list.length - 1, mid;
  while (lo < hi) {
    mid = (lo + hi + 1) >> 1;
    if (map.list[mid].start <= k) lo = mid; else hi = mid - 1;
  }
  return { node: map.list[lo].node, offset: k - map.list[lo].start };
};
Writer.flow.charRect = function charRect(map, k, range) {
  var p = Writer.flow.locate(map, k);
  range.setStart(p.node, p.offset);
  range.setEnd(p.node, p.offset + 1);
  var rects = range.getClientRects();
  return rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
};

/* Char index where the first line that does not fit starts; 0 = whole block; -1 = none. */
Writer.flow.splitIndex = function splitIndex(block, limitY) {
  var map = Writer.flow.textMap(block);
  if (!map.total) return -1;
  var range = document.createRange();
  var lo = 0, hi = map.total - 1, mid, r;
  if (Writer.flow.charRect(map, hi, range).bottom <= limitY) return -1;
  while (lo < hi) {                       // first char whose bottom is past the limit
    mid = (lo + hi) >> 1;
    r = Writer.flow.charRect(map, mid, range);
    if (r.bottom > limitY) hi = mid; else lo = mid + 1;
  }
  var top = Writer.flow.charRect(map, lo, range).top;
  var a = 0, b = lo;
  while (a < b) {                         // first char on that line
    mid = (a + b) >> 1;
    r = Writer.flow.charRect(map, mid, range);
    if (r.top >= top - 1) b = mid; else a = mid + 1;
  }
  return { index: a, map: map };
};

/* Cut `block` at char index k; returns the continuation clone (not yet inserted). */
Writer.flow.cut = function cut(block, map, k) {
  var p = Writer.flow.locate(map, k);
  var c = Writer.flow.caret;
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
  cont.setAttribute(Writer.flow.CONT, '1');
  cont.appendChild(frag);
  /* partial wrappers (cloned by extractContents) lead down to `start` */
  var el = cont.firstChild;
  while (el && el.nodeType === 1 && el !== start && el.contains(start)) {
    el.setAttribute(Writer.flow.CONT, '1');
    el = el.firstChild;
  }
  /* the piece left behind must not end in a dangling partial wrapper */
  return cont;
};

/* Push whatever does not fit on page `i` to the top of page i+1. Returns true if it moved anything. */
