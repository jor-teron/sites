/* ============================================================
   FILE: modules/writer-headerfooter.js
   DF25: was modules/draftly-headerfooter.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Header & Footer. Left / centre / right plain-text slots,
         the same on every page, drawn inside the top and bottom
         margins (absolute, so body page breaks never move).
         Fields: {page}, {pages}, {date}. Saved with the document
         (record field `hf`). The Page-tab page-number buttons now
         write {page} into the footer centre / right slot.
   EDIT: Insert > Header & Footer, or double-click a page's top /
         bottom margin. Esc, Close, or a click in the body exits.
         Typing undo is the browser's own (plain-text slots).
   DEPENDS: config, pages, storage, ui, view, ribbon (optional)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.hf = {};
Writer.hf.data = { head: ['', '', ''], foot: ['', '', ''] };
Writer.hf.editing = false;
Writer.hf.lastSlot = null;
Writer.hf.saveTimer = null;
Writer.hf.PARTS = ['head', 'foot'];
/* Own small undo for header / footer edits (typing pauses end a step). */
Writer.hf.undoStack = [];
Writer.hf.redoStack = [];
Writer.hf.prev = null;
Writer.hf.lastPush = 0;
Writer.hf.stepMs = 450;

Writer.hf.blank = function blank() { return { head: ['', '', ''], foot: ['', '', ''] }; };

Writer.hf.get = function get() {
  var d = Writer.hf.data;
  return { head: d.head.slice(), foot: d.foot.slice() };
};

Writer.hf.isEmpty = function isEmpty(d) {
  d = d || Writer.hf.data;
  return !(d.head.join('') + d.foot.join('')).trim();
};

/* Load a document's header / footer. A document saved before this
   feature (no `hf`) starts from the old global page-number setting. */
Writer.hf.set = function set(saved) {
  var d = Writer.hf.blank();
  var ok = saved && Array.isArray(saved.head) && Array.isArray(saved.foot);
  if (ok) {
    for (var k = 0; k < 3; k++) {
      d.head[k] = String(saved.head[k] || '');
      d.foot[k] = String(saved.foot[k] || '');
    }
  } else if (Writer.breaks && Writer.breaks.loadNumbers) {
    var n = Writer.breaks.loadNumbers();
    if (n.on) d.foot[n.pos === 'right' ? 2 : 1] = '{page}';
  }
  Writer.hf.data = d;
  Writer.hf.undoStack = [];
  Writer.hf.redoStack = [];
  Writer.hf.prev = Writer.hf.get();
  Writer.hf.render();
};

/* Record the state before a change (merged while typing quickly). */
Writer.hf.record = function record(force) {
  var H = Writer.hf;
  var now = Date.now();
  if (H.prev && (force || now - H.lastPush > H.stepMs)) {
    H.undoStack.push(H.prev);
    if (H.undoStack.length > 100) H.undoStack.shift();
    H.redoStack = [];
  }
  H.lastPush = now;
};

Writer.hf.restore = function restore(from, to) {
  var H = Writer.hf;
  if (!from.length) return;
  to.push(H.get());
  H.data = from.pop();
  H.prev = H.get();
  H.lastPush = 0;
  var a = document.activeElement;
  if (a && a.classList.contains('hf-slot')) {
    a.textContent = H.data[a.parentNode.getAttribute('data-part')][+a.getAttribute('data-slot')];
    var sel = window.getSelection();
    sel.selectAllChildren(a);
    sel.collapseToEnd();
  }
  H.render();
  H.changed();
};

Writer.hf.today = function today() {
  try { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return new Date().toDateString(); }
};

/* Template text -> what one page shows. */
Writer.hf.fill = function fill(t, page, pages) {
  return String(t).replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages)).replace(/\{date\}/g, Writer.hf.today());
};

/* The header or footer box of one paper (made on demand). */
Writer.hf.box = function box(paper, part) {
  var b = paper.querySelector(':scope > .hf-' + part);
  if (b) return b;
  b = document.createElement('div');
  b.className = 'hf-box hf-' + part;
  b.setAttribute('data-part', part);
  for (var k = 0; k < 3; k++) {
    var s = document.createElement('div');
    s.className = 'hf-slot hf-slot-' + ['left', 'center', 'right'][k];
    s.setAttribute('data-slot', String(k));
    s.setAttribute('spellcheck', 'false');
    b.appendChild(s);
  }
  paper.appendChild(b);
  return b;
};

