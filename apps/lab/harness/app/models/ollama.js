/* Harness — app/models/ollama.js: Ollama HTTP API from the browser.
   tags(base) -> [{name,size,details}] from GET <base>/api/tags.
   chat({base,model,messages,think,tools,signal,onDelta(content,thinking)}) streams POST <base>/api/chat (NDJSON, one JSON per line)
   and resolves with the final chunk's stats {eval_count, eval_duration, prompt_eval_count, total_duration, done_reason}
   plus tool_calls [{function:{name, arguments}}] collected from any chunk (HR2: Ollama native tool calling, `tools` param).
   Errors carry .kind: 'unreachable' (network/CORS), 'http' (status + Ollama's error text), 'abort' (Stop). */
HR.ollama = (function () {
  function trim(b) { return String(b || '').replace(/\/+$/, ''); }
  function fail(kind, msg, status) { var e = new Error(msg); e.kind = kind; e.status = status; return e; }
  function wrap(err) { if (err && err.kind) return err; if (err && err.name === 'AbortError') return fail('abort', 'Stopped'); return fail('unreachable', (err && err.message) || 'Network error'); }
  function httpErr(r) { return r.text().then(function (t) { var m = t; try { m = JSON.parse(t).error || t; } catch (e) { /* plain text */ } throw fail('http', m || ('HTTP ' + r.status), r.status); }); }
  function tags(base) {
    return fetch(trim(base) + '/api/tags').then(function (r) { if (!r.ok) return httpErr(r); return r.json(); })
      .then(function (j) { return (j.models || []).map(function (m) { return { name: m.name || m.model, size: m.size, details: m.details || {} }; }); })
      .catch(function (e) { throw wrap(e); });
  }
  function chat(o) {
    var body = { model: o.model, messages: o.messages, stream: true };
    if (o.think === true || o.think === false) body.think = o.think;
    if (o.tools && o.tools.length) body.tools = o.tools;
    return fetch(trim(o.base) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: o.signal })
      .then(function (r) {
        if (!r.ok) return httpErr(r);
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', last = null, calls = [];
        function line(l) {
          if (!l.trim()) return;
          var j = JSON.parse(l);
          if (j.error) throw fail('http', j.error);
          var m = j.message || {};
          if (m.content || m.thinking) o.onDelta(m.content || '', m.thinking || '');
          if (m.tool_calls) calls = calls.concat(m.tool_calls);
          if (j.done) last = j;
        }
        function pump() {
          return rd.read().then(function (x) {
            if (x.done) { line(buf); return Object.assign({}, last || {}, { tool_calls: calls }); }
            buf += dec.decode(x.value, { stream: true });
            var parts = buf.split('\n'); buf = parts.pop(); parts.forEach(line);
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) { throw wrap(e); });
  }
  /* tokens per second from Ollama's final stats (eval_duration is in ns) */
  function tps(s) { return s && s.eval_count && s.eval_duration ? s.eval_count / (s.eval_duration / 1e9) : 0; }
  return { tags: tags, chat: chat, tps: tps };
})();
/* HR6: Ollama as a provider adapter (default) */
HR.models.register({ id: 'ollama', label: 'Ollama', needsKey: false,
  models: function (c) { return HR.ollama.tags(c.base).then(function (l) { return l.map(function (m) {
    var gb = m.size ? ' · ' + (m.size / 1073741824).toFixed(m.size < 1073741824 * 10 ? 1 : 0) + ' GB' : '';
    return { name: m.name, label: m.name + (m.details.parameter_size ? ' · ' + m.details.parameter_size : '') + gb }; }); }); },
  chat: function (o) { return HR.ollama.chat({ base: o.cfg.base, model: o.model, messages: o.messages, think: o.think, tools: o.tools, signal: o.signal, onDelta: o.onDelta }); } });
