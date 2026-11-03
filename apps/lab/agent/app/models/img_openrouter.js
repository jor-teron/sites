/* Agent — app/models/img_openrouter.js: AG16 OpenRouter image provider (OpenRouter key, Hub first via HR.models.getKey).
   HR.imgProviders.openrouter (same shape as img_pollinations.js). models(): public /api/v1/models filtered to
   architecture.output_modalities incl. 'image', minus openrouter/auto*; label carries a price hint (all paid).
   generate(): POST /chat/completions {model, messages, modalities:['image','text']}, reads
   choices[0].message.images[0].image_url.url (data URL). AG17: image_config.aspect_ratio sent; price = API completion price. Errors: 'nocredit' (402), 'nokey' (401/403), 'noimage', 'http'. */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.openrouter = (function () {
  var API = 'https://openrouter.ai/api/v1';
  function key() { return HR.models ? HR.models.getKey('openrouter', HR.models.base('openrouter')) : ''; }
  function err(kind, msg, st) { var e = new Error(msg); e.kind = kind; e.status = st; return e; }
  function price(m) {
    var p = m.pricing || {}, out = parseFloat(p.completion);   /* pricing.image is per input image, so not shown */
    if (out > 0) return '$' + (+(out * 1e6).toPrecision(3)) + '/M out';
    return 'paid';
  }
  function models() {
    return fetch(API + '/models').then(function (r) { if (!r.ok) throw err('http', 'OpenRouter model list HTTP ' + r.status); return r.json(); })
      .catch(function (e) { if (e.kind) throw e; throw err('unreachable', 'Could not reach OpenRouter. Check the internet connection.'); })
      .then(function (j) {
        var l = (j.data || []).filter(function (m) { var o = m.architecture && m.architecture.output_modalities || []; return o.indexOf('image') >= 0 && !/^openrouter\/auto/.test(m.id); });
        if (!l.length) throw err('nomodel', 'OpenRouter lists no image models right now.');
        return l.sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (m) { return { name: m.id, label: m.name || m.id, price: price(m) }; });
      });
  }
  function generate(o) {
    if (!key()) return Promise.reject(err('nokey', 'No OpenRouter key yet.'));
    return fetch(API + '/chat/completions', { method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key() },
      body: JSON.stringify({ model: o.model, messages: [{ role: 'user', content: o.prompt }], modalities: ['image', 'text'], image_config: { aspect_ratio: o.ratio || '1:1' } }) })
      .catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw err('unreachable', 'Could not reach OpenRouter. Check the internet connection.'); })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {}
        var m = String((j && j.error && j.error.message) || t || r.statusText).slice(0, 300);
        if (r.status === 402) throw err('nocredit', 'OpenRouter says the account needs credit. ' + m, 402);
        if (r.status === 401 || r.status === 403) throw err('nokey', 'OpenRouter did not accept the key.', r.status);
        if (!r.ok) throw err('http', 'OpenRouter HTTP ' + r.status + ': ' + m, r.status);
        var msg = j && j.choices && j.choices[0] && j.choices[0].message, im = msg && msg.images && msg.images[0], u = im && im.image_url && im.image_url.url;
        if (!u) throw err('noimage', 'The model replied with text only, no picture. Try another model.');
        return fetch(u).then(function (x) { return x.blob(); }).then(function (b) { return { blob: b }; }); }); });
  }
  return { id: 'openrouter', label: 'OpenRouter', note: 'Your OpenRouter key · paid image models', steps: false, size: 'ratio', ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], cooldown: 0,
    ready: function () { return !!key(); }, models: models, generate: generate };
})();
