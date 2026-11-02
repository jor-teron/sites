/* Agent — app/gui/imagepage.js: AG14 Image page (replaces the AG11 composer Chat | Image toggle).
   🖼 in the top bar opens a full slide-over (#imgPage); ✕ returns to chat. Big prompt + Generate, its own picker that lists
   ONLY image models (HR.imagegen.models -> image true / name-guessed), saved in setting `imageModel` (separate from the chat
   model); steps (setting `imageSteps`, default 8), size 1024; progress 'step c / t' with Stop (AbortController).
   No model / unreachable / disabled -> one friendly card with the pull command, Copy and Retry (texts from AG11).
   Gallery (HR.imgstore, IndexedDB): newest first; tap = large view with ⬇ Download and 🗑 Delete (confirm). */
HR.imgpage = (function () {
  var $ = function (id) { return document.getElementById(id); }, ctrl = null, urls = [], cur = null;
  var PULL = 'ollama pull x/z-image-turbo';
  function help(e) {
    if (e.kind === 'disabled') return ['🖼 Image generation is off in this Ollama', e.message + ' — Ollama 0.32.6 and later have image generation switched off for now. Use Ollama 0.32.5 on macOS with x/z-image-turbo.'];
    if (e.kind === 'nomodel') return ['🖼 No image model yet', (e.message || 'This Ollama has no image-generation model') + '. Install one (or x/flux2-klein):'];
    if (e.kind === 'noimage') return ['🖼 No image came back', e.message + ' Install an image model (or x/flux2-klein):'];
    if (e.kind === 'unreachable') return ['🖼 Can\'t reach Ollama', e.message + '. The Image page needs Ollama running (OLLAMA_ORIGINS must allow this page). Then install an image model:'];
    return ['🖼 Image failed', e.message];
  }
  function card(e) {
    var h = help(e), c = $('imgCard'), pull = e.kind !== 'http';
    c.innerHTML = ''; c.hidden = false;
    var t = document.createElement('h3'); t.textContent = h[0]; c.appendChild(t);
    var p = document.createElement('p'); p.textContent = h[1]; c.appendChild(p);
    var row = document.createElement('div'); row.className = 'ig-cmd';
    if (pull) {
      var code = document.createElement('code'); code.textContent = PULL; row.appendChild(code);
      var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'hb wide'; cp.textContent = '📋 Copy';
      cp.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(PULL) : Promise.reject()).then(function () { cp.textContent = '✓ Copied'; }, function () { cp.textContent = 'Select & copy'; }); };
      row.appendChild(cp);
    }
    var rt = document.createElement('button'); rt.type = 'button'; rt.className = 'hb wide'; rt.textContent = '↻ Retry'; rt.onclick = function () { load(); };
    row.appendChild(rt); c.appendChild(row);
  }
  function load() {
    var sel = $('imgModel'), base = HR.models.base('ollama'); $('imgCard').hidden = true; sel.innerHTML = '<option>Loading…</option>'; $('imgGo').disabled = true;
    return HR.imagegen.models(base).then(function (l) {
      var img = l.filter(function (m) { return m.image !== false; });
      if (!img.length) { var e = new Error('This Ollama has no image-generation model'); e.kind = 'nomodel'; throw e; }
      var want = (HR.set.get('imageModel') || '').trim(); if (!img.some(function (m) { return m.name === want; })) want = HR.imagegen.pick(img);
      sel.innerHTML = ''; img.forEach(function (m) { var o = document.createElement('option'); o.value = o.textContent = m.name; sel.appendChild(o); });
      sel.value = want; HR.set.put('imageModel', want); $('imgGo').disabled = false;
    }).catch(function (e) { sel.innerHTML = '<option value="">No image model</option>'; card(e); });
  }
  function steps() { var v = parseInt(HR.set.get('imageSteps'), 10); return Math.max(1, Math.min(50, isNaN(v) ? 8 : v)); }
  function blobOf(b64) { return fetch('data:image/jpeg;base64,' + String(b64).replace(/^data:[^,]*,/, '')).then(function (r) { return r.blob(); }); }
  function go() {
    if (ctrl) { ctrl.abort(); return; }
    var prompt = $('imgPrompt').value.trim(), m = $('imgModel').value; if (!prompt) { $('imgPrompt').focus(); return; } if (!m) { load(); return; }
    ctrl = new AbortController(); busy(true); bar(0, steps());
    HR.imagegen.generate({ base: HR.models.base('ollama'), model: m, prompt: prompt, steps: steps(), width: 1024, height: 1024, signal: ctrl.signal, onProgress: bar })
      .then(function (r) { return HR.attach.shrink('data:image/png;base64,' + r.b64); }).then(blobOf)
      .then(function (b) { return HR.imgstore.add({ blob: b, prompt: prompt, model: m, time: Date.now() }); }).then(gallery)
      .catch(function (e) { if (e.kind !== 'abort') card(e); })
      .then(function () { ctrl = null; busy(false); });
  }
  function bar(c, t) { $('imgBar').hidden = false; $('imgFill').style.width = (t ? 100 * c / t : 0) + '%'; $('imgStep').textContent = 'step ' + c + ' / ' + t; }
  function busy(on) { var g = $('imgGo'); g.textContent = on ? '■ Stop' : '✨ Generate'; g.classList.toggle('stop', on); if (!on) $('imgBar').hidden = true; }
  function gallery() {
    return HR.imgstore.list().then(function (l) {
      urls.forEach(URL.revokeObjectURL); urls = [];
      var g = $('imgGrid'); g.innerHTML = ''; $('imgEmpty').hidden = l.length > 0;
      l.forEach(function (r) {
        var u = URL.createObjectURL(r.blob); urls.push(u);
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ig-th'; b.title = r.prompt;
        var i = document.createElement('img'); i.src = u; i.alt = r.prompt; i.loading = 'lazy'; b.appendChild(i);
        b.onclick = function () { view(r, u); }; g.appendChild(b);
      });
    }).catch(function () { $('imgEmpty').hidden = false; });
  }
  function view(r, u) {
    cur = r; $('imgBig').src = u; $('imgCap').textContent = r.prompt + ' · ' + r.model + ' · ' + new Date(r.time).toLocaleString();
    var d = $('imgDl'); d.href = u; d.download = 'agent-image-' + r.id + '.jpg'; $('imgView').showModal();
  }
  function open() { $('imgPage').hidden = false; requestAnimationFrame(function () { $('imgPage').classList.add('on'); }); load(); gallery(); $('imgPrompt').focus(); }
  function close() { if (ctrl) ctrl.abort(); var p = $('imgPage'); p.classList.remove('on'); setTimeout(function () { p.hidden = true; }, 250); }
  function init() {
    $('btnImage').onclick = open; $('imgClose').onclick = close; $('imgGo').onclick = go;
    $('imgModel').onchange = function () { HR.set.put('imageModel', this.value); };
    var st = $('imgSteps'); st.value = steps(); st.onchange = function () { HR.set.put('imageSteps', Math.max(1, Math.min(50, parseInt(st.value, 10) || 8))); st.value = steps(); };
    $('imgPrompt').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
    $('imgViewX').onclick = function () { $('imgView').close(); };
    $('imgDel').onclick = function () { if (!cur || !confirm('Delete this picture?')) return; HR.imgstore.del(cur.id).then(function () { $('imgView').close(); gallery(); }); };
  }
  return { init: init, open: open, close: close };
})();
