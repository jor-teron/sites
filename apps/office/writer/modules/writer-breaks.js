/* ============================================================
   FILE: modules/writer-breaks.js
   DF25: was modules/draftly-breaks.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Manual page breaks (toolbar button, Ctrl/⌘+Enter) and
         page numbers in the bottom margin (Page popup).
   MODEL: A break is a top-level
          <div class="dr-pagebreak" contenteditable="false">.
          writer-flow.js moves everything after it to the next
          page. Backspace at the start of the block after it, or
          Delete at the end of the block before it, removes it.
          Page numbers are the .page-number badge of each paper
          (decoration, never part of the content).
   DEPENDS: Writer.config, Writer.flow, Writer.pages,
            Writer.editor, Writer.history, Writer.ui
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.breaks = {};

Writer.breaks.make = function make() {
  var d = document.createElement('div');
  d.className = Writer.flow.BREAK;
  d.setAttribute('contenteditable', 'false');
  d.setAttribute('data-label', 'Page break');
  return d;
};

/* Top-level block of an editor holding `node`, or null. */
Writer.breaks.topBlock = function topBlock(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  var ed = el && el.closest('.' + Writer.config.editorClass);
  if (!ed) return null;
  while (el && el.parentElement !== ed) el = el.parentElement;
  return el && el.parentElement === ed ? el : null;
};

/* Neighbouring top-level block across pages. */
Writer.breaks.sibling = function sibling(block, dir) {
  var s = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
  if (s) return s;
  var eds = Writer.flow.editors();
  var i = eds.indexOf(block.parentElement) + dir;
  var ed = eds[i];
  return ed ? (dir < 0 ? ed.lastElementChild : ed.firstElementChild) : null;
};

/* Insert a break at the caret: split the paragraph, break, caret on the new page. */
Writer.breaks.insert = function insert() {
  var sel = window.getSelection();
  if ((!sel || !sel.rangeCount || !Writer.breaks.topBlock(sel.anchorNode)) && Writer.editor.restoreSelection) {
    Writer.editor.restoreSelection();      // toolbar click: use the last caret
    sel = window.getSelection();
  }
  if (!sel || !sel.rangeCount || !Writer.breaks.topBlock(sel.anchorNode)) {
    var first = Writer.pages.firstEditor();
    if (!first) return;
    first.focus();
    sel = window.getSelection();
    sel.selectAllChildren(first);
    sel.collapseToEnd();
  }
  if (!sel.isCollapsed) sel.deleteFromDocument();
  var block = Writer.breaks.topBlock(sel.anchorNode);
  var editor;
  if (!block) {
    editor = Writer.pages.firstEditor();
    block = document.createElement('p');
    block.innerHTML = '<br>';
    editor.appendChild(block);
  }
  editor = block.parentElement;
  if (block.nodeName === 'TABLE') {   /* DF1: never split a table; break after it */
    var pbT = Writer.breaks.make(), pT = document.createElement('p');
    pT.innerHTML = '<br>';
    editor.insertBefore(pbT, block.nextSibling);
    editor.insertBefore(pT, pbT.nextSibling);
    var cT = document.createRange();
    cT.setStart(pT, 0); cT.collapse(true);
    sel.removeAllRanges(); sel.addRange(cT);
    Writer.breaks.changed();
    return;
  }
  /* split at the caret */
  var r = sel.getRangeAt(0);
  var tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(block, block.childNodes.length);
  var frag = tail.extractContents();
  var after = block.cloneNode(false);
  after.removeAttribute('id');
  after.removeAttribute(Writer.flow.CONT);
  after.appendChild(frag);
  if (!after.textContent.length && !after.querySelector('br,img')) after.innerHTML = '<br>';
  if (!block.textContent.length && !block.querySelector('br,img')) block.innerHTML = '<br>';
  var pb = Writer.breaks.make();
  editor.insertBefore(pb, block.nextSibling);
  editor.insertBefore(after, pb.nextSibling);
  var c = document.createRange();
  var first2 = after.firstChild;
  while (first2 && first2.firstChild && first2.nodeName !== 'BR') first2 = first2.firstChild;
  if (first2 && first2.nodeType === 3) c.setStart(first2, 0);
  else c.setStart(first2 && first2.nodeName !== 'BR' ? first2 : after, 0);
  c.collapse(true);
  sel.removeAllRanges();
  sel.addRange(c);
  Writer.breaks.changed();
};

