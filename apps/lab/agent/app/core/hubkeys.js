/* AG24: only Gemini, Tavily and Ollama use direct named keys. Company tabs
   discover visible HubProviders metadata; credentials stay inside HubAPI.
   AG37: every lookup goes to Agent's OWN namespace (HR.apiHost.window: app/api/hub/ copies of the Hub code, store
   'agent.api:sites-hub.credentials'), never window.top. Legacy: top(name) read window.top[name] || window[name].
   load() also moves Agent's own old keys (localStorage 'agent.keys', settings tavilyKey, baseUrl) into that store once
   (app/api/legacy.js). Hub keys are never read. inHub() now means "Agent's API runtime is loaded" (always, in the app). */
HR.hubKeys = (function () {
  var NAMES = ['tavily', 'gemini', 'ollama_url'];
  var cache = {}, subs = [], hooked = null, servicesHooked = null;
  function top(name) { var w = HR.apiHost && HR.apiHost.window; return (w && w[name]) || null; }   /* AG37: own namespace only */
  function hub() { var h = top('HubKeys'); return h && typeof h.get === 'function' ? h : null; }
  function providers() { var h = top('HubProviders'); return h && typeof h.list === 'function' && typeof h.info === 'function' ? h : null; }
  function norm(s) { return String(s || '').trim().replace(/\/+$/, ''); }
  function service(p, base) {
    var h = providers(), pr = HR.presets && HR.presets.get(p);
    if (!h || !pr) return null;
    var label = String(pr.label || '').trim().toLowerCase(), endpoint = norm(base || pr.base);
    if (!endpoint) return null;
    try {
      var matches = h.list().filter(function (s) {
        if (!/^svc_/.test(s.id) || s.type !== 'openai') return false;
        var info = h.info(s.id);
        return info && norm(info.endpoint) === endpoint &&
          (p === 'custom' || String(s.label || '').trim().toLowerCase() === label);
      });
      // Ambiguous duplicates must not silently select someone else's account.
      return matches.length === 1 ? h.info(matches[0].id) : null;
    } catch (e) { return null; }
  }
  function emit(n) { subs.forEach(function (f) { try { f(n); } catch (e) {} }); }
  async function read(n) {
    var h = hub(); if (!h) return;
    try { var v = await h.get(n); if (v) cache[n] = String(v).trim(); else delete cache[n]; } catch (e) { delete cache[n]; }
  }
  async function load() {
    if (HR.apiLegacy) { try { HR.apiLegacy.run(); } catch (e) {} }   /* AG37: Agent's own old keys, once */
    var h = hub(), s = providers();
    if (h) {
      await Promise.all(NAMES.map(read));
      if (hooked !== h && typeof h.onChange === 'function') {
        hooked = h; h.onChange(function (e) {
          var n = e && e.name;
          if (n && NAMES.indexOf(n) < 0) return;
          (n ? read(n) : Promise.all(NAMES.map(read))).then(function () { emit(n || ''); });
        });
      }
    }
    if (s && servicesHooked !== s && typeof s.onChange === 'function') {
      servicesHooked = s; s.onChange(function () { emit(''); });
    }
    return !!(h || s);
  }
  function val(n) { return NAMES.indexOf(n) >= 0 ? cache[n] || '' : ''; }
  function has(n) { var h = providers(); return /^svc_/.test(n) ? !!(h && h.has(n)) : !!val(n); }
  function open(n) {
    var h = hub(), s = providers();
    try {
      if (NAMES.indexOf(n) >= 0) { if (h && h.open) h.open(n); }
      else if (s && s.open) s.open(/^svc_/.test(n) && s.has(n) ? n : '');
      else if (h && h.open) h.open('');
    } catch (e) {}
  }
  return { load: load, inHub: function () { return !!(hub() || providers()); }, val: val, has: has, open: open,
    service: service, onChange: function (f) { subs.push(f); }, NAMES: NAMES };
})();
