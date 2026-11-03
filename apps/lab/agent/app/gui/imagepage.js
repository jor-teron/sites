/* Agent — app/gui/imagepage.js: the Image page (AG14; AG15: its own page image.html, provider tabs). HR.imgpage.
   Tabs = HR.imgProviders in ORDER (AG16: pollinations, gemini, deepinfra, openrouter, ollama), a tab only when
   provider.ready(). Last tab: setting `imageProvider`; each tab's last model: `imageModel_<id>` (Ollama falls back to the
   AG14 `imageModel`). Steps (`imageSteps`, default 8) shown only when the provider supports them. Generate / ■ Stop
   (AbortController); progress 'step c / t' (Ollama) or an indeterminate bar. Cooldown (Pollinations 50 s): last start
   time in localStorage 'agent.imgCool.<id>', so a reload can't skip it; the Generate button counts down (a failed or
   stopped try clears it, except 'busy' / 429).
   Errors -> one friendly card (title, plain text, ↻ Retry; Ollama adds the pull command + 📋 Copy).
   Gallery (HR.imgstore, IndexedDB 'agent-images'): newest first; tap = large view with ⬇ Download and 🗑 Delete. */
HR.imgpage = (function () {
  var $ = function (id) { return document.getElementById(id); }, ctrl = null, urls = [], cur = null, tick = null, prov = '';
  var ORDER = ['pollinations', 'gemini', 'deepinfra', 'openrouter', 'ollama'], PULL = 'ollama pull x/z-image-turbo';
  function P() { return HR.imgProviders[prov]; }
  function tabs() { return ORDER.filter(function (id) { var p = HR.imgProviders[id]; try { return p && p.ready(); } catch (e) { return false; } }); }
  function help(e) {
    var who = P() ? P().label : 'Provider';
    switch (e.kind) {
      case 'disabled': return ['🖼 Image generation is off in this Ollama', e.message + ' — Ollama 0.32.6 and later have it switched off for now. Use Ollama 0.32.5 on macOS, or try the Pollinations tab.'];
      case 'nomodel': return ['🖼 No image model yet', (e.message || 'No image model') + '. Install one (or x/flux2-klein), or try the Pollinations tab:'];
      case 'unreachable': return ['📡 Can\'t reach ' + who, e.message + (prov === 'ollama' ? ' Ollama must be running (OLLAMA_ORIGINS must allow this page).' : '')];
      case 'nokey': return ['🔑 Key problem', e.message + ' Check the key in Hub › API Keys › ' + who + '.'];
      case 'quota': return ['🚫 Image generation blocked', e.message + ' Try the free Pollinations tab, or turn on billing for the Gemini key.'];
      case 'nocredit': return ['💳 No credit left', e.message + ' Add credit on the provider\'s site, or use the free Pollinations tab.'];
      case 'busy': return ['⏳ Busy right now', e.message];
      case 'noimage': return ['🖼 No picture came back', e.message];
      default: return ['😕 That didn\'t work', e.message || 'Something went wrong.'];
    }
  }
  function card(e) {
    var h = help(e), c = $('imgCard'), pull = prov === 'ollama' && /nomodel|noimage|unreachable/.test(e.kind);
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
    var rt = document.createElement('button'); rt.type = 'button'; rt.className = 'hb wide'; rt.textContent = '↻ Retry'; rt.onclick = function () { c.hidden = true; load(); };
    row.appendChild(rt); c.appendChild(row);
  }
  function drawTabs() {
    var box = $('imgTabs'), l = tabs(); box.innerHTML = '';
    if (l.indexOf(prov) < 0) prov = l.indexOf(HR.set.get('imageProvider')) >= 0 ? HR.set.get('imageProvider') : l[0];
    l.forEach(function (id) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ig-tab' + (id === prov ? ' on' : ''); b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === prov)); b.textContent = HR.imgProviders[id].label; b.dataset.p = id;
      b.onclick = function () { if (ctrl || id === prov) return; prov = id; HR.set.put('imageProvider', id); drawTabs(); load(); };
      box.appendChild(b);
    });
  }
  function mkey() { return 'imageModel_' + prov; }
  function load() {
    var p = P(), sel = $('imgModel'), want = HR.set.get(mkey()) || (prov === 'ollama' ? HR.set.get('imageModel') : '') || '', tok = prov;
    $('imgCard').hidden = true; $('imgNote').textContent = p.note || ''; $('imgStepsL').hidden = !p.steps;
    sel.innerHTML = '<option value="">Loading…</option>'; sel.disabled = true; cool();
    p.models().then(function (l) {
      if (tok !== prov) return;
      sel.innerHTML = ''; l.forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.textContent = m.label || m.name; sel.appendChild(o); });
      if (!l.some(function (m) { return m.name === want; })) want = l[0] ? l[0].name : '';
      sel.value = want; sel.disabled = false; if (want) HR.set.put(mkey(), want); cool();
    }).catch(function (e) { if (tok !== prov) return; sel.innerHTML = '<option value="">No image model</option>'; card(e); cool(); });
  }
  function steps() { var v = parseInt(HR.set.get('imageSteps'), 10); return Math.max(1, Math.min(50, isNaN(v) ? 8 : v)); }
  /* cooldown */
  function ckey() { return 'agent.imgCool.' + prov; }
  function left() { var p = P(); if (!p || !p.cooldown) return 0; var t = parseInt(localStorage.getItem(ckey()), 10) || 0; return Math.max(0, Math.ceil((t + p.cooldown * 1000 - Date.now()) / 1000)); }
  function cool() {
    if (ctrl) return; clearTimeout(tick); var g = $('imgGo'), s = left();
    g.classList.remove('stop'); g.classList.toggle('wait', s > 0);
    g.disabled = s > 0 || !$('imgModel').value;
    g.textContent = s > 0 ? '⏳ Next picture in ' + s + ' s' : '✨ Generate';
    if (s > 0) tick = setTimeout(cool, 1000);
  }
  function shrink(blob) {   /* ≤1024 px JPEG, like AG14 */
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * s) || 1, h = Math.round(img.naturalHeight * s) || 1;
        var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(u); c.toBlob(function (b) { b ? ok(b) : no(new Error('Could not read the picture.')); }, 'image/jpeg', 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(u); var e = new Error('The picture could not be opened.'); e.kind = 'noimage'; no(e); };
      img.src = u;
    });
  }
  function go() {
    if (ctrl) { ctrl.abort(); return; }
    var p = P(), prompt = $('imgPrompt').value.trim(), m = $('imgModel').value;
    if (!prompt) { $('imgPrompt').focus(); $('imgPrompt').classList.add('shake'); setTimeout(function () { $('imgPrompt').classList.remove('shake'); }, 400); return; }
    if (!m) { load(); return; } if (left() > 0) return;
    $('imgCard').hidden = true; ctrl = new AbortController(); busy(true); bar(0, 0);
    if (p.cooldown) try { localStorage.setItem(ckey(), String(Date.now())); } catch (e) {}
    p.generate({ model: m, prompt: prompt, steps: p.steps ? steps() : 0, width: 1024, height: 1024, signal: ctrl.signal, onProgress: bar })
      .then(function (r) { return shrink(r.blob); })
      .then(function (b) { return HR.imgstore.add({ blob: b, prompt: prompt, model: p.label + ' · ' + m, time: Date.now() }); }).then(gallery)
      .catch(function (e) { if (e.kind !== 'busy') try { localStorage.removeItem(ckey()); } catch (x) {} if (e.kind !== 'abort') card(e); })
      .then(function () { ctrl = null; busy(false); cool(); });
  }
  function bar(c, t) { $('imgBar').hidden = false; $('imgBar').classList.toggle('indet', !t); $('imgFill').style.width = (t ? 100 * c / t : 0) + '%'; $('imgStep').textContent = t ? 'step ' + c + ' / ' + t : 'Painting…'; }
  function busy(on) { var g = $('imgGo'); if (on) { clearTimeout(tick); g.disabled = false; g.textContent = '■ Stop'; g.classList.add('stop'); g.classList.remove('wait'); } else $('imgBar').hidden = true; }
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
  function init() {
    $('imgGo').onclick = go;
    $('imgModel').onchange = function () { HR.set.put(mkey(), this.value); cool(); };
    var st = $('imgSteps'); st.value = steps(); st.onchange = function () { HR.set.put('imageSteps', Math.max(1, Math.min(50, parseInt(st.value, 10) || 8))); st.value = steps(); };
    $('imgPrompt').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
    $('imgViewX').onclick = function () { $('imgView').close(); };
    $('imgDel').onclick = function () { if (!cur || !confirm('Delete this picture?')) return; HR.imgstore.del(cur.id).then(function () { $('imgView').close(); gallery(); }); };
    if (HR.hubKeys) HR.hubKeys.onChange(function () { if (!ctrl) { var was = prov; drawTabs(); if (was !== prov) load(); } });
    drawTabs(); load(); gallery();
  }
  return { init: init };
})();
