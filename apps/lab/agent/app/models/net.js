/* Agent — app/models/net.js: shared HTTP helpers for model adapters (HR6).
   HR.net.fail(kind,msg,status), wrap(err) -> kind 'abort' | 'unreachable', httpErr(response) -> throws kind 'http' with the
   provider's error text (Ollama {error}, OpenAI {error:{message}}, Gemini {error:{message}} or [{error}]),
   sse(response, onData(json)) reads a text/event-stream ("data: {...}" lines, ignores "[DONE]"). */
HR.net = (function () {
  function fail(kind, msg, status) { var e = new Error(msg); e.kind = kind; e.status = status; return e; }
  function wrap(err) { if (err && err.kind) return err; if (err && err.name === 'AbortError') return fail('abort', 'Stopped'); return fail('unreachable', (err && err.message) || 'Network error'); }
  function msgOf(j) { if (Array.isArray(j)) j = j[0] || {}; var e = j && j.error; return typeof e === 'string' ? e : e && (e.message || e.status) || ''; }
  function httpErr(r) {
    return r.text().then(function (t) { var m = t; try { m = msgOf(JSON.parse(t)) || t; } catch (e) { /* plain text */ } throw fail('http', String(m || ('HTTP ' + r.status)).slice(0, 600), r.status); });
  }
  function sse(r, onData) {
    var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
    function line(l) {
      l = l.replace(/\r$/, ''); if (l.indexOf('data:') !== 0) return;
      var d = l.slice(5).trim(); if (!d || d === '[DONE]') return;
      var j = JSON.parse(d); if (j.error) throw fail('http', msgOf(j)); onData(j);
    }
    function pump() {
      return rd.read().then(function (x) {
        if (x.done) { line(buf); return; }
        buf += dec.decode(x.value, { stream: true });
        var parts = buf.split('\n'); buf = parts.pop(); parts.forEach(line);
        return pump();
      });
    }
    return pump();
  }
  function trim(b) { return String(b || '').replace(/\/+$/, ''); }
  return { fail: fail, wrap: wrap, httpErr: httpErr, sse: sse, trim: trim };
})();
