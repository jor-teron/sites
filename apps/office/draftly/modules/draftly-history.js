/* ============================================================
   FILE: modules/draftly-history.js
   PROJECT: Draftly
   ROLE: App-managed undo / redo. Pagination and Shift+Enter
         change the DOM outside the browser's own history, so
         Draftly keeps whole-document snapshots instead.
   DEPENDS: config, editor, pages, flow, storage, ui, lists
   ISOLATION: Wraps editor / list commands to checkpoint first.
              If a module is missing, that wrap is skipped.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.history = {};

/* Steps kept, and the pause that ends one typing step. */
Draftly.history.limit = 100;
Draftly.history.typingMs = 450;

Draftly.history.undoStack = [];
Draftly.history.redoStack = [];
Draftly.history.current = null;
Draftly.history.timer = null;
Draftly.history.applying = false;

/* Caret as a character offset across all pages (text + <br> = 1). */
Draftly.history.caretOffset = function caretOffset() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var r = sel.getRangeAt(0);
  if (!Draftly.editor.isInEditor(r.startContainer)) return null;
  var eds = Draftly.flow.editors();
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
Draftly.history.setCaret = function setCaret(offset) {
  var eds = Draftly.flow.editors();
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
  Draftly.editor.activeEditor = target;
  Draftly.editor.saveSelection();
};

/* Snapshot of the whole document. */
Draftly.history.snapshot = function snapshot() {
  return { html: Draftly.pages.combinedHtml(), caret: Draftly.history.caretOffset() };
};

/* Enable / disable the toolbar buttons. */
Draftly.history.sync = function sync() {
  var u = document.getElementById('undoBtn');
  var r = document.getElementById('redoBtn');
  if (u) u.disabled = !Draftly.history.canUndo();
  if (r) r.disabled = !Draftly.history.redoStack.length;
};

Draftly.history.canUndo = function canUndo() {
  if (Draftly.history.undoStack.length) return true;
  return !!(Draftly.history.timer && Draftly.history.current &&
    Draftly.pages.combinedHtml() !== Draftly.history.current.html);
};

/* Record the document now if it differs from the last step. */
Draftly.history.commit = function commit() {
  var h = Draftly.history;
  clearTimeout(h.timer);
  h.timer = null;
  if (h.applying || !Draftly.app || !Draftly.app.ready) return;
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
Draftly.history.checkpoint = function checkpoint() {
  Draftly.history.commit();
};

/* After typing: group keystrokes into one step. */
Draftly.history.schedule = function schedule() {
  var h = Draftly.history;
  if (h.applying) return;
  clearTimeout(h.timer);
  h.timer = setTimeout(h.commit, h.typingMs);
  h.sync();
};

/* Forget all steps (open, new, delete-switch). */
Draftly.history.reset = function reset() {
  var h = Draftly.history;
  clearTimeout(h.timer);
  h.timer = null;
  h.undoStack = [];
  h.redoStack = [];
  h.current = (Draftly.app && Draftly.app.ready) ? h.snapshot() : null;
  h.sync();
};

/* Load a snapshot, reflow, restore the caret, mark dirty. */
Draftly.history.apply = function apply(snap) {
  var h = Draftly.history;
  h.applying = true;
  try {
    Draftly.pages.rebuildSinglePage();
    var editor = Draftly.pages.firstEditor();
    editor.innerHTML = snap.html || Draftly.config.defaultHtml;
    Draftly.editor.stripMarks(editor);
    Draftly.flow.caret = null;
    Draftly.pages.layoutAll();
    h.setCaret(snap.caret);
    if (Draftly.ui) Draftly.ui.updateToolbarState();
  } catch (err) {
    console.warn('draftly: history apply failed', err);
  }
  h.applying = false;
  /* Dirty: autosave on the normal input timer. */
  if (Draftly.app && Draftly.app.ready) {
    clearTimeout(Draftly.app.inputTimer);
    Draftly.app.inputTimer = setTimeout(function () {
      Draftly.storage.save();
    }, Draftly.config.inputDebounceMs);
  }
  h.sync();
};

Draftly.history.undo = function undo() {
  var h = Draftly.history;
  h.commit();
  if (!h.undoStack.length) return false;
  h.redoStack.push(h.current);
  h.current = h.undoStack.pop();
  h.apply(h.current);
  return true;
};

Draftly.history.redo = function redo() {
  var h = Draftly.history;
  h.commit();
  if (!h.redoStack.length) return false;
  h.undoStack.push(h.current);
  h.current = h.redoStack.pop();
  h.apply(h.current);
  return true;
};

/* Wrap one command so it starts a fresh step. */
Draftly.history.wrap = function wrap(obj, name) {
  if (!obj || typeof obj[name] !== 'function') return;
  var orig = obj[name];
  obj[name] = function () {
    Draftly.history.checkpoint();
    var out = orig.apply(this, arguments);
    Draftly.history.commit();
    return out;
  };
};

/* Keys, beforeinput, input and toolbar. */
Draftly.history.init = function init() {
  var h = Draftly.history;
  var e;
  var list = ['execCmd', 'setFontFamily', 'applyFontSize', 'onPaste', 'insertLineBreak'];
  for (e = 0; e < list.length; e++) h.wrap(Draftly.editor, list[e]);
  h.wrap(Draftly.lists, 'apply');
  h.wrap(Draftly.lists, 'applySuffix');

  document.addEventListener('keydown', function (ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    var key = ev.key.toLowerCase();
    var isUndo = key === 'z' && !ev.shiftKey;
    var isRedo = (key === 'z' && ev.shiftKey) || (key === 'y' && !ev.shiftKey);
    if (!isUndo && !isRedo) return;
    var active = document.activeElement;
    var inEditor = Draftly.editor.isInEditor(ev.target) ||
      (active && active.classList && active.classList.contains(Draftly.config.editorClass));
    if (!inEditor) return;
    ev.preventDefault();
    if (isUndo) h.undo(); else h.redo();
  }, true);

  document.addEventListener('beforeinput', function (ev) {
    if (!Draftly.editor.isInEditor(ev.target)) return;
    if (ev.inputType === 'historyUndo') { ev.preventDefault(); h.undo(); }
    else if (ev.inputType === 'historyRedo') { ev.preventDefault(); h.redo(); }
  }, true);

  document.addEventListener('input', function (ev) {
    if (!Draftly.editor.isInEditor(ev.target)) return;
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

Draftly.history.init();
