/* H139a: bounded embeddings transport. No credential persistence, cache, model-name heuristics,
 * inference probes, automatic downloads/retries/batching or task/prompt formatting.
 * Limits: 1–32 strings, 8192 UTF-8 bytes each, 65536 serialized request bytes;
 * response <=4 MiB / 8192 stream chunks (including empty chunks), vectors <=4096 dimensions
 * (<=131072 scalars per request). Chunk count also bounds tiny-chunk overhead and microtask loops.
 * Discovery: <=128 tag records, inspect at most 16 unique names sequentially, <=512 UTF-8
 * bytes per model name; explicit Ollama /show capabilities only. No caching or stale metadata.
 * Deadlines cover resolution, transport, body reads and discovery fan-out: 15s / 60s.
 * Official shape: docs.ollama.com/api/embed and /api-reference/show-model-details.
 */
(function () {
  'use strict';
  if (window.HubEmbeddings) return;
  function create({ resolve, fail }) {
    const enc = new TextEncoder(), safeErrors = new WeakSet();
    const error = (...args) => { const e = fail(...args); safeErrors.add(e); return e; };
    const MAX_BODY = 65536, MAX_RESPONSE = 4 * 1024 * 1024, MAX_DIMS = 4096;
    const check = (signal) => { if (signal.aborted) throw error('abort', 'Embedding request cancelled.'); };
    const text = (v) => typeof v === 'string' && v.trim().length > 0;
    const modelOK = (v) => typeof v === 'string' && v.length <= 512 && text(v) && enc.encode(v).length <= 512;
    function options(o, embed) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw error('input', 'Embedding options must be an object.');
      // Explicit rejection, rather than silently accepting app-owned credential overrides.
      const allowed = embed ? ['provider', 'model', 'input', 'signal'] : ['provider', 'signal'];
      if (Object.keys(o).some((k) => !allowed.includes(k))) throw error('input', 'Unsupported embedding option. Use central API Keys only.');
      if (typeof o.provider !== 'string' || !(o.provider.toLowerCase() === 'ollama' || /^svc_[a-z0-9]{6,40}$/.test(o.provider))) {
        throw error('input', 'Embeddings require Ollama or a supported saved provider id.');
      }
      if (o.signal && (typeof o.signal.aborted !== 'boolean' || typeof o.signal.addEventListener !== 'function' || typeof o.signal.removeEventListener !== 'function')) {
        throw error('input', 'Invalid embedding cancellation signal.');
      }
    }
    async function scoped(signal, ms, fn) {
      if (signal && signal.aborted) throw error('abort', 'Embedding request cancelled.');
      const ac = new AbortController(); let timer, timedOut = false, rejectCancel;
      const cancelled = new Promise((_, reject) => { rejectCancel = reject; });
      const aborted = () => rejectCancel(error(timedOut ? 'unreachable' : 'abort', timedOut ? 'Embedding request timed out.' : 'Embedding request cancelled.'));
      const forward = () => ac.abort();
      ac.signal.addEventListener('abort', aborted, { once: true });
      if (signal) signal.addEventListener('abort', forward, { once: true });
      if (signal && signal.aborted) forward();
      timer = setTimeout(() => { timedOut = true; ac.abort(); }, ms);
      try {
        return await Promise.race([cancelled, Promise.resolve().then(() => { check(ac.signal); return fn(ac.signal); })]);
      } catch (e) {
        if (ac.signal.aborted) throw error(timedOut ? 'unreachable' : 'abort', timedOut ? 'Embedding request timed out.' : 'Embedding request cancelled.');
        if (e && safeErrors.has(e)) throw e;
        throw error('unreachable', 'Embedding service could not be reached or returned an invalid response.');
      } finally {
        clearTimeout(timer); ac.signal.removeEventListener('abort', aborted);
        if (signal) signal.removeEventListener('abort', forward);
      }
    }
    function cancel(body) { try { if (body && typeof body.cancel === 'function') Promise.resolve(body.cancel()).catch(() => {}); } catch (_) { /* safe cleanup */ } }
    async function json(r, signal) {
      check(signal);
      const size = r.headers && r.headers.get('content-length');
      if (size != null && (!/^\d+$/.test(size) || Number(size) > MAX_RESPONSE)) {
        cancel(r.body); throw error('unreachable', 'Embedding response exceeds its size limit.');
      }
      if (!r.body || typeof r.body.getReader !== 'function') throw error('unreachable', 'Bounded embedding response reader unavailable.');
      const reader = r.body.getReader(), chunks = []; let bytes = 0, reads = 0;
      const stop = () => cancel(reader);
      signal.addEventListener('abort', stop, { once: true });
      try {
        check(signal);
        while (true) {
          const { done, value } = await reader.read(); check(signal);
          if (done) break;
          if (++reads > 8192 || !(value instanceof Uint8Array)) throw error('unreachable', 'Invalid or excessively fragmented embedding response.');
          bytes += value.byteLength;
          if (bytes > MAX_RESPONSE) throw error('unreachable', 'Embedding response exceeds its size limit.');
          chunks.push(value);
        }
        const all = new Uint8Array(bytes); let at = 0;
        for (const chunk of chunks) { all.set(chunk, at); at += chunk.byteLength; }
        let result;
        try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); }
        catch (_) { throw error('unreachable', 'Malformed embedding response.'); }
        if (!result || typeof result !== 'object' || Array.isArray(result) || result.error) throw error('unreachable', 'Invalid embedding response.');
        return result;
      } finally {
        signal.removeEventListener('abort', stop); cancel(reader);
        try { reader.releaseLock(); } catch (_) { /* read may still be settling on abort */ }
      }
    }
    function body(o) {
      const s = JSON.stringify(o);
      if (enc.encode(s).length > MAX_BODY) throw error('input', 'Embedding request exceeds 64 KiB.');
      return s;
    }
    async function request(p, path, payload, signal) {
      check(signal);
      const headers = { Accept: 'application/json' };
      if (p.key) headers.Authorization = 'Bearer ' + p.key;
      const init = { method: payload === undefined ? 'GET' : 'POST', headers, signal, cache: 'no-store', redirect: 'error', credentials: 'omit' };
      if (payload !== undefined) { init.body = body(payload); headers['Content-Type'] = 'application/json'; }
      const r = await fetch(p.base + path, init);
      if (signal.aborted) { cancel(r.body); check(signal); }
      if (!r.ok) {
        cancel(r.body);
        const kind = r.status === 401 || r.status === 403 ? 'key' : r.status === 402 ? 'nocredit' : r.status === 429 ? 'quota' : 'http';
        throw error(kind, 'Embedding service returned an HTTP error.', r.status);
      }
      return json(r, signal);
    }
    async function provider(o, signal) {
      check(signal);
      let p;
      try { p = await resolve({ provider: o.provider }); }
      catch (e) {
        check(signal);
        // Resolver failures may involve custom metadata: do not propagate raw messages or hooks.
        throw error(e && e.kind === 'key' ? 'key' : 'input', 'Embedding provider is unavailable. Check central API Keys.');
      }
      check(signal);
      if (!p || !['ollama', 'openai'].includes(p.kind)) throw error('input', 'This saved provider type does not support embeddings.');
      return p;
    }
    async function embeddingModels(o = {}) {
      options(o, false); o = Object.assign({}, o);
      return scoped(o.signal, 15000, async (signal) => {
        const p = await provider(o, signal);
        // Standard OpenAI /models has no reliable embedding capability contract. Manual model input
        // is supported; never infer support from names, or invoke paid embeddings to discover it.
        if (p.kind === 'openai') return [];
        const tags = await request(p, '/api/tags', undefined, signal);
        if (!Array.isArray(tags.models) || tags.models.length > 128) throw error('unreachable', 'Invalid or oversized embedding model list.');
        const names = [...new Set(tags.models.map((m) => m && m.name).filter(modelOK))].slice(0, 16), found = [];
        for (const name of names) {
          check(signal);
          try {
            const show = await request(p, '/api/show', { model: name }, signal);
            if (Array.isArray(show.capabilities) && show.capabilities.includes('embedding')) found.push({ name, label: name });
          } catch (e) { check(signal); if (!e || !['http', 'unreachable'].includes(e.kind)) throw e; /* unestablished capability: omit */ }
        }
        return found;
      });
    }
    function vectors(list, n) {
      if (!Array.isArray(list) || list.length !== n) throw error('unreachable', 'Embedding vector count does not match input.');
      const dims = Array.isArray(list[0]) ? list[0].length : 0;
      if (!dims || dims > MAX_DIMS || list.some((v) => !Array.isArray(v) || v.length !== dims || v.some((x) => typeof x !== 'number' || !Number.isFinite(x)))) {
        throw error('unreachable', 'Embedding vectors have invalid dimensions or numeric values.');
      }
      return dims;
    }
    async function embed(o = {}) {
      options(o, true); o = Object.assign({}, o);
      if (!modelOK(o.model) || !Array.isArray(o.input) || o.input.length < 1 || o.input.length > 32 ||
          Array.from(o.input).some((s) => typeof s !== 'string' || s.length > 8192 || !text(s) || enc.encode(s).length > 8192)) throw error('input', 'Embeddings require a model and 1–32 nonblank strings of at most 8 KiB each.');
      // Snapshot user strings before awaiting credentials. No trim, prefix, truncation or mutation.
      const input = o.input.slice(), model = o.model;
      // Validate the actual adapter body before resolving credentials or making any request.
      const local = o.provider.toLowerCase() === 'ollama';
      const payload = local ? { model, input, truncate: false } : { model, input, encoding_format: 'float' };
      body(payload);
      return scoped(o.signal, 60000, async (signal) => {
        const p = await provider(o, signal);
        const j = await request(p, p.kind === 'ollama' ? '/api/embed' : '/embeddings', payload, signal);
        let list = j.embeddings;
        if (p.kind === 'openai') {
          if (!Array.isArray(j.data) || j.data.length !== input.length) throw error('unreachable', 'Embedding vector count does not match input.');
          list = new Array(input.length); const seen = new Set();
          for (const item of j.data) {
            if (!item || !Number.isInteger(item.index) || item.index < 0 || item.index >= input.length || seen.has(item.index)) throw error('unreachable', 'Invalid embedding response indices.');
            seen.add(item.index); list[item.index] = item.embedding;
          }
        }
        const dims = vectors(list, input.length), result = { vectors: list, dims, model };
        const usage = {}, u = p.kind === 'ollama' ? { prompt_tokens: j.prompt_eval_count } : j.usage;
        if (u && typeof u === 'object') for (const key of ['prompt_tokens', 'total_tokens']) {
          if (Number.isSafeInteger(u[key]) && u[key] >= 0) usage[key] = u[key];
        }
        if (Object.keys(usage).length) result.usage = usage;
        return result;
      });
    }
    return Object.freeze({ embeddingModels, embed });
  }
  window.HubEmbeddings = Object.freeze({ create });
})();
