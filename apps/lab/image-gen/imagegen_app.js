/* Image Gen IG4 app: screens, swipes, settings, theme, generate flow (text or start photo), gallery,
   upscale 2×, compare slider, Send to Gallery.
   Settings in 'imagegen-settings-v1': { theme, url, model, size, steps, prompt, sharpen, engine, seed }. IG4: engine 'ollama' | 'online' (Pollinations). */
(function () {
  'use strict';
  const SKEY = 'imagegen-settings-v1', SWIPE = 75, TAP_MOVE = 10;
  const SIZES = { square: [1024, 1024], portrait: [768, 1024], landscape: [1024, 768] };
  const ORIGIN = 'https://jor-teron.github.io';
  const $ = (id) => document.getElementById(id);
  // const P = { theme: 'dark', url: 'http://localhost:11434', model: '', size: 'square', steps: 8, prompt: '', sharpen: 'on' };  (IG3)
  const P = { theme: 'dark', url: 'http://localhost:11434', model: '', size: 'square', steps: 8, prompt: '', sharpen: 'on', engine: 'ollama', seed: '' };
  const isOn = () => P.engine === 'online';
  const IGNORED = 0.3; /* grey-correlation below this = the result does not look like the start photo */
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
    if (e.kind === 'noedit') return dialog('Start photo not supported',
      '<p>Ollama said: <i>' + esc(e.message) + '</i></p><p><b>Ollama doesn\u2019t support start photos (image-to-image) for this model yet.</b> Remove the start photo to make a picture from the prompt alone.</p>' +
      '<p class="mut">Only <code>x/flux2-klein</code> ever took a start photo, in Ollama 0.15.1\u20130.15.4 on macOS.</p>');
    if (e.kind === 'nomodel') return dialog('Model not found', '<p>' + esc(e.message) + '</p><p>Download one with <code>ollama pull x/z-image-turbo</code>, then tap ↻ in Settings.</p>');
    if (e.kind === 'noimage') return dialog('No image came back', '<p>' + esc(e.message) + '</p><p>Image models: <code>x/z-image-turbo</code>, <code>x/flux2-klein</code>.</p>');
    return dialog('Something went wrong', '<p>' + esc(e.message || e) + '</p>');
  }
  /* IG4: online (Pollinations) errors */
  function explainOn(e) {
    if (e.kind === 'limit') return dialog('Free limit reached', '<p>Pollinations allows one free image at a time, at least 45 s apart, per network. Try again in about ' + (+e.retry || 45) + ' s.</p>');
    if (e.kind === 'unreachable') return dialog('Can\u2019t reach Pollinations', '<p>Could not reach <code>image.pollinations.ai</code>. Check the connection, or switch the engine to Ollama.</p>');
    if (e.kind === 'refused') return dialog('Prompt refused', '<p>Pollinations refused this prompt (safety filter).</p><p class="mut"><i>' + esc(e.message) + '</i></p>');
    return dialog('Online generator error', '<p>' + esc(e.message || e) + '</p><p class="mut">The free service is best effort; try again later or use Ollama.</p>');
  }
  /* IG4: engine view — start photo + steps are Ollama only */
  function renderEngine() {
    const on = isOn();
    $('online-note').hidden = !on; $('seed-f').hidden = !on; $('steps-f').hidden = on; $('src-f').hidden = on; $('model-lf').hidden = on;
    if (on) { $('src-box').hidden = $('src-note').hidden = true; } else renderSrc();
    $('size-photo').hidden = on || !src;
  }

  /* segmented controls */
  function renderSeg() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v))); }
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); renderSeg();
    if (g.dataset.key === 'engine') renderEngine();
    if (g.dataset.key === 'size') renderSrc();
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
    $('out-info').textContent = (meta.kind === 'edit' ? 'From start photo · ' : meta.kind === 'up' ? 'Upscaled 2× · ' : '') + meta.w + '×' + meta.h + ' · ' + (meta.engine === 'online' ? 'seed ' + meta.seed : meta.steps + ' steps') + ' · ' + meta.model + (meta.secs ? ' · ' + meta.secs + ' s' : '');
    $('ba-btn').hidden = !meta.src;
  }
  /* start photo (image-to-image): Add photo, drop, paste, or "Use as start" */
  let src = null, srcUrl = null;
  async function setSrc(blob) {
    if (!blob) return;
    try { src = await IGEdit.loadPhoto(blob); } catch (e) { dialog('Can\u2019t use that picture', '<p>' + esc(e.message || e) + '</p>'); return; }
    P.size = 'photo'; saveP(); renderSrc(); renderSeg(); go(0); toast('Start photo set');
  }
  function clearSrc() { src = null; if (P.size === 'photo') { P.size = 'square'; saveP(); } renderSrc(); renderSeg(); }
  function renderSrc() {
    if (srcUrl) { URL.revokeObjectURL(srcUrl); srcUrl = null; }
    $('src-box').hidden = $('src-note').hidden = $('size-photo').hidden = !src;
    $('src-add').textContent = src ? 'Change' : 'Add photo';
    if (src) {
      srcUrl = URL.createObjectURL(src.blob); $('src-img').src = srcUrl;
      $('src-info').textContent = src.w + '\u00d7' + src.h + ' \u2192 makes ' + src.gw + '\u00d7' + src.gh;
      $('size-photo').title = 'Match the start photo (' + src.gw + '\u00d7' + src.gh + ')';
    } else if (P.size === 'photo') { P.size = 'square'; }
  }
  const sizeWH = () => (P.size === 'photo' && src ? [src.gw, src.gh] : SIZES[P.size] || SIZES.square);
  $('src-add').onclick = () => $('src-file').click();
  $('src-file').onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) setSrc(f); };
  $('src-del').onclick = clearSrc;
  const appEl = $('app');
  const imgFile = (list) => [...(list || [])].find((f) => f && /^image\//.test(f.type));
  appEl.addEventListener('dragover', (e) => { if ([...(e.dataTransfer.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); appEl.classList.add('dragover'); } });
  appEl.addEventListener('dragleave', (e) => { if (e.target === appEl || !appEl.contains(e.relatedTarget)) appEl.classList.remove('dragover'); });
  appEl.addEventListener('drop', (e) => {
    appEl.classList.remove('dragover'); const f = imgFile(e.dataTransfer.files);
    if (f) { e.preventDefault(); setSrc(f); } else if (e.dataTransfer.files.length) { e.preventDefault(); toast('Drop a picture file'); }
  });
  addEventListener('paste', (e) => {
    if (!$('dialog').hidden) return;
    const f = imgFile([...(e.clipboardData && e.clipboardData.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()));
    if (f) { e.preventDefault(); setSrc(f); }
  });

  const seedEl = $('seed'); seedEl.value = P.seed || '';
  seedEl.addEventListener('change', () => { P.seed = seedEl.value.trim(); saveP(); });
  /* IG4: online generate — spinner only, Cancel via AbortController; saved like Ollama results with engine 'online' */
  async function genOnline(prompt) {
    const left = IGOnline.waitLeft();
    if (left) { dialog('Please wait', '<p>The free online generator allows one image every 45 s. Try again in ' + left + ' s.</p>'); return; }
    const wh = P.size === 'photo' ? IGOnline.SIZES.square : (IGOnline.SIZES[P.size] || IGOnline.SIZES.square), t0 = Date.now();
    ac = new AbortController(); busy(true); $('prog-t').textContent = 'Generating online (Pollinations)\u2026';
    try {
      const r = await IGOnline.generate({ prompt, width: wh[0], height: wh[1], seed: P.seed, signal: ac.signal });
      const meta = { prompt, model: IGOnline.name, engine: 'online', seed: r.seed, w: r.w, h: r.h, steps: 0, secs: Math.round((Date.now() - t0) / 1000) };
      showResult(r.blob, meta);
      try { meta.id = await IGStore.add(Object.assign({ blob: r.blob }, meta)); renderGallery(); } catch (_) { toast('Could not keep it in the gallery (storage full?)'); }
    } catch (e) {
      if (e && e.name === 'AbortError') toast('Cancelled'); else explainOn(e);
    } finally { ac = null; busy(false); }
  }
  $('gen-btn').onclick = async () => {
    const prompt = pr.value.trim();
    if (isOn()) { if (!prompt) { dialog('Add a prompt', '<p>Describe the picture you want first.</p>'); pr.focus(); return; } return genOnline(prompt); }
    if (!prompt) { dialog('Add a prompt', '<p>Describe the picture you want' + (src ? ', or what to change in the start photo,' : '') + ' first.</p>'); pr.focus(); return; }
    if (!P.model) {
      const ok = await loadModels(true);
      if (!ok || !P.model) return;
    }
    const [w, h] = sizeWH(), t0 = Date.now(), s0 = src;  /* Ollama path unchanged; records engine below */
    ac = new AbortController(); busy(true);
    try {
      const r = await IGOllama.generate({ url: P.url, model: P.model, prompt, width: w, height: h, steps: P.steps, signal: ac.signal, images: s0 ? [s0.b64] : null,
        onProgress: (c, t) => { $('bar').parentNode.classList.remove('ind'); $('bar').style.width = Math.min(100, c / t * 100) + '%'; $('prog-t').textContent = 'Step ' + c + ' / ' + t; } });
      const blob = IGOllama.b64ToBlob(r.b64), meta = { prompt, model: P.model, w, h, steps: P.steps, secs: Math.round((Date.now() - t0) / 1000), engine: 'ollama' };
      if (s0) { meta.kind = 'edit'; meta.src = s0.blob; }
      showResult(blob, meta);
      try { meta.id = await IGStore.add(Object.assign({ blob }, meta)); renderGallery(); } catch (_) { toast('Could not keep it in the gallery (storage full?)'); }
      if (s0) {
        let sim = 1; try { sim = await IGEdit.similarity(s0.blob, blob); } catch (_) { /* can't tell */ }
        meta.sim = sim;
        if (sim < IGNORED) dialog('Ollama ignored the start photo',
          '<p>The picture came back, but it doesn\u2019t look like your start photo, so this Ollama made a brand-new image from the prompt.</p>' +
          '<p><b>Ollama doesn\u2019t support start photos (image-to-image) yet.</b> It accepts <code>images</code> but ignores them in 0.15.5\u20130.32.5, and 0.32.6+ has image generation off.</p>' +
          '<p class="mut">Check with Before / after. (Guess from a similarity score of ' + sim.toFixed(2) + '; big edits can fool it.)</p>');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') toast('Cancelled'); else explain(e);
    } finally { ac = null; busy(false); }
  };
  $('cancel-btn').onclick = () => { if (ac) ac.abort(); };
  $('save-btn').onclick = () => { if (curBlob) IGSave.save(curBlob, IGSave.fileName(curMeta && curMeta.prompt, tagOf(curMeta))).then((n) => toast('Saved ' + n)); };
  $('send-btn').onclick = () => { if (curBlob) sendToGallery(curBlob, curMeta); };
  $('up-btn').onclick = () => { if (curBlob) upscale(curBlob, curMeta, curMeta && curMeta.id); };
  $('tostart-btn').onclick = () => { if (curBlob) setSrc(curBlob); };
  $('ba-btn').onclick = () => { if (curMeta && curMeta.src) openCompare(curMeta.src, curBlob, 'Before', 'After'); };

  /* upscale 2× on this device -> new gallery item */
  const tagOf = (m) => (m && m.kind === 'up' ? 'x2' : m && m.kind === 'edit' ? 'edit' : '');
  let upBusy = false;
  async function upscale(blob, meta, fromId) {
    if (upBusy) return; upBusy = true; toast('Upscaling 2\u00d7\u2026');
    try {
      const r = await IGEdit.upscale2x(blob, P.sharpen !== 'off');
      const rec = { blob: r.blob, prompt: (meta && meta.prompt) || '', model: (meta && meta.model) || '', w: r.w, h: r.h, steps: (meta && meta.steps) || 0, kind: 'up' };
      if (fromId != null) rec.from = fromId;
      let id = null; try { id = await IGStore.add(rec); } catch (_) { toast('Could not keep it in the gallery (storage full?)'); }
      await renderGallery();
      const saved = id != null ? await IGStore.get(id) : null;
      if (saved) { go(1); openViewer(saved); }
      toast('Upscaled to ' + r.w + '\u00d7' + r.h + (saved ? ' \u2014 new gallery image' : ''));
    } catch (e) {
      dialog(e.kind === 'toobig' ? 'Already big' : 'Couldn\u2019t upscale', '<p>' + esc(e.message || e) + '</p>');
    } finally { upBusy = false; }
  }

  /* Send to Gallery: Gallery keeps no shared store (it shows a folder/files you open), so save + explain */
  function sendToGallery(blob, meta) {
    IGSave.toGallery(blob, meta && meta.prompt, tagOf(meta)).then((n) => dialog('Saved for Gallery',
      '<p>Saved <b>' + esc(n) + '</b> to your Downloads.</p>' +
      '<p>Gallery shows pictures from a folder on this device. In Gallery tap <b>Open folder</b> and pick your Downloads folder (or <b>Files</b> and pick this image). If Gallery already remembers that folder, the picture shows next time you open it.</p>' +
      '<p><a href="../../media/gallery/gallery.html" target="_blank" rel="noopener">Open Gallery \u2197</a></p>'));
  }

  /* compare: two images on top of each other, slider reveals B on the right */
  const cmp = { a: null, b: null, ua: null, ub: null, x: 50, la: '', lb: '' };
  function cmpPlace() {
    $('c-b').style.clipPath = 'inset(0 0 0 ' + cmp.x + '%)'; $('c-line').style.left = cmp.x + '%'; $('c-range').value = cmp.x;
  }
  async function openCompare(a, b, la, lb) {
    closeViewer();
    [cmp.ua, cmp.ub].forEach((u) => u && URL.revokeObjectURL(u));
    Object.assign(cmp, { a, b, la, lb, x: 50, ua: URL.createObjectURL(a), ub: URL.createObjectURL(b) });
    let d = { w: 1, h: 1 }; try { d = await IGEdit.size(b); } catch (_) { /* */ }
    const wrap = $('c-wrap'); wrap.style.aspectRatio = d.w + ' / ' + d.h;
    wrap.style.width = 'min(100%, calc(78vh * ' + (d.w / d.h).toFixed(4) + '))'; wrap.style.margin = '0 auto';
    $('c-a').src = cmp.ua; $('c-b').src = cmp.ub; $('c-la').textContent = la; $('c-lb').textContent = lb;
    cmpPlace(); $('compare').hidden = false;
  }
  function closeCompare() { $('compare').hidden = true; [cmp.ua, cmp.ub].forEach((u) => u && URL.revokeObjectURL(u)); cmp.ua = cmp.ub = null; }
  $('c-close').onclick = closeCompare;
  $('compare').addEventListener('click', (e) => { if (e.target.id === 'compare') closeCompare(); });
  $('c-range').addEventListener('input', (e) => { cmp.x = +e.target.value; cmpPlace(); });
  $('c-swap').onclick = () => { const { a, b, la, lb } = cmp; openCompare(b, a, lb, la); };
  let cdrag = null;
  const cset = (e) => { const r = $('c-wrap').getBoundingClientRect(); cmp.x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)); cmpPlace(); };
  $('c-wrap').addEventListener('pointerdown', (e) => { cdrag = e.pointerId; try { $('c-wrap').setPointerCapture(e.pointerId); } catch (_) { /* */ } cset(e); e.preventDefault(); });
  $('c-wrap').addEventListener('pointermove', (e) => { if (cdrag === e.pointerId) cset(e); });
  const cend = (e) => { if (cdrag === e.pointerId) cdrag = null; };
  $('c-wrap').addEventListener('pointerup', cend); $('c-wrap').addEventListener('pointercancel', cend);

  /* gallery */
  let galUrls = [], viewRec = null, viewUrl = null, picking = false, picks = [];
  function setPicking(on) {
    picking = on; picks = []; $('cmp-btn').textContent = on ? 'Cancel' : 'Compare'; $('cmp-hint').hidden = !on;
    $('gal').classList.toggle('picking', on); document.querySelectorAll('#gal button.sel').forEach((b) => { b.classList.remove('sel'); });
  }
  $('cmp-btn').onclick = () => setPicking(!picking);
  function pick(r, b) {
    const i = picks.findIndex((p) => p.r.id === r.id);
    if (i >= 0) { picks.splice(i, 1); b.classList.remove('sel'); } else { picks.push({ r, b }); b.classList.add('sel'); }
    picks.forEach((p, k) => { p.b.dataset.n = k + 1; });
    if (picks.length === 2) {
      const [x, y] = picks; setPicking(false);
      const lab = (q) => (q.kind === 'up' ? '2\u00d7 ' : q.kind === 'edit' ? 'Edit ' : '') + q.w + '\u00d7' + q.h;
      openCompare(x.r.blob, y.r.blob, '1 \u00b7 ' + lab(x.r), '2 \u00b7 ' + lab(y.r));
    }
  }
  async function renderGallery() {
    let list = []; try { list = await IGStore.list(); } catch (_) { /* no IndexedDB */ }
    galUrls.forEach((u) => URL.revokeObjectURL(u)); galUrls = [];
    const g = $('gal'); g.innerHTML = '';
    $('gal-empty').hidden = list.length > 0; $('gal-n').textContent = list.length ? list.length + ' / ' + IGStore.MAX : '';
    list.forEach((r) => {
      const b = document.createElement('button'), im = document.createElement('img'), u = URL.createObjectURL(r.blob);
      galUrls.push(u); im.src = u; im.alt = r.prompt; im.loading = 'lazy'; b.title = r.prompt; b.appendChild(im);
      if (r.kind) { const t = document.createElement('span'); t.className = 'bdg'; t.textContent = r.kind === 'up' ? '2\u00d7' : 'edit'; b.appendChild(t); }
      b.onclick = () => (picking ? pick(r, b) : openViewer(r)); g.appendChild(b);
    });
  }
  function openViewer(r) {
    viewRec = r; if (viewUrl) URL.revokeObjectURL(viewUrl); viewUrl = URL.createObjectURL(r.blob);
    $('v-img').src = viewUrl; $('v-prompt').textContent = r.prompt;
    $('v-info').textContent = new Date(r.ts).toLocaleString() + ' · ' + (r.kind === 'up' ? 'upscaled 2× · ' : r.kind === 'edit' ? 'from start photo · ' : '') + r.w + '×' + r.h + ' · ' + (r.engine === 'online' ? 'seed ' + r.seed : r.steps + ' steps') + ' · ' + r.model;
    $('v-ba').hidden = !r.src;
    $('viewer').hidden = false;
  }
  function closeViewer() { $('viewer').hidden = true; viewRec = null; }
  $('v-close').onclick = closeViewer;
  $('viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') closeViewer(); });
  $('v-save').onclick = () => { if (viewRec) IGSave.save(viewRec.blob, IGSave.fileName(viewRec.prompt, tagOf(viewRec))).then((n) => toast('Saved ' + n)); };
  $('v-send').onclick = () => { if (viewRec) { const r = viewRec; closeViewer(); sendToGallery(r.blob, r); } };
  $('v-up').onclick = () => { if (viewRec) { const r = viewRec; closeViewer(); upscale(r.blob, r, r.id); } };
  $('v-start').onclick = () => { if (viewRec) { const r = viewRec; closeViewer(); setSrc(r.blob); } };
  $('v-ba').onclick = () => { if (viewRec && viewRec.src) openCompare(viewRec.src, viewRec.blob, 'Before', 'After'); };
  $('v-reuse').onclick = () => {
    if (!viewRec) return;
    pr.value = P.prompt = viewRec.prompt;
    const sz = Object.keys(SIZES).find((k) => SIZES[k][0] === viewRec.w && SIZES[k][1] === viewRec.h); if (sz && P.size !== 'photo') P.size = sz;
    P.steps = viewRec.steps || P.steps; if (viewRec.engine === 'online') { P.engine = 'online'; P.seed = String(viewRec.seed); seedEl.value = P.seed; } saveP(); renderEngine(); renderSeg(); renderSteps(); closeViewer(); go(0);
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
  const noSwipe = (el) => el.closest && el.closest('input, textarea, select, .noswipe, .seg, button, a, #dialog, #viewer, #compare');
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (!$('dialog').hidden || !$('viewer').hidden || !$('compare').hidden || (e.pointerType === 'mouse' && e.button !== 0) || noSwipe(e.target)) { g = null; return; }
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
    if (!$('compare').hidden) {
      if (e.key === 'Escape') closeCompare();
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.id !== 'c-range') { cmp.x = Math.max(0, Math.min(100, cmp.x + (e.key === 'ArrowLeft' ? -5 : 5))); cmpPlace(); }
      return;
    }
    if (!$('viewer').hidden) { if (e.key === 'Escape') closeViewer(); return; }
    if (picking && e.key === 'Escape') { setPicking(false); return; }
    if (e.target.closest && e.target.closest('input, textarea, select')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target === pr) $('gen-btn').click();
      return;
    }
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('storage', (e) => {
    if (e.key === 'sites-hub.theme') theme();
    if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); renderSteps(); renderModelLabel(); renderEngine(); }
  });

  // renderSrc(); go(0); renderSeg(); renderSteps(); renderModelLabel(); fillSelect(); renderGallery(); loadModels(false);  (IG3)
  renderSrc(); go(0); renderSeg(); renderSteps(); renderModelLabel(); fillSelect(); renderEngine(); renderGallery(); loadModels(false);
  window.IGApp = { go, get screen() { return cur; }, setSrc, get src() { return src; }, openCompare };
})();
