/* ============================================================
   FILE: modules/draftly-flow.js
   PROJECT: Draftly
   ROLE: Line-by-line flow of content across fixed-height A4
         pages. Overflow moves to the next page; a block that
         straddles the bottom margin is split at the last line
         that fits. Underflow pulls content back.
   MODEL: Every page editor holds top-level blocks (p, div, ul,
          ol, …). A block cut at a page bottom continues at the
          top of the next page as a clone carrying
          data-cont="1" (its partial inline wrappers carry it
          too). Continuations are re-joined when content moves
          back, and always in joinedHtml() (save / export).
   CARET: Tracked as (node, offset) and fixed up through every
          split / merge, then put back. Nodes are moved, never
          re-parsed, so typing stays fast and undo-safe-ish.
   DEPENDS: Draftly.config
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.flow = {};
Draftly.flow.busy = false;
Draftly.flow.caret = null;

/* ----- small helpers ----- */
Draftly.flow.editors = function editors() {
  return Array.prototype.slice.call(document.querySelectorAll('.' + Draftly.config.editorClass));
};
Draftly.flow.CONT = 'data-cont';

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
Draftly.flow.push = function push(eds, i) {
  var ed = eds[i];
  ed.scrollTop = 0;                       // caret may have scrolled the clipped box
  if (!Draftly.flow.overflows(ed)) return false;
  var er = ed.getBoundingClientRect();     // screen space (pages may be scaled to fit)
  var limit = er.top + er.height;
  var blocks = ed.children;
  var j = blocks.length - 1;
  while (j > 0 && blocks[j].getBoundingClientRect().top >= limit) j--;
  var straddle = blocks[j];
  var moved = [];
  var k;
  for (k = blocks.length - 1; k > j; k--) moved.unshift(blocks[k]);
  var cont = null;
  if (straddle.getBoundingClientRect().bottom > limit + Draftly.config.paginationSlackPx) {
    var s = Draftly.flow.splitIndex(straddle, limit);
    if (s !== -1 && s.index > 0) cont = Draftly.flow.cut(straddle, s.map, s.index);
    else if (j > 0) moved.unshift(straddle);  // first line does not fit: move it whole
  }
  if (!moved.length && !cont) return false;
  if (!eds[i + 1]) eds.push(Draftly.pages.createNewPage(i + 2).querySelector('.' + Draftly.config.editorClass));
  var next = eds[i + 1];
  for (k = moved.length - 1; k >= 0; k--) Draftly.flow.prepend(next, moved[k]);
  if (cont) Draftly.flow.prepend(next, cont);
  return true;
};

/* Pull blocks back from page i+1 while page `i` has room. Returns true if it moved anything. */
Draftly.flow.pull = function pull(eds, i) {
  var ed = eds[i], next = eds[i + 1];
  if (!next || !next.firstElementChild) return false;
  var free = Draftly.flow.boxHeight(ed) - Draftly.flow.usedHeight(ed);
  if (free < Draftly.flow.lineHeightPx(ed)) return false;
  var movedAny = false;
  var f;
  while (next.firstElementChild && !Draftly.flow.overflows(ed)) {
    f = next.firstElementChild;
    if (f.hasAttribute(Draftly.flow.CONT) && ed.lastElementChild && ed.lastElementChild.tagName === f.tagName) {
      Draftly.flow.join(ed.lastElementChild, f);
      f.remove();
    } else {
      f.removeAttribute(Draftly.flow.CONT);
      ed.appendChild(f);
    }
    movedAny = true;
  }
  return movedAny;
};

Draftly.flow.lineHeightPx = function lineHeightPx(ed) {
  var cs = getComputedStyle(ed);
  var lh = parseFloat(cs.lineHeight);
  return isFinite(lh) ? lh : parseFloat(cs.fontSize) * Draftly.config.lineHeight;
};

/* ----- caret ----- */
Draftly.flow.saveCaret = function saveCaret() {
  var sel = window.getSelection();
  Draftly.flow.caret = null;
  if (!sel || !sel.rangeCount) return;
  var r = sel.getRangeAt(0);
  var el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  if (!el || !el.closest('.' + Draftly.config.editorClass)) return;
  Draftly.flow.caret = { node: r.startContainer, offset: r.startOffset, collapsed: r.collapsed };
};
Draftly.flow.restoreCaret = function restoreCaret() {
  var c = Draftly.flow.caret;
  Draftly.flow.caret = null;
  if (!c || !c.node.isConnected) return;
  var el = c.node.nodeType === 1 ? c.node : c.node.parentElement;
  var ed = el && el.closest('.' + Draftly.config.editorClass);
  if (!ed) return;
  var max = c.node.nodeType === 3 ? c.node.nodeValue.length : c.node.childNodes.length;
  try {
    if (document.activeElement !== ed) ed.focus({ preventScroll: true });
    var sel = window.getSelection();
    sel.collapse(c.node, Math.min(c.offset, max));
  } catch (e) { return; }
  if (Draftly.editor) { Draftly.editor.activeEditor = ed; Draftly.editor.saveSelection(); }
  /* keep the caret on screen when it moved to another page */
  var sel2 = window.getSelection();
  if (sel2.rangeCount) {
    var rect = sel2.getRangeAt(0).getBoundingClientRect();
    var ws = document.getElementById('workspace');
    if (ws && rect && (rect.top || rect.bottom)) {
      var wr = ws.getBoundingClientRect();
      if (rect.bottom > wr.bottom - 8) ws.scrollTop += rect.bottom - wr.bottom + 40;
      else if (rect.top < wr.top + 8) ws.scrollTop -= wr.top - rect.top + 40;
    }
  }
};

