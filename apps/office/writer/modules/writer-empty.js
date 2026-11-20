/* ============================================================
   FILE: modules/writer-empty.js
   PROJECT: Writer
   ROLE: DW18 "no document open" state.
         File > Close and Delete end here, and a fresh window starts
         here (unless a file link, #new or the DW15 writer_open_new
         flag asks for a document). No page is shown; a centred
         panel offers New, Open... and Recent. The ribbon, ruler and
         status bar are off, the name box is empty (Hub title shows
         just "Writer") and nothing is saved, so no stray Untitled
         file appears.
         Pure rules (next, canEdit, canWrite, bootMode, keyAction,
         closeNeedsConfirm, recentRows, hashHasFile) are tested in
         test/test-dw18-close.cjs; enter / leave touch the page.
   DEPENDS: (at run time) storage, pages, how, docs, history, hf, ui
   ============================================================ */
(function (root) {
  'use strict';

  var E = {};

  /* The one flag. empty === true means no document is open. */
  E.state = { empty: false };

  /* File menu items that need a document. Settings and Recent stay on. */
  E.MENU_OFF = ['renameBtn', 'saveBtn', 'saveAsBtn', 'printBtn', 'closeDocBtn', 'deleteCurrentBtn', 'exportBtn'];
  /* Parts of the window that are switched off (inert) while empty. */
  E.PARTS_OFF = ['ribbonNav', 'ruler', 'statusBar', 'fileNameInput'];
  E.RECENT_MAX = 8;

  /* Transitions. close / delete / boot-empty → empty; new / open / blank → a document. */
  E.next = function next(state, action) {
    var cur = !!(state && state.empty);
    switch (action) {
      case 'close':
      case 'delete':
      case 'boot-empty':
        return { empty: true };
      case 'new':
      case 'open':
      case 'blank':
      case 'boot-file':
      case 'boot-blank':
        return { empty: false };
      default:
        return { empty: cur };
    }
  };

  E.canEdit = function canEdit(state) { return !(state && state.empty); };

  /* Autosave, timers, Save, Save As and the leave-page flush write only when a document is open. */
  E.canWrite = function canWrite(state) { return !(state && state.empty); };

  /* What a fresh window shows.
     o.fresh: DW15 New window / tab (writer_open_new or #new) → blank.
     o.hashFile: a #drive=&file= / Hub open-with link names a document → open it.
     o.officeNew: Hub Office ?new=1 tab → blank.
     Otherwise → empty. */
  E.bootMode = function bootMode(o) {
    o = o || {};
    if (o.fresh) return 'blank';
    if (o.hashFile) return 'file';
    if (o.officeNew) return 'blank';
    return 'empty';
  };

  /* True when the hash names a file Writer can open. parse = FsRef.parse. */
  E.hashHasFile = function hashHasFile(hash, parse) {
    if (!hash || typeof parse !== 'function') return false;
    var ref = null;
    try { ref = parse(String(hash)); } catch (e) { ref = null; }
    return !!(ref && ref.name && /\.(how|docx|odt|txt)$/i.test(String(ref.name)));
  };

  /* Keys while empty. null = let it through.
     'new' / 'open' run those; 'toast' = Save / Print with nothing open; 'block' = an edit key. */
  E.keyAction = function keyAction(state, ev) {
    if (!(state && state.empty) || !ev) return null;
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return null;
    var k = String(ev.key || '').toLowerCase();
    if (k === 'n' && !ev.shiftKey) return 'new';
    if (k === 'o' && !ev.shiftKey) return 'open';
    if (k === 's' || k === 'p') return 'toast';
    if ('zybiuejlkdhf'.indexOf(k) !== -1 && k.length === 1) return 'block';
    if (k === 'enter' || k === 'backspace' || k === 'delete') return 'block';
    return null;
  };

  /* Close asks first only when the flush cannot keep the changes:
     o.willWrite false (standalone without a file handle, or a .docx / .odt with no file),
     o.blank false and o.changed true. */
  E.closeNeedsConfirm = function closeNeedsConfirm(o) {
    o = o || {};
    if (o.willWrite) return false;
    if (o.blank) return false;
    return !!o.changed;
  };

  /* Does the save before Close write the document? Mirrors writer-how.js saveNow for a non-timer flush. */
  E.flushWrites = function flushWrites(o) {
    o = o || {};
    var hub = !!(o.inHub && o.canLocal);
    var kind = o.destKind || '';
    if ((o.format || 'how') === 'how') return hub || kind === 'handle';
    return !!kind && (kind === 'handle' || hub);
  };

  /* Recent rows for the panel: newest first (How.list order), at most RECENT_MAX. */
  E.recentRows = function recentRows(rows, stem) {
    var s = typeof stem === 'function' ? stem : function (n) { return String(n || '').replace(/\.how$/i, ''); };
    return (rows || []).filter(function (r) { return r && r.name; }).slice(0, E.RECENT_MAX)
      .map(function (r) { return { name: r.name, label: s(r.name) }; });
  };

  E.isEmpty = function isEmpty() { return !!E.state.empty; };

  /* ----- Page side (not run under node) ----- */
  function W() { return root.Writer || {}; }
  function el(id) { return root.document ? root.document.getElementById(id) : null; }
  function partEl(id) {
    if (id === 'ribbonNav') return root.document ? root.document.querySelector('nav.ribbon') : null;
    return el(id);
  }
  function setParts(off) {
    E.PARTS_OFF.forEach(function (id) {
      var n = partEl(id);
      if (!n) return;
      if (off) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); if (id === 'fileNameInput') n.disabled = true; }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); if (id === 'fileNameInput') n.disabled = false; }
    });
    E.MENU_OFF.forEach(function (id) {
      var b = el(id);
      if (!b) return;
      if (off) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      else { b.disabled = false; b.removeAttribute('aria-disabled'); }
    });
    var panel = el('emptyPanel');
    if (panel) panel.hidden = !off;
    if (root.document && root.document.body) root.document.body.classList.toggle('writer-empty', !!off);
  }
  /* Drop a #drive=&file= link so a restored Hub window does not reopen the closed file. */
  function clearFileHash() {
    var loc = root.location, hist = root.history;
    if (!loc || !hist || typeof hist.replaceState !== 'function' || !loc.hash) return;
    if (!E.hashHasFile(loc.hash, root.FsRef && root.FsRef.parse)) return;
    try { hist.replaceState(null, '', String(loc.href).split('#')[0]); } catch (e) {}
  }

  /* Show the empty state. The caller has already flushed the save. */
  E.enter = function enter(action) {
    var S = W();
    E.state = E.next(E.state, action || 'close');
    if (S.app) clearTimeout(S.app.inputTimer);
    if (S.how) {
      S.how.dest = null;
      S.how.format = 'how';
      S.how.savedSig = '';
      S.how.created = 0;
      S.how.holdClash = '';
      S.how.lastHash = '';
    }
    if (S.storage) {
      S.storage.loadedName = '';
      S.storage.autoName = '';
      if (S.storage.setCurrentName) S.storage.setCurrentName('', false);   /* Hub title: just "Writer" */
    }
    if (S.pages && S.pages.rebuildSinglePage) S.pages.rebuildSinglePage();
    var ed = S.pages && S.pages.firstEditor ? S.pages.firstEditor() : null;
    if (ed) { ed.innerHTML = '<p><br></p>'; if (ed.blur) ed.blur(); }
    if (S.hf && S.hf.set && S.hf.blank) S.hf.set(S.hf.blank());
    if (S.history && S.history.reset) S.history.reset();
    var find = el('findBar');
    if (find) find.hidden = true;
    clearFileHash();
    setParts(true);
    E.renderRecent();
    var nb = el('emptyNewBtn');
    if (nb && nb.focus) { try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); } }
    if (typeof OfficeQuick !== 'undefined' && OfficeQuick.refresh) { try { OfficeQuick.refresh(); } catch (e) {} }
    return true;
  };

  /* Leave the empty state before a document is laid out (How.apply, How.fresh, docxopen). */
  E.leave = function leave(action) {
    if (!E.state.empty) return false;
    E.state = E.next(E.state, action || 'open');
    setParts(false);
    /* The page was display:none; measure the zoom (and the ruler, via its fit wrapper) again. */
    var S = W();
    if (S.view && S.view.fit) { try { S.view.fit(); } catch (e) {} }
    if (typeof OfficeQuick !== 'undefined' && OfficeQuick.refresh) { try { setTimeout(function () { OfficeQuick.refresh(); }, 0); } catch (e) {} }
    return true;
  };

  /* Fill the panel's Recent list (same How.list the File menu Recent uses). */
  E.renderRecent = function renderRecent() {
    var box = el('emptyRecent');
    var S = W();
    if (!box) return Promise.resolve();
    var pending = (S.how && S.how.list) ? S.how.list() : Promise.resolve([]);
    return pending.then(function (rows) {
      var list = E.recentRows(rows, S.how && S.how.stem);
      box.innerHTML = '';
      if (!list.length) {
        var msg = (S.how && S.how.inHub && S.how.inHub()) ? 'No .how files in Documents' : 'No recent documents here. Use Open... to pick a file.';
        var p = root.document.createElement('div');
        p.className = 'empty-none';
        p.textContent = msg;
        box.appendChild(p);
        return;
      }
      list.forEach(function (r) {
        var b = root.document.createElement('button');
        b.type = 'button';
        b.className = 'empty-recent-item';
        b.title = 'Open ' + r.label;
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
        var span = root.document.createElement('span');
        span.textContent = r.label;
        b.appendChild(span);
        b.addEventListener('click', function () { if (S.docs && S.docs.openDoc) S.docs.openDoc(r.name); });
        box.appendChild(b);
      });
    }).catch(function () { box.innerHTML = ''; });
  };

  /* Panel buttons and the empty-state keys. */
  E.bind = function bind() {
    var doc = root.document;
    if (!doc) return;
    var S = W();
    var nb = el('emptyNewBtn'), ob = el('emptyOpenBtn');
    if (nb) nb.addEventListener('click', function () { if (S.docs && S.docs.newDoc) S.docs.newDoc(); });
    if (ob) ob.addEventListener('click', function () { if (S.docs && S.docs.openFromMenu) S.docs.openFromMenu(); });
    /* Window capture, before OfficeQuick and the editor see the key. */
    root.addEventListener('keydown', function (ev) {
      var a = E.keyAction(E.state, ev);
      if (!a) return;
      ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (ev.repeat) return;
      if (a === 'new' && S.docs && S.docs.newDoc) S.docs.newDoc();
      else if (a === 'open' && S.docs && S.docs.openFromMenu) S.docs.openFromMenu();
      /* Ctrl+P already reached Quick Access print (it toasts); Ctrl+S is just switched off there. */
      else if (a === 'toast' && String(ev.key || '').toLowerCase() !== 'p' && S.ui && S.ui.showToast) S.ui.showToast('No document open');
    }, true);
  };

  if (typeof module === 'object' && module.exports) module.exports = E;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.empty = E;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
