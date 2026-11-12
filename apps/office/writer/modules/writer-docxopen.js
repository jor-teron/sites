/* ============================================================
   FILE: modules/writer-docxopen.js
   DF25: was modules/draftly-docxopen.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DF6 File > Open .docx (picker) and drag-and-drop of a
         .docx onto the page. Reads it with Writer.docxread,
         saves the current doc, opens the result as a NEW document
         named after the file (unique), applies its page size /
         orientation / margins (global page prefs, like the Page
         tab), header / footer text, repaginates and stores it.
         A short toast says when something was simplified.
   DEPENDS: docxread, storage, pages, editor, hf, history, ui
   ============================================================ */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.docxopen = {};

Writer.docxopen.isDocx = function isDocx(f) {
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
Writer.docxopen.open = function open(file) {
  var ui = Writer.ui, base = String(file.name || 'Document').replace(/\.docx$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Document';
  ui.showToast('Opening ' + file.name + '\u2026');
  if (Writer.app) clearTimeout(Writer.app.inputTimer);
  return file.arrayBuffer().then(function (buf) {
    return Writer.docxread.read(buf);
  }).then(function (res) {
    var prev = Writer.how ? Writer.how.autosave() : Promise.resolve();
    return prev.catch(function () {}).then(function () { return res; });
  }).then(function (res) {
    var pg = res.page;
    if (pg) {
      if (pg.margins) ui.setPage(pg.size, 'custom', pg.margins); else ui.setPage(pg.size, Writer.config.marginPreset, Writer.config.marginCustom);
      ui.setOrientation(pg.orient);
    }
    if (Writer.how) { Writer.how.dest = null; Writer.how.created = 0; }
    Writer.storage.loadedName = '';
    Writer.storage.setCurrentName(base, false);
    Writer.pages.rebuildSinglePage();
    var ed = Writer.pages.firstEditor();
    ed.innerHTML = res.html;
    Writer.editor.stripMarks(ed);
    if (Writer.hf) Writer.hf.set(res.hf);
    Writer.pages.layoutAll();
    Writer.history.reset();
    var stored = Writer.how ? Writer.how.save({ unique: true }) : Promise.resolve();
    return stored.catch(function () {}).then(function () {
      var msg = 'Opened ' + (Writer.storage.currentName() || base);
      if (res.notes && res.notes.length) msg += ' (simplified: ' + res.notes.slice(0, 2).join('; ') + (res.notes.length > 2 ? '\u2026' : '') + ')';
      ui.showToast(msg);
      return Writer.storage.currentName();
    });
  }).catch(function (e) {
    console.warn('writer: docx open failed', e);
    ui.showToast(e && e.userMessage ? e.userMessage : 'Could not open this .docx');
  });
};

Writer.docxopen.bind = function bind() {
  var D = Writer.docxopen, btn = document.getElementById('openDocxBtn'), inp = document.getElementById('docxFile');
  if (btn && inp) {
    btn.addEventListener('click', function () {
      if (Writer.ribbon && Writer.ribbon.setFile) Writer.ribbon.setFile(false);
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
    else if (Writer.how && Writer.how.isHow(f)) { e.preventDefault(); Writer.how.openFile(f, null); }
    else if (f && !/^image\//.test(f.type)) { e.preventDefault(); Writer.ui.showToast('Drop a .how or .docx file to open it'); }
  });
};

Writer.docxopen.bind();
