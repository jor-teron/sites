/* Agent — app/models/registry.js: provider adapters behind one interface (HR6). The loop only calls adapter.chat().
   Adapter: {id, label, needsKey, models(cfg) -> [{name,label}], chat({cfg, model, messages, think, tools, signal, onDelta(c,th)})
   -> {tool_calls:[{id?, function:{name, arguments(object)}}], eval_count, prompt_eval_count, eval_duration (ns), done_reason}}.
   Messages in and out use the internal (Ollama-style) format; adapters translate. Settings: provider 'ollama' (default) |
   'openai' | 'gemini' | 'browser' (AG2), openaiBase, model per provider. fallback(on): use 'browser' for this page session
   while the chosen provider can't be used (unreachable / no key); id() is the provider in use, chosen() the saved one.
   AG5: setChat(p, m) — the open chat's own provider + model (HR.chats); chosen() is the chat's provider when set, else the
   Settings default; chatModel() the chat's model for that provider ('' = default). Settings provider = default for new chats. API keys: localStorage 'agent.keys' {host|'gemini': key} — this device only.
   AG24: Gemini/Ollama use direct Hub settings; company tabs match visible svc_
   metadata. Custom uses only customBase. Secrets never leave HubAPI; image
   adapters get only Agent-local keys until HubAPI offers image generation. */
HR.models = (function () {
  var reg = {}, KEYS = 'agent.keys', over = '', chat = { p: '', m: '' };
  var OPENAI = 'https://api.openai.com/v1', GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
  /* AG23; legacy: reg[a.id] = a; standalone adapters remain the fallback. */
  function register(a) { reg[a.id] = HR.hubAPI ? HR.hubAPI.wrap(a) : a; }
  function def() { var p = HR.set.get('provider'); return reg[p] ? p : 'ollama'; }
  function chosen() { return chat.p && reg[chat.p] ? chat.p : def(); }
  function setChat(p, m) { chat = { p: p || '', m: m || '' }; }
  function chatModel() { return chat.p && chat.p === id() ? chat.m : ''; }
  function id() { return over && reg[over] ? over : chosen(); }
  function fallback(on) { over = on && reg.browser && chosen() !== 'browser' ? 'browser' : ''; return !!over; }
  function current() { return reg[id()]; }
  function keys() { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (e) { return {}; } }
  function keySlot(p, base) { if (p === 'gemini') return 'gemini'; try { return new URL(base).host; } catch (e) { return base; } }
  function service(p, base) { return HR.hubKeys && HR.hubKeys.service ? HR.hubKeys.service(p, base) : null; }
  function hubName(p, base) { var s = service(p, base); return p === 'gemini' ? 'gemini' : s ? s.id : ''; }
  function hubKey(p) { return p === 'gemini' && HR.hubKeys ? HR.hubKeys.val('gemini') : ''; }
  function getKey(p, base) { return hubKey(p, base) || keys()[keySlot(p, base)] || ''; }
  function localKey(p, base) { return keys()[keySlot(p, base)] || ''; }
  function setKey(p, base, v) { var k = keys(), s = keySlot(p, base); if (v) k[s] = v; else delete k[s]; try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch (e) {} }
  function hv(n) { return HR.hubKeys ? HR.hubKeys.val(n).replace(/\/+$/, '') : ''; }
  function base(p) { p = p || id(); return p === 'ollama' ? hv('ollama_url') || HR.set.get('baseUrl') : p === 'browser' ? 'this browser' : p === 'gemini' ? GEMINI : oaBase(p); }
  /* AG24: no Hub fallback for Agent's Custom endpoint. */
  function oaBase(p) { var pr = HR.presets.get(p); return pr && pr.base ? pr.base : (HR.set.get('customBase') || '').replace(/\/+$/, ''); }
  function ready(p) { var a = reg[p]; if (!a) return false; if (p === 'ollama' || p === 'browser') return true; var b = base(p); return !!service(p, b) || (p === 'custom' ? !!b : !!getKey(p, b)); }
  function cfg() { var p = id(), b = base(p), online = p !== 'ollama' && p !== 'browser';
    return { provider: p, service: (service(p, b) || {}).id || '', base: b, key: online ? getKey(p, b) : '', typed: online ? (HR.set.get(p + 'Model') || '').trim() : '' }; }
  function modelKey() { var p = id(); return p === 'ollama' ? 'model' : 'model_' + p; }
  return { register: register, current: current, id: id, chosen: chosen, def: def, setChat: setChat, chatModel: chatModel, fallback: fallback, fallen: function () { return !!over; }, cfg: cfg, base: base, getKey: getKey, localKey: localKey, setKey: setKey, keySlot: keySlot, modelKey: modelKey,
    ready: ready, hubName: hubName, service: service,
    all: function () { return HR.presets.ORDER.filter(function (k) { return reg[k]; }).map(function (k) { return reg[k]; }); } };
})();
