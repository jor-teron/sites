/* Harness — app/models/registry.js: provider adapters behind one interface (HR6). The loop only calls adapter.chat().
   Adapter: {id, label, needsKey, models(cfg) -> [{name,label}], chat({cfg, model, messages, think, tools, signal, onDelta(c,th)})
   -> {tool_calls:[{id?, function:{name, arguments(object)}}], eval_count, prompt_eval_count, eval_duration (ns), done_reason}}.
   Messages in and out use the internal (Ollama-style) format; adapters translate. Settings: provider 'ollama' (default) |
   'openai' | 'gemini', openaiBase, model per provider. API keys: localStorage 'harness.keys' {host|'gemini': key} — this device only. */
HR.models = (function () {
  var reg = {}, KEYS = 'harness.keys';
  var OPENAI = 'https://api.openai.com/v1', GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  function register(a) { reg[a.id] = a; }
  function id() { var p = HR.set.get('provider'); return reg[p] ? p : 'ollama'; }
  function current() { return reg[id()]; }
  function keys() { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (e) { return {}; } }
  function keySlot(p, base) { if (p === 'gemini') return 'gemini'; try { return new URL(base).host; } catch (e) { return base; } }
  function getKey(p, base) { return keys()[keySlot(p, base)] || ''; }
  function setKey(p, base, v) { var k = keys(), s = keySlot(p, base); if (v) k[s] = v; else delete k[s]; try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch (e) {} }
  function base(p) { p = p || id(); return p === 'ollama' ? HR.set.get('baseUrl') : p === 'gemini' ? GEMINI : (HR.set.get('openaiBase') || OPENAI); }
  function cfg() { var p = id(), b = base(p); return { provider: p, base: b, key: p === 'ollama' ? '' : getKey(p, b), typed: p === 'ollama' ? '' : (HR.set.get(p + 'Model') || '').trim() }; }
  function modelKey() { var p = id(); return p === 'ollama' ? 'model' : 'model_' + p; }
  return { register: register, current: current, id: id, cfg: cfg, base: base, getKey: getKey, setKey: setKey, keySlot: keySlot, modelKey: modelKey,
    all: function () { return Object.keys(reg).map(function (k) { return reg[k]; }); } };
})();
