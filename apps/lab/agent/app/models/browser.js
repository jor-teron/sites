/* Agent — app/models/browser.js: the built-in Browser provider (AG2). No Ollama, no API key.
   Story Mini = onnx-community/TinyStories-3M-ONNX (q8 ~17 MB + tokenizer ~3.5 MB) via Agent's own Transformers.js 3.7.0
   (engine: transformers.min.js 0.9 MB + ORT wasm 11.1 MB, ~3 MB gzipped) in app/models/browser_worker.js, so the UI never freezes. Nothing downloads until
   download() (the card's tap); then setting browserModel = 'ready' remembers it. Cache: Cache API 'agent-browser-model'.
   It is a story model: chat() continues the last user message as a story (no tools, no system prompt, no history).
   Stop terminates the worker (frees its memory); the next send reloads from the cache. remove() deletes the cache. */
HR.browser = (function () {
  var ID = 'onnx-community/TinyStories-3M-ONNX', CACHE = 'agent-browser-model', MAX = 200;
  var FILE = 'https://huggingface.co/' + ID + '/resolve/main/onnx/model_quantized.onnx';
  var SIZE = { model: 20.6, engine: 12.0 };   // MB
  var w = null, job = null, Q = '&plain=1&noarena=1';
  function fail(k, m) { return HR.net.fail(k, m); }
  function kill() { if (w) { w.terminate(); w = null; } }
  function spawn() {
    if (w) return w;
    w = new Worker('app/models/browser_worker.js?v=20261030ag-f1', { type: 'module' });
    w.onmessage = function (e) { if (job) job(e.data || {}); };
    w.onerror = function (e) { e.preventDefault && e.preventDefault(); var j = job; kill(); if (j) j({ type: 'error', msg: (e && e.message) || 'worker failed to start' }); };
    return w;
  }
  function run(msg, on, signal) {
    return new Promise(function (res, rej) {
      if (job) return rej(fail('http', 'The browser model is busy (download or reply in progress).'));
      if (signal && signal.aborted) return rej(fail('abort', 'Stopped'));
      function end(f, v) { job = null; if (signal) signal.removeEventListener('abort', ab); f(v); }
      function ab() { kill(); end(rej, fail('abort', 'Stopped')); }
      if (signal) signal.addEventListener('abort', ab);
      job = function (m) {
        if (m.type === 'error') end(rej, fail('http', 'Browser model: ' + m.msg));
        else if (m.type === 'ready' || m.type === 'done') end(res, m);
        else if (on) on(m);
      };
      spawn().postMessage(msg);
    });
  }
  function ready() { return HR.set.get('browserModel') === 'ready'; }
  /* is the model file really in our cache? (no Cache API, e.g. plain http: trust the flag) */
  function cached() {
    if (!window.caches) return Promise.resolve(true);
    return caches.open(CACHE).then(function (c) { return c.match(FILE); }).then(function (r) { return !!r; }, function () { return true; });
  }
  function download(onProgress, signal) {
    return run({ type: 'load' }, function (m) { if (m.type === 'progress' && onProgress) onProgress(m.loaded, m.total); }, signal)
      .then(function () { HR.set.put('browserModel', 'ready'); });
  }
  function remove() {
    var j = job; kill(); if (j) j({ type: 'error', msg: 'removed' });
    HR.set.put('browserModel', '');
    return window.caches ? caches.delete(CACHE).catch(function () { return false; }) : Promise.resolve(false);
  }
  function prompt(messages) {
    var u = messages.filter(function (m) { return m.role === 'user'; }).pop();
    var t = String(u && u.content || '').replace(/\s+/g, ' ').trim();
    return (t.length > 800 ? t.slice(-800) : t) || 'Once upon a time';
  }
  function chat(o) {
    return (ready() ? cached() : Promise.resolve(false)).then(function (ok) {
      if (!ok) { HR.set.put('browserModel', ''); throw fail('download', 'Download the browser model first.'); }
      return run({ type: 'gen', prompt: prompt(o.messages), max: MAX, temp: 0.8 }, function (m) { if (m.type === 'token') o.onDelta(m.text, ''); }, o.signal);
    }).then(function (m) {
      return { tool_calls: [], eval_count: m.count, eval_duration: m.ms * 1e6, done_reason: m.count >= MAX ? 'length' : 'stop' };
    });
  }
  return { id: ID, size: SIZE, ready: ready, cached: cached, download: download, remove: remove, busy: function () { return !!job; }, chat: chat };
})();
HR.models.register({ id: 'browser', label: 'Browser', needsKey: false,
  models: function () { return Promise.resolve([{ name: 'tinystories-3m', label: 'Story Mini (' + HR.browser.size.model + ' MB)' }]); },
  chat: HR.browser.chat });
