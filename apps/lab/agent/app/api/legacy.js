/* Agent — app/api/legacy.js: one-time move of Agent's OWN old provider settings into Agent's API store (AG37). HR.apiLegacy.
   Sources (Agent-owned only, never the Hub's): localStorage 'agent.keys' {host|'gemini': key} (AG6 Agent-local keys),
   agent.settings.tavilyKey, agent.settings.baseUrl (Ollama URL), agent.settings.customBase (endpoint of a Custom key).
   Moves: 'gemini' -> named key gemini; a preset host (Groq, OpenRouter, …) -> provider {label: preset label, type openai,
   endpoint: preset base} (or adds the key to that existing row); the Custom endpoint's host -> provider 'Custom';
   tavilyKey -> named key tavily; a saved baseUrl -> ollama_url (when none is saved; with no saved URL Agent's
   built-in Ollama adapter keeps using http://localhost:11434). Unknown hosts stay in 'agent.keys'.
   Moved values are then removed from the old places, so there is one store. Flag 'agent.api.legacyMoved' = done.
   Values are never logged or shown. */
HR.apiLegacy = (function () {
  var FLAG = 'agent.api.legacyMoved', OLD = 'agent.keys';
  function W() { return HR.apiHost.window; }
  function host(u) { try { return new URL(u).host; } catch (e) { return ''; } }
  function norm(u) { return String(u || '').trim().replace(/\/+$/, ''); }
  function findSvc(endpoint, label) {
    var P = W().HubProviders, m = P.list().map(function (s) { return P.info(s.id); }).filter(function (i) { return i && norm(i.endpoint) === norm(endpoint) && i.type === 'openai'; });
    return m.filter(function (i) { return !label || i.label.trim().toLowerCase() === label.toLowerCase(); })[0] || null;
  }
  function run() {
    var K = W().HubKeys, P = W().HubProviders; if (!K || !P) return 0;
    try { if (localStorage.getItem(FLAG)) return 0; } catch (e) { return 0; }
    var old = {}; try { old = JSON.parse(localStorage.getItem(OLD) || '{}') || {}; } catch (e) { old = {}; }
    var s = HR.set ? HR.set : null, n = 0, left = {};
    Object.keys(old).forEach(function (slot) {
      var v = String(old[slot] || '').trim(); if (!v) return;
      try {
        if (slot === 'gemini') { if (!K.has('gemini')) K.set('gemini', v); n++; return; }
        var pr = HR.presets ? HR.presets.OA.filter(function (x) { return x.base && host(x.base) === slot; })[0] : null;
        var cb = s ? norm(s.get('customBase')) : '';
        var ep = pr ? pr.base : cb && host(cb) === slot ? cb : '', label = pr ? pr.label : 'Custom';
        if (!ep) { left[slot] = old[slot]; return; }
        var ex = findSvc(ep, pr ? label : '');
        if (ex) { if (!ex.hasKey) P.update(ex.id, { key: v }); } else P.add({ label: label, type: 'openai', endpoint: ep, key: v });
        n++;
      } catch (e) { left[slot] = old[slot]; }
    });
    if (s) {
      var tk = String(s.get('tavilyKey') || '').trim();
      if (tk) { try { if (!K.has('tavily')) K.set('tavily', tk); s.put('tavilyKey', ''); n++; } catch (e) {} }
      var raw = {}; try { raw = JSON.parse(localStorage.getItem('agent.settings') || '{}') || {}; } catch (e) { raw = {}; }
      var bu = norm(raw.baseUrl);   /* only a URL the person saved; the built-in default is not copied (store stays blank) */
      if (bu && !K.has('ollama_url')) { try { K.set('ollama_url', bu); } catch (e) {} }
    }
    try {
      if (Object.keys(left).length) localStorage.setItem(OLD, JSON.stringify(left)); else localStorage.removeItem(OLD);
      localStorage.setItem(FLAG, 'ag37');
    } catch (e) {}
    return n;
  }
  return { run: run, FLAG: FLAG };
})();
