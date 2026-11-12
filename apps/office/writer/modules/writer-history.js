/* ============================================================
   FILE: modules/writer-history.js
   DF25: was modules/draftly-history.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: App-managed undo / redo. Pagination and Shift+Enter
         change the DOM outside the browser's own history, so
         Writer keeps whole-document snapshots instead.
   DEPENDS: config, editor, pages, flow, storage, ui, lists
   ISOLATION: Wraps editor / list commands to checkpoint first.
              If a module is missing, that wrap is skipped.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.history = {};

/* Steps kept, and the pause that ends one typing step. */
Writer.history.limit = 100;
Writer.history.typingMs = 450;

Writer.history.undoStack = [];
Writer.history.redoStack = [];
Writer.history.current = null;
Writer.history.timer = null;
Writer.history.applying = false;

/* Caret as a character offset across all pages (text + <br> = 1). */
Writer.history.caretOffset = function caretOffset() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var r = sel.getRangeAt(0);
  if (!Writer.editor.isInEditor(r.startContainer)) return null;
  var eds = Writer.flow.editors();
  var count = 0;
  var i, w, n, probe;
  for (i = 0; i < eds.length; i++) {
    w = document.createTreeWalker(eds[i], NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        if (n === r.startContainer) return count + r.startOffset;
        probe = document.createRange();
        probe.selectNode(n);
        if (probe.compareBoundaryPoints(Range.START_TO_START, r) > 0) return count;
        count += n.nodeValue.length;
      } else if (n.tagName === 'BR') {
        probe = document.createRange();
        probe.selectNode(n);
        if (probe.compareBoundaryPoints(Range.START_TO_START, r) >= 0) return count;
        count += 1;
      }
    }
  }
  return count;
};

/* Put the caret at a saved character offset after reflow. */
Writer.history.setCaret = function setCaret(offset) {
  var eds = Writer.flow.editors();
  if (!eds.length) return;
  var target = eds[0];
  var node = null;
  var pos = 0;
  var left = offset == null ? 0 : offset;
  var i, w, n, last = null;
  for (i = 0; i < eds.length && !node; i++) {
    w = document.createTreeWalker(eds[i], NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        last = { node: n, pos: n.nodeValue.length, ed: eds[i] };
        if (left <= n.nodeValue.length) { node = n; pos = left; target = eds[i]; break; }
        left -= n.nodeValue.length;
      } else if (n.tagName === 'BR') {
        if (left === 0) {
          node = n.parentNode;
          pos = Array.prototype.indexOf.call(node.childNodes, n);
          target = eds[i];
          break;
        }
        left -= 1;
        last = { node: n.parentNode, pos: Array.prototype.indexOf.call(n.parentNode.childNodes, n) + 1, ed: eds[i] };
      }
    }
  }
  if (!node && last) { node = last.node; pos = last.pos; target = last.ed; }
  try {
    target.focus({ preventScroll: true });
    var sel = window.getSelection();
    if (node) sel.collapse(node, pos);
    else sel.collapse(target, 0);
  } catch (e) {}
  Writer.editor.activeEditor = target;
  Writer.editor.saveSelection();
};

/* Snapshot of the whole document. */
Writer.history.snapshot = function snapshot() {
  return { html: Writer.pages.combinedHtml(), caret: Writer.history.caretOffset() };
};

/* Enable / disable the toolbar buttons. */
Writer.history.sync = function sync() {
  var u = document.getElementById('undoBtn');
  var r = document.getElementById('redoBtn');
  if (u) u.disabled = !Writer.history.canUndo();
  if (r) r.disabled = !Writer.history.redoStack.length;
};

Writer.history.canUndo = function canUndo() {
  if (Writer.history.undoStack.length) return true;
  return !!(Writer.history.timer && Writer.history.current &&
    Writer.pages.combinedHtml() !== Writer.history.current.html);
};

/* Record the document now if it differs from the last step. */
Writer.history.commit = function commit() {
  var h = Writer.history;
  clearTimeout(h.timer);
  h.timer = null;
  if (h.applying || !Writer.app || !Writer.app.ready) return;
  var snap = h.snapshot();
  if (!h.current) { h.current = snap; h.sync(); return; }
  if (snap.html === h.current.html) { h.current.caret = snap.caret; h.sync(); return; }
  h.undoStack.push(h.current);
  if (h.undoStack.length > h.limit) h.undoStack.shift();
  h.redoStack = [];
  h.current = snap;
  h.sync();
};

