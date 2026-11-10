/* Notely — nl_store.js: localStorage wrapper that never throws (private mode / file://).
   HO2: set() keeps the last error so autosave can say why it failed. */
NL.store = {
  lastError: null,
  get(key) { try { return localStorage.getItem(key); } catch (e) { this.lastError = e; return null; } },
  set(key, value) {
    try { localStorage.setItem(key, value); this.lastError = null; return true; }
    /* (before HO2) catch (_) { return false; } — the editor ignored the false, so a full disk was silent. */
    catch (e) { this.lastError = e; return false; }
  },
};
