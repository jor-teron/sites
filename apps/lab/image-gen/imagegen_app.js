/* Image Gen IG1 app: screens, swipes, settings, theme, generate flow, gallery.
   Settings in 'imagegen-settings-v1': { theme, url, model, size, steps, prompt }. */
(function () {
  'use strict';
  const SKEY = 'imagegen-settings-v1', SWIPE = 75, TAP_MOVE = 10;
  const SIZES = { square: [1024, 1024], portrait: [768, 1024], landscape: [1024, 768] };
  const ORIGIN = 'https://jor-teron.github.io';
  const $ = (id) => document.getElementById(id);
  const P = { theme: 'dark', url: 'http://localhost:11434', model: '', size: 'square', steps: 8, prompt: '' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* */ }
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };
  const defSteps = (m) => (/flux/i.test(m || '') ? 4 : 8);

  /* theme: System follows the hub pref, then the device */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let h = null; try { h = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = h === 'dark' || h === 'light' ? h === 'dark' : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);

  /* dialogs + toast (never alert). html is built from our own strings only; user text goes through esc(). */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let dlgRes = null;
  function dialog(title, html, confirm) {
    $('dlg-h').textContent = title; $('dlg-t').innerHTML = html; $('dlg-no').hidden = !confirm; $('dialog').hidden = false; $('dlg-ok').focus();
    return new Promise((r) => { dlgRes = r; });
  }
  function closeDlg(v) { $('dialog').hidden = true; const r = dlgRes; dlgRes = null; r && r(v); }
  $('dlg-ok').onclick = () => closeDlg(true); $('dlg-no').onclick = () => closeDlg(false);
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3000); }

  function explain(e) {
    const url = esc(IGOllama.base(P.url));
    if (e.kind === 'unreachable') return dialog('Can\u2019t reach Ollama',
      '<p>Nothing answered at <code>' + url + '</code>, or the browser blocked it (CORS).</p>' +
      '<p>Make sure Ollama is running, and start it so this site may call it:</p><p><code>OLLAMA_ORIGINS=' + ORIGIN + ' ollama serve</code></p>' +
      '<p class="mut">On a Mac app install: <code>launchctl setenv OLLAMA_ORIGINS "' + ORIGIN + '"</code>, then restart Ollama. Check the URL in Settings.</p>');
    if (e.kind === 'disabled') return dialog('Image generation is off in this Ollama',
      '<p>Ollama said: <i>' + esc(e.message) + '</i></p><p>Ollama 0.32.6 and later have image generation switched off for now. Use <b>Ollama 0.32.5 on macOS</b> with an image model such as <code>x/z-image-turbo</code>.</p>');
    if (e.kind === 'nomodel') return dialog('Model not found', '<p>' + esc(e.message) + '</p><p>Download one with <code>ollama pull x/z-image-turbo</code>, then tap ↻ in Settings.</p>');
    if (e.kind === 'noimage') return dialog('No image came back', '<p>' + esc(e.message) + '</p><p>Image models: <code>x/z-image-turbo</code>, <code>x/flux2-klein</code>.</p>');
    return dialog('Something went wrong', '<p>' + esc(e.message || e) + '</p>');
  }

  /* segmented controls */
  function renderSeg() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v))); }
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); renderSeg();
  }));

  /* prompt + steps */
  const pr = $('prompt'), st = $('steps');
  pr.value = P.prompt || '';
  pr.addEventListener('input', () => { P.prompt = pr.value; saveP(); });
  function renderSteps() { st.value = P.steps; $('steps-v').textContent = P.steps; }
  st.addEventListener('input', () => { P.steps = +st.value; saveP(); renderSteps(); });

  /* models */
  const sel = $('model-s'), cust = $('model-c'), CUSTOM = '__custom__';
  let modelList = [];
  function renderModelLabel() { $('model-l').textContent = P.model || 'none — open Settings'; $('model-l').title = P.model; }
  function setModel(m, resetSteps) {
    if (m === P.model) return;
    P.model = m; if (resetSteps) P.steps = defSteps(m); saveP(); renderSteps(); renderModelLabel();
  }
  function fillSelect() {
    sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    modelList.forEach((m) => add(m.name, m.name + (m.image === true ? '  (image)' : m.image === null ? '' : '  (text)')));
    add(CUSTOM, 'Other (type a name)…');
    const known = modelList.some((m) => m.name === P.model);
    sel.value = known ? P.model : CUSTOM;
    $('custom-f').hidden = known; cust.value = known ? '' : P.model;
  }
  sel.addEventListener('change', () => {
    if (sel.value === CUSTOM) { $('custom-f').hidden = false; cust.focus(); return; }
    $('custom-f').hidden = true; setModel(sel.value, true);
  });
  cust.addEventListener('change', () => setModel(cust.value.trim(), true));
  async function loadModels(showErr) {
    $('models-t').textContent = 'Loading models…';
    try {
      modelList = await IGOllama.models(P.url);
      const img = modelList.filter((m) => m.image === true);
      if (!P.model || !modelList.some((m) => m.name === P.model)) {
        const pick = img.find((m) => /z-image/i.test(m.name)) || img[0] || modelList.find((m) => m.image === null);
        if (pick) setModel(pick.name, true);
      }
      $('models-t').textContent = modelList.length ? img.length + ' image model' + (img.length === 1 ? '' : 's') + ' of ' + modelList.length + ' installed.' : 'No models installed.';
      fillSelect();
      if (showErr && !img.length && !modelList.some((m) => m.image === null)) {
        dialog('No image models', '<p>This Ollama has no image-generation model.</p><p>Run <code>ollama pull x/z-image-turbo</code> (or <code>x/flux2-klein</code>), then tap ↻ in Settings.</p><p class="mut">You can still type a model name under Settings → Model → Other.</p>');
      }
      return true;
    } catch (e) {
      $('models-t').textContent = 'Could not load models.'; fillSelect();
      if (showErr) explain(e);
      return false;
    }
  }
  const url = $('url'); url.value = P.url;
  url.addEventListener('change', () => { P.url = url.value.trim() || 'http://localhost:11434'; url.value = P.url; saveP(); loadModels(true); });
  $('refresh-btn').onclick = () => loadModels(true);

  /* generate */
  let ac = null, curBlob = null, curUrl = null, curMeta = null;
  function busy(on) {
    $('prog').hidden = !on; $('gen-btn').disabled = on; $('gen-btn').textContent = on ? 'Generating…' : 'Generate';
    if (on) { $('bar').style.width = '0'; $('bar').parentNode.classList.add('ind'); $('prog-t').textContent = 'Loading model…'; }
  }
  function showResult(blob, meta) {
    if (curUrl) URL.revokeObjectURL(curUrl);
    curBlob = blob; curMeta = meta; curUrl = URL.createObjectURL(blob);
    $('out-img').src = curUrl; $('result').hidden = false; $('empty').hidden = true;
    $('out-info').textContent = meta.w + '×' + meta.h + ' · ' + meta.steps + ' steps · ' + meta.model + (meta.secs ? ' · ' + meta.secs + ' s' : '');
  }
  $('gen-btn').onclick = async () => {
    const prompt = pr.value.trim();
    if (!prompt) { dialog('Add a prompt', '<p>Describe the picture you want first.</p>'); pr.focus(); return; }
    if (!P.model) {
      const ok = await loadModels(true);
      if (!ok || !P.model) return;
    }
    const [w, h] = SIZES[P.size] || SIZES.square, t0 = Date.now();
    ac = new AbortController(); busy(true);
    try {
      const r = await IGOllama.generate({ url: P.url, model: P.model, prompt, width: w, height: h, steps: P.steps, signal: ac.signal,
        onProgress: (c, t) => { $('bar').parentNode.classList.remove('ind'); $('bar').style.width = Math.min(100, c / t * 100) + '%'; $('prog-t').textContent = 'Step ' + c + ' / ' + t; } });
      const blob = IGOllama.b64ToBlob(r.b64), meta = { prompt, model: P.model, w, h, steps: P.steps, secs: Math.round((Date.now() - t0) / 1000) };
      showResult(blob, meta);
      try { await IGStore.add(Object.assign({ blob }, meta)); renderGallery(); } catch (_) { toast('Could not keep it in the gallery (storage full?)'); }
    } catch (e) {
      if (e && e.name === 'AbortError') toast('Cancelled'); else explain(e);
    } finally { ac = null; busy(false); }
  };
  $('cancel-btn').onclick = () => { if (ac) ac.abort(); };
  $('save-btn').onclick = () => { if (curBlob) IGSave.save(curBlob, IGSave.fileName(curMeta && curMeta.prompt)).then((n) => toast('Saved ' + n)); };

  /* gallery */
  let galUrls = [], viewRec = null, viewUrl = null;
  async function renderGallery() {
    let list = []; try { list = await IGStore.list(); } catch (_) { /* no IndexedDB */ }
    galUrls.forEach((u) => URL.revokeObjectURL(u)); galUrls = [];
    const g = $('gal'); g.innerHTML = '';
    $('gal-empty').hidden = list.length > 0; $('gal-n').textContent = list.length ? list.length + ' / ' + IGStore.MAX : '';
    list.forEach((r) => {
      const b = document.createElement('button'), im = document.createElement('img'), u = URL.createObjectURL(r.blob);
      galUrls.push(u); im.src = u; im.alt = r.prompt; im.loading = 'lazy'; b.title = r.prompt; b.appendChild(im);
      b.onclick = () => openViewer(r); g.appendChild(b);
    });
  }
  function openViewer(r) {
    viewRec = r; if (viewUrl) URL.revokeObjectURL(viewUrl); viewUrl = URL.createObjectURL(r.blob);
    $('v-img').src = viewUrl; $('v-prompt').textContent = r.prompt;
    $('v-info').textContent = new Date(r.ts).toLocaleString() + ' · ' + r.w + '×' + r.h + ' · ' + r.steps + ' steps · ' + r.model;
    $('viewer').hidden = false;
  }
  function closeViewer() { $('viewer').hidden = true; viewRec = null; }
  $('v-close').onclick = closeViewer;
  $('viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') closeViewer(); });
  $('v-save').onclick = () => { if (viewRec) IGSave.save(viewRec.blob, IGSave.fileName(viewRec.prompt)).then((n) => toast('Saved ' + n)); };
  $('v-reuse').onclick = () => {
    if (!viewRec) return;
    pr.value = P.prompt = viewRec.prompt;
    const sz = Object.keys(SIZES).find((k) => SIZES[k][0] === viewRec.w && SIZES[k][1] === viewRec.h); if (sz) P.size = sz;
    P.steps = viewRec.steps || P.steps; saveP(); renderSeg(); renderSteps(); closeViewer(); go(0);
  };
  $('v-del').onclick = async () => {
    if (!viewRec) return; const r = viewRec; $('viewer').hidden = true;
    if (await dialog('Delete image?', '<p>This removes it from the gallery on this device.</p>', true)) { await IGStore.del(r.id); renderGallery(); toast('Deleted'); }
    else openViewer(r);
  };

  /* screens + swipes (75 px, wrap-around, left = next) */
  const N = 3, track = $('track'), app = $('app'), dots = [...document.querySelectorAll('#dots i')];
  let cur = 0;
  function place(dx) { track.style.transform = 'translateX(calc(' + (-cur * 100) + '% + ' + dx + 'px))'; }
  function go(i) { cur = (i + N) % N; place(0); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); }
  const noSwipe = (el) => el.closest && el.closest('input, textarea, select, .noswipe, .seg, button, #dialog, #viewer');
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (!$('dialog').hidden || !$('viewer').hidden || (e.pointerType === 'mouse' && e.button !== 0) || noSwipe(e.target)) { g = null; return; }
    g = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId };
  });
  app.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis && (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') { track.classList.add('drag'); place(dx); }
  });
  function end(e, cancel) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null; track.classList.remove('drag');
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1)); else place(0);
  }
  app.addEventListener('pointerup', (e) => end(e, false));
  app.addEventListener('pointercancel', (e) => end(e, true));
  addEventListener('keydown', (e) => {
    if (!$('dialog').hidden) { if (e.key === 'Escape') closeDlg(false); if (e.key === 'Enter') closeDlg(true); return; }
    if (!$('viewer').hidden) { if (e.key === 'Escape') closeViewer(); return; }
    if (e.target.closest && e.target.closest('input, textarea, select')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target === pr) $('gen-btn').click();
      return;
    }
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('storage', (e) => {
    if (e.key === 'sites-hub.theme') theme();
    if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); renderSteps(); renderModelLabel(); }
  });

  go(0); renderSeg(); renderSteps(); renderModelLabel(); fillSelect(); renderGallery(); loadModels(false);
  window.IGApp = { go, get screen() { return cur; } };
})();
