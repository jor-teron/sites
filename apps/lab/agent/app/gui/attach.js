/* Agent — app/gui/attach.js: AG11 📷 photo attach (merged from the Lab Vision app).
   HR.attach: the 📷 button next to the composer opens a file picker (camera on phones); each photo is downscaled to
   max 1024 px JPEG (shrink(), also used for made images) and shows as a small chip above the composer (✕ removes).
   peek() -> [b64 jpeg] waiting to send, clear() empties them. ok() -> can the current provider take images
   (Ollama `images`, OpenAI-compatible image_url parts, Gemini inlineData; not the Browser story model). */
HR.attach = (function () {
  var MAX = 1024, pics = [], btn, file, row;
  function shrink(src, max) {
    max = max || MAX;
    return new Promise(function (ok, bad) {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
        var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        ok(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = function () { bad(new Error('Could not read that picture.')); };
      img.src = src;
    });
  }
  function readFile(f) { return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = bad; r.readAsDataURL(f); }); }
  function paint() {
    row.innerHTML = ''; row.hidden = !pics.length;
    pics.forEach(function (b, i) {
      var c = HR.view.el('span', 'pchip'), im = new Image(), x = HR.view.el('button', 'hb', '✕');
      im.src = 'data:image/jpeg;base64,' + b; im.alt = 'Photo ' + (i + 1); x.type = 'button'; x.setAttribute('aria-label', 'Remove photo');
      x.onclick = function () { pics.splice(i, 1); paint(); }; c.append(im, x); row.appendChild(c);
    });
  }
  function add(files) {
    Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); }).slice(0, 4 - pics.length).forEach(function (f) {
      readFile(f).then(function (d) { return shrink(d); }).then(function (b) { pics.push(b); paint(); })
        .catch(function (e) { HR.view.infoCard('📷 Photo not added', e.message || 'Could not read that picture.'); });
    });
  }
  function ok() { var p = HR.models.id(); return p !== 'browser' && !!HR.models.current(); }   /* AG12: every tab but Browser */
  function show(on) { btn.hidden = !on; row.hidden = !on || !pics.length; }
  function init() {
    btn = document.getElementById('btnPhoto'); file = document.getElementById('photoFile'); row = document.getElementById('photoRow');
    btn.onclick = function () { file.click(); };
    file.onchange = function () { add(file.files); file.value = ''; };
    paint();
  }
  return { init: init, shrink: shrink, peek: function () { return pics.slice(); }, clear: function () { pics = []; paint(); }, ok: ok, show: show };
})();
