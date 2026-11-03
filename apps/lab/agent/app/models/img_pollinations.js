/* Agent — app/models/img_pollinations.js: AG15 Pollinations image provider (free, no key). HR.imgProviders.pollinations.
   Provider module shape (AG15, shared by img_deepinfra.js and img_ollama.js): {id, label, note, steps (bool), cooldown (s),
   ready() -> bool, models() -> Promise<[{name,label}]>, generate({model,prompt,width,height,steps,signal,onProgress}) -> {blob}}.
   GET https://image.pollinations.ai/prompt/<prompt>?width&height&model&seed&nologo=true returns a JPEG keyless.
   Keyless models tested AG15: 'sana' (default; also what flux/turbo silently fall back to) and 'zimage'. /models is read
   and merged with that list. AG17: price 'free'; size px (multiples of 16, max 2048); steps fixed by provider. 50 s cooldown between prompts (enforced by imagepage.js). Errors carry .kind. */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.pollinations = (function () {
  var BASE = 'https://image.pollinations.ai', KEYLESS = ['sana', 'zimage'];
  var LABEL = { sana: 'Sana (default)', zimage: 'Z-Image Turbo' };
  function err(kind, msg) { var e = new Error(msg); e.kind = kind; return e; }
  function models() {
    return fetch(BASE + '/models').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (l) {
      var names = KEYLESS.slice(); (Array.isArray(l) ? l : []).forEach(function (n) { n = typeof n === 'string' ? n : n && n.name; if (n && names.indexOf(n) < 0) names.push(n); });
      return names.map(function (n) { return { name: n, label: LABEL[n] || n, price: 'free' }; });
    });
  }
  function generate(o) {
    var q = 'width=' + (o.width || 1024) + '&height=' + (o.height || 1024) + '&model=' + encodeURIComponent(o.model || 'sana') + '&seed=' + Math.floor(Math.random() * 1e9) + '&nologo=true';
    return fetch(BASE + '/prompt/' + encodeURIComponent(o.prompt) + '?' + q, { signal: o.signal })
      .catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw err('unreachable', 'Could not reach Pollinations. Check the internet connection.'); })
      .then(function (r) {
        if (r.status === 429) throw err('busy', 'Pollinations says too many requests. Wait a minute and try again.');
        if (r.status === 403) throw err('http', 'Pollinations refused this request (HTTP 403). It blocks pages opened from localhost; the live site works.');
        if (!r.ok) throw err('http', 'Pollinations answered HTTP ' + r.status + '.');
        return r.blob();
      }).then(function (b) { if (!b || !/^image\//.test(b.type)) throw err('noimage', 'Pollinations did not send a picture back.'); return { blob: b }; })
      .catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw e; });
  }
  return { id: 'pollinations', label: 'Pollinations', note: 'Free · no key · one picture every 50 s', steps: false, size: 'px', mult: 16, max: 2048, cooldown: 50,
    ready: function () { return true; }, models: models, generate: generate };
})();
