/* Agent — app/core/migrate.js (AG1): one-time carry-over from the old "Harness" names so nothing is lost.
   Storage: localStorage harness.settings / harness.keys -> agent.* (once, flag agent.migrated); sessionStorage harness.history
   -> agent.history (this tab). IndexedDB: oldRoot() reads the folder handle from the old 'harness' db (never creates it).
   Folder: folder() copies <folder>/harness/** to <folder>/agent/** (only files missing there; old folder left in place),
   once per folder name (flag agent.migratedFolder.<name>). Loaded first, before app/core/messages.js. */
window.HR = window.HR || {};
HR.migrate = (function () {
  function copy(store, from, to) { try { var v = store.getItem(from); if (v != null && store.getItem(to) == null) store.setItem(to, v); } catch (e) { /* blocked */ } }
  try {
    if (!localStorage.getItem('agent.migrated')) { copy(localStorage, 'harness.settings', 'agent.settings'); copy(localStorage, 'harness.keys', 'agent.keys'); localStorage.setItem('agent.migrated', 'ag1'); }
    copy(sessionStorage, 'harness.history', 'agent.history');
  } catch (e) { /* storage blocked */ }
  function oldRoot() {
    return new Promise(function (ok) {
      var r; try { r = indexedDB.open('harness'); } catch (e) { return ok(null); }
      r.onupgradeneeded = function () { r.transaction.abort(); };
      r.onerror = r.onblocked = function () { ok(null); };
      r.onsuccess = function () {
        var db = r.result; if (!db.objectStoreNames.contains('kv')) { db.close(); return ok(null); }
        var q = db.transaction('kv', 'readonly').objectStore('kv').get('root');
        q.onsuccess = function () { db.close(); ok(q.result || null); }; q.onerror = function () { db.close(); ok(null); };
      };
    });
  }
  async function folder() {
    if (!HR.fs.ready()) return;
    var flag = 'agent.migratedFolder.' + HR.fs.name(), n = 0;
    try { if (localStorage.getItem(flag)) return; } catch (e) { return; }
    try {
      await HR.fs.walk('harness', async function (rel, h) {
        var to = 'agent/' + rel.slice('harness/'.length);
        if (!(await HR.fs.stat(to)).exists) { await HR.fs.write(to, await (await h.getFile()).text()); n++; }
      });
    } catch (e) { /* no harness/ folder */ }
    try { localStorage.setItem(flag, 'ag1'); } catch (e) {}
    if (n && HR.chat && HR.chat.note) HR.chat.note('Copied ' + n + ' file' + (n > 1 ? 's' : '') + ' from harness/ to agent/ (the old folder is left in place).');
  }
  return { oldRoot: oldRoot, folder: folder };
})();
