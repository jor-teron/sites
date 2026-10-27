/* Agent — app/core/hubkeys.js: keys from the Hub (AG9, Hub H28 / H28.1, hub/keys.readme.md). HR.hubKeys.
   Inside the Hub, window.top.HubKeys (same-origin; try/catch so a cross-origin or standalone page just gets null) holds
   the user's keys. load() reads the known names into memory (never into localStorage); val(name) is that copy, '' when
   unset. Hub values win; Agent's own fields are the fallback (standalone, or the Hub has none). onChange from the Hub
   re-reads the key, then calls our listeners (Settings rows repaint, models reload, web tools follow at once).
   forProvider(p, base) -> the Hub key name for a provider + base URL: gemini -> gemini; OpenAI-compatible base host
   api.groq.com -> groq, openrouter.ai -> openrouter, api.deepseek.com -> deepseek, api.x.ai -> xai, the Hub's
   openai_base host (or api.openai.com when the Hub has no base) -> openai_key. named(base): base is one of those 4 presets
   (then Agent keeps that base even when the Hub has an openai_base; HR.models.base). */
HR.hubKeys = (function () {
  var NAMES = ['tavily', 'gemini', 'openai_base', 'openai_key', 'ollama_url', 'groq', 'openrouter', 'deepseek', 'xai'];
  var HOSTS = { 'api.groq.com': 'groq', 'openrouter.ai': 'openrouter', 'api.deepseek.com': 'deepseek', 'api.x.ai': 'xai' };
  var cache = {}, subs = [], api = null, hooked = false;
  function hub() { if (api) return api; try { var h = window.top && window.top !== window ? window.top.HubKeys : null; api = h && typeof h.get === 'function' ? h : null; } catch (e) { api = null; } return api; }
  function host(u) { try { return new URL(u).host; } catch (e) { return ''; } }
  async function read(n) { var h = hub(); if (!h) return; try { var v = await h.get(n); if (v) cache[n] = String(v).trim(); else delete cache[n]; } catch (e) { delete cache[n]; } }
  async function load() {
    var h = hub(); if (!h) return false;
    await Promise.all(NAMES.map(read));
    if (!hooked && typeof h.onChange === 'function') { hooked = true;
      try { h.onChange(function (e) { var n = e && e.name; (n && NAMES.indexOf(n) >= 0 ? read(n) : !n ? Promise.all(NAMES.map(read)) : Promise.resolve()).then(function () {
        subs.forEach(function (f) { try { f(n || ''); } catch (x) {} }); }); }); } catch (e) {}
    }
    return true;
  }
  function val(n) { return cache[n] || ''; }
  function forProvider(p, base) {
    if (p === 'gemini') return 'gemini';
    var hs = host(base); if (HOSTS[hs]) return HOSTS[hs];
    var hb = val('openai_base'); return (hb ? host(hb) === hs : hs === 'api.openai.com') ? 'openai_key' : '';
  }
  function named(base) { return !!HOSTS[host(base)]; }
  function open(n) { var h = hub(); try { if (h && h.open) h.open(n); } catch (e) {} }
  return { load: load, inHub: function () { return !!hub(); }, val: val, has: function (n) { return !!val(n); }, forProvider: forProvider, named: named, open: open,
    onChange: function (f) { subs.push(f); }, NAMES: NAMES };
})();