/* Remove a break and re-flow. */
Writer.breaks.remove = function remove(pb) {
  Writer.history.checkpoint();
  pb.remove();
  Writer.breaks.changed();
  Writer.history.commit();
};

Writer.breaks.changed = function changed() {
  Writer.pages.checkPagination();
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () { Writer.storage.save(); }, Writer.config.inputDebounceMs);
  }
};

/* True when the collapsed caret is at the start (dir<0) / end (dir>0) of `block`. */
Writer.breaks.atEdge = function atEdge(r, block, dir) {
  var t = document.createRange();
  if (dir < 0) { t.setStart(block, 0); t.setEnd(r.startContainer, r.startOffset); }
  else { t.setStart(r.startContainer, r.startOffset); t.setEnd(block, block.childNodes.length); }
  return !t.toString().length;
};

Writer.breaks.onKey = function onKey(e) {
  if (e.isComposing || !Writer.editor.isInEditor(e.target)) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    Writer.breaks.insert();
    return;
  }
  if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.metaKey || e.altKey) return;
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  var r = sel.getRangeAt(0);
  var block = Writer.breaks.topBlock(r.startContainer);
  if (!block) return;
  var dir = e.key === 'Backspace' ? -1 : 1;
  if (!Writer.breaks.atEdge(r, block, dir)) return;
  var nb = Writer.breaks.sibling(block, dir);
  if (!Writer.flow.isBreak(nb)) return;
  e.preventDefault();
  Writer.breaks.remove(nb);
};

/* ----- page numbers ----- */
Writer.breaks.loadNumbers = function loadNumbers() {
  var out = { on: false, pos: 'center' };
  try {
    out.on = localStorage.getItem(Writer.config.storageKeyPageNumbers) === '1';
    out.pos = localStorage.getItem(Writer.config.storageKeyPageNumberPos) === 'right' ? 'right' : 'center';
  } catch (e) {}
  return out;
};

Writer.breaks.setNumbers = function setNumbers(on, pos) {
  var b = document.body;
  b.classList.toggle('pn-on', !!on);
  b.classList.toggle('pn-right', pos === 'right');
  try {
    localStorage.setItem(Writer.config.storageKeyPageNumbers, on ? '1' : '0');
    localStorage.setItem(Writer.config.storageKeyPageNumberPos, pos === 'right' ? 'right' : 'center');
  } catch (e) {}
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  var key = on ? pos : 'off';
  for (var i = 0; i < opts.length; i++) {
    var hit = opts[i].getAttribute('data-pn') === key;
    opts[i].classList.toggle('active', hit);
    opts[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

Writer.breaks.init = function init() {
  document.addEventListener('keydown', Writer.breaks.onKey, true);
  Writer.history.wrap(Writer.breaks, 'insert');
  var btn = document.getElementById('pageBreakBtn');
  if (btn) {
    btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    btn.addEventListener('click', function (ev) { ev.preventDefault(); Writer.breaks.insert(); });
  }
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  for (var i = 0; i < opts.length; i++) {
    opts[i].addEventListener('click', function (ev) {
      var v = ev.currentTarget.getAttribute('data-pn');
      var cur = Writer.breaks.loadNumbers();
      Writer.breaks.setNumbers(v !== 'off', v === 'off' ? cur.pos : v);
      Writer.ui.showToast(v === 'off' ? 'Page numbers off' : 'Page numbers: bottom ' + v);
    });
  }
  var s = Writer.breaks.loadNumbers();
  Writer.breaks.setNumbers(s.on, s.pos);
};

Writer.breaks.init();
