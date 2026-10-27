/* Agent — app/models/registry.js: provider adapters behind one interface (HR6). The loop only calls adapter.chat().
   Adapter: {id, label, needsKey, models(cfg) -> [{name,label}], chat({cfg, model, messages, think, tools, signal, onDelta(c,th)})
   -> {tool_calls:[{id?, function:{name, arguments(object)}}], eval_count, prompt_eval_count, eval_duration (ns), done_reason}}.
   Messages in and out use the internal (Ollama-style) format; adapters translate. Settings: provider 'ollama' (default) |
   'openai' | 'gemini' | 'browser' (AG2), openaiBase, model per provider. fallback(on): use 'browser' for this page session
   while the chosen provider can't be used (unreachable / no key); id() is the provider in use, chosen() the saved one. API keys: localStorage 'agent.keys' {host|'gemini': key} — this device only. */
HR.models = (function () {
  var reg = {}, KEYS = 'agent.keys', over = '';
  var OPENAI = 'https://api.openai.com/v1', GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  function register(a) { reg[a.id] = a; }
  function chosen() { var p = HR.set.get('provider'); return reg[p] ? p : 'ollama'; }
  function id() { return over && reg[over] ? over : chosen(); }
  function fallback(on) { over = on && reg.browser && chosen() !== 'browser' ? 'browser' : ''; return !!over; }
  function current() { return reg[id()]; }
  function keys() { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (e) { return {}; } }
  function keySlot(p, base) { if (p === 'gemini') return 'gemini'; try { return new URL(base).host; } catch (e) { return base; } }
  function getKey(p, base) { return keys()[keySlot(p, base)] || ''; }
  function setKey(p, base, v) { var k = keys(), s = keySlot(p, base); if (v) k[s] = v; else delete k[s]; try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch (e) {} }
  function base(p) { p = p || id(); return p === 'ollama' ? HR.set.get('baseUrl') : p === 'browser' ? 'this browser' : p === 'gemini' ? GEMINI : (HR.set.get('openaiBase') || OPENAI); }
  function cfg() { var p = id(), b = base(p), online = p !== 'ollama' && p !== 'browser';
    return { provider: p, base: b, key: online ? getKey(p, b) : '', typed: online ? (HR.set.get(p + 'Model') || '').trim() : '' }; }
  function modelKey() { var p = id(); return p === 'ollama' ? 'model' : 'model_' + p; }
  return { register: register, current: current, id: id, chosen: chosen, fallback: fallback, fallen: function () { return !!over; }, cfg: cfg, base: base, getKey: getKey, setKey: setKey, keySlot: keySlot, modelKey: modelKey,
    all: function () { return Object.keys(reg).map(function (k) { return reg[k]; }); } };
})();
