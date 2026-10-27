/* Agent — app/models/gemini.js: Google Gemini adapter (HR6), generativelanguage.googleapis.com/v1beta, key in x-goog-api-key.
   POST models/<m>:streamGenerateContent?alt=sse with contents / systemInstruction / tools.functionDeclarations.
   Internal -> Gemini: user -> role 'user' text, assistant -> role 'model' text + functionCall parts (thoughtSignature kept
   and sent back, needed by Gemini 3), tool -> role 'user' functionResponse {name, response:{result}}; same-role turns merged.
   Thinking: On -> includeThoughts (thought parts go to the Thinking box), Off -> thinkingBudget 0, Auto -> model default. */
(function () {
  var N = HR.net;
  function hdr(c) { return { 'Content-Type': 'application/json', 'x-goog-api-key': c.key || '' }; }
  function toG(list) {
    var contents = [], sys = [];
    function push(role, parts) { if (!parts.length) return; var l = contents[contents.length - 1]; if (l && l.role === role) l.parts = l.parts.concat(parts); else contents.push({ role: role, parts: parts }); }
    list.forEach(function (m) {
      if (m.role === 'system') sys.push(m.content);
      else if (m.role === 'user') push('user', [{ text: m.content || ' ' }]);
      else if (m.role === 'assistant') push('model', (m.content ? [{ text: m.content }] : []).concat((m.tool_calls || []).map(function (c) {
        var f = c.function || {}, p = { functionCall: { name: f.name, args: typeof f.arguments === 'string' ? JSON.parse(f.arguments || '{}') : (f.arguments || {}) } };
        if (c.thoughtSignature) p.thoughtSignature = c.thoughtSignature; return p; })));
      else if (m.role === 'tool') { var fr = { name: m.tool_name, response: { result: m.content || '' } }; if (m.tool_call_id) fr.id = m.tool_call_id; push('user', [{ functionResponse: fr }]); }
    });
    return { contents: contents, sys: sys.join('\n\n') };
  }
  function decl(t) {
    var f = t.function, p = f.parameters, d = { name: f.name, description: f.description };
    if (p && p.properties && Object.keys(p.properties).length) d.parameters = p;
    return d;
  }
  function models(c) {
    return fetch(N.trim(c.base) + '/models?pageSize=200', { headers: hdr(c) }).then(function (r) { return r.ok ? r.json() : N.httpErr(r); })
      .then(function (j) { return (j.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
        .map(function (m) { var n = m.name.replace(/^models\//, ''); return { name: n, label: n + (m.displayName ? ' · ' + m.displayName : ''), ctx: m.inputTokenLimit || 0 }; }); })
      .catch(function (e) { throw N.wrap(e); });
  }
  function chat(o) {
    var g = toG(o.messages), body = { contents: g.contents };
    if (g.sys) body.systemInstruction = { parts: [{ text: g.sys }] };
    if (o.tools && o.tools.length) body.tools = [{ functionDeclarations: o.tools.map(decl) }];
    if (o.think === true) body.generationConfig = { thinkingConfig: { includeThoughts: true } };
    else if (o.think === false) body.generationConfig = { thinkingConfig: { thinkingBudget: 0 } };
    var calls = [], out = { done_reason: '' }, t1 = 0, t2 = 0;
    var url = N.trim(o.cfg.base) + '/models/' + encodeURIComponent(o.model) + ':streamGenerateContent?alt=sse';
    return fetch(url, { method: 'POST', headers: hdr(o.cfg), body: JSON.stringify(body), signal: o.signal })
      .then(function (r) {
        if (!r.ok) return N.httpErr(r);
        return N.sse(r, function (j) {
          if (j.promptFeedback && j.promptFeedback.blockReason) throw N.fail('http', 'Blocked by Gemini: ' + j.promptFeedback.blockReason);
          var u = j.usageMetadata; if (u) { out.eval_count = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); out.prompt_eval_count = u.promptTokenCount; }
          var c = (j.candidates || [])[0]; if (!c) return;
          ((c.content || {}).parts || []).forEach(function (p) {
            if (!t1) t1 = performance.now(); t2 = performance.now();
            if (p.functionCall) { var tc = { function: { name: p.functionCall.name, arguments: p.functionCall.args || {} } }; if (p.functionCall.id) tc.id = p.functionCall.id;
              if (p.thoughtSignature) tc.thoughtSignature = p.thoughtSignature; calls.push(tc); }
            else if (p.text) o.onDelta(p.thought ? '' : p.text, p.thought ? p.text : '');
          });
          if (c.finishReason) out.done_reason = c.finishReason.toLowerCase();
        });
      })
      .then(function () { if (out.eval_count && t2 > t1) out.eval_duration = (t2 - t1) * 1e6; out.tool_calls = calls; return out; })
      .catch(function (e) { throw N.wrap(e); });
  }
  HR.models.register({ id: 'gemini', label: 'Gemini', needsKey: true, models: models, chat: chat, toG: toG });
})();
