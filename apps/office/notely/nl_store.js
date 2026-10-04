/* Notely — nl_store.js: localStorage wrapper that never throws (private mode / file://). */
NL.store = {
  get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } },
};