/* Draw every page. In edit mode the raw template is shown. */
Writer.hf.render = function render() {
  var H = Writer.hf;
  var papers = document.querySelectorAll('.paper');
  var n = papers.length;
  var editable = 'plaintext-only';
  for (var i = 0; i < n; i++) {
    for (var p = 0; p < 2; p++) {
      var part = H.PARTS[p];
      var b = H.box(papers[i], part);
      var empty = !H.data[part].join('').trim();
      b.classList.toggle('hf-empty', empty);
      for (var k = 0; k < 3; k++) {
        var s = b.children[k];
        var want = H.editing ? H.data[part][k] : H.fill(H.data[part][k], i + 1, n);
        if (s !== document.activeElement && s.textContent !== want) s.textContent = want;
        if (H.editing) {
          if (s.contentEditable !== editable) {
            s.contentEditable = editable;
            if (s.contentEditable !== editable) s.contentEditable = 'true';
          }
        } else if (s.isContentEditable) s.removeAttribute('contenteditable');
      }
    }
  }
  if (Writer.breaks && Writer.breaks.syncNumbers) Writer.breaks.syncNumbers();
};

Writer.hf.changed = function changed() {
  clearTimeout(Writer.hf.saveTimer);
  Writer.hf.saveTimer = setTimeout(function () {
    if (Writer.app && Writer.app.ready) Writer.storage.save();
  }, Writer.config.inputDebounceMs);
};

Writer.hf.enter = function enter(part, slot) {
  var H = Writer.hf;
  if (!H.editing) {
    H.editing = true;
    document.body.classList.add('hf-editing');
    if (Writer.ribbon) Writer.ribbon.selectTab('insert');
    var tools = document.getElementById('hfTools');
    if (tools) tools.hidden = false;
    var btn = document.getElementById('hfBtn');
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
    H.render();
  }
  var paper = (H.lastSlot && H.lastSlot.closest('.paper')) || document.querySelector('.paper');
  if (part) paper = part.paper || paper;
  var target = paper.querySelector('.hf-' + ((part && part.name) || 'head') + ' [data-slot="' + (slot == null ? 1 : slot) + '"]');
  if (target) {
    target.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(target);
    sel.collapseToEnd();
    H.lastSlot = target;
  }
};

Writer.hf.exit = function exit() {
  var H = Writer.hf;
  if (!H.editing) return;
  H.editing = false;
  document.body.classList.remove('hf-editing');
  var tools = document.getElementById('hfTools');
  if (tools) tools.hidden = true;
  var btn = document.getElementById('hfBtn');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
  if (document.activeElement && document.activeElement.classList.contains('hf-slot')) document.activeElement.blur();
  H.render();
  H.changed();
};

/* Insert a field token at the caret of the slot being edited. */
Writer.hf.insertField = function insertField(token) {
  var H = Writer.hf;
  if (!H.editing) H.enter({ name: 'foot' }, 1);
  var s = H.lastSlot;
  if (!s) return;
  if (document.activeElement !== s) {
    s.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(s);
    sel.collapseToEnd();
  }
  H.record(true);
  H.fieldStep = true;   /* the field is its own step */
  var cur = s.textContent;
  var t = (cur && !/\s$/.test(cur) ? ' ' : '') + token;
  if (!document.execCommand('insertText', false, t)) { s.textContent = cur + t; H.onInput({ target: s }); }
};

/* One slot changed: store it and copy it to the same slot on every page. */
Writer.hf.onInput = function onInput(e) {
  var s = e.target;
  if (!s || !s.classList || !s.classList.contains('hf-slot')) return;
  var part = s.parentNode.getAttribute('data-part');
  var k = +s.getAttribute('data-slot');
  if (Writer.hf.fieldStep) { Writer.hf.fieldStep = false; Writer.hf.lastPush = 0; }
  else Writer.hf.record(false);
  Writer.hf.data[part][k] = s.textContent.replace(/\n/g, ' ');
  Writer.hf.lastSlot = s;
  Writer.hf.prev = Writer.hf.get();
  Writer.hf.render();
  Writer.hf.changed();
};

