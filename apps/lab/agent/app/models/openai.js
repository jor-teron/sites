/* Agent — app/models/openai.js: OpenAI-compatible adapter (HR6) — OpenAI, Groq, OpenRouter, Together, LM Studio, vLLM…
   POST <base>/chat/completions with stream:true (SSE) and `tools`; GET <base>/models for the list. Bearer API key.
   Internal -> OpenAI: assistant tool_calls get ids (kept from the provider or "call_N"), arguments become JSON strings,
   tool results become {role:'tool', tool_call_id}. Streamed delta.tool_calls are joined by index; reasoning_content /
   reasoning deltas go to the Thinking box. usage (stream_options.include_usage, or Groq x_groq.usage) -> token stats. */
(function () {
  var N = HR.net;
  function hdr(c) { var h = { 'Content-Type': 'application/json' }; if (c.key) h.Authorization = 'Bearer ' + c.key; return h; }
  function toOA(list) {
    var q = [], n = 0;
    return list.map(function (m) {
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
        return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map(function (c) {
          var f = c.function || {}, id = c.id || 'call_' + (n++); q.push(id);
          return { id: id, type: 'function', function: { name: f.name, arguments: typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments || {}) } };
        }) };
      }
      if (m.role === 'tool') { var qid = q.shift(); return { role: 'tool', tool_call_id: m.tool_call_id || qid || 'call_0', content: m.content || '' }; }
      return { role: m.role, content: m.content || '' };
    });
  }
  function parse(a) { if (!a) return {}; try { return JSON.parse(a); } catch (e) { return { _raw: a }; } }
  function models(c) {
    return fetch(N.trim(c.base) + '/models', { headers: hdr(c) }).then(function (r) { return r.ok ? r.json() : N.httpErr(r); })
      .then(function (j) { return (j.data || j.models || []).map(function (m) { return { name: m.id || m.name, label: m.id || m.name }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); }); })
      .catch(function (e) { throw N.wrap(e); });
  }
  function chat(o) {
    var body = { model: o.model, messages: toOA(o.messages), stream: true, stream_options: { include_usage: true } };
    if (o.tools && o.tools.length) body.tools = o.tools;
    var acc = [], out = { done_reason: '' }, t1 = 0, t2 = 0;
    return fetch(N.trim(o.cfg.base) + '/chat/completions', { method: 'POST', headers: hdr(o.cfg), body: JSON.stringify(body), signal: o.signal })
      .then(function (r) {
        if (!r.ok) return N.httpErr(r);
        return N.sse(r, function (j) {
          var u = j.usage || (j.x_groq && j.x_groq.usage);
          if (u) { out.eval_count = u.completion_tokens; out.prompt_eval_count = u.prompt_tokens; }
          var ch = (j.choices || [])[0]; if (!ch) return;
          var d = ch.delta || ch.message || {}, th = d.reasoning_content || d.reasoning || '';
          if (d.content || th) { if (!t1) t1 = performance.now(); t2 = performance.now(); o.onDelta(d.content || '', typeof th === 'string' ? th : ''); }
          (d.tool_calls || []).forEach(function (tc, i) {
            var k = tc.index != null ? tc.index : i, a = acc[k] || (acc[k] = { id: '', name: '', args: '' }), f = tc.function || {};
            if (tc.id) a.id = tc.id; if (f.name && !a.name) a.name = f.name;
            if (f.arguments) a.args += typeof f.arguments === 'string' ? f.arguments : JSON.stringify(f.arguments);
            if (!t1) t1 = performance.now(); t2 = performance.now();
          });
          if (ch.finish_reason) out.done_reason = ch.finish_reason;
        });
      })
      .then(function () {
        if (out.eval_count && t2 > t1) out.eval_duration = (t2 - t1) * 1e6;
        out.tool_calls = acc.filter(Boolean).map(function (a) { return { id: a.id || undefined, function: { name: a.name, arguments: parse(a.args) } }; });
        return out;
      })
      .catch(function (e) { throw N.wrap(e); });
  }
  HR.models.register({ id: 'openai', label: 'OpenAI-compatible', needsKey: true, models: models, chat: chat, toOA: toOA });
})();
