/* ============================================================
   FILE: modules/draftly-docxopen.js
   PROJECT: Draftly
   ROLE: DF6 File > Open .docx (picker) and drag-and-drop of a
         .docx onto the page. Reads it with Draftly.docxread,
         saves the current doc, opens the result as a NEW document
         named after the file (unique), applies its page size /
         orientation / margins (global page prefs, like the Page
         tab), header / footer text, repaginates and stores it.
         A short toast says when something was simplified.
   DEPENDS: docxread, storage, pages, editor, hf, history, ui
   ============================================================ */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.docxopen = {};

Draftly.docxopen.isDocx = function isDocx(f) {
  return !!f && (/\.docx$/i.test(f.name || '') || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
};

/* (before HOW1) IndexedDB save and listDocs around a .docx open:
Draftly.docxopen.open = function open(file) {
  var ui = Draftly.ui, base = String(file.name || 'Document').replace(/\.docx$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Document';
  ui.showToast('Opening ' + file.name + '…');
  if (Draftly.app) clearTimeout(Draftly.app.inputTimer);
  var res;
  return file.arrayBuffer().then(function (buf) {
    return Draftly.docxread.read(buf);
  }).then(function (r) {
    res = r;
    return Draftly.storage.save().catch(function () {});
  }).then(function () {
    return Draftly.storage.listDocs().catch(function () { return []; });
  }).then(function (rows) {
    var name = base, n = 2;
    while (rows.some(function (x) { return x.name === name; })) name = base + '_' + (n++);
    var pg = res.page;
    if (pg) {
      if (pg.margins) ui.setPage(pg.size, 'custom', pg.margins); else ui.setPage(pg.size, Draftly.config.marginPreset, Draftly.config.marginCustom);
      ui.setOrientation(pg.orient);
    }
    Draftly.pages.rebuildSinglePage();
    var ed = Draftly.pages.firstEditor();
    ed.innerHTML = res.html;
    Draftly.editor.stripMarks(ed);
    Draftly.storage.loadedName = '';
    Draftly.storage.setCurrentName(name, false);
    if (Draftly.hf) Draftly.hf.set(res.hf);
    Draftly.pages.layoutAll();
    Draftly.history.reset();
    return Draftly.storage.save().then(function () {
      var msg = 'Opened ' + name;
      if (res.notes.length) msg += ' (simplified: ' + res.notes.slice(0, 2).join('; ') + (res.notes.length > 2 ? '…' : '') + ')';
      ui.showToast(msg);
      return name;
    });
  }).catch(function (e) {
    console.warn('draftly: docx open failed', e);
    ui.showToast(e && e.userMessage ? e.userMessage : 'Could not open this .docx');
  });
};
*/
Draftly.docxopen.open = function open(file) {
  var ui = Draftly.ui, base = String(file.name || 'Document').replace(/\.docx$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Document';
  ui.showToast('Opening ' + file.name + '\u2026');
  if (Draftly.app) clearTimeout(Draftly.app.inputTimer);
  return file.arrayBuffer().then(function (buf) {
    return Draftly.docxread.read(buf);
  }).then(function (res) {
    var prev = Draftly.how ? Draftly.how.autosave() : Promise.resolve();
    return prev.catch(function () {}).then(function () { return res; });
  }).then(function (res) {
    var pg = res.page;
    if (pg) {
      if (pg.margins) ui.setPage(pg.size, 'custom', pg.margins); else ui.setPage(pg.size, Draftly.config.marginPreset, Draftly.config.marginCustom);
      ui.setOrientation(pg.orient);
    }
    if (Draftly.how) { Draftly.how.dest = null; Draftly.how.created = 0; }
    Draftly.storage.loadedName = '';
    Draftly.storage.setCurrentName(base, false);
    Draftly.pages.rebuildSinglePage();
    var ed = Draftly.pages.firstEditor();
    ed.innerHTML = res.html;
    Draftly.editor.stripMarks(ed);
    if (Draftly.hf) Draftly.hf.set(res.hf);
    Draftly.pages.layoutAll();
    Draftly.history.reset();
    var stored = Draftly.how ? Draftly.how.save({ unique: true }) : Promise.resolve();
    return stored.catch(function () {}).then(function () {
      var msg = 'Opened ' + (Draftly.storage.currentName() || base);
      if (res.notes && res.notes.length) msg += ' (simplified: ' + res.notes.slice(0, 2).join('; ') + (res.notes.length > 2 ? '\u2026' : '') + ')';
      ui.showToast(msg);
      return Draftly.storage.currentName();
    });
  }).catch(function (e) {
    console.warn('draftly: docx open failed', e);
    ui.showToast(e && e.userMessage ? e.userMessage : 'Could not open this .docx');
  });
};

Draftly.docxopen.bind = function bind() {
  var D = Draftly.docxopen, btn = document.getElementById('openDocxBtn'), inp = document.getElementById('docxFile');
  if (btn && inp) {
    btn.addEventListener('click', function () {
      if (Draftly.ribbon && Draftly.ribbon.setFile) Draftly.ribbon.setFile(false);
      inp.value = ''; inp.click();
    });
    inp.addEventListener('change', function () { if (inp.files[0]) D.open(inp.files[0]); });
  }
  function hasFile(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
  document.addEventListener('dragover', function (e) { if (hasFile(e)) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (!hasFile(e)) return;
    var f = e.dataTransfer.files[0];
    if (D.isDocx(f)) { e.preventDefault(); D.open(f); }
    else if (Draftly.how && Draftly.how.isHow(f)) { e.preventDefault(); Draftly.how.openFile(f, null); }
    else if (f && !/^image\//.test(f.type)) { e.preventDefault(); Draftly.ui.showToast('Drop a .how or .docx file to open it'); }
  });
};

Draftly.docxopen.bind();
