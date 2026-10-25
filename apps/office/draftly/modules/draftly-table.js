/* ============================================================
   FILE: modules/draftly-table.js
   PROJECT: Draftly
   ROLE: FT7 basic tables. Insert tab "Table" grid picker (up to
         8x8), contextual row/column/delete tools while the caret
         is in a table, Tab / Shift+Tab between cells.
   MODEL: A top-level <table> with inline 1px borders (so print,
          PDF and html-docx keep them). draftly-flow.js moves a
          table whole to the next page; a table taller than a
          page overflows instead of splitting.
   DEPENDS: Draftly.breaks, Draftly.flow, Draftly.history,
            Draftly.editor, Draftly.pages
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.table = {};
Draftly.table.MAX = 8;
Draftly.table.TBL = 'border-collapse:collapse;width:100%;table-layout:fixed;';
Draftly.table.TD = 'border:1px solid #000;padding:4px 6px;vertical-align:top;';

Draftly.table.cell = function cell() {
  var td = document.createElement('td');
  td.setAttribute('style', Draftly.table.TD);
  td.innerHTML = '<br>';
  return td;
};

Draftly.table.make = function make(rows, cols) {
  var t = document.createElement('table');
  t.setAttribute('style', Draftly.table.TBL);
  var tb = document.createElement('tbody');
  for (var r = 0; r < rows; r++) {
    var tr = document.createElement('tr');
    for (var c = 0; c < cols; c++) tr.appendChild(Draftly.table.cell());
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  return t;
};

Draftly.table.focusCell = function focusCell(td, atEnd) {
  if (!td) return;
  var sel = window.getSelection();
  var r = document.createRange();
  r.selectNodeContents(td);
  r.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(r);
  if (Draftly.editor.saveSelection) Draftly.editor.saveSelection();
  Draftly.table.sync();
};

/* Cell holding the caret (or the last saved caret), or null. */
Draftly.table.current = function current() {
  var sel = window.getSelection();
  var n = sel && sel.rangeCount ? sel.anchorNode : null;
  var el = n && (n.nodeType === 1 ? n : n.parentElement);
  var td = el && el.closest('td,th');
  return td && Draftly.editor.isInEditor(td) ? td : null;
};

/* Insert a rows x cols table at the caret as its own block. */
Draftly.table.insert = function insert(rows, cols) {
  var sel = window.getSelection();
  if ((!sel.rangeCount || !Draftly.breaks.topBlock(sel.anchorNode)) && Draftly.editor.restoreSelection) {
    Draftly.editor.restoreSelection();
    sel = window.getSelection();
  }
  if (Draftly.table.current()) return;      // no nested tables
  var block = sel.rangeCount ? Draftly.breaks.topBlock(sel.anchorNode) : null;
  var editor, after;
  if (!block) {
    editor = Draftly.pages.firstEditor();
    if (!editor) return;
    block = editor.lastElementChild;
    if (!block) { block = document.createElement('p'); block.innerHTML = '<br>'; editor.appendChild(block); }
    after = null;
  } else {
    if (!sel.isCollapsed) sel.deleteFromDocument();
    var r = sel.getRangeAt(0);
    var tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(block, block.childNodes.length);
    var frag = tail.extractContents();
    after = block.cloneNode(false);
    after.removeAttribute('id');
    after.removeAttribute(Draftly.flow.CONT);
    after.appendChild(frag);
    if (!after.textContent.length && !after.querySelector('br,img')) after.innerHTML = '<br>';
    if (!block.textContent.length && !block.querySelector('br,img')) block.innerHTML = '<br>';
  }
  editor = block.parentElement;
  var t = Draftly.table.make(rows, cols);
  if (!after) { after = document.createElement('p'); after.innerHTML = '<br>'; }
  editor.insertBefore(t, block.nextSibling);
  editor.insertBefore(after, t.nextSibling);
  /* drop an empty paragraph left before the table */
  if (block.tagName === 'P' && !block.textContent.length && block.previousElementSibling) block.remove();
  Draftly.table.focusCell(t.rows[0].cells[0]);
  Draftly.breaks.changed();
};

/* Structural edit on the current table. */
Draftly.table.op = function op(name) {
  var td = Draftly.table.current();
  if (!td && Draftly.editor.restoreSelection) { Draftly.editor.restoreSelection(); td = Draftly.table.current(); }
  if (!td) return;
  var tr = td.parentElement, t = tr.closest('table');
  var ci = td.cellIndex, ri = tr.rowIndex, rows = t.rows, i, next;
  var newRow = function () {
    var nr = document.createElement('tr');
    for (var k = 0; k < tr.cells.length; k++) nr.appendChild(Draftly.table.cell());
    return nr;
  };
  if (name === 'rowAbove' || name === 'rowBelow') {
    next = newRow();
    tr.parentElement.insertBefore(next, name === 'rowAbove' ? tr : tr.nextSibling);
    td = next.cells[ci];
  } else if (name === 'colLeft' || name === 'colRight') {
    for (i = 0; i < rows.length; i++) {
      var ref = rows[i].cells[ci];
      var c = Draftly.table.cell();
      rows[i].insertBefore(c, name === 'colLeft' ? ref : ref.nextSibling);
      if (i === ri) td = c;
    }
  } else if (name === 'delRow') {
    if (rows.length === 1) return Draftly.table.remove(t);
    next = rows[ri + 1] || rows[ri - 1];
    tr.remove();
    td = next.cells[Math.min(ci, next.cells.length - 1)];
  } else if (name === 'delCol') {
    if (tr.cells.length === 1) return Draftly.table.remove(t);
    for (i = 0; i < rows.length; i++) rows[i].cells[ci].remove();
    td = tr.cells[Math.min(ci, tr.cells.length - 1)];
  } else if (name === 'delTable') {
    return Draftly.table.remove(t);
  }
  Draftly.table.focusCell(td);
  Draftly.breaks.changed();
};

