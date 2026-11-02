/* Agent — app/models/imagegen.js: AG11 text → image with Ollama, adapted from the Lab Image Gen app (imagegen_ollama.js).
   HR.imagegen.models(base) -> [{name, image:true|false|null}] image models first (capabilities from /api/tags or /api/show,
   else guessed from the name). generate({base, model, prompt, width, height, steps, signal, onProgress}) streams
   POST /api/generate (NDJSON) and resolves {b64, info}. Errors carry .kind: 'unreachable', 'disabled' (image gen off in
   this Ollama), 'nomodel', 'noimage', 'http', 'abort'. pick(list) prefers z-image like Image Gen. */
HR.imagegen = (function () {
  var base = function (u) { return String(u || '').trim().replace(/\/+$/, '') || 'http://localhost:11434'; };
  function err(kind, msg, status) { var e = new Error(msg); e.kind = kind; e.status = status; return e; }
  function call(url, opt) {
    return fetch(url, opt).catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw err('unreachable', 'Could not reach Ollama at ' + url); })
      .then(function (r) {
        if (r.ok) return r;
        return r.text().catch(function () { return ''; }).then(function (t) {
          var msg = t; try { msg = JSON.parse(t).error || t; } catch (e) { /* plain */ }
          msg = String(msg || r.statusText || 'HTTP ' + r.status);
          if (/not (currently )?supported/i.test(msg) && /image/i.test(msg)) throw err('disabled', msg, r.status);
          if (r.status === 404 && /model/i.test(msg)) throw err('nomodel', msg, r.status);
          throw err('http', 'HTTP ' + r.status + ': ' + msg, r.status);
        });
      });
  }
  function looksImage(n) { return /^x\/|z-image|flux|stable-?diffusion|sdxl|image/i.test(n); }
  function models(u) {
    return call(base(u) + '/api/tags', {}).then(function (r) { return r.json(); }).then(function (j) {
      var list = (j.models || []).map(function (m) { return { name: m.name || m.model, caps: m.capabilities || null }; });
      var ask = list.length <= 30 ? list.filter(function (m) { return !m.caps; }) : [];
      return Promise.all(ask.map(function (m) {
        return fetch(base(u) + '/api/show', { method: 'POST', body: JSON.stringify({ model: m.name }) }).then(function (s) { return s.ok ? s.json() : {}; })
          .then(function (s) { m.caps = s.capabilities || null; }, function () {});
      })).then(function () {
        list.forEach(function (m) { m.image = m.caps ? m.caps.indexOf('image') >= 0 : (looksImage(m.name) ? null : false); });
        var rank = function (m) { return m.image === true ? 0 : m.image === null ? 1 : 2; };
        return list.sort(function (a, b) { return rank(a) - rank(b) || a.name.localeCompare(b.name); });
      });
    });
  }
  function pick(list) { var img = list.filter(function (m) { return m.image === true; }); var p = img.find(function (m) { return /z-image/i.test(m.name); }) || img[0] || list.find(function (m) { return m.image === null; }); return p ? p.name : ''; }
  function generate(o) {
    var req = { model: o.model, prompt: o.prompt, width: o.width || 1024, height: o.height || 1024, steps: o.steps || 8, stream: true };
    return call(base(o.base) + '/api/generate', { method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
      .then(function (r) {
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', img = null, last = null;
        function line(s) {
          s = s.trim(); if (!s) return; var j; try { j = JSON.parse(s); } catch (e) { return; }
          last = j;
          if (j.error) { var m = String(j.error); throw err(/not (currently )?supported/i.test(m) && /image/i.test(m) ? 'disabled' : 'http', m); }
          if (j.total && o.onProgress) o.onProgress(j.completed || 0, j.total);
          var b = j.image || (j.images && j.images[0]); if (b) img = b;
        }
        function pump() {
          return rd.read().then(function (x) {
            if (x.done) {
              line(buf + dec.decode());
              if (!img) throw err('noimage', last && last.response ? 'The model replied with text, not an image. Pick an image model.' : 'Ollama finished without returning an image.');
              return { b64: String(img).replace(/^data:image\/\w+;base64,/, ''), info: last };
            }
            buf += dec.decode(x.value, { stream: true }); var i;
            while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
            return pump();
          });
        }
        return pump();
      }).catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw e; });
  }
  return { models: models, pick: pick, generate: generate };
})();