/* Page-number buttons (Page tab) now edit the footer. */
Writer.hf.setNumbers = function setNumbers(on, pos) {
  var H = Writer.hf;
  try {
    localStorage.setItem(Writer.config.storageKeyPageNumbers, on ? '1' : '0');
    localStorage.setItem(Writer.config.storageKeyPageNumberPos, pos === 'right' ? 'right' : 'center');
  } catch (e) {}
  H.record(true);
  var f = H.data.foot;
  if (f[1] === '{page}') f[1] = '';
  if (f[2] === '{page}') f[2] = '';
  if (on) f[pos === 'right' ? 2 : 1] = '{page}';
  H.prev = H.get();
  H.render();
  H.changed();
};

/* Page-number buttons show which footer slot holds a bare {page}. */
Writer.hf.syncNumbers = function syncNumbers() {
  var f = Writer.hf.data.foot;
  var key = f[1] === '{page}' ? 'center' : (f[2] === '{page}' ? 'right' : 'off');
  var opts = document.querySelectorAll('#pagePanel .seg-btn[data-pn]');
  for (var i = 0; i < opts.length; i++) {
    var hit = opts[i].getAttribute('data-pn') === key;
    opts[i].classList.toggle('active', hit);
    opts[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
  }
};

/* Which margin (if any) a point on a paper is in. */
Writer.hf.marginAt = function marginAt(paper, x, y) {
  var r = paper.getBoundingClientRect();
  var z = (Writer.view && Writer.view.zoom) || 1;
  var cm = Writer.view ? Writer.view.CM_PX : 96 / 2.54;
  var cfg = Writer.config;
  var part = null;
  if (y - r.top < cfg.marginTopCm * cm * z) part = 'head';
  else if (r.bottom - y < cfg.marginBottomCm * cm * z) part = 'foot';
  if (!part) return null;
  var third = Math.min(2, Math.max(0, Math.floor((x - r.left) / (r.width / 3))));
  return { name: part, paper: paper, slot: third };
};

Writer.hf.bind = function bind() {
  var H = Writer.hf;
  /* Old page-number badges are replaced by the footer. */
  document.body.classList.remove('pn-on', 'pn-right');
  if (Writer.breaks) {
    Writer.breaks.setNumbers = H.setNumbers;
    Writer.breaks.syncNumbers = H.syncNumbers;
  }
  /* Redraw after every pagination pass. */
  var up = Writer.pages.updatePageNumbers;
  Writer.pages.updatePageNumbers = function () {
    var out = up.apply(this, arguments);
    H.render();
    return out;
  };
  Writer.ui.onClick('hfBtn', function () { if (H.editing) H.exit(); else H.enter({ name: 'head' }, 1); });
  Writer.ui.onClick('hfCloseBtn', function () { H.exit(); });
  var fields = document.querySelectorAll('#hfTools [data-hf-field]');
  for (var i = 0; i < fields.length; i++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); H.insertField(b.getAttribute('data-hf-field')); });
    })(fields[i]);
  }
  var ws = document.getElementById('workspace');
  if (ws) {
    ws.addEventListener('input', H.onInput);
    ws.addEventListener('focusin', function (e) {
      if (e.target.classList && e.target.classList.contains('hf-slot')) H.lastSlot = e.target;
    });
    ws.addEventListener('dblclick', function (e) {
      if (H.editing && e.target.closest('.hf-box')) return;
      var paper = e.target.closest('.paper');
      if (!paper || e.target.closest('.' + Writer.config.editorClass)) return;
      var m = H.marginAt(paper, e.clientX, e.clientY);
      if (!m) return;
      e.preventDefault();
      H.enter(m, m.slot);
    });
  }
  /* A click anywhere outside the header / footer and its tools ends editing. */
  document.addEventListener('mousedown', function (e) {
    if (!H.editing) return;
    if (e.target.closest('.hf-box, #hfTools, #hfBtn')) return;
    H.exit();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!H.editing) return;
    var inSlot = e.target.classList && e.target.classList.contains('hf-slot');
    if (e.key === 'Escape') { e.preventDefault(); H.exit(); return; }
    if (inSlot && e.key === 'Enter') e.preventDefault();   /* one line per slot */
    if (inSlot && (e.ctrlKey || e.metaKey) && !e.altKey) {
      var key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); H.restore(H.undoStack, H.redoStack); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); e.stopPropagation(); H.restore(H.redoStack, H.undoStack); }
    }
  }, true);
  H.render();
};
