/* ============================================================
   FILE: modules/draftly-quick.js
   PROJECT: Draftly
   ROLE: HO1 Hub Office Quick Access: registers Draftly's Undo / Redo / Save / Print
         with ../shared/office-quick.js (bar before File, Hub title bar via office-hubbar.js).
         Undo / Redo = Draftly.history (whole-document snapshots). Save = save now
         (Draftly.storage.save) + ✓ Saved tick. Print = Draftly.export.printDocument.
         Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S, Ctrl/Cmd+P are routed by OfficeQuick
         (the old per-module key handlers were removed in HO1).
   DEPENDS: OfficeQuick, Draftly.history, Draftly.storage, Draftly.export, Draftly.ribbon, Draftly.hub
   ============================================================ */
(function () {
  if (typeof OfficeQuick === 'undefined' || !window.Draftly) return;
  var D = Draftly;
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
    app: 'Draftly',
    undo: function () { D.history.undo(); },
    redo: function () { D.history.redo(); },
    canUndo: function () { return D.history.canUndo(); },
    canRedo: function () { return D.history.redoStack.length > 0; },
    save: function () { return D.storage.save().then(function () { return true; }); },
    print: function () { D.export.printDocument(); },
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
