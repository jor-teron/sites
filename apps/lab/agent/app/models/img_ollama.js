/* Agent — app/models/img_ollama.js: AG15 Ollama image provider, a thin wrapper over HR.imagegen (imagegen.js) at the
   Ollama URL (HR.models.base('ollama')). HR.imgProviders.ollama (same shape as img_pollinations.js); steps supported.
   models() lists only image models (image true, or name-guessed); errors keep imagegen's .kind (unreachable, disabled,
   nomodel, noimage). generate() returns {blob} (PNG from base64).
   AG17: steps 1..50 (default 8), size px (multiples of 16, max 2048). */
window.HR = window.HR || {}; HR.imgProviders = HR.imgProviders || {};
HR.imgProviders.ollama = (function () {
  function base() { return HR.models.base('ollama'); }
  function models() {
    return HR.imagegen.models(base()).then(function (l) {
      var img = l.filter(function (m) { return m.image !== false; });
      if (!img.length) { var e = new Error('This Ollama has no image-generation model'); e.kind = 'nomodel'; throw e; }
      return img.map(function (m) { return { name: m.name, label: m.name }; });
    });
  }
  function generate(o) {
    return HR.imagegen.generate(Object.assign({ base: base() }, o)).then(function (r) {
      return fetch('data:image/png;base64,' + r.b64).then(function (x) { return x.blob(); }).then(function (b) { return { blob: b }; });
    });
  }
  return { id: 'ollama', label: 'Ollama', note: 'On your computer · image models need Ollama 0.32.5 on macOS for now', steps: { min: 1, max: 50, def: function () { return 8; } }, size: 'px', mult: 16, max: 2048, cooldown: 0,
    ready: function () { return true; }, models: models, generate: generate };
})();
