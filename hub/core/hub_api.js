/**
 * H134b: shared, non-streaming AI requests; no apps migrated yet.
 * Same-origin Hub apps: await window.top.HubAPI.chat({...}).
 * Standalone: load hub_keys.js then hub_api.js (paths relative to your page).
 * Requires HubKeys at call time; never copies keys into another store.
 * Text chat only: no tools, images, streaming, retries or usage accounting.
 * See hub/hubapi.readme.md. Calls can spend provider credits.
 * H134c: + chatAdvanced() (streaming onDelta, tools / tool_calls, images, Gemini thinking + thoughtSignature, usage),
 *   models(), fetchPage() (Tavily extract), services() (custom services from hub_providers.js as {id, label, type}),
 *   search({depth}) + credits. provider may be a built-in name, a custom service id 'svc_…', or 'custom' (app's own
 *   endpoint + key). chat() keeps its contract ({text}); it also accepts a
 *   custom service id. The note above about tools/streaming is chat() only.
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
    const e = new Error(label + ' request failed (HTTP ' + status + ').' + hint);
    e.status = status;   // H134c: callers (Agent's Tavily cards) branch on 401 / 429 / 432 / 433
    return e;
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
    if (/^svc_/.test(provider)) {
      // H134c: a custom service id (Settings > API Keys > Custom providers): same {text} result, via the streaming path.
      text = (await chatAdvanced({ provider, model, messages: list, temperature: o.temperature, maxTokens: o.maxTokens, signal: o.signal })).text;
    } else if (provider === 'gemini') {
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
  // async function search(o = {}) { ... search_depth: 'basic' only, no credits ... }   (before H134c)
  async function search(o = {}) {
    const query = requiredText(o.query, 'query');
    if (o.count !== undefined && !Number.isInteger(o.count)) throw new Error('count must be an integer.');
    const count = Math.max(1, Math.min(10, o.count === undefined ? 5 : o.count));
    const depth = depthOf(o.depth);   // H134c: optional 'advanced' (2 credits)
    const key = await value('tavily');
    const j = await post('https://api.tavily.com/search',
      { query, max_results: count, search_depth: depth, include_usage: true }, { Authorization: 'Bearer ' + key }, o.signal, 'Tavily');
    if (!Array.isArray(j.results)) throw new Error('Tavily returned an invalid search response.');
    return { query, depth, credits: credits(j, depth), results: j.results.slice(0, count).map((r) => ({
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
  /* ---------------- H134c: custom services + advanced (streaming) calls ---------------- */
  // The advanced path mirrors Agent's adapters (apps/lab/agent/app/models/gemini.js, openai.js, ollama.js, net.js)
  // so Agent can become a thin adapter: same request bodies, same internal (Ollama-style) message format, same result
  // fields (tool_calls, eval_count, prompt_eval_count, eval_duration, done_reason) plus a plain text / thinking / usage.
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  function providerStore() {
    let p = window.HubProviders;
    try { p = (window.top && window.top.HubProviders) || p; } catch (_) { /* standalone */ }
    return p && typeof p.list === 'function' ? p : null;
  }
  function services() {
    const p = providerStore();
    return p ? p.list().map((s) => ({ id: s.id, label: s.label, type: s.type })) : [];
  }
  function fail(kind, message, status) {
    const e = new Error(message);
    e.kind = kind; // 'key' | 'http' | 'unreachable' | 'abort' | 'input' (Agent's HR.net kinds + key/input)
    if (status) e.status = status;
    if (kind === 'abort') e.name = 'AbortError';
    return e;
  }
  // Provider error text helps (wrong model, bad tool schema) but may echo a key: redact every secret we sent.
  function redact(s, secrets) {
    let t = String(s || '');
    (secrets || []).forEach((k) => { if (k && k.length >= 4) t = t.split(k).join('•••'); });
    return t.replace(/([?&]key=)[^&\s"']+/gi, '$1•••').replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1•••')
      .replace(/\b(sk-|gsk_|xai-|tvly-|AIza)[A-Za-z0-9_-]{6,}/g, '•••').slice(0, 300);
  }
  function msgOf(j) {
    if (Array.isArray(j)) j = j[0] || {};
    const e = j && (j.error !== undefined ? j.error : j.detail);
    return typeof e === 'string' ? e : (e && (e.message || e.error || e.status)) || '';
  }
  async function resolve(o) {
    const provider = requiredText(o.provider, 'provider');
    const lower = provider.toLowerCase();
    if (/^svc_/.test(provider)) {
      const store = providerStore();
      const s = store && await store.secret(provider);
      if (!s) {
        const e = fail('key', 'This custom service is not saved in this browser. Add it in Settings > API Keys > Custom providers.');
        e.keyName = provider; e.openSettings = () => { try { store && store.open(''); } catch (_) { /* no Hub */ } };
        throw e;
      }
      const info = store.info ? store.info(provider) : null;
      const label = (info && info.label) || 'Custom service';
      return { kind: s.type, base: baseURL(s.endpoint || (s.type === 'gemini' ? GEMINI : '')), key: s.key, label };
    }
    if (lower === 'custom') {
      // App-owned config (Agent's Custom tab: its own base + optional local key). Nothing is stored by the Hub.
      return { kind: 'openai', base: baseURL(requiredText(o.endpoint, 'endpoint')), key: typeof o.key === 'string' ? o.key.trim() : '', label: 'Custom' };
    }
    if (lower === 'gemini') return { kind: 'gemini', base: GEMINI, key: await keyed('gemini'), label: 'Gemini' };
    if (lower === 'ollama') return { kind: 'ollama', base: baseURL(await keyed('ollama_url')), key: '', label: 'Ollama' };
    if (lower !== 'openai' && !Object.prototype.hasOwnProperty.call(PRESETS, lower)) {
      throw fail('input', 'Unsupported HubAPI provider. Use a built-in name, a custom service id (svc_…) or "custom". See hub/hubapi.readme.md.');
    }
    const preset = PRESETS[lower];
    return { kind: 'openai', key: await keyed(preset ? lower : 'openai_key'), label: preset ? preset[0] : 'OpenAI-compatible',
      base: baseURL(preset ? preset[1] : (await value('openai_base', false)) || 'https://api.openai.com/v1') };
  }
  async function keyed(name) {
    try { return await value(name); }
    catch (e) { e.kind = e.kind || 'key'; throw e; }
  }
  async function stream(url, body, headers, signal, label, secrets, onData, ndjson) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body), signal, credentials: 'omit', redirect: 'error' });
    } catch (_) {
      if (signal && signal.aborted) throw fail('abort', 'Stopped');
      throw fail('unreachable', label + ' could not be reached. Check connection, CORS and the endpoint.');
    }
    if (!r.ok) {
      let detail = '';
      try { const t = await r.text(); try { detail = msgOf(JSON.parse(t)) || ''; } catch (_) { detail = t; } } catch (_) { /* no body */ }
      const base = httpError(label, r.status).message;
      throw fail('http', base + (detail ? ' ' + redact(detail, secrets) : ''), r.status);
    }
    if (!r.body || typeof r.body.getReader !== 'function') throw fail('http', label + ' returned no stream.');
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    function line(l) {
      l = l.replace(/\r$/, '');
      let d;
      if (ndjson) { d = l.trim(); if (!d) return; }
      else { if (l.indexOf('data:') !== 0) return; d = l.slice(5).trim(); if (!d || d === '[DONE]') return; }
      let j;
      try { j = JSON.parse(d); } catch (_) { throw fail('http', label + ' sent an unreadable stream chunk.'); }
      if (j && j.error) throw fail('http', label + ' returned an error: ' + redact(msgOf(j), secrets));
      onData(j);
    }
    try {
      for (;;) {
        const x = await rd.read();
        if (x.done) { line(buf); break; }
        buf += dec.decode(x.value, { stream: true });
        const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(line);
      }
    } catch (e) {
      if (e && e.kind) throw e;
      if ((signal && signal.aborted) || (e && e.name === 'AbortError')) throw fail('abort', 'Stopped');
      throw fail('unreachable', label + ' stream was interrupted.');
    }
  }
  function imgPart(b) {
    // Agent sends raw base64 JPEG; also accept a data URL or {data, mimeType}.
    if (b && typeof b === 'object') return { mime: String(b.mimeType || 'image/jpeg'), data: String(b.data || '') };
    const s = String(b || ''), m = /^data:([^;,]+);base64,(.*)$/.exec(s);
    return m ? { mime: m[1], data: m[2] } : { mime: 'image/jpeg', data: s };
  }
  function args(a) {
    if (a && typeof a === 'object') return a;
    if (!a) return {};
    try { return JSON.parse(a); } catch (_) { return { _raw: a }; }
  }
  function advMessages(list) {
    if (!Array.isArray(list) || !list.length) throw fail('input', 'messages must be a non-empty array.');
    list.forEach((m) => {
      if (!m || !['system', 'user', 'assistant', 'tool'].includes(m.role)) throw fail('input', 'messages roles: system, user, assistant, tool.');
    });
    return list;
  }
  // Same as Agent gemini.js toG()
  function toGemini(list) {
    const contents = [], sys = [];
    function push(role, parts) { if (!parts.length) return; const l = contents[contents.length - 1]; if (l && l.role === role) l.parts = l.parts.concat(parts); else contents.push({ role, parts }); }
    list.forEach((m) => {
      if (m.role === 'system') sys.push(m.content);
      else if (m.role === 'user') push('user', [{ text: m.content || ' ' }].concat((m.images || []).map((b) => { const i = imgPart(b); return { inlineData: { mimeType: i.mime, data: i.data } }; })));
      else if (m.role === 'assistant') push('model', (m.content ? [{ text: m.content }] : []).concat((m.tool_calls || []).map((c) => {
        const f = c.function || {}, p = { functionCall: { name: f.name, args: args(f.arguments) } };
        if (c.thoughtSignature) p.thoughtSignature = c.thoughtSignature; return p; })));
      else if (m.role === 'tool') { const fr = { name: m.tool_name, response: { result: m.content || '' } }; if (m.tool_call_id) fr.id = m.tool_call_id; push('user', [{ functionResponse: fr }]); }
    });
    return { contents, sys: sys.join('\n\n') };
  }
  function geminiDecl(t) {
    const f = t.function || t, p = f.parameters, d = { name: f.name, description: f.description };
    if (p && p.properties && Object.keys(p.properties).length) d.parameters = p;
    return d;
  }
  // Same as Agent openai.js toOA()
  function toOpenAI(list) {
    const q = []; let n = 0;
    return list.map((m) => {
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
        return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((c) => {
          const f = c.function || {}, id = c.id || 'call_' + (n++); q.push(id);
          return { id, type: 'function', function: { name: f.name, arguments: typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments || {}) } };
        }) };
      }
      if (m.role === 'tool') { const qid = q.shift(); return { role: 'tool', tool_call_id: m.tool_call_id || qid || 'call_0', content: m.content || '' }; }
      if (m.images && m.images.length) return { role: m.role, content: [{ type: 'text', text: m.content || 'What is in this picture?' }].concat(m.images.map((b) => { const i = imgPart(b); return { type: 'image_url', image_url: { url: 'data:' + i.mime + ';base64,' + i.data } }; })) };
      return { role: m.role, content: m.content || '' };
    });
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  async function chatAdvanced(o = {}) {
    const model = requiredText(o.model, 'model').replace(/^models\//, '');
    const list = advMessages(o.messages);
    options(o);
    if (o.tools !== undefined && !Array.isArray(o.tools)) throw fail('input', 'tools must be an array of {type:"function", function:{name, description, parameters}}.');
    const p = await resolve(o);
    const onDelta = typeof o.onDelta === 'function' ? o.onDelta : null;
    const secrets = [p.key];
    let text = '', thinking = '', t1 = 0, t2 = 0;
    const out = { done_reason: '' }, calls = [];
    function delta(c, th) {
      if (!c && !th) return;
      text += c || ''; thinking += th || '';
      if (onDelta) { try { onDelta(c || '', th || ''); } catch (e) { console.warn('HubAPI onDelta', e); } }
    }
    function tick() { if (!t1) t1 = now(); t2 = now(); }
    if (p.kind === 'gemini') {
      const g = toGemini(list), body = { contents: g.contents };
      if (g.sys) body.systemInstruction = { parts: [{ text: g.sys }] };
      if (o.tools && o.tools.length) body.tools = [{ functionDeclarations: o.tools.map(geminiDecl) }];
      const th = o.thinking, gc = {};
      if (th === true) gc.thinkingConfig = { includeThoughts: true };
      else if (th === false) gc.thinkingConfig = { thinkingBudget: 0 };
      else if (th && typeof th === 'object') {
        gc.thinkingConfig = {};
        if (th.includeThoughts !== undefined) gc.thinkingConfig.includeThoughts = !!th.includeThoughts;
        if (Number.isInteger(th.budget)) gc.thinkingConfig.thinkingBudget = th.budget;
        if (typeof th.level === 'string') gc.thinkingConfig.thinkingLevel = th.level;
      }
      if (o.temperature !== undefined) gc.temperature = o.temperature;
      if (o.maxTokens !== undefined) gc.maxOutputTokens = o.maxTokens;
      if (Object.keys(gc).length) body.generationConfig = gc;
      const headers = p.key ? { 'x-goog-api-key': p.key } : {};
      await stream(p.base + '/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', body, headers, o.signal, p.label, secrets, (j) => {
        if (j.promptFeedback && j.promptFeedback.blockReason) throw fail('http', 'Blocked by Gemini: ' + String(j.promptFeedback.blockReason).slice(0, 60));
        const u = j.usageMetadata;
        if (u) {
          out.eval_count = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); out.prompt_eval_count = u.promptTokenCount;
          out.usage = { prompt_tokens: u.promptTokenCount || 0, completion_tokens: u.candidatesTokenCount || 0,
            thoughts_tokens: u.thoughtsTokenCount || 0, total_tokens: u.totalTokenCount || 0 };
        }
        const c = (j.candidates || [])[0]; if (!c) return;
        ((c.content || {}).parts || []).forEach((part) => {
          tick();
          if (part.functionCall) {
            const tc = { function: { name: part.functionCall.name, arguments: part.functionCall.args || {} } };
            if (part.functionCall.id) tc.id = part.functionCall.id;
            if (part.thoughtSignature) tc.thoughtSignature = part.thoughtSignature;
            calls.push(tc);
          } else if (part.text) delta(part.thought ? '' : part.text, part.thought ? part.text : '');
        });
        if (c.finishReason) out.done_reason = String(c.finishReason).toLowerCase();
      });
    } else if (p.kind === 'ollama') {
      // Same as Agent ollama.js chat(): NDJSON stream, native tools, think flag.
      const body = { model, messages: list.map((m) => { const x = Object.assign({}, m); if (x.images) x.images = x.images.map((b) => imgPart(b).data); return x; }), stream: true };
      if (o.thinking === true || o.thinking === false) body.think = o.thinking;
      if (o.tools && o.tools.length) body.tools = o.tools;
      if (o.temperature !== undefined || o.maxTokens !== undefined) {
        body.options = {};
        if (o.temperature !== undefined) body.options.temperature = o.temperature;
        if (o.maxTokens !== undefined) body.options.num_predict = o.maxTokens;
      }
      let last = null;
      await stream(p.base + '/api/chat', body, {}, o.signal, p.label, secrets, (j) => {
        const m = j.message || {};
        if (m.content || m.thinking) { tick(); delta(m.content || '', m.thinking || ''); }
        if (m.tool_calls) m.tool_calls.forEach((c) => calls.push({ id: c.id, function: { name: (c.function || {}).name, arguments: args((c.function || {}).arguments) } }));
        if (j.done) last = j;
      }, true);
      if (last) {
        ['eval_count', 'prompt_eval_count', 'eval_duration', 'total_duration'].forEach((k) => { if (last[k] !== undefined) out[k] = last[k]; });
        out.done_reason = last.done_reason || '';
        out.usage = { prompt_tokens: last.prompt_eval_count || 0, completion_tokens: last.eval_count || 0,
          total_tokens: (last.prompt_eval_count || 0) + (last.eval_count || 0) };
      }
    } else {
      // Same as Agent openai.js chat(): SSE, stream_options.include_usage, tool_calls joined by index.
      const body = { model, messages: toOpenAI(list), stream: true, stream_options: { include_usage: true } };
      if (o.tools && o.tools.length) body.tools = o.tools;
      if (o.temperature !== undefined) body.temperature = o.temperature;
      if (o.maxTokens !== undefined) body.max_tokens = o.maxTokens;
      if (typeof o.reasoningEffort === 'string') body.reasoning_effort = o.reasoningEffort;
      const acc = [];
      await stream(p.base + '/chat/completions', body, p.key ? { Authorization: 'Bearer ' + p.key } : {}, o.signal, p.label, secrets, (j) => {
        const u = j.usage || (j.x_groq && j.x_groq.usage);
        if (u) {
          out.eval_count = u.completion_tokens; out.prompt_eval_count = u.prompt_tokens;
          out.usage = { prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0,
            total_tokens: u.total_tokens || ((u.prompt_tokens || 0) + (u.completion_tokens || 0)) };
          const r = u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens;
          if (r) out.usage.thoughts_tokens = r;
        }
        const ch = (j.choices || [])[0]; if (!ch) return;
        const d = ch.delta || ch.message || {}, th = d.reasoning_content || d.reasoning || '';
        if (d.content || th) { tick(); delta(d.content || '', typeof th === 'string' ? th : ''); }
        (d.tool_calls || []).forEach((tc, i) => {
          const k = tc.index != null ? tc.index : i, a = acc[k] || (acc[k] = { id: '', name: '', args: '' }), f = tc.function || {};
          if (tc.id) a.id = tc.id; if (f.name && !a.name) a.name = f.name;
          if (f.arguments) a.args += typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments);
          tick();
        });
        if (ch.finish_reason) out.done_reason = ch.finish_reason;
      });
      acc.filter(Boolean).forEach((a) => { const c = { function: { name: a.name, arguments: args(a.args) } }; if (a.id) c.id = a.id; calls.push(c); });
    }
    if (out.eval_count && t2 > t1 && out.eval_duration === undefined) out.eval_duration = (t2 - t1) * 1e6;
    out.text = text;
    if (thinking) out.thinking = thinking;
    out.tool_calls = calls;
    out.provider = p.kind; // 'gemini' | 'openai' | 'ollama' (wire format used); never the key or endpoint
    return out;
  }
  // Model list for a provider (free GET; Agent's model pickers). -> [{name, label, ctx}]
  async function models(o = {}) {
    const p = await resolve(o);
    const url = p.base + (p.kind === 'ollama' ? '/api/tags' : p.kind === 'gemini' ? '/models?pageSize=200' : '/models');
    const headers = p.kind === 'gemini' ? (p.key ? { 'x-goog-api-key': p.key } : {}) : p.key ? { Authorization: 'Bearer ' + p.key } : {};
    let r;
    try { r = await fetch(url, { headers, signal: o.signal, credentials: 'omit', redirect: 'error' }); }
    catch (_) { if (o.signal && o.signal.aborted) throw fail('abort', 'Stopped'); throw fail('unreachable', p.label + ' could not be reached. Check connection, CORS and the endpoint.'); }
    if (!r.ok) throw fail('http', httpError(p.label, r.status).message, r.status);
    let j; try { j = await r.json(); } catch (_) { throw fail('http', p.label + ' returned invalid JSON.'); }
    if (p.kind === 'gemini') {
      return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
        .map((m) => { const n = String(m.name || '').replace(/^models\//, ''); return { name: n, label: n + (m.displayName ? ' · ' + m.displayName : ''), ctx: m.inputTokenLimit || 0 }; });
    }
    if (p.kind === 'ollama') return (j.models || []).map((m) => ({ name: m.name || m.model, label: m.name || m.model, ctx: 0 }));
    return (j.data || j.models || []).map((m) => ({ name: m.id || m.name, label: m.id || m.name, ctx: +(m.context_length || m.context_window) || 0 }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  // Tavily extract (Agent web_fetch): one URL -> readable text.
  async function fetchPage(o = {}) {
    const url = requiredText(o.url, 'url');
    if (!/^https?:\/\//i.test(url)) throw fail('input', 'url must start with http:// or https://');
    const depth = depthOf(o.depth);
    const key = await keyed('tavily');
    const j = await post('https://api.tavily.com/extract', { urls: [url], extract_depth: depth, include_usage: true },
      { Authorization: 'Bearer ' + key }, o.signal, 'Tavily');
    const r = (j.results || [])[0];
    if (!r) {
      const f = (j.failed_results || [])[0];
      throw fail('http', 'Could not read ' + url + (f && f.error ? ' (' + redact(f.error, [key]).slice(0, 120) + ')' : ''));
    }
    const text = String(r.raw_content || '').replace(/\n{3,}/g, '\n\n').trim();
    const max = Number.isInteger(o.maxChars) && o.maxChars > 0 ? o.maxChars : 0;
    return { url: String(r.url || url), depth, text: max && text.length > max ? text.slice(0, max) : text,
      length: text.length, trimmed: !!(max && text.length > max), credits: credits(j, depth) };
  }
  function depthOf(d) {
    if (d === undefined || d === 'basic') return 'basic';
    if (d === 'advanced') return 'advanced';
    throw fail('input', 'depth must be "basic" or "advanced".');
  }
  // Credits Tavily reports (include_usage), else the published price: basic 1, advanced 2.
  function credits(j, depth) { const c = j && j.usage && +j.usage.credits; return c >= 0 && !Number.isNaN(c) ? c : depth === 'advanced' ? 2 : 1; }
  // window.HubAPI = Object.freeze({ chat, search, vision });   (before H134c)
  window.HubAPI = Object.freeze({ chat, search, vision, chatAdvanced, models, fetchPage, services });   // H134c

})();
