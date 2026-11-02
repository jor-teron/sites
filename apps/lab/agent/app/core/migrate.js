/* Agent — app/core/migrate.js (AG1): one-time carry-over from the old "Harness" names so nothing is lost.
   Storage: localStorage harness.settings / harness.keys -> agent.* (once, flag agent.migrated); sessionStorage harness.history
   -> agent.history (this tab). IndexedDB: oldRoot() reads the folder handle from the old 'harness' db (never creates it).
   Folder: folder() copies <folder>/harness/** to <folder>/agent/** (only files missing there; old folder left in place),
   once per folder name (flag agent.migratedFolder.<name>). Loaded first, before app/core/messages.js.
   AG12 ag12() (called by app/models/presets.js once it exists): provider 'openai' + openaiBase -> its own tab id (preset host
   -> that id, api.openai.com -> 'openai', other -> 'custom' with customBase = openaiBase); model_openai / openaiModel move to
   model_<id> / <id>Model. Flag + map in localStorage 'agent.ag12' {to, at}; chats saved before 'at' with provider 'openai'
   open on 'to' (legacy(p, updated), app/gui/chats.js). Keys stay (they are per host). */
window.HR = window.HR || {};
HR.migrate = (function () {
  function copy(store, from, to) { try { var v = store.getItem(from); if (v != null && store.getItem(to) == null) store.setItem(to, v); } catch (e) { /* blocked */ } }
  try {
    if (!localStorage.getItem('agent.migrated')) { copy(localStorage, 'harness.settings', 'agent.settings'); copy(localStorage, 'harness.keys', 'agent.keys'); localStorage.setItem('agent.migrated', 'ag1'); }
    // copy(sessionStorage, 'harness.history', 'agent.history');   /* pre-AG-F1: ran on every load and never removed harness.history -> a new duplicate chat per reload */
    /* AG-F1: copy once per tab, then drop the old key so legacy() can't re-import it */
    if (sessionStorage.getItem('harness.history') != null) { copy(sessionStorage, 'harness.history', 'agent.history'); sessionStorage.removeItem('harness.history'); }
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
  function ag12() {
    try {
      if (localStorage.getItem('agent.ag12')) return;
      var s = JSON.parse(localStorage.getItem('agent.settings') || '{}') || {}, b = String(s.openaiBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
      var to = HR.presets.byHost(b) || 'custom';
      if (to === 'custom') s.customBase = b;
      if (s.model_openai && !s['model_' + to]) s['model_' + to] = s.model_openai;
      if (s.openaiModel && !s[to + 'Model']) s[to + 'Model'] = s.openaiModel;
      if (s.provider === 'openai') s.provider = to;
      localStorage.setItem('agent.settings', JSON.stringify(s));
      localStorage.setItem('agent.ag12', JSON.stringify({ to: to, at: new Date().toISOString().slice(0, 19) }));
    } catch (e) { /* storage blocked */ }
  }
  /* AG12: a chat saved before the move with provider 'openai' -> the tab its base became */
  function legacy(p, upd) {
    if (p !== 'openai') return p;
    try { var m = JSON.parse(localStorage.getItem('agent.ag12') || 'null'); return m && m.to && String(upd || '') < m.at ? m.to : p; } catch (e) { return p; }
  }
  return { oldRoot: oldRoot, folder: folder, ag12: ag12, legacy: legacy };
})();
