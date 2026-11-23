/* ============================================================
   FILE: modules/writer-app.js
   DF25: was modules/draftly-app.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Thin bootstrap. Checks modules, calls each feature's
         bind(), loads the last document. Holds shared boot state
         (ready, inputTimer), lazy feature triggers (DW26), and
         post-boot button enable / queued click replay.
   DEPENDS: config, storage, ui, editor, pages, docs, format
   ISOLATION: A missing module is logged and skipped.
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.app = Writer.app || {};

/* Names required for a full editor. */
/* (before DW26) Writer.app.required = ['config', 'storage', 'ui', 'editor', 'pages', 'export', 'lists', 'history', 'docs', 'format']; */
Writer.app.required = ['config', 'storage', 'ui', 'editor', 'pages', 'lists', 'history', 'docs', 'format'];

/* True after the last file has been applied. Blocks early autosave. */
Writer.app.ready = false;

/* Debounced autosave timer (shared: other modules clear it before saving). */
Writer.app.inputTimer = null;

/* Log any module that failed to attach. Returns true if all exist. */
Writer.app.guard = function guard() {
  var missing = Writer.app.required.filter(function (n) { return !Writer[n]; });
  if (missing.length) console.warn('writer: skipped missing modules: ' + missing.join(', '));
  return missing.length === 0;
};

/* DW26: finish first-paint boot — hide loading hint, enable controls,
   focus the page if open, and replay any clicks queued before ready. */
Writer.app.finishBoot = function finishBoot(editor) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (window.__writerBootOnClick) {
      document.removeEventListener('click', window.__writerBootOnClick, true);
      window.__writerBootOnClick = null;
    }
    if (document.body) document.body.classList.remove('writer-loading');
    var hint = document.getElementById('loadingHint');
    if (hint) hint.hidden = true;
    var waited = document.querySelectorAll('[data-boot-wait]');
    for (var i = 0; i < waited.length; i++) {
      var el = waited[i];
      el.removeAttribute('data-boot-wait');
      if (el.tagName === 'SELECT') el.disabled = false;
      else if (!el.disabled) el.removeAttribute('aria-disabled');
    }
  }
  if (editor && !(Writer.empty && Writer.empty.isEmpty())) {
    if (editor.focus) editor.focus();
    if (Writer.editor) Writer.editor.activeEditor = editor;
  }
  if (typeof window !== 'undefined' && Array.isArray(window.__writerBootQueue) && window.__writerBootQueue.length) {
    var q = window.__writerBootQueue.slice();
    window.__writerBootQueue = [];
    for (var j = 0; j < q.length; j++) {
      var target = q[j];
      if (target && !target.disabled && typeof target.click === 'function' && document.contains(target)) {
        target.click();
      }
    }
  }
};

/* DW26: wire entry points for lazy modules (export, find, review, drag-drop)
   so they only load when the user clicks, uses a shortcut, or drops a file. */
