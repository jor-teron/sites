/* Agent — app/models/img_gemini.js: AG16 Gemini image provider (AG26: differing Agent-local key overrides Hub; else Hub via getKey).
   HR.imgProviders.gemini (same shape as img_pollinations.js). models(): v1beta/models filtered to image output —
   gemini-*image* (generateContent) and imagen-* with 'predict'; fallback gemini-2.5-flash-image.
   generate(): gemini -> :generateContent with responseModalities ['TEXT','IMAGE'], reads inlineData; imagen -> :predict
   {instances:[{prompt}], parameters:{sampleCount:1}}, reads predictions[0].bytesBase64Encoded.
   AG17: aspect ratio sent (generationConfig.imageConfig.aspectRatio / Imagen parameters.aspectRatio); no price in the API.
   Errors: 'quota' (429 / RESOURCE_EXHAUSTED / limit: 0 — free tier blocks image gen), 'nokey', 'noimage' (text only), 'http'. */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.gemini = (function () {
  var API = 'https://generativelanguage.googleapis.com/v1beta', FALL = ['gemini-2.5-flash-image'];
  function key() {
    if (!HR.models) return '';
    var b = HR.models.base('gemini'), local = HR.models.localKey('gemini', b), hub = HR.hubKeys ? HR.hubKeys.val('gemini') : '';
    // AG26 Legacy: getKey prefers Hub; a differing Agent-local key must win for image calls.
    return local && local !== hub ? local : HR.models.getKey('gemini', b);
  }
  function err(kind, msg, st) { var e = new Error(msg); e.kind = kind; e.status = st; return e; }
  function models() {
    return fetch(API + '/models?pageSize=1000&key=' + encodeURIComponent(key())).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (j) {
      var n = (j.models || []).filter(function (m) {
        var id = String(m.name || '').replace(/^models\//, ''), g = m.supportedGenerationMethods || [];
        return /^imagen-/.test(id) ? g.indexOf('predict') >= 0 : /^gemini-.*image/.test(id) && g.indexOf('generateContent') >= 0;
      }).map(function (m) { return String(m.name).replace(/^models\//, ''); });
      if (!n.length) n = FALL.slice();
      return n.sort().map(function (x) { return { name: x, label: x }; });
    });
  }
  function post(url, body, o) {
    return fetch(url, { method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body) })
      .catch(function (e) { if (e && e.name === 'AbortError') throw err('abort', 'Stopped'); throw err('unreachable', 'Could not reach Gemini. Check the internet connection.'); })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (r.ok) return j || {};
        var m = String((j && j.error && j.error.message) || t || r.statusText).slice(0, 300), s = j && j.error && j.error.status || '';
        if (r.status === 429 || /RESOURCE_EXHAUSTED/.test(s) || /limit: 0/.test(m)) throw err('quota', 'Google blocks image generation on this key right now (free tier or quota used up).', r.status);
        if (r.status === 401 || r.status === 403 || /API key not valid|API_KEY_INVALID/i.test(m)) throw err('nokey', 'Gemini did not accept the key.', r.status);
        throw err('http', 'Gemini HTTP ' + r.status + ': ' + m, r.status); }); });
  }
  function generate(o) {
    if (!key()) return Promise.reject(err('nokey', 'No Gemini key yet.'));
    var u = API + '/models/' + o.model, im = /^imagen-/.test(o.model);
    var req = im ? post(u + ':predict', { instances: [{ prompt: o.prompt }], parameters: { sampleCount: 1, aspectRatio: o.ratio || '1:1' } }, o)
      : post(u + ':generateContent', { contents: [{ role: 'user', parts: [{ text: o.prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: o.ratio || '1:1' } } }, o);
    return req.then(function (j) {
      var d = '', mt = 'image/png';
      if (im) { var p = j.predictions && j.predictions[0]; if (p) { d = p.bytesBase64Encoded || ''; mt = p.mimeType || mt; } }
      else ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).forEach(function (p) { var x = p.inlineData || p.inline_data; if (x && x.data && !d) { d = x.data; mt = x.mimeType || x.mime_type || mt; } });
      if (!d) throw err('noimage', 'Gemini replied with text only, no picture. Try again or rephrase as "make a picture of …".');
      var um = j.usageMetadata || {}, tok = Number.isSafeInteger(um.promptTokenCount) && Number.isSafeInteger(um.candidatesTokenCount) ? { p: um.promptTokenCount, o: um.candidatesTokenCount } : null;   /* AG39: reported only */
      return fetch('data:' + mt + ';base64,' + d).then(function (r) { return r.blob(); }).then(function (b) { return { blob: b, tokens: tok }; });
    });
  }
  return { id: 'gemini', label: 'Gemini', note: 'Your Gemini key · Flash Image / Imagen (free tier often blocks images)', steps: false, size: 'ratio', ratios: ['1:1', '3:4', '4:3', '9:16', '16:9'], cooldown: 0,
    ready: function () { return !!key(); }, models: models, generate: generate };
})();
/* AG25 Legacy: original adapter above is retained only for standalone/local
   configuration or an older Hub without the image API. Hub failures do not
   fall back to another credential or repeat the generation request. */
if (HR.hubAPI) HR.imgProviders.gemini = HR.hubAPI.imageProvider(HR.imgProviders.gemini);
