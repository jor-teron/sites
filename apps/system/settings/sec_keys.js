/*
 * Settings → API Keys (apps/system/settings/sec_keys.js, H28). One place for the API keys every Hub
 * app uses (Agent, News, …), stored by hub/core/hub_keys.js in localStorage 'sites-hub.keys'
 * (only this browser; every Hub app gets them, no per-app prompt). Uses the Hub's window.top.HubKeys
 * when Settings runs inside the Hub (so the Hub's onChange listeners fire at once), else its own copy.
 * One row per known key (HubKeys.KNOWN): masked input (URLs shown plain) + 👁 reveal, Save (also on
 * Enter / leaving the field), Test where cheap, Delete. Custom keys get the same row without Test;
 * "Add custom key" adds one. Deep link: #keys/<name> scrolls to and highlights that row.
 * Tests (straight from this browser, nothing goes through the Hub):
 *   tavily      GET api.tavily.com/usage (free, no credit; a 1-result search only if /usage is missing)
 *   gemini      GET generativelanguage.googleapis.com/v1beta/models (model list, free)
 *   ollama_url  GET <url>/api/tags
 *   openai_*    GET <base>/models with the key (Bearer)
 *   H28.1, all Bearer: groq GET api.groq.com/openai/v1/models, openrouter GET openrouter.ai/api/v1/key
 *   (its /models list is public, so /key is what proves the key), deepseek GET api.deepseek.com/models,
 *   xai GET api.x.ai/v1/models. All four answer browser (CORS) requests.
 *   H28.2 gvision POST vision.googleapis.com/v1/images:annotate?key= with no images ({ requests: [] }: nothing to
 *   bill). 400 with reason API_KEY_INVALID = bad key; any other 400 / 200 = the key reached Vision; 403 tells apart
 *   API not enabled, billing off and key restrictions.
 * Guide: hub/keys.readme.md (shown folded at the bottom, plus a GitHub link).
 */
