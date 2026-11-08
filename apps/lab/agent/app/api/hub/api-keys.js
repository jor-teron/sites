/* Agent AG37 app-local copy of apps/system/api-keys/api-keys.js (Hub Builder 1; upstream commit b9af92e H140: simplify API Keys with eleven named provider rows).
   upstream-sha256: fc6868911a17fd37d3dca9cafc3e3fd59e946d6e2835bdb459a6b402f3ab1cda
   Do not edit by hand: python3 apps/lab/agent/app/api/vendor.py. The Hub file itself is unchanged. */
(function (window, localStorage) {   /* AG37 wrapper: Agent namespace, not the Hub */
/* ---- upstream below, unchanged ---- */
/*
 * API Keys standalone editor (apps/system/api-keys/api-keys.js, H138b). One place for the API keys every Hub
 * app uses (Agent, News, …), stored by hub/core/hub_keys.js in HubCredentials (sites-hub.credentials)
 * (only this browser; every Hub app gets them, no per-app prompt). Uses the Hub's window.top.HubKeys
 * when the editor runs inside the Hub (so the Hub's onChange listeners fire at once), else its own copy.
 * One row per known key (HubKeys.KNOWN): masked input (URLs shown plain) + 👁 reveal, Save (also on
 * Enter / leaving the field), Test where cheap, Delete. Old provider slots are not read (H134e).
 * Deep link: #keys/<name> scrolls to and highlights that row.
 * The only remaining general key tests are Tavily, Gemini, Ollama and Cloud Vision.
 * Tests (straight from this browser, nothing goes through the Hub):
 *   tavily      GET api.tavily.com/usage (free, no credit; a 1-result search only if /usage is missing)
 *   gemini      GET generativelanguage.googleapis.com/v1beta/models (model list, free)
 *   ollama_url  GET <url>/api/tags
 *   H28.2 gvision POST vision.googleapis.com/v1/images:annotate?key= with no images ({ requests: [] }: nothing to
 *   bill). 400 with reason API_KEY_INVALID = bad key; any other 400 / 200 = the key reached Vision; 403 tells apart
 *   API not enabled, billing off and key restrictions.
 * H140: four built-in service rows plus seven named provider rows backed by ordinary svc_ records.
 * No hidden legacy slots or migration; Add Provider Row and advanced editors remain available.
 * H134a: "Used by" comes from the four visible HubKeys definitions.
 * H134c/H134e: 'Providers' section (hub/core/hub_providers.js, HubCredentials providers section): Label, Provider type
 *   (OpenAI-compatible | Gemini), API endpoint, API key; stable id svc_… per service; Save / Test / Delete. The saved key
 *   is never written back into the page. Test = GET <endpoint>/models (model listing only, not inference verification). Deep link #keys/svc_… scrolls to that row.
 * Guide: hub/keys.readme.md (shown folded at the bottom, plus a GitHub link).
 */
(function () {
  'use strict';
  const ui = {
    el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },
    title(text) { return this.el('h2', 'opt-title', text); },
    note(text) { return this.el('p', 'opt-note', text); },
  };
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
  const testFor = (name) => TESTS[name];
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
    if (def.usedBy && def.usedBy.length) card.appendChild(ui.el('p', 'key-used', 'Used by: ' + def.usedBy.join(', ')));   // H134a

    const line = ui.el('div', 'key-line');
    const inp = ui.el('input', 'key-input');
    const masked = def.kind !== 'url';
    inp.type = masked ? 'password' : 'url';
    inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', 'off');
    inp.placeholder = def.kind === 'url' ? (name === 'ollama_url' ? 'http://localhost:11434' : 'https://…/v1') : 'Paste the key';
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
      if (tbtn) tbtn.disabled = !v;
      save.disabled = true;
    }
    function doSave() {
      const v = inp.value.trim();
      if (!v) { say(K.has(name) ? 'Saved value unchanged. Use Delete to remove it.' : 'Paste a value first.', K.has(name) ? 'ok' : 'bad'); load(); return; }
      try { if (K.set(name, v) === false) throw new Error('Could not save (browser storage full or blocked).'); say(v ? 'Saved' : 'Removed', 'ok'); } catch (e) { say(String(e.message || e), 'bad'); }
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
      if (!K.remove(name) && K.has(name)) { say('Could not remove the key (browser storage may be blocked).', 'bad'); return; }
      say('Deleted', 'ok');
      if (card.dataset.custom) card.remove(); else load();
    });
    if (tbtn) tbtn.addEventListener('click', async () => {
      if (!save.disabled) doSave();
      const v = await K.get(name);
      if (!v) { say('Add the key first', 'bad'); return; }
      tbtn.disabled = true; say('Testing…');
      try { const r = await test(v); say(r.text, r.ok ? 'ok' : 'bad'); }
      catch (e) { say(e && e.name === 'AbortError' ? 'Timed out' : (REACH[name] || 'Could not reach the server (offline, or it blocks browser requests)'), 'bad'); }
      tbtn.disabled = false;
    });
    card.reload = load;
    load();
    if (focusName === name) card.classList.add('key-focus');
    return card;
  }

  /* ---------------- H134c/H134e: Visible providers (hub/core/hub_providers.js) ----------------
   * Four fields per saved service: Label, Provider type, API key, API endpoint. No model (apps pick models).
   * Each service gets a stable id (svc_…) when added; apps call HubAPI with that id, so renaming the label is safe.
   * The saved key is never put back into the page: the key field stays empty ("Key saved") and only a newly typed key
   * replaces it. Test = GET <endpoint>/models (free model list; Gemini: x-goog-api-key header, OpenAI-compatible: Bearer). */
  const P = (() => { try { if (window.top !== window && window.top.HubProviders) return window.top.HubProviders; } catch (_) { /* cross-origin */ } return window.HubProviders; })();
  const PROV_PH = { openai: 'https://api.example.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta (empty = this)' };

  const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
  // H140: canonical labels/endpoints match Agent presets; these are visible svc_ records,
  // not hidden named keys or a second credential store. NVIDIA retains the H138c base.
  const FIXED_PROVIDERS = [
    { name: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1' },
    { name: 'groq', label: 'Groq', endpoint: 'https://api.groq.com/openai/v1' },
    { name: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1' },
    { name: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1' },
    { name: 'xai', label: 'xAI', endpoint: 'https://api.x.ai/v1' },
    { name: 'deepinfra', label: 'DeepInfra', endpoint: 'https://api.deepinfra.com/v1/openai' },
    { name: 'nvidia', label: 'NVIDIA', endpoint: NVIDIA_BASE },
  ];
  function fixedMatch(def) {
    const matches = P.list().map((s) => P.info(s.id)).filter((s) => s && trimSlash(s.endpoint) === def.endpoint);
    const saved = matches.length === 1 && matches[0].type === 'openai' &&
      matches[0].label.trim().toLowerCase() === def.label.toLowerCase() ? matches[0] : null;
    return { saved, conflict: matches.length > 0 && !saved, matches };
  }
  function manageProvider(id) {
    const advanced = pane.querySelector('.providers-advanced');
    if (advanced) advanced.open = true;
    const row = id && pane.querySelector('#prov-' + CSS.escape(id));
    const target = row || advanced;
    if (target) { target.scrollIntoView({ block: 'center' }); const field = target.querySelector('.key-input'); if (field) field.focus(); }
  }
  function namedProviderRow(def) {
    const card = ui.el('section', 'card key-row named-key-row named-provider-row'); card.id = 'key-' + def.name;
    const title = ui.el('b', 'key-label', def.label);
    const input = ui.el('input', 'key-input');
    Object.assign(input, { type: 'password', autocomplete: 'new-password', spellcheck: false });
    input.setAttribute('aria-label', def.label + ' key'); input.setAttribute('autocapitalize', 'off');
    const save = ui.el('button', 'key-btn key-save', 'Save'); save.type = 'button';
    const clear = ui.el('button', 'key-btn key-del', 'Clear'); clear.type = 'button';
    const manage = ui.el('button', 'key-btn fixed-manage', 'Manage'); manage.type = 'button';
    const test = ui.el('button', 'key-btn', 'Test model list'); test.type = 'button';
    const line = ui.el('div', 'key-line'); line.append(input, save);
    const options = ui.el('details', 'fixed-actions');
    options.append(ui.el('summary', '', 'Options'), clear, test, manage);
    const state = ui.el('p', 'key-hint fixed-state'); state.id = 'state-' + def.name; state.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', state.id);
    const out = ui.el('p', 'key-out'); out.setAttribute('aria-live', 'polite');
    card.append(title, state, line, options, out);
    const say = (text, cls) => { out.textContent = text; out.className = 'key-out' + (cls ? ' ' + cls : ''); };
    function load() {
      const m = fixedMatch(def);
      input.placeholder = m.saved && m.saved.hasKey ? 'Key saved · type to replace' : 'Paste the key';
      if (m.conflict) options.open = true;
      save.disabled = m.conflict; clear.disabled = !m.saved || !m.saved.hasKey; test.disabled = !m.saved;
      state.textContent = m.conflict ? 'Existing custom or duplicate providers use this default endpoint. Use Manage to resolve; nothing will be overwritten.'
        : m.saved ? (m.saved.hasKey ? 'Key saved' : 'Provider saved · no key') : '';
      manage.disabled = !m.matches.length;
    }
    function doSave() {
      const m = fixedMatch(def), key = input.value.trim();
      if (m.conflict) { say('Resolve the existing providers with Manage first.', 'bad'); return false; }
      if (!key) { say(m.saved ? 'Saved key unchanged. Use Clear to remove it.' : 'Paste a key first.', m.saved ? 'ok' : 'bad'); return !!m.saved; }
      try {
        if (m.saved) P.update(m.saved.id, { key });
        else P.add({ label: def.label, type: 'openai', endpoint: def.endpoint, key });
        input.value = ''; load(); say('Saved', 'ok'); return true;
      } catch (_) { say('Could not save. Check the key format and browser storage.', 'bad'); return false; }
    }
    save.addEventListener('click', doSave);
    input.addEventListener('input', () => say(''));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    clear.addEventListener('click', async () => {
      const m = fixedMatch(def); if (!m.saved || !m.saved.hasKey) return;
      const D = window.UiDialog;
      const ok = D ? await D.confirm('Clear saved key?', 'Removes the ' + def.label + ' key but keeps its provider id.', 'Clear', true) : window.confirm('Clear saved key?');
      if (!ok) return;
      // Recheck after the asynchronous confirmation; never act on a changed/ambiguous record.
      const now = fixedMatch(def); if (!now.saved || now.saved.id !== m.saved.id) { say('Provider changed. Review it with Manage first.', 'bad'); return; }
      try { P.update(m.saved.id, { key: null }); input.value = ''; load(); say('Key cleared', 'ok'); }
      catch (_) { say('Could not clear the key. Browser storage may be blocked.', 'bad'); }
    });
    manage.addEventListener('click', () => { const m = fixedMatch(def); manageProvider(m.matches[0] && m.matches[0].id); });
    test.addEventListener('click', async () => {
      if (input.value.trim() && !doSave()) return;
      const m = fixedMatch(def); if (!m.saved) { say('Save this provider first, or resolve its conflict with Manage.', 'bad'); return; }
      test.disabled = true; say('Testing model list…');
      try { const result = await provTest(m.saved.id); say(result.text, result.ok ? 'ok' : 'bad'); }
      catch (e) { say(modelListFailure(e), 'bad'); }
      load();
    });
    card.reload = load; load(); return card;
  }
  const NOT_INFERENCE = ' Inference was not tested.';

  // Validate base URLs, never silently rewrite full request paths or arbitrary compatible bases.
  // Shared provider storage still owns general validation; this editor prevents accidental suffix duplication.
  function providerBase(value, type) {
    const raw = String(value || '').trim();
    if (!raw) return raw; // Gemini's default / required OpenAI base are handled by HubProviders
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error('API endpoint must be a valid base URL.'); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Use an HTTP(S) base URL without login, query or fragment. Put the key only in the API key field.');
    }
    const path = url.pathname.replace(/\/+$/, '');
    if (type === 'openai' && /\/chat\/completions$/i.test(path)) {
      throw new Error('Use the API base URL, not the full /chat/completions request URL. NVIDIA base: ' + NVIDIA_BASE);
    }
    if (/\/models$/i.test(path)) {
      throw new Error('Use the API base URL, not the /models test URL; the app adds /models itself.');
    }
    return url.href.replace(/\/+$/, '');
  }

  function modelListFailure(e) {
    return (e && e.name === 'AbortError' ? 'Model-list request timed out.' : 'Model list could not be reached. Network, endpoint or browser restrictions (possibly CORS) may be responsible; the key has not been verified.') + NOT_INFERENCE;
  }

  async function provTest(id) {
    const s = await P.secret(id);
    if (!s) return { ok: false, text: 'Provider is not saved.' + NOT_INFERENCE };
    if (!s.endpoint) return { ok: false, text: 'Add the API base endpoint first.' + NOT_INFERENCE };
    let base;
    try { base = providerBase(s.endpoint, s.type); }
    catch (e) { return { ok: false, text: e.message + NOT_INFERENCE }; } // only our fixed validation text
    const gem = s.type === 'gemini';
    const h = s.key ? (gem ? { 'x-goog-api-key': s.key } : { Authorization: 'Bearer ' + s.key }) : {};
    const r = await fetchT(base + (gem ? '/models?pageSize=1000' : '/models'), { headers: h, credentials: 'omit' });
    const messages = {
      400: 'Model-list request refused (400). Check the base URL and model-list support; this does not prove the key is invalid.',
      401: 'Authentication failed (401). Check the API key and provider account.',
      403: 'Access denied (403). Check API permissions or model-list access; this does not prove the key is invalid.',
      404: 'Model list not found (404). Check the base URL; this provider may not support model listing.',
      429: 'Rate limit or quota reached (429). Try later or check provider usage.',
    };
    if (!r.ok) {
      const status = Number(r.status);
      const text = messages[status] || (status >= 500 && status <= 599
        ? 'Provider server error (' + status + '). Try later.'
        : 'The provider did not return a successful model list.');
      return { ok: false, text: text + NOT_INFERENCE };
    }
    let j;
    try { j = await r.json(); }
    catch (_) { return { ok: false, text: 'Model-list response was not valid JSON.' + NOT_INFERENCE }; }
    const models = j && typeof j === 'object' && !Array.isArray(j) && !j.error ? (gem ? j.models : j.data) : null;
    if (!Array.isArray(models) || !models.every((m) => m && typeof m === 'object' &&
      typeof (gem ? m.name : m.id) === 'string' && (gem ? m.name : m.id).trim())) {
      return { ok: false, text: 'Model-list response had an unexpected format.' + NOT_INFERENCE };
    }
    return { ok: true, text: 'Model list received \u00b7 ' + models.length + ' model' + (models.length === 1 ? '' : 's') + '.' + NOT_INFERENCE };
  }

  /** the four inputs, shared by a saved row and the Add card */
  function provFields(card, v) {
    const lab = ui.el('input', 'key-input prov-label');
    Object.assign(lab, { type: 'text', placeholder: 'Label, e.g. My LM Studio', autocomplete: 'off', spellcheck: false, maxLength: 60 });
    lab.setAttribute('aria-label', 'Label');
    const typ = ui.el('select', 'key-input prov-type');
    typ.setAttribute('aria-label', 'Provider type');
    P.TYPES.forEach((t) => { const o = ui.el('option', '', t.label); o.value = t.type; typ.appendChild(o); });
    const end = ui.el('input', 'key-input prov-endpoint');
    Object.assign(end, { type: 'url', autocomplete: 'off', spellcheck: false });
    end.setAttribute('aria-label', 'API endpoint'); end.setAttribute('autocapitalize', 'off');
    const key = ui.el('input', 'key-input prov-key');
    Object.assign(key, { type: 'password', autocomplete: 'new-password', spellcheck: false });
    key.setAttribute('aria-label', 'API key'); key.setAttribute('autocapitalize', 'off');
    const eye = ui.el('button', 'key-btn key-eye', '\uD83D\uDC41');
    eye.type = 'button'; eye.title = 'Show / hide what you typed'; eye.setAttribute('aria-label', 'Show or hide the typed key');
    eye.addEventListener('click', () => { key.type = key.type === 'password' ? 'text' : 'password'; eye.classList.toggle('on', key.type === 'text'); });
    const l1 = ui.el('div', 'key-line'), l2 = ui.el('div', 'key-line'), l3 = ui.el('div', 'key-line prov-keyline');
    l1.append(lab, typ); l2.append(end); l3.append(key, eye);
    card.append(l1, l2, l3);
    const ph = () => { end.placeholder = PROV_PH[typ.value] || ''; };
    typ.addEventListener('change', ph);
    if (v) { lab.value = v.label; typ.value = v.type; end.value = v.endpoint || ''; }
    ph();
    return { lab, typ, end, key };
  }

  function provRow(id, focusName, list) {
    const card = ui.el('section', 'card key-row prov-row');
    card.id = 'prov-' + id;
    const head = ui.el('div', 'key-head');
    const title = ui.el('b', 'key-label', '');
    const tag = ui.el('code', 'key-name', id);
    const kind = ui.el('code', 'key-name prov-kind', '');
    head.append(title, tag, kind);
    card.append(head, ui.el('p', 'key-hint', 'Apps call it by its id and choose the model. The label is only for you, so renaming is safe.'));
    const f = provFields(card, null);
    const line = ui.el('div', 'key-line');
    const save = ui.el('button', 'key-btn key-save', 'Save'); save.type = 'button';
    const tbtn = ui.el('button', 'key-btn', 'Test model list'); tbtn.type = 'button';
    const del = ui.el('button', 'key-btn key-del', 'Delete'); del.type = 'button';
    line.append(save, tbtn, del);
    const out = ui.el('p', 'key-out', ''); out.setAttribute('aria-live', 'polite');
    card.append(line, ui.el('p', 'key-hint prov-test-note', 'Test only lists models; it does not verify inference, model access or available credits.'), out);
    const say = (text, cls) => { out.textContent = text; out.className = 'key-out' + (cls ? ' ' + cls : ''); };
    function load() {
      const v = P.info(id);
      if (!v) { card.remove(); return; }
      title.textContent = v.label;
      kind.textContent = (P.TYPES.find((t) => t.type === v.type) || {}).label || v.type;
      f.lab.value = v.label; f.typ.value = v.type; f.end.value = v.endpoint || '';
      f.typ.dispatchEvent(new Event('change'));
      f.key.value = '';   // never show the saved key
      f.key.placeholder = v.hasKey ? 'Key saved \u00b7 type to replace' : 'API key (optional for a local server)';
      save.disabled = true;
    }
    function doSave() {
      try {
        const endpoint = providerBase(f.end.value, f.typ.value);
        const previous = P.info(id);
        if (previous && trimSlash(previous.endpoint) !== endpoint && FIXED_PROVIDERS.some((d) => d.endpoint === endpoint) && P.list().some((s) => {
          const info = P.info(s.id); return s.id !== id && info && trimSlash(info.endpoint) === endpoint;
        })) { say('A saved provider already uses this default endpoint. Manage the existing record instead.', 'bad'); return false; }
        P.update(id, { label: f.lab.value, type: f.typ.value, endpoint, key: f.key.value });
        say('Saved', 'ok');
      } catch (e) { say(String((e && e.message) || 'Could not save'), 'bad'); return false; }
      load();
      return true;
    }
    [f.lab, f.end, f.key].forEach((i) => {
      i.addEventListener('input', () => { save.disabled = false; say(''); });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    });
    f.typ.addEventListener('change', () => { if (P.info(id) && f.typ.value !== P.info(id).type) { save.disabled = false; say(''); } });
    save.addEventListener('click', doSave);
    del.addEventListener('click', async () => {
      const D = window.UiDialog, name = (P.info(id) || {}).label || id;
      const ok = D ? await D.confirm('Delete this provider?', 'Removes "' + name + '" (' + id + ') and its key from this browser. Apps that use it stop working until you add it again.', 'Delete', true)
        : window.confirm('Delete "' + name + '"?');
      if (!ok) return;
      P.remove(id);
      card.remove();
      if (list && !list.querySelector('.prov-row')) list.appendChild(provEmpty());
    });
    tbtn.addEventListener('click', async () => {
      if (!save.disabled && !doSave()) return;
      tbtn.disabled = true; say('Testing model list…');
      try { const r = await provTest(id); say(r.text, r.ok ? 'ok' : 'bad'); }
      catch (e) { say(modelListFailure(e), 'bad'); }
      tbtn.disabled = false;
    });
    card.reload = load;
    load();
    if (focusName === id) card.classList.add('key-focus');
    return card;
  }
  function provEmpty() { return ui.el('p', 'opt-note prov-empty', 'No custom providers yet. Add one below.'); }

  function provAddCard(list, focusName) {
    const card = ui.el('section', 'card key-row key-add prov-add');
    card.appendChild(ui.el('b', 'key-label', 'Add Provider Row'));
    card.appendChild(ui.el('p', 'key-hint', 'OpenAI, Groq, OpenRouter, LM Studio, vLLM or another service. Type chooses the request format; apps choose the model.'));
    const setup = ui.el('details', 'prov-setup');
    const summary = ui.el('summary', '', 'NVIDIA setup');
    const guide = ui.el('p', 'key-hint'); guide.id = 'nvidia-guide';
    guide.textContent = 'Use OpenAI-compatible with base ' + NVIDIA_BASE + ', not the full /chat/completions URL. Paste only the key in the key field. Apps choose the model. A preset cannot bypass browser restrictions; a trusted relay/proxy may be required and is not supplied here.';
    const preset = ui.el('button', 'key-btn prov-nvidia', 'Use NVIDIA preset');
    preset.type = 'button'; preset.setAttribute('aria-describedby', 'nvidia-guide');
    setup.append(summary, guide);
    card.append(preset, setup);
    const f = provFields(card, null);
    f.key.placeholder = 'API key (optional for a local server)';
    const line = ui.el('div', 'key-line');
    const add = ui.el('button', 'key-btn key-save', 'Add provider'); add.type = 'button';
    line.append(add);
    const out = ui.el('p', 'key-out', ''); out.setAttribute('aria-live', 'polite');
    card.append(line, out);
    preset.addEventListener('click', () => {
      f.lab.value = 'NVIDIA'; f.typ.value = 'openai'; f.end.value = NVIDIA_BASE;
      f.typ.dispatchEvent(new Event('change'));
      // Never alter the typed key, save or fetch automatically.
      out.textContent = 'NVIDIA fields filled. Add provider to save; Test model list is a separate optional action.';
      out.className = 'key-out';
      f.key.focus();
    });
    function go() {
      let id;
      try {
        const endpoint = providerBase(f.end.value, f.typ.value);
        if (FIXED_PROVIDERS.some((d) => d.endpoint === endpoint) && P.list().some((s) => { const info = P.info(s.id); return info && trimSlash(info.endpoint) === endpoint; })) {
          out.textContent = 'A saved provider already uses this default endpoint. Use Manage or advanced settings instead of adding a duplicate.'; out.className = 'key-out bad'; return;
        }
        id = P.add({ label: f.lab.value, type: f.typ.value, endpoint, key: f.key.value });
      }
      catch (e) { out.textContent = String((e && e.message) || 'Could not add'); out.className = 'key-out bad'; return; }
      f.lab.value = ''; f.end.value = ''; f.key.value = '';
      out.textContent = 'Added \u00b7 id ' + id; out.className = 'key-out ok';
      const empty = list.querySelector('.prov-empty'); if (empty) empty.remove();
      if (!list.querySelector('#prov-' + CSS.escape(id))) list.appendChild(provRow(id, focusName, list));   // onChange may have added it
    }
    add.addEventListener('click', go);
    [f.lab, f.end, f.key].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }));
    return card;
  }

  function providersSection(focusName) {
    const wrap = ui.el('div', 'prov-section');
    const list = ui.el('div', 'key-list prov-list');
    const ids = P.list().map((s) => s.id);
    if (!ids.length) list.appendChild(provEmpty());
    ids.forEach((id) => list.appendChild(provRow(id, focusName, list)));
    const advanced = ui.el('details', 'providers-advanced');
    advanced.append(ui.el('summary', '', 'Manage saved providers / advanced settings'), list);
    advanced.open = !!focusName && /^svc_/.test(focusName);
    wrap.append(advanced, provAddCard(list, focusName));
    // another tab / app changed the list → add missing rows, drop gone ones, repaint the rest
    const off = P.onChange(() => {
      if (!wrap.isConnected) { off(); return; }
      const now = P.list().map((s) => s.id);
      list.querySelectorAll('.prov-row').forEach((r) => { if (now.indexOf(r.id.slice(5)) < 0) r.remove(); else if (r.reload) r.reload(); });
      now.forEach((id) => { if (!list.querySelector('#prov-' + CSS.escape(id))) { const e = list.querySelector('.prov-empty'); if (e) e.remove(); list.appendChild(provRow(id, focusName, list)); } });
      if (!list.querySelector('.prov-row') && !list.querySelector('.prov-empty')) list.appendChild(provEmpty());
    });
    dispose.push(off);
    return wrap;
  }

  function guide() {
    const d = ui.el('details', 'card howto key-guide');
    const s = ui.el('summary', '', 'Keys guide: where to get each key, free limits, how apps use them');
    const body = ui.el('div', 'howto-body');
    const pre = ui.el('pre', 'key-readme', 'Loading…');
    const a = ui.el('a', 'tap', 'Open the keys guide on GitHub');
    a.href = README_GH; a.target = '_blank'; a.rel = 'noopener';
    a.appendChild(ui.el('small', '', 'hub/keys.readme.md'));
    body.append(pre, a);
    d.append(s, body);
    let loaded = false;
    d.addEventListener('toggle', () => {
      if (!d.open || loaded) return;
      loaded = true;
      // if (location.protocol === 'file:') { pre.textContent = 'Open hub/keys.readme.md next to hub.html, or the GitHub link below.'; return; }   (before H129d: hub.html removed)
      if (location.protocol === 'file:') { pre.textContent = 'Open hub/keys.readme.md in the site folder, or the GitHub link below.'; return; }
      fetch(README, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then((t) => { pre.textContent = t; }).catch(() => { pre.textContent = 'Could not load the guide (offline?). Use the GitHub link below.'; });
    });
    return d;
  }

  const editor = {
    id: 'keys', title: 'API Keys', icon: '\uD83D\uDD11',
    render(pane, sub) {
      if (!K) { pane.appendChild(ui.note('The key store (hub/core/hub_keys.js) did not load.')); return; }
      const focusName = String(sub || '').toLowerCase();
      const note = ui.el('p', 'opt-note key-note');
      note.textContent = '\uD83D\uDD12 Keys stay only in this browser on this device (localStorage). They are not automatically synced and the Hub sends them nowhere; each app sends a key only to its own service. Every Hub app can read them. (If you turn on Settings \u2192 Devices \u2192 Profile \u2192 Include keys in profile, they are also saved in your profile file.)';
      const list = ui.el('div', 'key-list');
      ['tavily', 'ollama_url', 'gemini', 'gvision'].forEach((name) => {
        const row = keyRow(K.KNOWN.find((d) => d.name === name), focusName);
        row.classList.add('named-key-row'); list.appendChild(row);
      });
      if (P) FIXED_PROVIDERS.forEach((def) => list.appendChild(namedProviderRow(def)));
      if (P) dispose.push(P.onChange(() => list.querySelectorAll('.named-provider-row').forEach((row) => row.reload())));
      const readme = ui.el('a', 'key-readme-link', 'Keys guide (readme) \u2197');
      readme.href = README_GH; readme.target = '_blank'; readme.rel = 'noopener';
      note.append(' ', readme);
      // H140: simple named rows first; advanced/custom provider controls remain below.
      pane.append(note, ui.title('API keys'), list,
        ui.note('Named provider rows use built-in defaults. Test model list never verifies inference or available credits. Use Options → Manage for endpoints and advanced settings.'));
      const nvidia = ui.el('details', 'prov-setup fixed-nvidia-guide');
      nvidia.append(ui.el('summary', '', 'NVIDIA setup and browser limits'), ui.note('NVIDIA uses the OpenAI-compatible base ' + NVIDIA_BASE + ', not /chat/completions. A saved key or model list does not prove inference works. Browser restrictions may require a trusted proxy; none is supplied here.'));
      pane.append(nvidia);
      if (P) pane.append(ui.title('Providers'), providersSection(focusName));
      pane.append(ui.title('Help'), guide());
      // another tab / app changed a key → refresh that row (or all)
      const off = K.onChange((e) => {
        if (!pane.isConnected) { off(); return; }
        list.querySelectorAll('.key-row').forEach((r) => { if (!e.name || r.id === 'key-' + e.name) { if (r.reload) r.reload(); } });
      });
      dispose.push(off);
      if (focusName && /^svc_/.test(focusName)) {   // H134c: a custom provider row (never a new custom key)
        const row = pane.querySelector('#prov-' + CSS.escape(focusName)) || pane.querySelector('.prov-add');
        if (row) requestAnimationFrame(() => { row.scrollIntoView({ block: 'center' }); const i = row.querySelector('.key-input'); if (i) i.focus({ preventScroll: true }); });
      } else if (focusName) {
        const row = pane.querySelector('#key-' + CSS.escape(focusName));
        if (row) requestAnimationFrame(() => { row.scrollIntoView({ block: 'center' }); const i = row.querySelector('.key-input'); if (i) i.focus({ preventScroll: true }); });
      }

    }
  };
  const pane = document.getElementById('keys-pane');
  let dispose = [];
  function render() {
    dispose.forEach((off) => off()); dispose = [];
    pane.replaceChildren();
    let sub = location.hash.replace(/^#/, '');
    if (sub === 'keys') sub = '';
    else if (sub.startsWith('keys/')) sub = sub.slice(5);
    try { sub = decodeURIComponent(sub); } catch (_) { /* invalid escape stays text */ }
    editor.render(pane, sub);
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', () => { dispose.forEach((off) => off()); dispose = []; });
  window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
  render();

})();

})(HR.apiHost.window, HR.apiHost.storage);
