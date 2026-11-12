/* ============================================================
   FILE: modules/writer-flow.js
   DF25: was modules/draftly-flow.js (global Draftly is now Writer).
   PROJECT: Writer
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
   SPLIT: block helpers (measure, join, split) are in
          writer-flow-blocks.js.
   DEPENDS: Writer.config, writer-flow-blocks.js
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.flow = Writer.flow || {};
Writer.flow.busy = false;
Writer.flow.caret = null;

Writer.flow.push = function push(eds, i) {
  var ed = eds[i];
  ed.scrollTop = 0;                       // caret may have scrolled the clipped box
  var pb = Writer.flow.firstBreak(ed);
  if (pb && pb.nextSibling) {             // manual page break: the rest goes to the next page
    var after = [];
    while (pb.nextSibling) { after.push(pb.nextSibling); pb.nextSibling.remove(); }
    if (!eds[i + 1]) eds.push(Writer.pages.createNewPage(i + 2).querySelector('.' + Writer.config.editorClass));
    for (var a = after.length - 1; a >= 0; a--) {
      if (after[a].nodeType === 1) Writer.flow.prepend(eds[i + 1], after[a]);
      else eds[i + 1].insertBefore(after[a], eds[i + 1].firstChild);
    }
    return true;
  }
  if (!Writer.flow.overflows(ed)) return false;
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
  if (straddle.getBoundingClientRect().bottom > limit + Writer.config.paginationSlackPx) {
    var s = (straddle.tagName === 'TABLE' || straddle.classList.contains('dl-img-block')) ? -1 : Writer.flow.splitIndex(straddle, limit);  // tables and images move whole
    if (s !== -1 && s.index > 0) cont = Writer.flow.cut(straddle, s.map, s.index);
    else if (j > 0) moved.unshift(straddle);  // first line does not fit: move it whole
  }
  if (!moved.length && !cont) return false;
  if (!eds[i + 1]) eds.push(Writer.pages.createNewPage(i + 2).querySelector('.' + Writer.config.editorClass));
  var next = eds[i + 1];
  for (k = moved.length - 1; k >= 0; k--) Writer.flow.prepend(next, moved[k]);
  if (cont) Writer.flow.prepend(next, cont);
  return true;
};

/* Pull blocks back from page i+1 while page `i` has room. Returns true if it moved anything. */
Writer.flow.pull = function pull(eds, i) {
  var ed = eds[i], next = eds[i + 1];
  if (!next || !next.firstElementChild) return false;
  var free = Writer.flow.boxHeight(ed) - Writer.flow.usedHeight(ed);
  if (free < Writer.flow.lineHeightPx(ed)) return false;
  if (Writer.flow.firstBreak(ed)) return false;  // a page break ends this page
  var movedAny = false;
  var f;
  while (next.firstElementChild && !Writer.flow.overflows(ed)) {
    f = next.firstElementChild;
    if (f.hasAttribute(Writer.flow.CONT) && ed.lastElementChild && ed.lastElementChild.tagName === f.tagName) {
      Writer.flow.join(ed.lastElementChild, f);
      f.remove();
    } else {
      f.removeAttribute(Writer.flow.CONT);
      ed.appendChild(f);
    }
    movedAny = true;
    if (Writer.flow.isBreak(f)) break;
  }
  return movedAny;
};

Writer.flow.lineHeightPx = function lineHeightPx(ed) {
  var cs = getComputedStyle(ed);
  var lh = parseFloat(cs.lineHeight);
  return isFinite(lh) ? lh : parseFloat(cs.fontSize) * Writer.config.lineHeight;
};

