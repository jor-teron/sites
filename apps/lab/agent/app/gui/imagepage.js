/* Agent — app/gui/imagepage.js: the Image page (AG14; AG15: its own page image.html, provider tabs). HR.imgpage.
   Tabs = HR.imgProviders in ORDER (AG16: pollinations, gemini, deepinfra, openrouter, ollama), a tab only when
   provider.ready(). Last tab: setting `imageProvider`; each tab's last model: `imageModel_<id>` (Ollama falls back to the
   AG14 `imageModel`). Steps (`imageSteps`, default 8) shown only when the provider supports them. Generate / ■ Stop
   (AbortController); progress 'step c / t' (Ollama) or an indeterminate bar. Cooldown (Pollinations 50 s): last start
   time in localStorage 'agent.imgCool.<id>', so a reload can't skip it; the Generate button counts down (a failed or
   stopped try clears it, except 'busy' / 429).
   Errors -> one friendly card (title, plain text, ↻ Retry; Ollama adds the pull command + 📋 Copy).
   Gallery (HR.imgstore, IndexedDB 'agent-images'): newest first; tap = large view with ⬇ Download and 🗑 Delete.
   AG17: Steps on every tab — providers with p.steps {min, max(m), def(m)} send it (setting `imageSteps_<id>`, Ollama falls
   back to `imageSteps`), others show it disabled 'fixed by provider'. Size chips (HR.imgsize, setting `imageSize`).
   AG19: Provider is a dropdown (#imgProv) in the top row next to Model; Steps is a dropdown hidden where unsupported;
   Ratio / Size come from HR.imgsize.draw(provider).
   AG20: ☆/★ (#imgFav) stars the current model (`imageFav_<id>`); '⭐ Favourites' optgroup on top, then Recent (no repeats).
   Gallery tap -> HR.imgviewer (full screen, ← → / swipe, Esc).
   Model options show the API price (m.price). Recent group: last 5 models used per tab (`imageRecent_<id>`).
   Download name = slugified prompt (+ '-2', '-3' for repeats in the gallery or this session) + real extension.
   AG21: download name = '[model]_[prompt]' + real extension (model = the one stored with the picture, provider label
   dropped; / \\ : * ? " < > | and control chars removed, spaces collapsed, prompt capped at 80, no prompt -> model only;
   '-2', '-3' on clash as before). */
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
      case 'nokey': return ['🔑 Key problem', e.message + (prov === 'gemini' ? ' Check the Gemini key in Agent › API & Providers.' : ' Check the matching provider in Agent › API & Providers, or the Agent-local key in Chat → Settings → Model.')];
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
    if (typeof e.openSettings === 'function') {
      var settings = document.createElement('button'); settings.type = 'button'; settings.className = 'hb wide'; settings.textContent = 'Open provider settings';
      settings.onclick = function () { e.openSettings(); }; row.appendChild(settings);
    }
    var rt = document.createElement('button'); rt.type = 'button'; rt.className = 'hb wide'; rt.textContent = '↻ Retry'; rt.onclick = function () { c.hidden = true; load(); };
    row.appendChild(rt); c.appendChild(row);
  }
  /* AG19: Provider dropdown (#imgProv) replaces the AG15 tabs; ready providers only, ORDER kept */
  function drawTabs() {
    var box = $('imgProv'), l = tabs(); box.innerHTML = '';
    if (l.indexOf(prov) < 0) prov = l.indexOf(HR.set.get('imageProvider')) >= 0 ? HR.set.get('imageProvider') : l[0];
    l.forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = HR.imgProviders[id].label; box.appendChild(o); });
    box.value = prov; box.title = 'Provider: ' + HR.imgProviders[prov].label;
  }
  function mkey() { return 'imageModel_' + prov; }
  function load() {
    var p = P(), sel = $('imgModel'), want = HR.set.get(mkey()) || (prov === 'ollama' ? HR.set.get('imageModel') : '') || '', tok = prov;
    $('imgCard').hidden = true; $('imgNote').textContent = p.note || ''; stepsUi(); HR.imgsize.draw(p, sizeUi); sizeUi();
    sel.innerHTML = '<option value="">Loading…</option>'; sel.disabled = true; favUi(); cool();
    p.models().then(function (l) {
      if (tok !== prov) return;
      sel.innerHTML = ''; var by = {}; l.forEach(function (m) { by[m.name] = m; });
      var opt = function (m, g) { var o = document.createElement('option'); o.value = m.name; o.textContent = (m.label || m.name) + (m.price ? ' · ' + m.price : ''); g.appendChild(o); };
      var fv = favs().filter(function (n) { return by[n]; }), rec = recent().filter(function (n) { return by[n] && fv.indexOf(n) < 0; });
      var grp = function (lab, l) { var g = document.createElement('optgroup'); g.label = lab; l.forEach(function (n) { opt(by[n], g); }); sel.appendChild(g); };
      if (fv.length) grp('⭐ Favourites', fv);
      if (rec.length) grp('🕘 Recent', rec);
      if (fv.length || rec.length) { var g2 = document.createElement('optgroup'); g2.label = 'All models'; l.forEach(function (m) { opt(m, g2); }); sel.appendChild(g2); }
      else l.forEach(function (m) { opt(m, sel); });
      if (!by[want]) want = l[0] ? l[0].name : '';
      sel.value = want; sel.title = want; sel.disabled = false; if (want) HR.set.put(mkey(), want); stepsUi(); favUi(); cool();
    }).catch(function (e) { if (tok !== prov) return; sel.innerHTML = '<option value="">No image model</option>'; card(e); cool(); });
  }
  /* AG17: steps per provider */
  function sMax() { var t = P().steps, m = $('imgModel').value; return typeof t.max === 'function' ? t.max(m) : t.max || 50; }
  function steps() {
    var t = P().steps; if (!t) return 0;
    var v = parseInt(HR.set.get('imageSteps_' + prov), 10); if (isNaN(v) && prov === 'ollama') v = parseInt(HR.set.get('imageSteps'), 10);
    if (isNaN(v)) v = t.def($('imgModel').value); return Math.max(t.min || 1, Math.min(sMax(), v));
  }
  function stepsUi() {
    var t = P().steps, st = $('imgSteps'); st.hidden = !t; st.innerHTML = ''; if (!t) return;   /* AG19: dropdown, only where supported */
    var mx = sMax(), cur = steps(), l = [1, 2, 4, 8, 12, 20, 25, 30, 40, 50].filter(function (n) { return n >= (t.min || 1) && n <= mx; });
    if (l.indexOf(cur) < 0) l.push(cur); l.sort(function (a, b) { return a - b; });
    l.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n + ' steps'; st.appendChild(o); });
    st.value = String(cur); st.title = 'Steps (default ' + t.def($('imgModel').value) + ', max ' + mx + ')';
  }
  /* AG20: favourites per provider (imageFav_<id>) */
  function favs() { var l = HR.set.get('imageFav_' + prov); return Array.isArray(l) ? l : []; }
  function favUi() { var b = $('imgFav'), m = $('imgModel').value, on = !!m && favs().indexOf(m) >= 0, t = on ? 'Remove from favourites' : 'Add to favourites';
    b.textContent = on ? '★' : '☆'; b.classList.toggle('on', on); b.disabled = !m; b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', String(on)); }
  function star() { var m = $('imgModel').value; if (!m) return; var l = favs(), k = l.indexOf(m); if (k >= 0) l.splice(k, 1); else l.push(m); HR.set.put('imageFav_' + prov, l); load(); }
  function recent() { var l = HR.set.get('imageRecent_' + prov); return Array.isArray(l) ? l : []; }
  function used(m) { var l = recent().filter(function (x) { return x !== m; }); l.unshift(m); HR.set.put('imageRecent_' + prov, l.slice(0, 5)); }
  function sizeUi() { var f = HR.imgsize.fit(P()); $('imgSizeNote').textContent = (P().size === 'ratio' ? '📐 shape ' + f.ratio : '📐 ' + f.width + ' × ' + f.height) + (f.note ? ' · ' + f.note : ''); }
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
    var f = HR.imgsize.fit(p);
    p.generate({ model: m, prompt: prompt, steps: steps(), width: f.width, height: f.height, ratio: f.ratio, signal: ctrl.signal, onProgress: bar })
      .then(function (r) { used(m); return shrink(r.blob); })
      .then(function (b) { return HR.imgstore.add({ blob: b, prompt: prompt, model: p.label + ' · ' + m, time: Date.now() }); }).then(gallery)
      .then(function () { if (recent()[0] === m && recent().length && !$('imgModel').querySelector('optgroup')) load(); })
      .catch(function (e) { if (e.kind !== 'busy') try { localStorage.removeItem(ckey()); } catch (x) {} if (e.kind !== 'abort') card(e); })
      .then(function () { ctrl = null; busy(false); cool(); });
  }
  function bar(c, t) { $('imgBar').hidden = false; $('imgBar').classList.toggle('indet', !t); $('imgFill').style.width = (t ? 100 * c / t : 0) + '%'; $('imgStep').textContent = t ? 'step ' + c + ' / ' + t : 'Painting…'; }
  function busy(on) { var g = $('imgGo'); if (on) { clearTimeout(tick); g.disabled = false; g.textContent = '■ Stop'; g.classList.add('stop'); g.classList.remove('wait'); } else $('imgBar').hidden = true; }
  function gallery() {
    return HR.imgstore.list().then(function (l) {
      gl = l;
      urls.forEach(URL.revokeObjectURL); urls = [];
      var g = $('imgGrid'); g.innerHTML = ''; $('imgEmpty').hidden = l.length > 0;
      l.forEach(function (r) {
        var u = URL.createObjectURL(r.blob); urls.push(u);
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ig-th'; b.title = r.prompt;
        var i = document.createElement('img'); i.src = u; i.alt = r.prompt; i.loading = 'lazy'; b.appendChild(i);
        b.onclick = function () { view(r); }; g.appendChild(b);
      });
    }).catch(function () { $('imgEmpty').hidden = false; });
  }
  /* AG17: download name from the prompt; AG21: '[model]_[prompt]' */
  var done = {}, gl = [];
  function slug(t) { var x = String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, ''); return x || 'agent-image'; }
  function clean(t, cap) { var x = String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    if (cap && x.length > cap) x = x.slice(0, cap); return x.replace(/[. ]+$/, ''); }
  function base(r) { var m = String(r.model || ''), k = m.lastIndexOf(' · '); if (k >= 0) m = m.slice(k + 3);
    m = clean(m.replace(/[\/\\:]+/g, '-'), 60); var p = clean(r.prompt, 80);
    return (m && p ? m + '_' + p : m || p) || 'agent-image'; }
  function ext(b) { var t = b && b.type || ''; return /png/.test(t) ? '.png' : /webp/.test(t) ? '.webp' : '.jpg'; }
  function fname(r) {
    var s = base(r), same = gl.filter(function (x) { return base(x) === s; }).sort(function (a, b) { return a.time - b.time || a.id - b.id; });
    var i = Math.max(0, same.findIndex(function (x) { return x.id === r.id; })), n = i ? s + '-' + (i + 1) : s, k = i + 1;
    while (done[n] && done[n] !== r.id) { k++; n = s + '-' + k; }
    return n + ext(r.blob);
  }
  function view(r) {   /* AG20: full-screen viewer, gallery order */
    var items = gl.map(function (x, k) { return { rec: x, url: urls[k] }; });
    HR.imgviewer.open(items, gl.indexOf(r), { fname: fname, onDownload: function (x, fn) { done[fn.replace(/\.\w+$/, '')] = x.id; },
      onDelete: function (x) { return HR.imgstore.del(x.id).then(function () { return gallery(); }); } });
  }
  function init() {
    $('imgGo').onclick = go;
    $('imgModel').onchange = function () { HR.set.put(mkey(), this.value); this.title = this.value; stepsUi(); favUi(); cool(); };
    $('imgProv').onchange = function () { if (ctrl) { this.value = prov; return; } prov = this.value; HR.set.put('imageProvider', prov); drawTabs(); load(); };
    var st = $('imgSteps'); st.onchange = function () { var t = P().steps; if (!t) return; var v = parseInt(st.value, 10);
      HR.set.put('imageSteps_' + prov, isNaN(v) ? t.def($('imgModel').value) : Math.max(t.min || 1, Math.min(sMax(), v))); stepsUi(); };
    $('imgPrompt').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
    $('imgFav').onclick = star;
    if (HR.hubKeys) HR.hubKeys.onChange(function () { if (!ctrl) { var was = prov; drawTabs(); if (was !== prov) load(); } });
    drawTabs(); load(); gallery();
  }
  return { init: init };
})();
