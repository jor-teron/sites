/* Agent — app/models/img_deepinfra.js: AG15 DeepInfra image provider (Agent-local DeepInfra key via HR.models.getKey;
   no legacy Hub credential lookups (AG24)). HR.imgProviders.deepinfra (same shape as img_pollinations.js).
   models(): GET api.deepinfra.com/models/list, keep type 'text-to-image' minus edit / background / erase tools; fallback
   FLUX-1-schnell, FLUX-1-dev, sdxl-turbo. generate(): POST /v1/openai/images/generations {model,prompt,size,n:1,
   response_format:'b64_json'}; on 404/400 falls back to /v1/inference/<model> {prompt,width,height,num_inference_steps}.
   AG17: generate tries /v1/inference/<model> first ({prompt,width,height,num_inference_steps}; steps default schnell 4,
   sdxl-turbo 4, dev 25, else the list's default_iterations; max schnell 4, sdxl-turbo 10, else 50), then the OpenAI images
   API ({size:'WxH'}). Price from the list's pricing (short, or cents_per_image_unit). Size px, multiples of 64, max 1536.
   Errors: 'nokey' (401/403), 'nocredit' (402), 'http', 'unreachable', 'abort'. */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.deepinfra = (function () {
  var API = 'https://api.deepinfra.com', OA = API + '/v1/openai';
  var CURATED = ['black-forest-labs/FLUX-1-schnell', 'black-forest-labs/FLUX-1-dev', 'stabilityai/sdxl-turbo'];
  var SKIP = /edit|remove|erase|expand|gen_fill|enhance|background|redux|kontext|vector|layer/i;
  var info = {}, DEF = { 'black-forest-labs/FLUX-1-schnell': 4, 'stabilityai/sdxl-turbo': 4, 'black-forest-labs/FLUX-1-dev': 25 };
  var MAX = { 'black-forest-labs/FLUX-1-schnell': 4, 'stabilityai/sdxl-turbo': 10 };
  function price(p) {   /* AG17: only what the API says */
    if (!p) return ''; if (p.short) return String(p.short);
    if (p.cents_per_image_unit != null) return p.cents_per_image_unit + '¢ / image unit';
    if (p.default_price_cents != null) return p.default_price_cents + '¢ / image';
    return '';
  }
  function sdef(m) { return DEF[m] || (info[m] && info[m].default_iterations > 1 ? info[m].default_iterations : 0) || 20; }
  function key() { return HR.models ? HR.models.getKey('deepinfra', OA) : ''; }
  function err(kind, msg, st) { var e = new Error(msg); e.kind = kind; e.status = st; return e; }
  function models() {
    return fetch(API + '/models/list').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (l) {
      var all = (Array.isArray(l) ? l : []).filter(function (m) { return m && m.type === 'text-to-image' && !SKIP.test(m.model_name); });
      all.forEach(function (m) { info[m.model_name] = m.pricing || {}; });
      var n = all.map(function (m) { return m.model_name; });
      if (!n.length) n = CURATED.slice();
      n.sort(function (a, b) { var ia = CURATED.indexOf(a), ib = CURATED.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
      return n.map(function (x) { return { name: x, label: x, price: price(info[x]) }; });
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
    var nat = { prompt: o.prompt, width: w, height: h }; if (o.steps) nat.num_inference_steps = o.steps;
    var bad = function (e) { return e.kind === 'http' && (e.status === 404 || e.status === 400 || e.status === 422); };
    /* AG17: steps only go through the native inference API, so it is tried first; OpenAI images API as fallback */
    return post(API + '/v1/inference/' + o.model, nat, o).catch(function (e) { if (!bad(e)) throw e; return post(OA + '/images/generations', body, o); }).then(function (j) {
      var d = b64of(j); if (!d) throw err('noimage', 'DeepInfra finished without a picture.');
      var src = /^(data:|https?:)/.test(d) ? d : 'data:image/png;base64,' + d;
      return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) { return { blob: blob }; });
    });
  }
  return { id: 'deepinfra', label: 'DeepInfra', note: 'Your DeepInfra key · FLUX, SDXL and more', steps: { min: 1, max: function (m) { return MAX[m] || 50; }, def: sdef }, size: 'px', mult: 64, max: 1536, cooldown: 0,
    ready: function () { return !!key(); }, models: models, generate: generate };
})();
