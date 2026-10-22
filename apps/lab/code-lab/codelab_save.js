/* Code Lab — the ONE save module. Everything persisted goes through here so Hub Drive can be added later.
   Keys: 'codelab-cells-v1' (cells), 'codelab-settings-v1' (theme, url, kernel, rememberToken, token if remembered). */
(function () {
  'use strict';
  const CKEY = 'codelab-cells-v1', SKEY = 'codelab-settings-v1', MAX = 2000000;
  function get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  window.CodeLabSave = {
    loadCells() { const c = get(CKEY, null); return Array.isArray(c) ? c : null; },
    saveCells(cells) {
      let data = cells.map((c) => ({ id: c.id, source: c.source, count: c.count || null, outputs: c.outputs || [] }));
      if (JSON.stringify(data).length > MAX) data = data.map((c) => ({ id: c.id, source: c.source, count: c.count, outputs: [] }));
      return put(CKEY, data);
    },
    loadSettings() { return get(SKEY, {}); },
    saveSettings(s) { const o = Object.assign({}, s); if (!o.rememberToken) delete o.token; return put(SKEY, o); }
  };
})();