/* ----- caret ----- */
Writer.flow.saveCaret = function saveCaret() {
  var sel = window.getSelection();
  Writer.flow.caret = null;
  if (!sel || !sel.rangeCount) return;
  var r = sel.getRangeAt(0);
  var el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  if (!el || !el.closest('.' + Writer.config.editorClass)) return;
  Writer.flow.caret = { node: r.startContainer, offset: r.startOffset, collapsed: r.collapsed,
    endNode: r.endContainer, endOffset: r.endOffset };
};
Writer.flow.restoreCaret = function restoreCaret() {
  var c = Writer.flow.caret;
  Writer.flow.caret = null;
  if (!c || !c.node.isConnected) return;
  var el = c.node.nodeType === 1 ? c.node : c.node.parentElement;
  var ed = el && el.closest('.' + Writer.config.editorClass);
  if (!ed) return;
  var max = c.node.nodeType === 3 ? c.node.nodeValue.length : c.node.childNodes.length;
  try {
    if (document.activeElement !== ed) ed.focus({ preventScroll: true });
    var sel = window.getSelection();
    sel.collapse(c.node, Math.min(c.offset, max));
    /* keep a selection (e.g. after a toolbar format) instead of collapsing it */
    if (!c.collapsed && c.endNode && c.endNode.isConnected && ed.contains(c.endNode)) {
      var emax = c.endNode.nodeType === 3 ? c.endNode.nodeValue.length : c.endNode.childNodes.length;
      sel.extend(c.endNode, Math.min(c.endOffset, emax));
    }
  } catch (e) { return; }
  if (Writer.editor) { Writer.editor.activeEditor = ed; Writer.editor.saveSelection(); }
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
Writer.flow.resetScroll = function resetScroll() {
  var eds = Writer.flow.editors();
  for (var i = 0; i < eds.length; i++) if (eds[i].scrollTop) eds[i].scrollTop = 0;
};
document.addEventListener('scroll', function (e) {
  var t = e.target;
  if (t && t.classList && t.classList.contains(Writer.config.editorClass) && t.scrollTop) {
    t.scrollTop = 0;
    if (Writer.marks) Writer.marks.schedule();
  }
}, true);

/* ----- main entry ----- */
/* Reflow from page `start` onward; stops at the first page that did not change. */
Writer.flow.reflow = function reflow(start, keepCaret) {
  if (Writer.flow.busy) return;
  Writer.flow.busy = true;
  try {
    if (keepCaret !== false) Writer.flow.saveCaret();
    var eds = Writer.flow.editors();
    var i = Math.max(0, Math.min(start || 0, eds.length - 1));
    var changed;
    var guard = 0;
    var sig = function (ed) { return ed ? ed.childElementCount + ':' + ed.textContent.length : '-'; };
    var before;
    for (; i < eds.length && guard < 5000; i++, guard++) {
      Writer.flow.normalize(eds[i]);
      before = sig(eds[i]) + '|' + sig(eds[i + 1]);
      Writer.flow.pull(eds, i);
      Writer.flow.push(eds, i);
      changed = before !== sig(eds[i]) + '|' + sig(eds[i + 1]);
      if (!changed && i > start) break;
    }
    /* drop empty trailing pages (keep page 1) */
    eds = Writer.flow.editors();
    for (i = eds.length - 1; i > 0; i--) {
      if (eds[i].firstElementChild || eds[i].textContent.trim()) break;
      if (Writer.flow.caret && eds[i].contains(Writer.flow.caret.node)) Writer.flow.caret = null;
      eds[i].closest('.paper').remove();
    }
    Writer.pages.updatePageNumbers(document.querySelectorAll('.paper').length);
    if (keepCaret !== false) Writer.flow.restoreCaret();
    Writer.flow.resetScroll();
  } catch (err) {
    console.warn('writer: flow failed', err);
  }
  Writer.flow.busy = false;
  if (Writer.marks) Writer.marks.schedule();
};

/* Full layout: everything onto page 1 (node moves), then flow forward. */
Writer.flow.reflowAll = function reflowAll() {
  var eds = Writer.flow.editors();
  if (!eds.length) return;
  Writer.flow.saveCaret();
  var first = eds[0];
  var i;
  for (i = 1; i < eds.length; i++) {
    while (eds[i].firstChild) {
      var f = eds[i].firstChild;
      if (f.nodeType === 1 && f.hasAttribute(Writer.flow.CONT) && first.lastElementChild && first.lastElementChild.tagName === f.tagName) {
        Writer.flow.join(first.lastElementChild, f);
        f.remove();
      } else {
        if (f.nodeType === 1) f.removeAttribute(Writer.flow.CONT);
        first.appendChild(f);
      }
    }
    eds[i].closest('.paper').remove();
  }
  var c = Writer.flow.caret;
  Writer.flow.busy = false;
  /* push forward page by page */
  Writer.flow.busy = true;
  try {
    eds = [first];
    for (i = 0; i < eds.length && i < 5000; i++) {
      Writer.flow.normalize(eds[i]);
      Writer.flow.push(eds, i);
    }
    Writer.pages.updatePageNumbers(eds.length);
  } catch (err) { console.warn('writer: flow failed', err); }
  Writer.flow.busy = false;
  Writer.flow.caret = c;
  Writer.flow.restoreCaret();
  Writer.flow.resetScroll();
  if (Writer.marks) Writer.marks.schedule();
};

/* HTML of the whole document with continuations re-joined (for save / export). */
Writer.flow.joinedHtml = function joinedHtml() {
  var holder = document.createElement('div');
  var eds = Writer.flow.editors();
  var i;
  for (i = 0; i < eds.length; i++) holder.insertAdjacentHTML('beforeend', eds[i].innerHTML);
  Writer.flow.joinContinuations(holder);
  return holder.innerHTML;
};
Writer.flow.joinContinuations = function joinContinuations(holder) {
  var saved = Writer.flow.caret;
  Writer.flow.caret = null;
  var conts = holder.querySelectorAll(':scope > [' + Writer.flow.CONT + ']');
  var i, el, prev;
  for (i = 0; i < conts.length; i++) {
    el = conts[i];
    prev = el.previousElementSibling;
    if (prev && prev.tagName === el.tagName) { Writer.flow.join(prev, el); el.remove(); }
    else el.removeAttribute(Writer.flow.CONT);
  }
  var rest = holder.querySelectorAll('[' + Writer.flow.CONT + ']');
  for (i = 0; i < rest.length; i++) rest[i].removeAttribute(Writer.flow.CONT);
  if (Writer.editor) Writer.editor.stripMarks(holder);
  Writer.flow.caret = saved;
};
