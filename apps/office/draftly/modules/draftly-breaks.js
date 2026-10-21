/* ============================================================
   FILE: modules/draftly-breaks.js
   PROJECT: Draftly
   ROLE: Manual page breaks (toolbar button, Ctrl/⌘+Enter) and
         page numbers in the bottom margin (Page popup).
   MODEL: A break is a top-level
          <div class="dr-pagebreak" contenteditable="false">.
          draftly-flow.js moves everything after it to the next
          page. Backspace at the start of the block after it, or
          Delete at the end of the block before it, removes it.
          Page numbers are the .page-number badge of each paper
          (decoration, never part of the content).
   DEPENDS: Draftly.config, Draftly.flow, Draftly.pages,
            Draftly.editor, Draftly.history, Draftly.ui
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.breaks = {};

Draftly.breaks.make = function make() {
  var d = document.createElement('div');
  d.className = Draftly.flow.BREAK;
  d.setAttribute('contenteditable', 'false');
  d.setAttribute('data-label', 'Page break');
  return d;
};

/* Top-level block of an editor holding `node`, or null. */
Draftly.breaks.topBlock = function topBlock(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  var ed = el && el.closest('.' + Draftly.config.editorClass);
  if (!ed) return null;
  while (el && el.parentElement !== ed) el = el.parentElement;
  return el && el.parentElement === ed ? el : null;
};

/* Neighbouring top-level block across pages. */
Draftly.breaks.sibling = function sibling(block, dir) {
  var s = dir < 0 ? block.previousElementSibling : block.nextElementSibling;
  if (s) return s;
  var eds = Draftly.flow.editors();
  var i = eds.indexOf(block.parentElement) + dir;
  var ed = eds[i];
  return ed ? (dir < 0 ? ed.lastElementChild : ed.firstElementChild) : null;
};

/* Insert a break at the caret: split the paragraph, break, caret on the new page. */
Draftly.breaks.insert = function insert() {
  var sel = window.getSelection();
  if ((!sel || !sel.rangeCount || !Draftly.breaks.topBlock(sel.anchorNode)) && Draftly.editor.restoreSelection) {
    Draftly.editor.restoreSelection();      // toolbar click: use the last caret
    sel = window.getSelection();
  }
  if (!sel || !sel.rangeCount || !Draftly.breaks.topBlock(sel.anchorNode)) {
    var first = Draftly.pages.firstEditor();
    if (!first) return;
    first.focus();
    sel = window.getSelection();
    sel.selectAllChildren(first);
    sel.collapseToEnd();
  }
  if (!sel.isCollapsed) sel.deleteFromDocument();
  var block = Draftly.breaks.topBlock(sel.anchorNode);
  var editor;
  if (!block) {
    editor = Draftly.pages.firstEditor();
    block = document.createElement('p');
    block.innerHTML = '<br>';
    editor.appendChild(block);
  }
  editor = block.parentElement;
  /* split at the caret */
  var r = sel.getRangeAt(0);
  var tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  tail.setEnd(block, block.childNodes.length);
  var frag = tail.extractContents();
  var after = block.cloneNode(false);
  after.removeAttribute('id');
  after.removeAttribute(Draftly.flow.CONT);
  after.appendChild(frag);
  if (!after.textContent.length && !after.querySelector('br,img')) after.innerHTML = '<br>';
  if (!block.textContent.length && !block.querySelector('br,img')) block.innerHTML = '<br>';
  var pb = Draftly.breaks.make();
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
  Draftly.breaks.changed();
};

/* Remove a break and re-flow. */
Draftly.breaks.remove = function remove(pb) {
  Draftly.history.checkpoint();
  pb.remove();
  Draftly.breaks.changed();
  Draftly.history.commit();
};

Draftly.breaks.changed = function changed() {
  Draftly.pages.checkPagination();
  if (Draftly.app && Draftly.app.ready) {
    clearTimeout(Draftly.app.inputTimer);
    Draftly.app.inputTimer = setTimeout(function () { Draftly.storage.save(); }, Draftly.config.inputDebounceMs);
  }
};

/* True when the collapsed caret is at the start (dir<0) / end (dir>0) of `block`. */
Draftly.breaks.atEdge = function atEdge(r, block, dir) {
  var t = document.createRange();
  if (dir < 0) { t.setStart(block, 0); t.setEnd(r.startContainer, r.startOffset); }
  else { t.setStart(r.startContainer, r.startOffset); t.setEnd(block, block.childNodes.length); }
  return !t.toString().length;
};

Draftly.breaks.onKey = function onKey(e) {
  if (e.isComposing || !Draftly.editor.isInEditor(e.target)) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    Draftly.breaks.insert();
    return;
  }
  if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.metaKey || e.altKey) return;
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  var r = sel.getRangeAt(0);
  var block = Draftly.breaks.topBlock(r.startContainer);
  if (!block) return;
  var dir = e.key === 'Backspace' ? -1 : 1;
  if (!Draftly.breaks.atEdge(r, block, dir)) return;
  var nb = Draftly.breaks.sibling(block, dir);
  if (!Draftly.flow.isBreak(nb)) return;
  e.preventDefault();
  Draftly.breaks.remove(nb);
};

/* ----- page numbers ----- */
Draftly.breaks.loadNumbers = function loadNumbers() {
  var out = { on: false, pos: 'center' };
  try {
    out.on = localStorage.getItem(Draftly.config.storageKeyPageNumbers) === '1';
    out.pos = localStorage.getItem(Draftly.config.storageKeyPageNumberPos) === 'right' ? 'right' : 'center';
  } catch (e) {}
  return out;
};

Draftly.breaks.setNumbers = function setNumbers(on, pos) {
  var b = document.body;
  b.classList.toggle('pn-on', !!on);
  b.classList.toggle('pn-right', pos === 'right');
  try {
    localStorage.setItem(Draftly.config.storageKeyPageNumbers, on ? '1' : '0');
    localStorage.setItem(Draftly.config.storageKeyPageNumberPos, pos === 'right' ? 'right' : 'center');
  } catch (e) {}
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  var key = on ? pos : 'off';
  for (var i = 0; i < opts.length; i++) {
    var hit = opts[i].getAttribute('data-pn') === key;
    opts[i].classList.toggle('active', hit);
    opts[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

Draftly.breaks.init = function init() {
  document.addEventListener('keydown', Draftly.breaks.onKey, true);
  Draftly.history.wrap(Draftly.breaks, 'insert');
  var btn = document.getElementById('pageBreakBtn');
  if (btn) {
    btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    btn.addEventListener('click', function (ev) { ev.preventDefault(); Draftly.breaks.insert(); });
  }
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  for (var i = 0; i < opts.length; i++) {
    opts[i].addEventListener('click', function (ev) {
      var v = ev.currentTarget.getAttribute('data-pn');
      var cur = Draftly.breaks.loadNumbers();
      Draftly.breaks.setNumbers(v !== 'off', v === 'off' ? cur.pos : v);
      Draftly.ui.showToast(v === 'off' ? 'Page numbers off' : 'Page numbers: bottom ' + v);
    });
  }
  var s = Draftly.breaks.loadNumbers();
  Draftly.breaks.setNumbers(s.on, s.pos);
};

Draftly.breaks.init();
