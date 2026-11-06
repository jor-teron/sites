/**
 * H134b: shared, non-streaming AI requests; no apps migrated yet.
 * Same-origin Hub apps: await window.top.HubAPI.chat({...}).
 * Standalone: load hub_keys.js then hub_api.js (paths relative to your page).
 * Requires HubKeys at call time; never copies keys into another store.
 * Text chat only: no tools, images, streaming, retries or usage accounting.
 * See hub/hubapi.readme.md. Calls can spend provider credits.
 */
(function () {
  'use strict';
  if (window.HubAPI) return;

  const PRESETS = {
    groq: ['Groq', 'https://api.groq.com/openai/v1'],
    openrouter: ['OpenRouter', 'https://openrouter.ai/api/v1'],
    deepseek: ['DeepSeek', 'https://api.deepseek.com/v1'],
    xai: ['xAI', 'https://api.x.ai/v1'],
    deepinfra: ['DeepInfra', 'https://api.deepinfra.com/v1/openai'],
  };
  const LABELS = { gemini: 'Gemini', openai_key: 'OpenAI-compatible',
    tavily: 'Tavily', gvision: 'Google Cloud Vision', ollama_url: 'Ollama URL' };

  function keys() {
    let h = window.HubKeys;
    try { h = (window.top && window.top.HubKeys) || h; } catch (_) { /* standalone */ }
    if (!h || typeof h.get !== 'function') {
      throw new Error('HubAPI requires HubKeys. Open this app in the Hub, or load hub_keys.js before hub_api.js.');
    }
    return h;
  }
  function settingsError(name, message) {
    const e = new Error(message + ' Add it in Settings > API Keys.');
    e.keyName = name;
    // Call from a user click to avoid popup blocking; never opens Settings automatically.
    e.openSettings = () => keys().open(name);
    return e;
  }
  async function value(name, required = true) {
    let v;
    try { v = await keys().get(name); }
    catch (_) {
      // Do not relay store exceptions: an implementation might include a secret.
      keys();
      throw new Error('HubAPI could not read Settings > API Keys.');
    }
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (!required) return '';
    const label = LABELS[name] || (PRESETS[name] && PRESETS[name][0]) || 'Provider';
    throw settingsError(name, 'No ' + label + (name === 'ollama_url' ? ' saved.' : ' key saved.'));
  }
  function requiredText(v, label) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(label + ' must be a non-empty string.');
    return v.trim();
  }
  function baseURL(v) {
    let u;
    try { u = new URL(v); } catch (_) { throw new Error('Invalid provider URL in Settings > API Keys.'); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) {
      throw new Error('Provider URL must be HTTP(S), without credentials, query or fragment. Check Settings > API Keys.');
    }
    return u.href.replace(/\/+$/, '');
  }
  function httpError(label, status) {
    const hint = status === 401 || status === 403 ? ' Check the key and API access in Settings > API Keys.'
      : status === 429 ? ' Rate limit or quota reached; try later or check your plan.'
      : status === 432 || status === 433 ? ' Search credits used up; check your plan.' : ' Try again later.';
    return new Error(label + ' request failed (HTTP ' + status + ').' + hint);
  }
  async function post(url, body, headers, signal, label) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body), signal, credentials: 'omit', redirect: 'error' });
    } catch (_) {
      // Never propagate fetch errors, URLs or response bodies (they can echo API keys).
      if (signal && signal.aborted) throw new DOMException('HubAPI request cancelled.', 'AbortError');
      throw new Error(label + ' could not be reached. Check connection, CORS and the provider URL.');
    }
    if (!r.ok) throw httpError(label, r.status);
    let j;
    try { j = await r.json(); } catch (_) { throw new Error(label + ' returned invalid JSON.'); }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(label + ' returned an invalid response.');
    if (j.error) throw new Error(label + ' returned an API error. Check API access and quota.');
    return j;
  }
  function messages(o) {
    const out = [];
    if (o.system !== undefined) out.push({ role: 'system', content: requiredText(o.system, 'system') });
    if (o.messages !== undefined) {
      if (!Array.isArray(o.messages)) throw new Error('messages must be an array of {role, content}.');
      o.messages.forEach((m) => {
        if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') {
          throw new Error('messages supports system, user and assistant roles with string content only.');
        }
        out.push({ role: m.role, content: m.content });
      });
    }
    if (o.prompt !== undefined) out.push({ role: 'user', content: requiredText(o.prompt, 'prompt') });
    if (!out.some((m) => m.role !== 'system' && m.content.trim())) throw new Error('Supply prompt or non-empty messages.');
    return out;
  }
  function options(o) {
    if (o.temperature !== undefined && (typeof o.temperature !== 'number' || !Number.isFinite(o.temperature) || o.temperature < 0 || o.temperature > 2)) {
      throw new Error('temperature must be a number between 0 and 2.');
    }
    if (o.maxTokens !== undefined && (!Number.isInteger(o.maxTokens) || o.maxTokens < 1)) {
      throw new Error('maxTokens must be a positive integer.');
    }
  }
  async function chat(o = {}) {
    const provider = requiredText(o.provider, 'provider').toLowerCase();
    const model = requiredText(o.model, 'model');
    const list = messages(o);
    options(o);
    let j, text;
    if (provider === 'gemini') {
      const key = await value('gemini'), contents = [], sys = [];
      list.forEach((m) => {
        if (m.role === 'system') { sys.push(m.content); return; }
        const role = m.role === 'assistant' ? 'model' : 'user', parts = [{ text: m.content || ' ' }];
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts.push(...parts);
        else contents.push({ role, parts });
      });
      const body = { contents };
      if (sys.length) body.systemInstruction = { parts: [{ text: sys.join('\n\n') }] };
      if (o.temperature !== undefined || o.maxTokens !== undefined) {
        body.generationConfig = {};
        if (o.temperature !== undefined) body.generationConfig.temperature = o.temperature;
        if (o.maxTokens !== undefined) body.generationConfig.maxOutputTokens = o.maxTokens;
      }
      j = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model.replace(/^models\//, '')) + ':generateContent',
        body, { 'x-goog-api-key': key }, o.signal, 'Gemini');
      if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini blocked this prompt.');
      const candidate = (j.candidates || [])[0];
      text = candidate && candidate.content && Array.isArray(candidate.content.parts)
        ? candidate.content.parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('') : '';
    } else if (provider === 'ollama') {
      const base = baseURL(await value('ollama_url'));
      const body = { model, messages: list, stream: false };
      if (o.temperature !== undefined || o.maxTokens !== undefined) {
        body.options = {};
        if (o.temperature !== undefined) body.options.temperature = o.temperature;
        if (o.maxTokens !== undefined) body.options.num_predict = o.maxTokens;
      }
      j = await post(base + '/api/chat', body, {}, o.signal, 'Ollama');
      text = j.message && j.message.content;
    } else {
      if (provider !== 'openai' && !Object.prototype.hasOwnProperty.call(PRESETS, provider)) {
        throw new Error('Unsupported HubAPI provider. See hub/hubapi.readme.md.');
      }
      const preset = PRESETS[provider], label = preset ? preset[0] : 'OpenAI-compatible';
      const key = await value(preset ? provider : 'openai_key');
      const base = baseURL(preset ? preset[1] : (await value('openai_base', false)) || 'https://api.openai.com/v1');
      const body = { model, messages: list, stream: false };
      if (o.temperature !== undefined) body.temperature = o.temperature;
      if (o.maxTokens !== undefined) body.max_tokens = o.maxTokens;
      j = await post(base + '/chat/completions', body, { Authorization: 'Bearer ' + key }, o.signal, label);
      text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    }
    if (typeof text !== 'string' || !text.trim()) throw new Error('Provider returned no text (possibly blocked or a non-text response).');
    return { text }; // No raw payload: avoids forwarding provider diagnostics that might echo a key.
  }
  async function search(o = {}) {
    const query = requiredText(o.query, 'query');
    if (o.count !== undefined && !Number.isInteger(o.count)) throw new Error('count must be an integer.');
    const count = Math.max(1, Math.min(10, o.count === undefined ? 5 : o.count));
    const key = await value('tavily');
    const j = await post('https://api.tavily.com/search',
      { query, max_results: count, search_depth: 'basic', include_usage: true }, { Authorization: 'Bearer ' + key }, o.signal, 'Tavily');
    if (!Array.isArray(j.results)) throw new Error('Tavily returned an invalid search response.');
    return { query, depth: 'basic', results: j.results.slice(0, count).map((r) => ({
      title: String(r.title || ''), url: String(r.url || ''), snippet: String(r.content || '').slice(0, 500),
    })) };
  }
  async function vision(o = {}) {
    // Cloud Vision is NOT a prompt-following model. prompt selects labels/text/all only.
    const mode = o.prompt === undefined ? 'all' : requiredText(o.prompt, 'prompt').toLowerCase();
    if (!['labels', 'text', 'all'].includes(mode)) throw new Error('Cloud Vision prompt must be labels, text or all; free-form prompts are not supported.');
    const image = requiredText(o.image, 'image').replace(/^data:image\/[^;,]+;base64,/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('image must be base64 bytes or a base64 image data URL (not a URL).');
    const features = [];
    if (mode !== 'text') features.push({ type: 'LABEL_DETECTION', maxResults: 15 });
    if (mode !== 'labels') features.push({ type: 'DOCUMENT_TEXT_DETECTION' });
    const key = await value('gvision');
    // Same images:annotate payload as OCR/Vision; key header avoids putting secrets in URLs.
    const j = await post('https://vision.googleapis.com/v1/images:annotate',
      { requests: [{ image: { content: image }, features }] }, { 'x-goog-api-key': key }, o.signal, 'Google Cloud Vision');
    const r = j.responses && j.responses[0];
    if (!r || r.error) throw new Error('Google Cloud Vision could not annotate this image. Check API access, quota and image format.');
    return { text: (r.fullTextAnnotation && r.fullTextAnnotation.text) || ((r.textAnnotations || [])[0] || {}).description || '',
      labels: (r.labelAnnotations || []).map((l) => ({ description: l.description || '', score: l.score || 0 })) };
  }
  window.HubAPI = Object.freeze({ chat, search, vision });
})();
