/* Vision VS2 + VI-F1 app: screens, swipes, settings, theme, photo intake, streamed chat about one photo, history.
   Settings in 'vision-settings-v1': { theme, url, model, mode, engine, gmode, gkey }. VS2: engine 'gcv' (Cloud Vision) | 'ollama'. */
(function () {
  'use strict';
  const SKEY = 'vision-settings-v1', SWIPE = 75, TAP_MOVE = 10, MAXPX = 1024;
  const ORIGIN = 'https://jor-teron.github.io';
  const MODES = {
    describe: { label: 'Describe', text: 'Describe this image in detail: the main subject, the setting, notable objects and people, colours, and anything unusual or interesting. Use short paragraphs.' },
    ocr: { label: 'Read text', text: 'Read all the text in this image exactly as written, keeping line breaks and reading order. Output only the text, nothing else. If there is no readable text, reply exactly: No text found.' },
    prompt: { label: 'Image prompt', text: 'Write ONE detailed prompt for a text-to-image model that would recreate this image. Cover the main subject, setting, art style or medium, lighting, colours, mood, camera angle and composition. Output only the prompt as a single paragraph: no preamble, no quotes, no lists.' },
    ask: { label: 'Ask', text: '' },
  };
  const $ = (id) => document.getElementById(id);
  // const P = { theme: 'dark', url: 'http://localhost:11434', model: '', mode: 'describe' };  (VS1)
  const P = { theme: 'dark', url: 'http://localhost:11434', model: '', mode: 'describe', engine: '', gmode: 'labels', gkey: '' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* */ }
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };

  /* theme: System follows the hub pref, then the device */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let h = null; try { h = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = h === 'dark' || h === 'light' ? h === 'dark' : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);

  /* dialogs + toast (never alert). html is our own strings; anything from outside goes through esc(). */
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
  const PULL = '<p>Get one with <code>ollama pull llama3.2-vision</code> (or <code>ollama pull gemma3</code>), then tap \u21bb in Settings.</p>';
  function explain(e) {
    if (e.kind === 'unreachable') return dialog('Can\u2019t reach Ollama',
      '<p>Nothing answered at <code>' + esc(VSOllama.base(P.url)) + '</code>, or the browser blocked it (CORS).</p>' +
      '<p>Make sure Ollama is running, and start it so this site may call it:</p><p><code>OLLAMA_ORIGINS=' + ORIGIN + ' ollama serve</code></p>' +
      '<p class="mut">On a Mac app install: <code>launchctl setenv OLLAMA_ORIGINS "' + ORIGIN + '"</code>, then restart Ollama. Check the URL in Settings.</p>');
    if (e.kind === 'novision') return dialog('This model can\u2019t see images', '<p>Ollama said: <i>' + esc(e.message) + '</i></p><p>Pick a vision model in Settings.</p>' + PULL);
    if (e.kind === 'nomodel') return dialog('Model not found', '<p>' + esc(e.message) + '</p>' + PULL);
    if (e.kind === 'blind') return dialog('The model ignored the photo', '<p><b>' + esc(P.model) + '</b> answered as if no picture was attached:</p><p class="mut"><i>' + esc(e.message) + '</i></p><p>It is probably a text-only model. Choose a vision model in Settings.</p>' + PULL);
    if (e.kind === 'empty') return dialog('No answer came back', '<p>' + esc(e.message) + ' Try again, or pick another model in Settings.</p>');
    return dialog('Something went wrong', '<p>' + esc(e.message || e) + '</p>');
  }
  /* VS2: Cloud Vision errors */
  function explainG(e) {
    const inHub = !!VSGcv.hub(), where = inHub ? 'Hub \u203a Settings \u203a API Keys (<code>gvision</code>)' : 'Vision \u203a Settings \u203a Cloud Vision key';
    const tail = '<p>Fix it in ' + where + '.' + (inHub ? '' : ' Or switch the engine to Ollama.') + '</p>';
    const T = {
      nokey: ['No Cloud Vision key', '<p>Add a Google Cloud Vision API key, or switch the engine to Ollama.</p>'],
      invalid: ['Key not valid', '<p>Google says this is not a valid API key.</p>'],
      disabled: ['Cloud Vision API not enabled', '<p>The key is fine, but the Cloud Vision API is not enabled in its Google Cloud project.</p>'],
      billing: ['Billing not enabled', '<p>Cloud Vision needs a billing account on the key\u2019s project (the first ~1,000 units a month per feature are free).</p>'],
      blocked: ['Key not allowed here', '<p>The key is restricted: allow this site under Application restrictions, and Cloud Vision under API restrictions.</p>'],
      quota: ['Quota used up', '<p>The Vision quota is used up for now (429). Try later or check quotas in Google Cloud.</p>'],
      unreachable: ['Can\u2019t reach Cloud Vision', '<p>Could not reach vision.googleapis.com. Check the connection.</p>'],
    }[e.kind] || ['Cloud Vision error', '<p>' + esc(e.message || e) + '</p>'];
    const extra = e.message && e.kind !== 'http' && e.kind !== 'nokey' ? '<p class="mut"><i>' + esc(e.message) + '</i></p>' : '';
    return dialog(T[0], T[1] + extra + tail, inHub).then((ok) => { if (ok && inHub) VSGcv.openHub(); });
  }
  const gKey = () => VSGcv.hubKey() || P.gkey || '';
  const isG = () => P.engine === 'gcv';
  const noVision = () => dialog('No vision model', '<p>This Ollama has no model that can look at pictures.</p>' + PULL + '<p class="mut">Or type a model name under Settings \u2192 Vision model \u2192 Other.</p>');

  /* segmented controls */
  function renderSeg() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v))); }
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); renderSeg(); renderEngine(); renderGo();
    if (g.dataset.key === 'mode' && P.mode === 'ask') $('q').focus();
  }));

  /* models */
  const sel = $('model-s'), cust = $('model-c'), CUSTOM = '__custom__';
  let modelList = [];
  function renderModelLabel() { $('model-l').textContent = P.model || 'none \u2014 open Settings'; $('model-l').title = P.model; }
  function fillSelect() {
    sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    modelList.forEach((m) => add(m.name, m.name + (m.vision === true ? '  (vision)' : m.vision === null ? '  (vision?)' : '  (text)')));
    add(CUSTOM, 'Other (type a name)\u2026');
    const known = modelList.some((m) => m.name === P.model);
    sel.value = known ? P.model : CUSTOM;
    $('custom-f').hidden = known; cust.value = known ? '' : P.model;
  }
  // const setModel = (m) => { P.model = m; saveP(); renderModelLabel(); };  (VS1)
  const setModel = (m) => { P.model = m; saveP(); renderModelLabel(); fillMain(); };
  /* VS2: Ollama model select on the main screen (Settings select stays as is) */
  const msel = $('model-m');
  function fillMain() {
    msel.innerHTML = '';
    const names = modelList.filter((m) => m.vision !== false).map((m) => m.name);
    if (P.model && !names.includes(P.model)) names.unshift(P.model);
    if (!names.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'none \u2014 open Settings'; msel.appendChild(o); }
    names.forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; msel.appendChild(o); });
    msel.value = P.model || '';
  }
  msel.addEventListener('change', () => { if (msel.value) { setModel(msel.value); fillSelect(); } });
  /* VS2: engine view */
  function renderEngine() {
    const g = isG();
    $('gmode').hidden = !g; $('omode').hidden = g; $('model-mf').hidden = g; $('model-lf').hidden = g;
    $('priv').textContent = g ? 'Cloud Vision sends the photo to Google (about 1,000 free units a month per feature).' : 'Ollama runs on your own network; the photo stays there.';
    renderKeyLine();
  }
  function renderKeyLine() {
    const t = $('gkey-t'), hk = VSGcv.hubKey();
    if (VSGcv.hub()) {
      t.innerHTML = hk ? 'Using the Hub\u2019s key. <button id="gkey-open" class="btn sm">Open</button>' : 'Not in Hub keys \u2014 the field above is used. <button id="gkey-open" class="btn sm">Add in Hub</button>';
      $('gkey-open').onclick = () => VSGcv.openHub();
    } else t.textContent = 'Standalone: the key is kept on this device only.';
    $('gkey').disabled = !!hk;
  }
  const gk = $('gkey'); gk.value = P.gkey || '';
  gk.addEventListener('change', () => { P.gkey = gk.value.trim(); saveP(); if (!P.engine) pickEngine(); });
  function pickEngine() { if (!P.engine) { P.engine = gKey() ? 'gcv' : 'ollama'; saveP(); } renderSeg(); renderEngine(); renderGo(); }
  sel.addEventListener('change', () => {
    if (sel.value === CUSTOM) { $('custom-f').hidden = false; cust.focus(); return; }
    $('custom-f').hidden = true; setModel(sel.value);
  });
  cust.addEventListener('change', () => setModel(cust.value.trim()));
  let lastErr = null;
  async function loadModels(showErr) {
    $('models-t').textContent = 'Loading models\u2026';
    try {
      modelList = await VSOllama.models(P.url); lastErr = null;
      const vis = modelList.filter((m) => m.vision !== false);
      if (!P.model || !modelList.some((m) => m.name === P.model)) { if (vis[0]) setModel(vis[0].name); }
      $('models-t').textContent = modelList.length ? vis.length + ' vision model' + (vis.length === 1 ? '' : 's') + ' of ' + modelList.length + ' installed.' : 'No models installed.';
      fillSelect(); fillMain();
      if (showErr && !vis.length && !P.model) noVision();
      return true;
    } catch (e) {
      lastErr = e; $('models-t').textContent = 'Could not load models.'; fillSelect();
      if (showErr) explain(e);
      return false;
    }
  }
  const url = $('url'); url.value = P.url;
  url.addEventListener('change', () => { P.url = url.value.trim() || 'http://localhost:11434'; url.value = P.url; saveP(); loadModels(true); });
  $('refresh-btn').onclick = () => loadModels(true);

  /* photo intake: downscale to ~1024 px JPEG */
  let S = null; /* session: { id, img: Blob, b64, url, messages:[{role, content, label?, images?}], mode, model } */
  const blobToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  async function shrink(blob) {
    const bmp = await createImageBitmap(blob), k = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  }
  async function openSession(rec) {
    if (S && S.url) URL.revokeObjectURL(S.url);
    S = { id: rec.id, img: rec.img, b64: await blobToB64(rec.img), url: URL.createObjectURL(rec.img), messages: rec.messages || [], mode: rec.mode, model: rec.model, engine: rec.engine || 'ollama' };
    $('photo').src = S.url; $('thumb').src = S.url; $('thumb').hidden = false; $('view').hidden = false; $('empty').hidden = true;
    renderChat(); renderGo(); go(0);
  }
  async function takePhoto(file) {
    if (busyNow()) return;
    if (!file || !/^image\//.test(file.type || 'image/')) { dialog('Not an image', '<p>Pick a photo or picture file.</p>'); return; }
    let img; try { img = await shrink(file); } catch (_) { dialog('Can\u2019t read that image', '<p>This browser could not open it. Try a JPG, PNG or WebP.</p>'); return; }
    await openSession({ id: undefined, img, messages: [] });
    // if (P.mode !== 'ask') run();  (VS1)
    if (isG() || P.mode !== 'ask') run(); else { $('q').focus(); toast('Type your question, then Ask'); }
  }
  const pfile = $('pfile'), cfile = $('cfile');
  // const pick = () => { if (!busyNow()) { pfile.value = ''; pfile.click(); } }, cam = () => { if (!busyNow()) { cfile.value = ''; cfile.click(); } };  (VS1)
  const pick = () => { if (!busyNow()) { pfile.value = ''; pfile.click(); } };
  const camFile = () => { cfile.value = ''; cfile.click(); };
  /* VI-F1: live camera (getUserMedia) with Capture / Switch / Cancel; falls back to the capture file input */
  const camV = $('cam-v');
  let camStream = null, camFacing = 'environment', camIds = [], camIdx = -1;
  const camOk = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  function camStop() { if (camStream) camStream.getTracks().forEach((t) => t.stop()); camStream = null; camV.srcObject = null; }
  function camClose() { camStop(); $('cam').hidden = true; }
  async function camStart() {
    camStop();
    const video = camIdx >= 0 && camIds[camIdx] ? { deviceId: { exact: camIds[camIdx] } } : { facingMode: camFacing };
    camStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    camV.srcObject = camStream; try { await camV.play(); } catch (_) { /* autoplay */ }
    try { camIds = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').map((d) => d.deviceId); } catch (_) { camIds = []; }
    $('cam-sw').hidden = camIds.length < 2;
  }
  async function cam() {
    if (busyNow()) return;
    if (!camOk()) { camFile(); return; }
    $('cam').hidden = false;
    try { await camStart(); }
    catch (e) {
      camClose();
      const n = e && e.name;
      toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Camera not allowed \u2014 opening the photo picker' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No camera found \u2014 opening the photo picker' : 'Camera unavailable \u2014 opening the photo picker');
      camFile();
    }
  }
  $('cam-no').onclick = camClose;
  $('cam-sw').onclick = async () => {
    if (camIds.length > 1) { const curId = camStream && camStream.getVideoTracks()[0] && camStream.getVideoTracks()[0].getSettings().deviceId; camIdx = (Math.max(0, camIds.indexOf(curId)) + 1) % camIds.length; }
    else { camFacing = camFacing === 'environment' ? 'user' : 'environment'; camIdx = -1; }
    try { await camStart(); } catch (_) { toast('Could not switch camera'); camIdx = -1; try { await camStart(); } catch (_e) { camClose(); } }
  };
  $('cam-shot').onclick = () => {
    const w = camV.videoWidth, h = camV.videoHeight; if (!w || !h) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(camV, 0, 0, w, h);
    c.toBlob((b) => { camClose(); if (b) takePhoto(new File([b], 'camera.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
  };
  addEventListener('keydown', (e) => { if (!$('cam').hidden) { e.stopImmediatePropagation(); if (e.key === 'Escape') camClose(); else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('cam-shot').click(); } } }, true);
  addEventListener('pagehide', camStop);
  $('pick-btn').onclick = $('pick-btn2').onclick = pick; $('cam-btn').onclick = $('cam-btn2').onclick = cam;
  pfile.addEventListener('change', () => takePhoto(pfile.files[0]));
  cfile.addEventListener('change', () => takePhoto(cfile.files[0]));
  const lp = $('pane-look');
  lp.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); lp.classList.add('over'); } });
  lp.addEventListener('dragleave', (e) => { if (!lp.contains(e.relatedTarget)) lp.classList.remove('over'); });
  lp.addEventListener('drop', (e) => {
    lp.classList.remove('over'); const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); takePhoto(f); }
  });
  addEventListener('paste', (e) => {
    const it = [...((e.clipboardData && e.clipboardData.items) || [])].find((x) => x.kind === 'file' && /^image\//.test(x.type));
    if (it) { e.preventDefault(); takePhoto(it.getAsFile()); }
  });

  /* chat */
  const q = $('q');
  const lastAnswer = () => { const m = S && [...S.messages].reverse().find((x) => x.role === 'assistant'); return m ? m.content : ''; };
  function renderChat() {
    const c = $('chat'); c.innerHTML = '';
    (S ? S.messages : []).forEach((m) => {
      const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai');
      // d.textContent = m.role === 'user' ? (m.label || m.content) : m.content;  (VS1)
      if (m.role !== 'user' && m.engine === 'gcv') paintG(d, m.content); else d.textContent = m.role === 'user' ? (m.label || m.content) : m.content;
      c.appendChild(d);
    });
    const has = !!lastAnswer();
    $('copy-btn').disabled = !has; $('txt-btn').disabled = !has; $('new-btn').disabled = !(S && S.messages.length);
  }
  /* VS2: Cloud Vision text with colour swatches for "\u25a0 #rrggbb" lines */
  function paintG(d, txt) {
    txt.split('\n').forEach((ln, i) => {
      if (i) d.appendChild(document.createTextNode('\n'));
      const mm = /^\u25a0 (#[0-9a-f]{6})(.*)$/.exec(ln);
      if (mm) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = mm[1]; d.appendChild(s); d.appendChild(document.createTextNode(mm[1] + mm[2])); }
      else d.appendChild(document.createTextNode(ln));
    });
  }
  function renderGo() {
    const b = $('go-btn'), t = q.value.trim();
    if (isG()) {
      q.hidden = true; $('q-note').hidden = false;
      b.disabled = !S || busyNow(); b.textContent = VSGcv.MODES[P.gmode] ? VSGcv.MODES[P.gmode].label : 'Labels';
      return;
    }
    q.hidden = false; $('q-note').hidden = true;
    b.disabled = !S || busyNow() || (P.mode === 'ask' && !t);
    b.textContent = t ? (S && S.messages.length ? 'Ask follow-up' : 'Ask') : MODES[P.mode].label;
    q.placeholder = S && S.messages.length ? 'Ask a follow-up about the same photo' : (P.mode === 'ask' ? 'Ask a question about the photo' : 'Ask a question about the photo (optional)');
  }
  q.addEventListener('input', renderGo);
  let ac = null;
  const busyNow = () => !!ac;
  function busy(on) {
    $('prog').hidden = !on; ['pick-btn', 'cam-btn', 'pick-btn2', 'cam-btn2', 'new-btn'].forEach((id) => { $(id).disabled = on; });
    if (on) { $('bar').parentNode.classList.add('ind'); $('prog-t').textContent = 'Looking at the photo\u2026'; }
    renderGo(); if (!on) renderChat();
  }
  /* VS2: one Cloud Vision request per tap; result kept as an assistant message tagged engine 'gcv' */
  async function runG() {
    const key = gKey(); if (!key) { explainG({ kind: 'nokey' }); return; }
    const gm = VSGcv.MODES[P.gmode] ? P.gmode : 'labels';
    S.messages.push({ role: 'user', content: VSGcv.MODES[gm].label, label: 'Cloud Vision \u00b7 ' + VSGcv.MODES[gm].label, engine: 'gcv' });
    if (!S.id && S.messages.length === 1) S.mode = 'gcv:' + gm;
    S.engine = 'gcv'; S.model = 'Google Cloud Vision'; renderChat();
    ac = new AbortController(); busy(true);
    try {
      const r = await VSGcv.annotate({ key, b64: S.b64, mode: gm, signal: ac.signal });
      S.messages.push({ role: 'assistant', content: r.text || 'Nothing found.', engine: 'gcv' });
      try { S.id = await VSSave.put({ id: S.id, img: S.img, mode: S.mode, model: S.model, engine: S.engine, messages: S.messages }); renderHistory(); } catch (_) { toast('Could not keep it in history (storage full?)'); }
    } catch (e) {
      S.messages.pop();
      if (e && e.name === 'AbortError') toast('Cancelled'); else explainG(e);
    } finally { ac = null; busy(false); }
  }
  async function run() {
    if (!S || busyNow()) return;
    if (isG()) return runG();
    const t = q.value.trim();
    if (!t && P.mode === 'ask') { q.focus(); return; }
    if (!P.model) {
      if (!(await loadModels(false))) { explain(lastErr || { kind: 'unreachable' }); return; }
      if (!P.model) { noVision(); return; }
    }
    // const first = !S.messages.length;  (VS1)
    const first = !S.messages.some((m) => m.engine !== 'gcv');  /* VS2: Cloud Vision turns are not sent to Ollama */
    const msg = t ? { role: 'user', content: t } : { role: 'user', content: MODES[P.mode].text, label: MODES[P.mode].label };
    if (first) { msg.first = true; S.mode = t ? 'ask' : P.mode; }
    S.messages.push(msg); S.model = P.model; S.engine = 'ollama';
    const send = S.messages.filter((m) => m.engine !== 'gcv').map((m) => (m.first ? { role: m.role, content: m.content, images: [S.b64] } : { role: m.role, content: m.content }));
    q.value = ''; renderChat();
    const live = document.createElement('div'); live.className = 'msg ai live'; $('chat').appendChild(live);
    ac = new AbortController(); busy(true);
    try {
      const ans = await VSOllama.chat({ url: P.url, model: P.model, messages: send, signal: ac.signal, first,
        onText: (c, all) => { live.textContent = all.replace(/^\s+/, ''); $('prog-t').textContent = 'Answering\u2026 ' + all.length + ' chars'; live.scrollIntoView({ block: 'nearest' }); } });
      S.messages.push({ role: 'assistant', content: ans });
      try { S.id = await VSSave.put({ id: S.id, img: S.img, mode: S.mode, model: S.model, engine: S.engine, messages: S.messages }); renderHistory(); } catch (_) { toast('Could not keep it in history (storage full?)'); }
    } catch (e) {
      S.messages.pop(); if (!t) { /* nothing to restore */ } else q.value = t;
      if (e && e.name === 'AbortError') toast('Cancelled'); else explain(e);
    } finally { ac = null; busy(false); }
  }
  $('go-btn').onclick = run;
  $('cancel-btn').onclick = () => { if (ac) ac.abort(); };
  $('copy-btn').onclick = async () => { const a = lastAnswer(); if (a) toast((await VSSave.copy(a)) ? 'Answer copied' : 'Copy failed'); };
  $('txt-btn').onclick = () => {
    if (!S) return;
    const txt = S.messages.map((m) => (m.role === 'user' ? '> ' + (m.label || m.content) : m.content)).join('\n\n') + '\n\n(' + S.model + ', Vision VS2)\n';
    const first = S.messages.find((m) => m.role === 'assistant');
    const slug = (first ? first.content : 'vision').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'vision';
    VSSave.download(txt, slug + '.txt'); toast('Saved ' + slug + '.txt');
  };
  $('new-btn').onclick = async () => {
    if (!S || !S.messages.length) return;
    if (await dialog('Clear this chat?', '<p>Starts a new chat about the same photo. The old one stays in Recent.</p>', true)) { S.messages = []; S.id = undefined; renderChat(); renderGo(); }
  };

  /* history */
  let histUrls = [];
  async function renderHistory() {
    let list = []; try { list = await VSSave.list(); } catch (_) { /* no IndexedDB */ }
    histUrls.forEach((u) => URL.revokeObjectURL(u)); histUrls = [];
    const h = $('hist'); h.innerHTML = '';
    $('hist-empty').hidden = list.length > 0; $('hist-n').textContent = list.length ? list.length + ' / ' + VSSave.MAX : '';
    list.forEach((r) => {
      const b = document.createElement('div'), u = URL.createObjectURL(r.img); histUrls.push(u);
      b.className = 'hi'; b.tabIndex = 0;
      const ans = (r.messages || []).find((m) => m.role === 'assistant');
      // const mode = r.mode === 'ask' ? 'Ask' : (MODES[r.mode] || MODES.describe).label;  (VS1)
      const gm = /^gcv:/.test(r.mode || '') && VSGcv.MODES[r.mode.slice(4)];
      const mode = gm ? 'Cloud Vision \u00b7 ' + gm.label : r.mode === 'ask' ? 'Ask' : (MODES[r.mode] || MODES.describe).label;
      const turns = (r.messages || []).filter((m) => m.role === 'user').length;
      b.innerHTML = '<img alt=""><div class="t"></div><div class="m"></div><button class="x" title="Delete">\u00d7</button>';
      b.querySelector('img').src = u; b.querySelector('.t').textContent = ans ? ans.content : '';
      b.querySelector('.m').textContent = mode + (turns > 1 ? ' \u00b7 ' + turns + ' questions' : '') + ' \u00b7 ' + new Date(r.ts).toLocaleDateString();
      b.querySelector('.x').onclick = async (e) => {
        e.stopPropagation();
        if (await dialog('Delete from Recent?', '<p>Removes this photo and its chat from this device.</p>', true)) { await VSSave.del(r.id); if (S && S.id === r.id) S.id = undefined; renderHistory(); toast('Deleted'); }
      };
      b.onclick = () => { if (!busyNow()) openSession(r); };
      h.appendChild(b);
    });
  }

  /* screens + swipes (75 px, wrap-around, left = next) */
  const N = 3, track = $('track'), app = $('app'), dots = [...document.querySelectorAll('#dots i')];
  let cur = 0;
  function place(dx) { track.style.transform = 'translateX(calc(' + (-cur * 100) + '% + ' + dx + 'px))'; }
  function go(i) { cur = (i + N) % N; place(0); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); }
  const noSwipe = (el) => el.closest && el.closest('input, textarea, select, .noswipe, .seg, button, #dialog, #cam');
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (!$('dialog').hidden || (e.pointerType === 'mouse' && e.button !== 0) || noSwipe(e.target)) { g = null; return; }
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
    if (e.target.closest && e.target.closest('input, textarea, select')) {
      if (e.key === 'Enter' && e.target === q && !e.shiftKey) { e.preventDefault(); if (!$('go-btn').disabled) run(); }
      return;
    }
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('storage', (e) => {
    if (e.key === 'sites-hub.theme') theme();
    if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); renderEngine(); renderModelLabel(); renderGo(); }
  });

  // go(0); renderSeg(); renderModelLabel(); fillSelect(); renderChat(); renderGo(); renderHistory(); loadModels(false);  (VS1)
  go(0); renderSeg(); renderModelLabel(); fillSelect(); fillMain(); renderEngine(); renderChat(); renderGo(); renderHistory(); loadModels(false);
  VSGcv.loadHub().then(pickEngine); VSGcv.onHubChange(() => { renderKeyLine(); if (!P.engine) pickEngine(); });
  window.VSApp = { go, get screen() { return cur; } };
})();
