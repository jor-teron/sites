/* AG23: thin HubAPI bridge. Never retry a failed Hub request via the legacy
   adapters: a retry could duplicate a paid call. No Hub/capability/config match
   means the existing standalone adapter is used, including its local keys.
   Legacy code: registry.register previously stored the adapter unchanged;
   reg[a.id] = a; is preserved here as the no-bridge behaviour. */
HR.hubAPI = (function () {
  function api(method) {
    var h = null;
    try { h = window.top && window.top.HubAPI; } catch (e) { /* cross-origin */ }
    h = h || window.HubAPI;
    return h && typeof h[method] === 'function' ? h : null;
  }
  function val(n) { return HR.hubKeys ? HR.hubKeys.val(n) : ''; }
  function trim(s) { return String(s || '').replace(/\/+$/, ''); }
  function config(id, c) {
    var b = trim(c.base), k = c.key || '';
    // H134c only honours endpoint/key overrides for OpenAI-compatible Custom.
    // Gemini and Ollama local overrides must keep their original adapters.
    if (id === 'gemini') return k && k === val('gemini') && b === 'https://generativelanguage.googleapis.com/v1beta' ? { provider: id } : null;
    if (id === 'ollama') return b && b === trim(val('ollama_url')) ? { provider: id } : null;
    var pr = HR.presets.get(id);
    if (!pr) return null; // Browser and image generation stay untouched.
    var hb = id === 'openai' ? trim(val('openai_base')) || pr.base : pr.base;
    return id !== 'custom' && k && k === val(pr.hub) && b === trim(hb) ? { provider: id }
      : { provider: 'custom', endpoint: c.base, key: k };
  }
  function wrap(a) {
    if (a.id === 'browser') return a;
    var legacyModels = a.models, legacyChat = a.chat;
    a.models = function (c) {
      var h = api('models'), cfg = config(a.id, c);
      if (!h || !cfg) return legacyModels(c);
      return Promise.resolve().then(function () { return h.models(cfg); }).then(function (list) {
        // H134c omits Ollama size/parameter labels. Keep those free metadata
        // reads (and /api/show context lookup), but use HubAPI's model names.
        if (a.id !== 'ollama') return list;
        return legacyModels(c).then(function (old) { return list.map(function (m) {
          var found = old.find(function (x) { return x.name === m.name; });
          return Object.assign({}, m, found || {});
        }); }, function () { return list; });
      }).catch(function (e) { throw HR.net.wrap(e); });
    };
    a.chat = function (o) {
      var h = api('chatAdvanced'), cfg = config(a.id, o.cfg);
      if (!h || !cfg) return legacyChat(o);
      return Promise.resolve().then(function () { return h.chatAdvanced(Object.assign({}, cfg, {
        model: o.model, messages: o.messages, tools: o.tools, thinking: o.think,
        signal: o.signal, onDelta: o.onDelta
      })); }).catch(function (e) { throw HR.net.wrap(e); });
    };
    return a;
  }
  function web(method) { return val('tavily') ? api(method) : null; }
  return { api: api, wrap: wrap, web: web };
})();
