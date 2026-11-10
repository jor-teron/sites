/* Notepad — one plain-text note in localStorage 'notepad-text'.
   HO2: autosave, flush on pagehide / hidden, don't load an empty store over text
   the browser already restored, and show a notice when storage fails.
   (before HO2) the note was written only by the Save button. Closing the tab
   dropped anything not saved yet, and a full disk threw with no message.

   (before HO2)
   const textarea = document.querySelector('.notepad-textarea');
   const saveButton = document.querySelector('.notepad-save');
   const downloadButton = document.querySelector('.notepad-download');
   const clearButton = document.querySelector('.notepad-clear');
   textarea.value = localStorage.getItem('notepad-text') || '';
   saveButton.addEventListener('click', () => {
     localStorage.setItem('notepad-text', textarea.value);
   });
   downloadButton.addEventListener('click', () => {
     const text = textarea.value;
     const blob = new Blob([text], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = 'My_note.txt';
     a.click();
     URL.revokeObjectURL(url);
   });
   clearButton.addEventListener('click', () => {
     textarea.value = '';
     localStorage.removeItem('notepad-text');
   });
   textarea.addEventListener('dragstart', (e) => {
     if (textarea.value) e.dataTransfer.setData('text/plain', textarea.value);
   });
*/
(function (root) {
  var KEY = 'notepad-text';
  var DEBOUNCE = 400;

  function create(env) {
    var doc = env.document;
    var win = env.window;
    var storage = env.localStorage;
    var textarea = env.textarea;
    var timer = 0;
    var dirty = false;
    var failed = false;

    function read() {
      try { return { ok: true, value: storage.getItem(KEY) }; }
      catch (e) { return { ok: false, error: e, value: null }; }
    }
    function write(text) {
      try { storage.setItem(KEY, text); return { ok: true }; }
      catch (e) { return { ok: false, error: e }; }
    }
    function noteFail(e) {
      failed = true;
      if (env.notify) env.notify(e);
    }
    function noteOk() {
      if (!failed) return;
      failed = false;
      if (env.notifyOk) env.notifyOk();
    }
    function save() {
      if (timer) { clearTimeout(timer); timer = 0; }
      var result = write(textarea.value);
      if (result.ok) { dirty = false; noteOk(); }
      else noteFail(result.error);
      return result.ok;
    }
    function schedule() {
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE);
    }
    /* Flush a pending or failed edit. Safe to call when nothing changed. */
    function flush() {
      if (dirty || timer) save();
    }
    function load() {
      var result = read();
      if (!result.ok) return;
      /* A saved note replaces the box. An empty or missing read must not wipe text already there. */
      if (result.value) textarea.value = result.value;
      else if (!textarea.value) textarea.value = result.value || '';
    }
    function download() {
      flush();
      var text = textarea.value;
      var blob = new Blob([text], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = 'My_note.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
    function clear() {
      textarea.value = '';
      dirty = false;
      if (timer) { clearTimeout(timer); timer = 0; }
      try { storage.removeItem(KEY); noteOk(); }
      catch (e) { noteFail(e); }
    }
    function bind() {
      load();
      textarea.addEventListener('input', schedule);
      win.addEventListener('pagehide', flush);
      doc.addEventListener('visibilitychange', function () {
        if (doc.visibilityState === 'hidden') flush();
      });
      if (env.saveButton) env.saveButton.addEventListener('click', save);
      if (env.downloadButton) env.downloadButton.addEventListener('click', download);
      if (env.clearButton) env.clearButton.addEventListener('click', clear);
      textarea.addEventListener('dragstart', function (e) {
        if (textarea.value && e.dataTransfer) e.dataTransfer.setData('text/plain', textarea.value);
      });
    }
    return { save: save, flush: flush, schedule: schedule, load: load, bind: bind, download: download, clear: clear };
  }

  function boot(docWin) {
    var doc = docWin.document;
    var textarea = doc.querySelector('.notepad-textarea');
    if (!textarea) return;
    var notifyErr = null;
    var app = create({
      document: doc,
      window: docWin,
      localStorage: docWin.localStorage,
      textarea: textarea,
      saveButton: doc.querySelector('.notepad-save'),
      downloadButton: doc.querySelector('.notepad-download'),
      clearButton: doc.querySelector('.notepad-clear'),
      notify: function (err) {
        notifyErr = err;
        if (docWin.OfficeNotify && docWin.OfficeNotify.saveProblem) docWin.OfficeNotify.saveProblem('notepad', err);
      },
      notifyOk: function () {
        notifyErr = null;
        if (docWin.OfficeNotify && docWin.OfficeNotify.saveOk) docWin.OfficeNotify.saveOk('notepad');
      }
    });
    app.bind();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { create: create, KEY: KEY, DEBOUNCE: DEBOUNCE };
  }
  if (root && root.document && root.document.querySelector) boot(root);
})(typeof window !== 'undefined' ? window : globalThis);