(function () {
  'use strict';
  const ui = window.Settings.ui;
  const ROOT = '../../../';
  const README = ROOT + 'hub/keys.readme.md';
  const README_GH = 'https://github.com/jor-teron/sites/blob/main/hub/keys.readme.md';
  const K = (() => { try { if (window.top !== window && window.top.HubKeys) return window.top.HubKeys; } catch (_) { /* cross-origin */ } return window.HubKeys; })();
  const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

  async function fetchT(url, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 10000);
    try { return await fetch(url, Object.assign({ cache: 'no-store', signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
  }
  const trimSlash = (u) => String(u || '').trim().replace(/\/+$/, '');

  /** Each test → {ok, text}. Errors thrown by fetch (offline / CORS) become "Could not reach". */
  const TESTS = {
    async tavily(v) {
      const h = { Authorization: 'Bearer ' + v };
      let r = await fetchT('https://api.tavily.com/usage', { headers: h });
      if (r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (401)' };
      if (r.ok) {
        let j = {}; try { j = await r.json(); } catch (_) { /* no body */ }
        const a = j.account || {}, k = j.key || {};
        const used = a.plan_usage != null ? a.plan_usage : k.usage, lim = a.plan_limit != null ? a.plan_limit : k.limit;
        return { ok: true, text: 'Key works' + (used != null && lim != null ? ' \u00b7 ' + used + ' / ' + lim + ' credits used' : '') };
      }
      if (r.status !== 404 && r.status !== 405) return { ok: false, text: 'Tavily answered ' + r.status };
      r = await fetchT('https://api.tavily.com/search', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ query: 'hello', max_results: 1, search_depth: 'basic' }) });
      if (r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (401)' };
      if (r.status === 432 || r.status === 433) return { ok: false, text: 'Key works, but the credits are used up' };
      return r.ok ? { ok: true, text: 'Key works (1 credit used for the test)' } : { ok: false, text: 'Tavily answered ' + r.status };
    },
    async gemini(v) {
      const r = await fetchT('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(v));
      if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (' + r.status + ')' };
      if (!r.ok) return { ok: false, text: 'Gemini answered ' + r.status };
      const j = await r.json().catch(() => ({}));
      const n = (j.models || []).length;
      return { ok: true, text: 'Key works' + (n ? ' \u00b7 ' + n + ' models' : '') };
    },
    async ollama_url(v) {
      const r = await fetchT(trimSlash(v) + '/api/tags', {}, 6000);
      if (!r.ok) return { ok: false, text: 'Ollama answered ' + r.status };
      const j = await r.json().catch(() => ({}));
      const n = (j.models || []).length;
      return { ok: true, text: 'Ollama is running \u00b7 ' + n + ' model' + (n === 1 ? '' : 's') };
    },
    async openai() {
      const base = trimSlash(await K.get('openai_base'));
      const key = await K.get('openai_key');
      if (!base) return { ok: false, text: 'Add the base URL first' };
      const r = await fetchT(base + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {} });
      if (r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (' + r.status + ')' };
      if (!r.ok) return { ok: false, text: 'Server answered ' + r.status };
      const j = await r.json().catch(() => ({}));
      const n = (j.data || j.models || []).length;
      return { ok: true, text: 'Works' + (n ? ' \u00b7 ' + n + ' models' : '') };
    },
    // H28.1: OpenAI-style model lists (Bearer key)
    groq: (v) => modelsTest('https://api.groq.com/openai/v1/models', v),
    deepseek: (v) => modelsTest('https://api.deepseek.com/models', v),
    xai: (v) => modelsTest('https://api.x.ai/v1/models', v),
    async openrouter(v) {
      const r = await fetchT('https://openrouter.ai/api/v1/key', { headers: { Authorization: 'Bearer ' + v } });
      if (r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (' + r.status + ')' };
      if (!r.ok) return { ok: false, text: 'OpenRouter answered ' + r.status };
      const d = ((await r.json().catch(() => ({}))).data) || {};
      const f = d.free_model_daily_requests;
      const bits = [];
      if (d.limit_remaining != null) bits.push('$' + (+d.limit_remaining).toFixed(2) + ' left on this key');
      if (f && f.limit != null) bits.push(f.remaining + ' / ' + f.limit + ' free-model requests left today');
      return { ok: true, text: 'Key works' + (bits.length ? ' \u00b7 ' + bits.join(' \u00b7 ') : '') };
    },
    async gvision(v) {   // H28.2
      const r = await fetchT('https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(v),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [] }) });
      if (r.ok) return { ok: true, text: 'Key works (Vision API answered; no image sent, nothing billed)' };
      const e = ((await r.json().catch(() => ({}))).error) || {};
      const why = (e.details || []).map((d) => d && d.reason).filter(Boolean).join(' ') + ' ' + (e.status || '') + ' ' + (e.message || '');
      if (/API_KEY_INVALID|API key not valid/i.test(why)) return { ok: false, text: 'Key rejected: not a valid API key (' + r.status + ')' };
      if (r.status === 400) return { ok: true, text: 'Key works (Vision API reached; the empty test request was refused, as expected)' };
      if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/i.test(why)) return { ok: false, text: 'Key is valid, but the Cloud Vision API is not enabled in its Google Cloud project' };
      if (/BILLING_DISABLED|billing/i.test(why)) return { ok: false, text: 'Key is valid, but billing is not enabled for its project (Vision needs a billing account)' };
      if (/REFERRER_BLOCKED|referer/i.test(why)) return { ok: false, text: 'Key is restricted to other websites (add this site under Application restrictions)' };
      if (/API_KEY_SERVICE_BLOCKED|blocked/i.test(why)) return { ok: false, text: 'Key is not allowed to use the Cloud Vision API (check its API restrictions)' };
      if (r.status === 429) return { ok: false, text: 'Key works, but the Vision quota is used up for now (429)' };
      if (r.status === 401 || r.status === 403) return { ok: false, text: 'Key refused (' + r.status + ')' + (e.message ? ': ' + e.message.slice(0, 120) : '') };
      return { ok: false, text: 'Vision answered ' + r.status };
    },
  };
  /** GET <url> with a Bearer key; 400 / 401 / 403 = key rejected (xAI answers 400 to a bad key). */
  async function modelsTest(url, v) {
    const r = await fetchT(url, { headers: { Authorization: 'Bearer ' + v } });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, text: 'Key rejected (' + r.status + ')' };
    if (!r.ok) return { ok: false, text: 'Server answered ' + r.status };
    const j = await r.json().catch(() => ({}));
    const n = (j.data || j.models || []).length;
    return { ok: true, text: 'Key works' + (n ? ' \u00b7 ' + n + ' models' : '') };
  }
  const testFor = (name) => (name === 'openai_base' || name === 'openai_key' ? TESTS.openai : TESTS[name]);
  const REACH = {
    ollama_url: 'Could not reach Ollama. Is it running, and started with OLLAMA_ORIGINS set to allow this site?',
  };

  function keyRow(def, focusName) {
    const name = def.name;
    const card = ui.el('section', 'card key-row');
    card.id = 'key-' + name;
    const head = ui.el('div', 'key-head');
    const title = ui.el('b', 'key-label', def.label || name);
    const tag = ui.el('code', 'key-name', name);
    head.append(title, tag);
    if (def.url) {
      const a = ui.el('a', 'key-get', def.kind === 'url' ? 'Docs \u2197' : 'Get a key \u2197');
      a.href = def.url; a.target = '_blank'; a.rel = 'noopener';
      head.appendChild(a);
    }
    card.appendChild(head);
    if (def.hint) card.appendChild(ui.el('p', 'key-hint', def.hint));

    const line = ui.el('div', 'key-line');
    const inp = ui.el('input', 'key-input');
    const masked = def.kind !== 'url';
    inp.type = masked ? 'password' : 'url';
    inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', 'off');
    inp.placeholder = def.kind === 'url' ? (name === 'ollama_url' ? 'http://localhost:11434' : 'https://\u2026/v1') : 'Paste the key';
    inp.setAttribute('aria-label', (def.label || name) + (def.kind === 'url' ? '' : ' key'));
    line.appendChild(inp);
    if (masked) {
      const eye = ui.el('button', 'key-btn key-eye', '\uD83D\uDC41');
      eye.type = 'button'; eye.title = 'Show / hide'; eye.setAttribute('aria-label', 'Show or hide ' + name);
      eye.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.classList.toggle('on', inp.type === 'text'); });
      line.appendChild(eye);
    }
    const save = ui.el('button', 'key-btn key-save', 'Save'); save.type = 'button';
    line.appendChild(save);
    const test = testFor(name);
    let tbtn = null;
    if (test) { tbtn = ui.el('button', 'key-btn', 'Test'); tbtn.type = 'button'; line.appendChild(tbtn); }
    const del = ui.el('button', 'key-btn key-del', 'Delete'); del.type = 'button';
    line.appendChild(del);
    card.appendChild(line);
    const out = ui.el('p', 'key-out', '');
    out.setAttribute('aria-live', 'polite');
    card.appendChild(out);

    const say = (text, cls) => { out.textContent = text; out.className = 'key-out' + (cls ? ' ' + cls : ''); };
    async function load() {
      const v = await K.get(name);
      inp.value = v || '';
      del.disabled = !v;
      if (tbtn) tbtn.disabled = !v && name !== 'openai_base';
      save.disabled = true;
    }
    function doSave() {
      const v = inp.value.trim();
      if (v === '' && !K.has(name)) { save.disabled = true; return; }
      try { K.set(name, v); say(v ? 'Saved' : 'Removed', 'ok'); } catch (e) { say(String(e.message || e), 'bad'); }
      load();
    }
    inp.addEventListener('input', () => { save.disabled = false; say(''); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    inp.addEventListener('change', doSave);
    save.addEventListener('click', doSave);
    del.addEventListener('click', async () => {
      const D = window.UiDialog;
      const ok = D ? await D.confirm('Delete this key?', 'Removes "' + name + '" from this browser. Apps that use it stop working until you add it again.', 'Delete', true)
        : window.confirm('Delete "' + name + '"?');
      if (!ok) return;
      K.remove(name);
      say('Deleted', 'ok');
      if (card.dataset.custom) card.remove(); else load();
    });
    if (tbtn) tbtn.addEventListener('click', async () => {
      if (!save.disabled) doSave();
      const v = name === 'openai_base' || name === 'openai_key' ? '' : await K.get(name);
      if (!v && name !== 'openai_base' && name !== 'openai_key') { say('Add the key first', 'bad'); return; }
      tbtn.disabled = true; say('Testing\u2026');
      try { const r = await test(v); say(r.text, r.ok ? 'ok' : 'bad'); }
      catch (e) { say(e && e.name === 'AbortError' ? 'Timed out' : (REACH[name] || 'Could not reach the server (offline, or it blocks browser requests)'), 'bad'); }
      tbtn.disabled = false;
    });
    card.reload = load;
    load();
    if (focusName === name) card.classList.add('key-focus');
    return card;
  }

  function addCustomRow(list, focusName) {
    const card = ui.el('section', 'card key-row key-add');
    card.appendChild(ui.el('b', 'key-label', 'Add custom key'));
    card.appendChild(ui.el('p', 'key-hint', 'Any other key an app asks for by name. Name: lowercase letters, digits, _ - . (up to 40).'));
    const line = ui.el('div', 'key-line');
    const nm = ui.el('input', 'key-input key-newname');
    Object.assign(nm, { type: 'text', placeholder: 'name, e.g. groq', autocomplete: 'off', spellcheck: false });
    nm.setAttribute('aria-label', 'Custom key name'); nm.setAttribute('autocapitalize', 'off');
    const val = ui.el('input', 'key-input');
    Object.assign(val, { type: 'password', placeholder: 'value', autocomplete: 'off', spellcheck: false });
    val.setAttribute('aria-label', 'Custom key value');
    const add = ui.el('button', 'key-btn key-save', 'Add'); add.type = 'button';
    line.append(nm, val, add);
    const out = ui.el('p', 'key-out', '');
    card.append(line, out);
    function go() {
      const n = nm.value.trim().toLowerCase(), v = val.value.trim();
      if (!NAME_RE.test(n)) { out.textContent = 'Use lowercase letters, digits, _ - . (1\u201340)'; out.className = 'key-out bad'; return; }
      if (!v) { out.textContent = 'Add a value'; out.className = 'key-out bad'; return; }
      const existed = K.has(n);
      K.set(n, v);
      nm.value = ''; val.value = '';
      out.textContent = existed ? 'Updated "' + n + '"' : 'Added "' + n + '"'; out.className = 'key-out ok';
      const row = list.querySelector('#key-' + CSS.escape(n));
      if (row) row.reload();
      else { const r = keyRow({ name: n, label: n, kind: 'key' }, focusName); r.dataset.custom = '1'; list.appendChild(r); }
    }
    add.addEventListener('click', go);
    [nm, val].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }));
    return card;
  }

  function guide() {
    const d = ui.el('details', 'card howto key-guide');
    const s = ui.el('summary', '', 'Keys guide: where to get each key, free limits, how apps use them');
    const body = ui.el('div', 'howto-body');
    const pre = ui.el('pre', 'key-readme', 'Loading\u2026');
    const a = ui.el('a', 'tap', 'Open the keys guide on GitHub');
    a.href = README_GH; a.target = '_blank'; a.rel = 'noopener';
    a.appendChild(ui.el('small', '', 'hub/keys.readme.md'));
    body.append(pre, a);
    d.append(s, body);
    let loaded = false;
    d.addEventListener('toggle', () => {
      if (!d.open || loaded) return;
      loaded = true;
      if (location.protocol === 'file:') { pre.textContent = 'Open hub/keys.readme.md next to hub.html, or the GitHub link below.'; return; }
      fetch(README, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then((t) => { pre.textContent = t; }).catch(() => { pre.textContent = 'Could not load the guide (offline?). Use the GitHub link below.'; });
    });
    return d;
  }

  Settings.add({
    id: 'keys', title: 'API Keys', icon: '\uD83D\uDD11',
    render(pane, sub) {
      if (!K) { pane.appendChild(ui.note('The key store (hub/core/hub_keys.js) did not load.')); return; }
      const focusName = String(sub || '').toLowerCase();
      const note = ui.el('p', 'opt-note key-note');
      note.textContent = '\uD83D\uDD12 Keys stay only in this browser on this device (localStorage). They are not synced to a joined phone and the Hub sends them nowhere; each app sends a key only to its own service. Every Hub app can read them. (If you turn on About \u2192 Profile \u2192 Include keys in profile, they are also saved in your profile file.)';
      const list = ui.el('div', 'key-list');
      K.KNOWN.forEach((def) => list.appendChild(keyRow(def, focusName)));
      const known = new Set(K.KNOWN.map((d) => d.name));
      const customs = K.list().filter((n) => !known.has(n));
      customs.forEach((n) => { const r = keyRow({ name: n, label: n, kind: 'key' }, focusName); r.dataset.custom = '1'; list.appendChild(r); });
      const readme = ui.el('a', 'key-readme-link', 'Keys guide (readme) \u2197');
      readme.href = README_GH; readme.target = '_blank'; readme.rel = 'noopener';
      note.append(' ', readme);
      pane.append(note, ui.title('Services'), list, ui.title('Custom'), addCustomRow(list, focusName), ui.title('Help'), guide());
      // another tab / app changed a key → refresh that row (or all)
      const off = K.onChange((e) => {
        if (!pane.isConnected) { off(); return; }
        list.querySelectorAll('.key-row').forEach((r) => { if (!e.name || r.id === 'key-' + e.name) { if (r.reload) r.reload(); } });
      });
      if (focusName) {
        let row = list.querySelector('#key-' + CSS.escape(focusName));
        if (!row && NAME_RE.test(focusName)) {   // an app asked for a custom key that is not set yet
          row = keyRow({ name: focusName, label: focusName, kind: 'key' }, focusName);
          row.dataset.custom = '1'; list.appendChild(row);
        }
        if (row) requestAnimationFrame(() => { row.scrollIntoView({ block: 'center' }); const i = row.querySelector('.key-input'); if (i) i.focus({ preventScroll: true }); });
      }
    }
  });
})();