Draftly.table.remove = function remove(t) {
  var next = t.nextElementSibling || t.previousElementSibling;
  if (!next) { next = document.createElement('p'); next.innerHTML = '<br>'; t.parentElement.appendChild(next); }
  t.remove();
  var sel = window.getSelection(), r = document.createRange();
  r.selectNodeContents(next); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  Draftly.table.sync();
  Draftly.breaks.changed();
};

/* Tab / Shift+Tab between cells; Tab in the last cell adds a row. */
Draftly.table.onKey = function onKey(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  var td = Draftly.table.current();
  if (!td) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  var t = td.closest('table');
  var cells = Array.prototype.slice.call(t.querySelectorAll('td,th'));
  var i = cells.indexOf(td) + (e.shiftKey ? -1 : 1);
  if (i < 0) return;
  if (i >= cells.length) { Draftly.table.op('rowBelow'); return; }
  Draftly.table.focusCell(cells[i], true);
};

/* Show the contextual tools while the caret is in a table. */
Draftly.table.sync = function sync() {
  var g = document.getElementById('tableTools');
  if (g) g.hidden = !Draftly.table.current();
};

Draftly.table.picker = function picker(open) {
  var p = document.getElementById('tablePicker');
  var b = document.getElementById('tableBtn');
  if (!p) return;
  p.hidden = !open;
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    /* DF1: fixed under the Table button, clamped to the viewport */
    if (p.parentNode !== document.body) document.body.appendChild(p);   /* ribbon backdrop-filter traps fixed */
    var r = b.getBoundingClientRect();
    p.style.top = (r.bottom + 4) + 'px';
    var w = p.offsetWidth, vw = document.documentElement.clientWidth;
    p.style.left = Math.max(4, Math.min(r.left, vw - w - 4)) + 'px';
    Draftly.table.pick(1, 1);
    p.querySelector('.tp-cell').focus({ preventScroll: true });
  }
};

Draftly.table.pick = function pick(r, c) {
  Draftly.table.sel = { r: r, c: c };
  var cells = document.querySelectorAll('#tpGrid .tp-cell');
  for (var i = 0; i < cells.length; i++) {
    cells[i].classList.toggle('on', +cells[i].dataset.r <= r && +cells[i].dataset.c <= c);
  }
  document.getElementById('tpLabel').textContent = r + ' x ' + c;
};

Draftly.table.init = function init() {
  var T = Draftly.table, M = T.MAX;
  Draftly.history.wrap(T, 'insert');
  Draftly.history.wrap(T, 'op');
  document.addEventListener('keydown', T.onKey, true);
  document.addEventListener('selectionchange', T.sync);
  var grid = document.getElementById('tpGrid');
  var btn = document.getElementById('tableBtn');
  if (!grid || !btn) return;
  for (var r = 1; r <= M; r++) for (var c = 1; c <= M; c++) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-cell'; b.dataset.r = r; b.dataset.c = c;
    b.setAttribute('aria-label', r + ' x ' + c);
    b.tabIndex = -1;
    grid.appendChild(b);
  }
  grid.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  grid.addEventListener('mouseover', function (ev) {
    var d = ev.target.dataset; if (d && d.r) T.pick(+d.r, +d.c);
  });
  grid.addEventListener('click', function (ev) {
    var d = ev.target.dataset; if (!d || !d.r) return;
    T.picker(false); T.insert(+d.r, +d.c);
  });
  document.getElementById('tablePicker').addEventListener('keydown', function (ev) {
    var s = T.sel, k = ev.key;
    if (k === 'Escape') { T.picker(false); btn.focus(); }
    else if (k === 'Enter' || k === ' ') { T.picker(false); T.insert(s.r, s.c); }
    else if (k === 'ArrowRight') T.pick(s.r, Math.min(M, s.c + 1));
    else if (k === 'ArrowLeft') T.pick(s.r, Math.max(1, s.c - 1));
    else if (k === 'ArrowDown') T.pick(Math.min(M, s.r + 1), s.c);
    else if (k === 'ArrowUp') T.pick(Math.max(1, s.r - 1), s.c);
    else return;
    ev.preventDefault();
  });
  btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    T.picker(document.getElementById('tablePicker').hidden);
  });
  document.addEventListener('mousedown', function (ev) {
    if (!ev.target.closest('#tablePicker,#tableBtn')) T.picker(false);
  });
  /* DF1: a fixed picker would drift; close it on resize or ribbon scroll */
  window.addEventListener('resize', function () { T.picker(false); });
  var rib = btn.closest('.ribbon');
  if (rib) rib.addEventListener('scroll', function () { T.picker(false); });
  var tools = document.querySelectorAll('#tableTools [data-tbl]');
  for (var i = 0; i < tools.length; i++) {
    tools[i].addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    tools[i].addEventListener('click', function (ev) {
      ev.preventDefault(); T.op(ev.currentTarget.getAttribute('data-tbl'));
    });
  }
};

Draftly.table.init();
