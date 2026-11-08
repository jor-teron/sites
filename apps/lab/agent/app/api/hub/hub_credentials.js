/* Agent AG37 app-local copy of hub/core/hub_credentials.js (Hub Builder 1; upstream commit 58c07a4 H138a: consolidate centralized API credentials without migration).
   upstream-sha256: 6d9a3463d500821bd3f72b7c4e76970bab1cffad18acc7a83d1d1ee438a2edf2
   Do not edit by hand: python3 apps/lab/agent/app/api/vendor.py. The Hub file itself is unchanged. */
(function (window, localStorage) {   /* AG37 wrapper: Agent namespace, not the Hub */
/* ---- upstream below, unchanged ---- */
/** H138a: sole browser-local credential record. No migration or legacy fallback.
 * sites-hub.credentials = {v:1, keys:{name:value}, providers:[{id,label,type,key,endpoint,created}],
 *   undo:null|{v:1,at,prev:{name:string|null}}}.
 * Undo is the existing explicit profile-sync rollback, now inside this record, never a second store.
 * HubKeys / HubProviders retain their public contracts. Only this module touches persistence.
 * Snapshot values are for trusted same-origin adapters, never log or expose them as metadata.
 * Profile export must explicitly opt in to keys; providers and undo are always excluded.
 */
(function () {
  'use strict';
  if (window.HubCredentials) return;
  const STORE = 'sites-hub.credentials';
  const listeners = new Set();
  const empty = () => ({ v: 1, keys: {}, providers: [], undo: null });
  // Remove exact old centralized records without reading them. Never touch app credentials,
  // WebDAV/SSH stores, profile preferences or the new record. Idempotent across frames/tabs.
  ['sites-hub.keys', 'sites-hub.providers', 'sites-hub.keysUndo'].forEach((key) => {
    try { localStorage.removeItem(key); } catch (_) { /* blocked; no legacy reads */ }
  });
  function read() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!o || o.v !== 1 || !o.keys || typeof o.keys !== 'object' || Array.isArray(o.keys) || !Array.isArray(o.providers)) return empty();
      return { v: 1, keys: o.keys, providers: o.providers, undo: o.undo || null };
    } catch (_) { return empty(); }
  }
  function notify() {
    listeners.forEach((fn) => { try { fn(); } catch (_) { /* never log listener errors containing secrets */ } });
  }
  function update(change) {
    const o = read(); // re-read immediately: sequential writers preserve the other sections
    change(o);
    try { localStorage.setItem(STORE, JSON.stringify(o)); }
    catch (_) { return false; }
    notify();
    return true;
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  window.addEventListener('storage', (e) => {
    if ((e.storageArea == null || e.storageArea === localStorage) && (e.key === STORE || e.key === null)) notify();
  });
  window.HubCredentials = Object.freeze({ STORE, read, update, onChange });
})();

})(HR.apiHost.window, HR.apiHost.storage);