/* Pages are clipped, never scrolled: undo any caret-driven scroll inside an editor. */
Draftly.flow.resetScroll = function resetScroll() {
  var eds = Draftly.flow.editors();
  for (var i = 0; i < eds.length; i++) if (eds[i].scrollTop) eds[i].scrollTop = 0;
};
document.addEventListener('scroll', function (e) {
  var t = e.target;
  if (t && t.classList && t.classList.contains(Draftly.config.editorClass) && t.scrollTop) {
    t.scrollTop = 0;
    if (Draftly.marks) Draftly.marks.schedule();
  }
}, true);

/* ----- main entry ----- */
/* Reflow from page `start` onward; stops at the first page that did not change. */
Draftly.flow.reflow = function reflow(start, keepCaret) {
  if (Draftly.flow.busy) return;
  Draftly.flow.busy = true;
  try {
    if (keepCaret !== false) Draftly.flow.saveCaret();
    var eds = Draftly.flow.editors();
    var i = Math.max(0, Math.min(start || 0, eds.length - 1));
    var changed;
    var guard = 0;
    var sig = function (ed) { return ed ? ed.childElementCount + ':' + ed.textContent.length : '-'; };
    var before;
    for (; i < eds.length && guard < 5000; i++, guard++) {
      Draftly.flow.normalize(eds[i]);
      before = sig(eds[i]) + '|' + sig(eds[i + 1]);
      Draftly.flow.pull(eds, i);
      Draftly.flow.push(eds, i);
      changed = before !== sig(eds[i]) + '|' + sig(eds[i + 1]);
      if (!changed && i > start) break;
    }
    /* drop empty trailing pages (keep page 1) */
    eds = Draftly.flow.editors();
    for (i = eds.length - 1; i > 0; i--) {
      if (eds[i].firstElementChild || eds[i].textContent.trim()) break;
      if (Draftly.flow.caret && eds[i].contains(Draftly.flow.caret.node)) Draftly.flow.caret = null;
      eds[i].closest('.paper').remove();
    }
    Draftly.pages.updatePageNumbers(document.querySelectorAll('.paper').length);
    if (keepCaret !== false) Draftly.flow.restoreCaret();
    Draftly.flow.resetScroll();
  } catch (err) {
    console.warn('draftly: flow failed', err);
  }
  Draftly.flow.busy = false;
  if (Draftly.marks) Draftly.marks.schedule();
};

/* Full layout: everything onto page 1 (node moves), then flow forward. */
Draftly.flow.reflowAll = function reflowAll() {
  var eds = Draftly.flow.editors();
  if (!eds.length) return;
  Draftly.flow.saveCaret();
  var first = eds[0];
  var i;
  for (i = 1; i < eds.length; i++) {
    while (eds[i].firstChild) {
      var f = eds[i].firstChild;
      if (f.nodeType === 1 && f.hasAttribute(Draftly.flow.CONT) && first.lastElementChild && first.lastElementChild.tagName === f.tagName) {
        Draftly.flow.join(first.lastElementChild, f);
        f.remove();
      } else {
        if (f.nodeType === 1) f.removeAttribute(Draftly.flow.CONT);
        first.appendChild(f);
      }
    }
    eds[i].closest('.paper').remove();
  }
  var c = Draftly.flow.caret;
  Draftly.flow.busy = false;
  /* push forward page by page */
  Draftly.flow.busy = true;
  try {
    eds = [first];
    for (i = 0; i < eds.length && i < 5000; i++) {
      Draftly.flow.normalize(eds[i]);
      Draftly.flow.push(eds, i);
    }
    Draftly.pages.updatePageNumbers(eds.length);
  } catch (err) { console.warn('draftly: flow failed', err); }
  Draftly.flow.busy = false;
  Draftly.flow.caret = c;
  Draftly.flow.restoreCaret();
  Draftly.flow.resetScroll();
  if (Draftly.marks) Draftly.marks.schedule();
};

/* HTML of the whole document with continuations re-joined (for save / export). */
Draftly.flow.joinedHtml = function joinedHtml() {
  var holder = document.createElement('div');
  var eds = Draftly.flow.editors();
  var i;
  for (i = 0; i < eds.length; i++) holder.insertAdjacentHTML('beforeend', eds[i].innerHTML);
  Draftly.flow.joinContinuations(holder);
  return holder.innerHTML;
};
Draftly.flow.joinContinuations = function joinContinuations(holder) {
  var saved = Draftly.flow.caret;
  Draftly.flow.caret = null;
  var conts = holder.querySelectorAll(':scope > [' + Draftly.flow.CONT + ']');
  var i, el, prev;
  for (i = 0; i < conts.length; i++) {
    el = conts[i];
    prev = el.previousElementSibling;
    if (prev && prev.tagName === el.tagName) { Draftly.flow.join(prev, el); el.remove(); }
    else el.removeAttribute(Draftly.flow.CONT);
  }
  var rest = holder.querySelectorAll('[' + Draftly.flow.CONT + ']');
  for (i = 0; i < rest.length; i++) rest[i].removeAttribute(Draftly.flow.CONT);
  if (Draftly.editor) Draftly.editor.stripMarks(holder);
  Draftly.flow.caret = saved;
};
