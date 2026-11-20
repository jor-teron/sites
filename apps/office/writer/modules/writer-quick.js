/* ============================================================
   FILE: modules/writer-quick.js
   DF25: was modules/draftly-quick.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: HO1 Hub Office Quick Access: registers Writer's Undo / Redo / Save / Print
         with ../shared/office-quick.js (bar before File, Hub title bar via office-hubbar.js).
         Undo / Redo = Writer.history (whole-document snapshots). Save = save now
         (Writer.storage.save) + ✓ Saved tick. Print = Writer.export.printDocument.
         Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S, Ctrl/Cmd+P are routed by OfficeQuick
         (the old per-module key handlers were removed in HO1).
   DEPENDS: OfficeQuick, Writer.history, Writer.storage, Writer.export, Writer.ribbon, Writer.hub
   ============================================================ */
(function () {
  if (typeof OfficeQuick === 'undefined' || !window.Writer) return;
  var D = Writer;
  function isField(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  }
  function activeTab() {
    var t = document.querySelector('.ribbon-tab[aria-selected="true"]');
    return t ? t.getAttribute('data-tab') : 'home';
  }
  OfficeQuick.register({
    /* (before DF24) app: 'Draftly', */
    app: 'Writer',
    undo: function () { D.history.undo(); },
    redo: function () { D.history.redo(); },
    /* (before DW18) canUndo: function () { return D.history.canUndo(); }, */
    /* (before DW18) canRedo: function () { return D.history.redoStack.length > 0; }, */
    /* DW18: nothing to undo, save or print while no document is open (writer-empty.js). */
    canUndo: function () { return !(D.empty && D.empty.isEmpty()) && D.history.canUndo(); },
    canRedo: function () { return !(D.empty && D.empty.isEmpty()) && D.history.redoStack.length > 0; },
    canSave: function () { return !(D.empty && D.empty.isEmpty()); },
    /* (before HOW1) save: function () { return D.storage.save().then(function () { return true; }); }, */
    save: function () {
      var p = (D.how && D.how.save) ? D.how.save({ explicit: true }) : D.storage.save();
      return p.then(function (res) { return !(res && res.ok === false); });
    },
    /* (before DW18) print: function () { D.export.printDocument(); }, */
    print: function () { if (D.empty && D.empty.isEmpty()) { if (D.ui && D.ui.showToast) D.ui.showToast('No document open'); return; } D.export.printDocument(); },
    undoKey: function (ev) {
      var a = document.activeElement;
      if (D.editor.isInEditor(ev.target) || (a && a.classList && a.classList.contains(D.config.editorClass))) return true;
      return !isField(ev.target) && !isField(a);
    },
    tabs: function () { return (D.hub && D.hub.tabs) ? D.hub.tabs.map(function (t) { return { id: t.id, label: t.label }; }) : []; },
    activeTab: activeTab,
    onTab: function (id) {
      if (id === 'file') {
        if (D.hub && D.hub.openFile) D.hub.openFile(false);
        else D.ribbon.setFile(!D.ribbon.isFileOpen());
        return;
      }
      if (D.ribbon.isFileOpen()) D.ribbon.setFile(false);
      D.ribbon.selectTab(id);
      if (D.ribbon.collapse) D.ribbon.collapse.peek(true);
    },
    mount: document.getElementById('toolbar'),
    before: document.getElementById('fileBtn'),
    fallback: document.querySelector('nav.ribbon')
  });
  /* Keep the bar in step with the history buttons and the ribbon tab. */
  var sync = D.history.sync;
  D.history.sync = function () { var r = sync.apply(this, arguments); OfficeQuick.refresh(); return r; };
  var sel = D.ribbon.selectTab;
  D.ribbon.selectTab = function () { var r = sel.apply(this, arguments); OfficeQuick.refresh(); return r; };
})();