Writer.app.bindLazy = function bindLazy() {
  var A = Writer.app, V = Writer.vendor;
  if (A._lazyBound || !Writer.ui || typeof document === 'undefined') return;
  A._lazyBound = true;
  A._exportButtonsBound = true;
  A._findRibbonBound = true;
  A._writeButtonsBound = true;

  /* Export & Print */
  Writer.ui.onClick('printBtn', function () {
    if (Writer.export) { Writer.export.printDocument(); return; }
    if (V && V.ensureExport) V.ensureExport('print').then(function () { if (Writer.export) { Writer.export.bind(); Writer.export.printDocument(); } });
  });
  Writer.ui.onClick('exportBtn', function () {
    if (Writer.export) { Writer.export.openChooser(); return; }
    if (V && V.ensureExport) V.ensureExport('menu').then(function () { if (Writer.export) { Writer.export.bind(); Writer.export.openChooser(); } });
  });
  Writer.ui.onClick('exportDocxBtn', function () {
    if (Writer.export) { Writer.export.closeChooser(); Writer.export.exportDocx(); return; }
    if (V && V.ensureExport) V.ensureExport('docx').then(function () { if (Writer.export) { Writer.export.bind(); Writer.export.closeChooser(); Writer.export.exportDocx(); } });
  });
  Writer.ui.onClick('exportOdtBtn', function () {
    if (Writer.export) { Writer.export.closeChooser(); Writer.export.exportOdt(); return; }
    if (V && V.ensureExport) V.ensureExport('odt').then(function () { if (Writer.export) { Writer.export.bind(); Writer.export.closeChooser(); Writer.export.exportOdt(); } });
  });
  Writer.ui.onClick('exportPdfBtn', function () {
    if (Writer.export) Writer.export.closeChooser();
    if (Writer.pdfgen) { Writer.pdfgen.exportDocument(); return; }
    if (V && V.ensureExport) {
      V.ensureExport('pdf').then(function () {
        if (Writer.export) { Writer.export.bind(); Writer.export.closeChooser(); }
        if (Writer.pdfgen) Writer.pdfgen.exportDocument();
        else if (Writer.pdf) Writer.pdf.download();
      });
    } else if (Writer.pdf) Writer.pdf.download();
  });

  /* Find & Replace */
  Writer.ui.onClick('findRibbonBtn', function () {
    if (Writer.find && Writer.find.show) { Writer.find.show(false); return; }
    if (V && V.ensureFind) V.ensureFind().then(function () { if (Writer.find && Writer.find.show) Writer.find.show(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (Writer.find && Writer.find.show) return;
    var mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    var k = (e.key || '').toLowerCase();
    if (mod && !e.shiftKey && (k === 'f' || k === 'h')) {
      e.preventDefault();
      e.stopPropagation();
      if (V && V.ensureFind) V.ensureFind().then(function () { if (Writer.find && Writer.find.show) Writer.find.show(k === 'h'); });
    }
  }, true);

  /* Review helpers (spellcheck, focus mode, read aloud, case transform) */
  Writer.ui.onClick('spellBtn', function () {
    if (Writer.write && Writer.write.toggleSpell) { Writer.write.toggleSpell(); return; }
    if (V && V.ensureWrite) V.ensureWrite().then(function () { if (Writer.write && Writer.write.toggleSpell) Writer.write.toggleSpell(); });
  });
  Writer.ui.onClick('focusBtn', function () {
    if (Writer.write && Writer.write.setFocus) { Writer.write.setFocus(!Writer.write.focusOn); return; }
    if (V && V.ensureWrite) V.ensureWrite().then(function () { if (Writer.write && Writer.write.setFocus) Writer.write.setFocus(!Writer.write.focusOn); });
  });
  Writer.ui.onClick('focusExitBtn', function () {
    if (Writer.write && Writer.write.setFocus) Writer.write.setFocus(false);
  });
  Writer.ui.onClick('readAloudBtn', function () {
    if (Writer.write && Writer.write.readAloud) { Writer.write.readAloud(); return; }
    if (V && V.ensureWrite) V.ensureWrite().then(function () { if (Writer.write && Writer.write.readAloud) Writer.write.readAloud(); });
  });
  var cb = document.querySelectorAll('[data-case]');
  for (var i = 0; i < cb.length; i++) {
    (function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var mode = b.getAttribute('data-case');
        if (Writer.write && Writer.write.changeCase) { Writer.write.changeCase(mode); return; }
        if (V && V.ensureWrite) V.ensureWrite().then(function () { if (Writer.write && Writer.write.changeCase) Writer.write.changeCase(mode); });
      });
    })(cb[i]);
  }

  /* Drag-and-drop (.how, .docx, .odt, .txt, images) before docxopen/imgdrop load */
  function hasFile(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
  }
  function dragHasImage(e) {
    var items = e.dataTransfer && e.dataTransfer.items;
    if (!items) return false;
    for (var j = 0; j < items.length; j++) {
      if (items[j].kind === 'file' && /^image\//i.test(items[j].type || '')) return true;
    }
    return false;
  }
  document.addEventListener('dragover', function (e) {
    if (Writer.docxopen && Writer.docxopen._bound) return;
    if (!hasFile(e)) return;
    e.preventDefault();
    if (dragHasImage(e) && !Writer.imgdrop && V && V.ensureImport) V.ensureImport('img');
  });
  document.addEventListener('drop', function (e) {
    if (Writer.docxopen && Writer.docxopen._bound) return;
    if (!hasFile(e)) return;
    e.preventDefault();
    var files = e.dataTransfer.files ? Array.prototype.slice.call(e.dataTransfer.files) : [];
    var f = files[0];
    if (!f) return;
    var name = String(f.name || '');
    if (Writer.how && Writer.how.isHow(f)) { Writer.how.openFile(f, null); return; }
    var m = name.match(/\.(docx|odt|txt)$/i);
    var isDocxMime = f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var isOdtMime = f.type === 'application/vnd.oasis.opendocument.text';
    var kind = m ? m[1].toLowerCase() : (isDocxMime ? 'docx' : (isOdtMime ? 'odt' : null));
    if (kind) {
      var item = e.dataTransfer.items && e.dataTransfer.items[0];
      var hp = null;
      if ((kind === 'docx' || kind === 'odt') && item && item.getAsFileSystemHandle && !(Writer.how && Writer.how.inHub && Writer.how.inHub())) {
        try { hp = item.getAsFileSystemHandle(); } catch (err) { hp = null; }
      }
      var loadImp = (V && V.ensureImport) ? V.ensureImport(kind) : Promise.resolve();
      Promise.all([loadImp, Promise.resolve(hp).catch(function () { return null; })]).then(function (res) {
        var h = res[1];
        if (!Writer.docxopen) return;
        if (h && h.kind === 'file') Writer.docxopen.open(f, { handle: h });
        else Writer.docxopen.open(f);
      });
      return;
    }
    var isImg = /^image\//i.test(f.type || '') || /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?)$/i.test(name);
    if (isImg && V && V.ensureImport) {
      var snap = { dataTransfer: { files: files }, target: e.target, clientX: e.clientX, clientY: e.clientY };
      V.ensureImport('img').then(function () {
        if (!Writer.imgdrop) return;
        if (Writer.imgdrop.isImage(f)) Writer.imgdrop.drop(snap);
        else if (Writer.imgdrop.isOtherImage(f)) Writer.ui.showToast('Drop a PNG, JPEG, GIF or WebP picture to insert it');
      });
      return;
    }
    Writer.ui.showToast('Drop a .how, .docx, .odt or .txt file to open it');
  });
};

Writer.app.checkMergeHash = function checkMergeHash() {
  if (typeof window === 'undefined' || !window.FsRef || !window.location) return;
  var ref = window.FsRef.parse(window.location.hash);
  if (ref && ref.name && /\.(csv|tsv|xlsx|xlsm|hos)$/i.test(ref.name) && !Writer.mergeUi && Writer.vendor && Writer.vendor.ensureMerge) {
    Writer.vendor.ensureMerge();
  }
};

Writer.app.init = function init() {
  if (!Writer.app.guard()) { Writer.app.finishBoot(); return; }
  try {
    Writer.config.applyToDocument();
    if (Writer.settings) Writer.settings.bind();   /* DF8: before loadTheme (auto theme) */
    Writer.ui.loadTheme();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    Writer.editor.bind();
    Writer.docs.bind();
    /* (before DW26) Writer.export.bind(); — now loaded lazily when Export/Print is used */
    if (Writer.export && Writer.export.bind) Writer.export.bind();
    Writer.app.bindLazy();
    Writer.format.bind();
    Writer.ui.bind();
    if (Writer.hf) Writer.hf.bind();
    if (Writer.margins) Writer.margins.bind();
    if (Writer.colour) Writer.colour.init();
    if (Writer.view) Writer.view.init();
    Writer.docs.load().then(function () {
      var editor = Writer.pages.firstEditor();
      Writer.pages.layoutAll();
      Writer.history.reset();
      Writer.app.finishBoot(editor);
      Writer.app.checkMergeHash();
    }, function () {
      Writer.app.finishBoot();
    });
  } catch (err) {
    console.warn('writer: init failed', err);
    Writer.app.finishBoot();
  }
};

Writer.app.init();
