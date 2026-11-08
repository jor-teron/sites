/* Agent — app/core/assist.js: the optional Assist model (AG31). HR.assist. Not the bash Helper (core/helper.js).
   A second provider + model, picked in Settings from the providers this Agent already has set up, for short side jobs
   (summaries, simple yes/no or label picks). AG31 only adds the choice and this API; nothing calls it yet (AG32 rolling
   summaries will). Settings in agent.settings: assistProvider ('' = Off, default) and assistModel ('' = not chosen).
   ask(o) {prompt | messages, system?, json?, maxChars? (default 4000), signal?} -> {text, data?, provider, model, usage}.
   One model call, no tools, never touches the main chat's provider/model (HR.models.setChat / Settings 'provider' / 'model').
   Off, no model, an unset provider or a failed call reject with an Error (kind 'off' | 'nomodel' | 'notready' | provider kind);
   there is no fallback to the main model and no retry (a retry could double a paid call). Stop = o.signal (kind 'abort').
   Usage goes to HR.usage.record like normal chat (estimated when the provider gives no counts). */
HR.assist = (function () {
  function err(kind, msg) { var e = new Error(msg); e.kind = kind; return e; }
  function adapter(p) { return HR.models.all().filter(function (a) { return a.id === p; })[0] || null; }
  /* Providers that can be picked: registered, set up (key, Hub service or URL), and not the in-browser story model */
  function choices() { return HR.models.all().filter(function (a) { return a.id !== 'browser' && HR.models.ready(a.id); }); }
  function pick() { return { provider: HR.set.get('assistProvider') || '', model: (HR.set.get('assistModel') || '').trim() }; }
  function on() { var s = pick(); return !!(s.provider && s.model); }
  function cfgFor(p) {
    var b = HR.models.base(p), online = p !== 'ollama';
    return { provider: p, service: (HR.models.service(p, b) || {}).id || '', base: b, key: online ? HR.models.getKey(p, b) : '', typed: '' };
  }
  function models(p, signal) { var a = adapter(p); if (!a) return Promise.reject(err('notready', 'Unknown provider ' + p)); return Promise.resolve(a.models(cfgFor(p), signal)); }
  async function ask(o) {
    o = o || {}; var s = pick();
    if (!s.provider) throw err('off', 'Assist model is Off. Pick one in Settings › Model.');
    if (!s.model) throw err('nomodel', 'Assist model has no model chosen. Pick one in Settings › Model.');
    var a = adapter(s.provider);
    if (!a || s.provider === 'browser' || !HR.models.ready(s.provider)) throw err('notready', 'Assist provider ' + s.provider + ' is not set up.');
    if (o.signal && o.signal.aborted) throw err('abort', 'Stopped');
    var sys = String(o.system || '').trim();
    if (o.json) sys = (sys ? sys + '\n\n' : '') + 'Reply with JSON only, no other text.';
    var msgs = o.messages ? o.messages.slice() : [{ role: 'user', content: String(o.prompt || '') }];
    if (sys) msgs.unshift({ role: 'system', content: sys });
    var out = '', res;
    try {
      res = await a.chat({ cfg: cfgFor(s.provider), model: s.model, messages: msgs, think: 'off', tools: [], signal: o.signal,
        onDelta: function (c) { out += c || ''; } });
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.kind === 'abort')) throw err('abort', 'Stopped');
      throw e;
    }
    res = res || {};
    var text = String(res.content != null && !out ? res.content : out).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    var cap = o.maxChars > 0 ? o.maxChars : 4000; if (text.length > cap) text = text.slice(0, cap);
    var usage = { p: res.prompt_eval_count || 0, o: res.eval_count || 0 };
    var cm = HR.cacheMeta ? HR.cacheMeta.read(res) : null; if (cm) usage.c = cm.cached;   /* AG35 */
    try { HR.usage.record(s.provider, s.model, usage.p || Math.ceil(JSON.stringify(msgs).length / 4), usage.o || Math.ceil(text.length / 4), !usage.p || !usage.o, cm); } catch (e) { /* best-effort, like chat */ }
    var r = { text: text, provider: s.provider, model: s.model, usage: usage };
    if (o.json) { var m = text.match(/[\[{][\s\S]*[\]}]/); try { r.data = JSON.parse(m ? m[0] : text); } catch (e) { r.data = null; } }
    return r;
  }
  /* Simple classification: pick one of labels; returns the label or '' when the reply matches none */
  async function classify(text, labels, o) {
    var r = await ask(Object.assign({}, o, { system: 'Classify the text into exactly one of these labels: ' + labels.join(', ') + '. Reply with the label only.', prompt: String(text) , maxChars: 200 }));
    var t = r.text.toLowerCase(); r.label = labels.filter(function (l) { return t.indexOf(String(l).toLowerCase()) >= 0; })[0] || '';
    return r;
  }
  return { choices: choices, pick: pick, on: on, models: models, ask: ask, classify: classify, cfgFor: cfgFor };
})();
