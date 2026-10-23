/* Code Lab — the ONE save module. Everything persisted goes through here so Hub Drive can be added later.
   Keys: 'codelab-cells-v1' (cells), 'codelab-settings-v1' (theme, url, kernel, rememberToken, token if remembered).
   Loading validates everything (a corrupt value can never blank the app); saving reports problems instead of failing silently. */
(function () {
  'use strict';
  const CKEY = 'codelab-cells-v1', SKEY = 'codelab-settings-v1', BAKKEY = 'codelab-cells-v1.corrupt', MAX = 2000000;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v) => typeof v === 'string';
  const strOrLines = (v) => isStr(v) || (Array.isArray(v) && v.every(isStr));
  function rawGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }

  /* one output must have a known shape; returns a clean copy or null */
  function cleanOutput(o) {
    if (!isObj(o)) return null;
    if (o.output_type === 'stream') {
      if (!strOrLines(o.text)) return null;
      return { output_type: 'stream', name: o.name === 'stderr' ? 'stderr' : 'stdout', text: Array.isArray(o.text) ? o.text.join('') : o.text };
    }
    if (o.output_type === 'error') {
      const tb = Array.isArray(o.traceback) ? o.traceback.filter(isStr) : [];
      return { output_type: 'error', ename: isStr(o.ename) ? o.ename : 'Error', evalue: isStr(o.evalue) ? o.evalue : '', traceback: tb };
    }
    if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
      if (!isObj(o.data)) return null;
      const data = {}; let n = 0;
      Object.keys(o.data).forEach((m) => { if (strOrLines(o.data[m])) { data[m] = o.data[m]; n++; } });
      if (!n) return null;
      return { output_type: o.output_type, data: data, execution_count: Number.isInteger(o.execution_count) ? o.execution_count : null };
    }
    return null;
  }

  /* returns { cells, dropped (cells thrown away), repaired (cells/outputs fixed), bad (storage was unreadable) } */
  function loadCells() {
    const res = { cells: null, dropped: 0, repaired: 0, bad: false };
    const raw = rawGet(CKEY);
    if (raw == null) return res;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    if (!Array.isArray(parsed)) { res.bad = true; backup(raw); return res; }
    const seen = new Set(), out = [];
    parsed.forEach((c, i) => {
      if (!isObj(c)) { res.dropped++; return; }
      let fixed = false;
      let source = c.source; if (!isStr(source)) { source = ''; fixed = true; }
      let id = c.id; if (!isStr(id) || !id || seen.has(id)) { id = 'r' + Date.now().toString(36) + i; fixed = true; }
      seen.add(id);
      const count = Number.isInteger(c.count) ? c.count : null; if (c.count != null && count == null) fixed = true;
      let outputs = [];
      if (Array.isArray(c.outputs)) { c.outputs.forEach((o) => { const k = cleanOutput(o); if (k) outputs.push(k); else fixed = true; }); }
      else if (c.outputs != null) fixed = true;
      if (fixed) res.repaired++;
      out.push({ id: id, source: source, count: count, outputs: outputs });
    });
    if (res.dropped || res.repaired) backup(raw);
    res.cells = out;
    return res;
  }
  /* keep the unreadable original once (never overwritten by a later bad one), so nothing is destroyed by the next save */
  function backup(raw) { if (rawGet(BAKKEY) == null) put(BAKKEY, raw); }

  /* returns { ok: source code saved?, droppedOutputs: number of cells whose outputs were not saved, reason } */
  function saveCells(cells) {
    let data = cells.map((c) => ({ id: c.id, source: c.source, count: c.count || null, outputs: c.outputs || [] }));
    const sizes = data.map((c) => JSON.stringify(c.outputs).length);
    let total = JSON.stringify(data).length, dropped = 0;
    /* over the cap: drop outputs of the biggest cells first until it fits (code is never dropped) */
    if (total > MAX) {
      const order = data.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a]);
      for (const i of order) { if (total <= MAX) break; if (sizes[i] > 2) { total -= sizes[i] - 2; data[i] = Object.assign({}, data[i], { outputs: [] }); dropped++; } }
    }
    if (put(CKEY, JSON.stringify(data))) return { ok: true, droppedOutputs: dropped, reason: dropped ? 'size' : '' };
    /* storage quota: retry with code only */
    const bare = data.map((c) => ({ id: c.id, source: c.source, count: c.count, outputs: [] }));
    const withOut = data.filter((c) => c.outputs.length).length;
    if (put(CKEY, JSON.stringify(bare))) return { ok: true, droppedOutputs: Math.max(withOut, 1), reason: 'quota' };
    return { ok: false, droppedOutputs: withOut, reason: 'quota' };
  }

  function loadSettings() {
    let v = null; try { v = JSON.parse(rawGet(SKEY) || 'null'); } catch (_) { v = null; }
    if (!isObj(v)) return {};
    const o = {};
    if (isStr(v.theme)) o.theme = v.theme;
    if (isStr(v.url)) o.url = v.url;
    if (isStr(v.kernel)) o.kernel = v.kernel;
    if (typeof v.rememberToken === 'boolean') o.rememberToken = v.rememberToken;
    if (isStr(v.token)) o.token = v.token;
    return o;
  }
  function saveSettings(s) { const o = Object.assign({}, s); if (!o.rememberToken) delete o.token; return put(SKEY, JSON.stringify(o)); }

  window.CodeLabSave = { loadCells: loadCells, saveCells: saveCells, loadSettings: loadSettings, saveSettings: saveSettings };
})();