/* Before a command: close the pending typing step. */
Writer.history.checkpoint = function checkpoint() {
  Writer.history.commit();
};

/* After typing: group keystrokes into one step. */
Writer.history.schedule = function schedule() {
  var h = Writer.history;
  if (h.applying) return;
  clearTimeout(h.timer);
  h.timer = setTimeout(h.commit, h.typingMs);
  h.sync();
};

/* Forget all steps (open, new, delete-switch). */
Writer.history.reset = function reset() {
  var h = Writer.history;
  clearTimeout(h.timer);
  h.timer = null;
  h.undoStack = [];
  h.redoStack = [];
  h.current = (Writer.app && Writer.app.ready) ? h.snapshot() : null;
  h.sync();
};

/* Load a snapshot, reflow, restore the caret, mark dirty. */
Writer.history.apply = function apply(snap) {
  var h = Writer.history;
  h.applying = true;
  try {
    Writer.pages.rebuildSinglePage();
    var editor = Writer.pages.firstEditor();
    editor.innerHTML = snap.html || Writer.config.defaultHtml;
    Writer.editor.stripMarks(editor);
    Writer.flow.caret = null;
    Writer.pages.layoutAll();
    h.setCaret(snap.caret);
    if (Writer.ui) Writer.ui.updateToolbarState();
  } catch (err) {
    console.warn('writer: history apply failed', err);
  }
  h.applying = false;
  /* Dirty: autosave on the normal input timer. */
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () {
      Writer.storage.save();
    }, Writer.config.inputDebounceMs);
  }
  h.sync();
};

Writer.history.undo = function undo() {
  var h = Writer.history;
  h.commit();
  if (!h.undoStack.length) return false;
  h.redoStack.push(h.current);
  h.current = h.undoStack.pop();
  h.apply(h.current);
  return true;
};

Writer.history.redo = function redo() {
  var h = Writer.history;
  h.commit();
  if (!h.redoStack.length) return false;
  h.undoStack.push(h.current);
  h.current = h.redoStack.pop();
  h.apply(h.current);
  return true;
};

/* Wrap one command so it starts a fresh step. */
Writer.history.wrap = function wrap(obj, name) {
  if (!obj || typeof obj[name] !== 'function') return;
  var orig = obj[name];
  obj[name] = function () {
    Writer.history.checkpoint();
    var out = orig.apply(this, arguments);
    Writer.history.commit();
    return out;
  };
};

/* Keys, beforeinput, input and toolbar. */
Writer.history.init = function init() {
  var h = Writer.history;
  var e;
  var list = ['execCmd', 'setFontFamily', 'applyFontSize', 'onPaste', 'insertLineBreak', 'setScript'];
  for (e = 0; e < list.length; e++) h.wrap(Writer.editor, list[e]);
  h.wrap(Writer.lists, 'apply');
  h.wrap(Writer.lists, 'applySuffix');

  /* HO1: Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z go through ../shared/office-quick.js (writer-quick.js). */

  document.addEventListener('beforeinput', function (ev) {
    if (!Writer.editor.isInEditor(ev.target)) return;
    if (ev.inputType === 'historyUndo') { ev.preventDefault(); h.undo(); }
    else if (ev.inputType === 'historyRedo') { ev.preventDefault(); h.redo(); }
  }, true);

  document.addEventListener('input', function (ev) {
    if (!Writer.editor.isInEditor(ev.target)) return;
    var t = ev.inputType || '';
    if (/^(insertText|insertCompositionText|deleteContent|deleteWord|deleteSoftLine|deleteHardLine)/.test(t) || !t) h.schedule();
    else h.commit();
  });

  var bind = function (id, fn) {
    var b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    b.addEventListener('click', function (ev) { ev.preventDefault(); fn(); });
  };
  bind('undoBtn', h.undo);
  bind('redoBtn', h.redo);
  h.sync();
};

Writer.history.init();
