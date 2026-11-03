/* Agent — app/models/img_deepinfra.js: AG15 DeepInfra image provider (your DeepInfra key: Hub slot 'deepinfra', else the
   Agent's own key via HR.models.getKey). HR.imgProviders.deepinfra (same shape as img_pollinations.js).
   models(): GET api.deepinfra.com/models/list, keep type 'text-to-image' minus edit / background / erase tools; fallback
   FLUX-1-schnell, FLUX-1-dev, sdxl-turbo. generate(): POST /v1/openai/images/generations {model,prompt,size,n:1,
   response_format:'b64_json'}; on 404/400 falls back to /v1/inference/<model> {prompt,width,height,num_inference_steps}.
   Errors: 'nokey' (401/403), 'nocredit' (402), 'http', 'unreachable', 'abort'. */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.deepinfra = (function () {
  var API = 'https://api.deepinfra.com', OA = API + '/v1/openai';
  var CURATED = ['black-forest-labs/FLUX-1-schnell', 'black-forest-labs/FLUX-1-dev', 'stabilityai/sdxl-turbo'];
  var SKIP = /edit|remove|erase|expand|gen_fill|enhance|background|redux|kontext|vector|layer/i;
  function key() { return HR.models ? HR.models.getKey('deepinfra', OA) : ''; }
  function err(kind, msg, st) { var e = new Error(msg); e.kind = kind; e.status = st; return e; }
  function models() {
    return fetch(API + '/models/list').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (l) {
      var n = (Array.isArray(l) ? l : []).filter(function (m) { return m && m.type === 'text-to-image' && !SKIP.test(m.model_name); }).map(function (m) { return m.model_name; });
      if (!n.length) n = CURATED.slice();
      n.sort(function (a, b) { var ia = CURATED.indexOf(a), ib = CURATED.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
      return n.map(function (x) { return { name: x, label: x }; });
    });
  }
  function post(url, body, o) {
    return fetch(url, { method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key() }, body: JSON.stringify(body) })
      .catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw err('unreachable', 'Could not reach DeepInfra. Check the internet connection.'); })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} 
        if (r.ok) return j || {};
        var m = String((j && (j.error && (j.error.message || j.error) || j.detail && (j.detail.error || j.detail))) || t || r.statusText).slice(0, 300);
        if (r.status === 401 || r.status === 403) throw err('nokey', 'DeepInfra did not accept the key. ' + m, r.status);
        if (r.status === 402 || /balance|credit|payment/i.test(m)) throw err('nocredit', 'DeepInfra says the account needs credit. ' + m, r.status);
        throw err('http', 'DeepInfra HTTP ' + r.status + ': ' + m, r.status); }); });
  }
  function b64of(j) { var d = j && (j.data && j.data[0] && (j.data[0].b64_json || j.data[0].url)) || (j.images && j.images[0]) || ''; return String(d); }
  function generate(o) {
    if (!key()) return Promise.reject(err('nokey', 'No DeepInfra key yet.'));
    var w = o.width || 1024, h = o.height || 1024, body = { model: o.model, prompt: o.prompt, size: w + 'x' + h, n: 1, response_format: 'b64_json' };
    return post(OA + '/images/generations', body, o).catch(function (e) {
      if (e.kind !== 'http' || (e.status !== 404 && e.status !== 400 && e.status !== 422)) throw e;
      var b = { prompt: o.prompt, width: w, height: h }; if (o.steps) b.num_inference_steps = o.steps;
      return post(API + '/v1/inference/' + o.model, b, o);
    }).then(function (j) {
      var d = b64of(j); if (!d) throw err('noimage', 'DeepInfra finished without a picture.');
      var src = /^(data:|https?:)/.test(d) ? d : 'data:image/png;base64,' + d;
      return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) { return { blob: blob }; });
    });
  }
  return { id: 'deepinfra', label: 'DeepInfra', note: 'Your DeepInfra key · FLUX, SDXL and more', steps: false, cooldown: 0,
    ready: function () { return !!key(); }, models: models, generate: generate };
})();
