/* Code Lab — UI. Cells, outputs, connection bar, settings, swipe screens. Persistence only via CodeLabSave. */
(function () {
  'use strict';
  const VERSION = 'N1 · CL2', SWIPE = 75, K = window.CodeLabKernel, SV = window.CodeLabSave, CM = window.CodeLabLib.cm;
  const $ = (id) => document.getElementById(id);
  const P = Object.assign({ theme: 'dark', url: '', kernel: 'python3', rememberToken: false, token: '' }, SV.loadSettings());
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  const saveP = () => SV.saveSettings(P);
  $('ver').textContent = VERSION;

  /* theme */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let v = null; try { v = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = v === 'dark' || (v !== 'light' && mq.matches);
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
    document.querySelectorAll('.seg[data-key=theme] button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.theme));
    document.querySelectorAll('iframe.html').forEach((f) => { f.srcdoc = htmlDoc(f._raw || ''); }); /* sandboxed HTML outputs follow the theme */
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P[g.dataset.key] = b.dataset.v; saveP(); theme();
  }));

  let tt; function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }
  let saveWarn = '';
  /* a storage warning (saveWarn) stays visible until a later save succeeds without losing anything */
  const msg = (s) => { const m = $('msg'); m.dataset.last = s || ''; m.textContent = saveWarn || s || ''; m.classList.toggle('warn', !!saveWarn); m.title = m.textContent; };

  /* screens + swipe */
  const MODES = ['cells', 'set']; let mode = 'cells';
  function setMode(m) {
    mode = m; $('track').style.transform = 'translateX(' + (-MODES.indexOf(m) * 50) + '%)';
    document.querySelectorAll('.dot').forEach((d) => { const on = d.dataset.mode === m; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); });
  }
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode); });
  setMode('cells');
  let sx = null, sy = 0;
  $('viewport').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cm-editor,.out,input,select,textarea')) { sx = null; return; }
    sx = e.clientX; sy = e.clientY;
  });
  addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) < SWIPE || Math.abs(dy) > Math.abs(dx)) return;
    const i = MODES.indexOf(mode), n = MODES.length;
    setMode(MODES[(i + (dx < 0 ? 1 : -1) + n) % n]); /* left = next, wraps */
  });

  /* cells */
  let cells = [], seq = 0, sel = null, saveT;
  const uid = () => 'c' + Date.now().toString(36) + (seq++);
  let pending = false;
  function saveNow() {
    clearTimeout(saveT); pending = false;
    const r = SV.saveCells(cells.map((c) => ({ id: c.id, source: c.view.state.doc.toString(), count: c.count, outputs: c.outputs })));
    const w = !r.ok ? '⚠ Storage full: your changes are NOT saved. Free browser storage.'
      : r.droppedOutputs ? '⚠ ' + r.droppedOutputs + ' cell output(s) not saved (' + (r.reason === 'quota' ? 'browser storage full' : 'over 2 MB') + '); code is saved.' : '';
    if (w && w !== saveWarn) toast(w);
    if (w !== saveWarn) { saveWarn = w; msg($('msg').dataset.last || ''); }
  }
  /* debounced save; flushed immediately when the page is hidden or closed so nothing typed is lost */
  const save = () => { pending = true; clearTimeout(saveT); saveT = setTimeout(saveNow, 300); };
  const flush = () => { if (pending) saveNow(); };
  addEventListener('pagehide', flush); addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function makeCell(data, at) {
    const c = { id: data.id || uid(), count: data.count || null, outputs: data.outputs || [], running: false };
    const el = document.createElement('div'); el.className = 'cell'; el.dataset.id = c.id;
    el.innerHTML = '<div class="main"><div class="cnt"></div><div class="ed"></div><div class="out"></div></div>' +
      '<div class="tools"><button type="button" class="mini run" title="Run (Shift+Enter)">▶</button>' +
      '<button type="button" class="mini up" title="Move up">↑</button><button type="button" class="mini down" title="Move down">↓</button>' +
      '<button type="button" class="mini del danger" title="Delete">✕</button></div>';
    c.el = el; c.outEl = el.querySelector('.out'); c.cntEl = el.querySelector('.cnt');
    c.view = new CM.EditorView({
      parent: el.querySelector('.ed'),
      state: CM.EditorState.create({
        doc: data.source || '',
        extensions: [
          CM.keymap.of([
            { key: 'Shift-Enter', run: () => { runCell(c, true); return true; } },
            { key: 'Ctrl-Enter', run: () => { runCell(c, false); return true; } },
            ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.historyKeymap, CM.indentWithTab]),
          CM.lineNumbers(), CM.history(), CM.drawSelection(), CM.indentOnInput(), CM.bracketMatching(), CM.closeBrackets(),
          CM.indentUnit.of('    '), CM.python(), CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
          CM.EditorView.lineWrapping,
          CM.EditorView.updateListener.of((u) => { if (u.docChanged) save(); if (u.focusChanged && u.view.hasFocus) select(c); })
        ]
      })
    });
    el.querySelector('.run').onclick = () => runCell(c, false);
    el.querySelector('.up').onclick = () => move(c, -1);
    el.querySelector('.down').onclick = () => move(c, 1);
    el.querySelector('.del').onclick = () => del(c);
    el.addEventListener('pointerdown', () => select(c));
    if (at == null || at >= cells.length) { cells.push(c); $('cells').appendChild(el); }
    else { cells.splice(at, 0, c); $('cells').insertBefore(el, cells[at + 1].el); }
    renderCount(c); renderOutputs(c);
    return c;
  }
  function select(c) { if (sel) sel.el.classList.remove('sel'); sel = c; if (c) c.el.classList.add('sel'); }
  function renderCount(c) { c.cntEl.textContent = c.running ? '[*] running…' : '[' + (c.count == null ? ' ' : c.count) + ']'; c.el.classList.toggle('running', c.running); }
  function move(c, d) {
    const i = cells.indexOf(c), j = i + d; if (j < 0 || j >= cells.length) return;
    cells.splice(i, 1); cells.splice(j, 0, c);
    const box = $('cells'); cells.forEach((x) => box.appendChild(x.el)); save(); c.el.scrollIntoView({ block: 'nearest' });
  }
  function del(c) {
    if (c.running) { toast('Cell is running'); return; }
    if ((c.view.state.doc.length || c.outputs.length) && !confirm('Delete this cell' + (c.view.state.doc.length ? ' and its code' : '') + '? This cannot be undone.')) return;
    const i = cells.indexOf(c); cells.splice(i, 1); c.view.destroy(); c.el.remove();
    if (!cells.length) makeCell({});
    select(cells[Math.min(i, cells.length - 1)]); save();
  }
  function addCell() {
    const at = sel ? cells.indexOf(sel) + 1 : cells.length;
    const c = makeCell({}, at); select(c); c.view.focus(); c.el.scrollIntoView({ block: 'nearest' }); save(); return c;
  }

  /* outputs */
  const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
  const txt = (s) => (Array.isArray(s) ? s.join('') : String(s == null ? '' : s)).replace(ANSI, '');
  /* text/html output is untrusted: it is shown in an iframe with an EMPTY sandbox attribute (no scripts, no same-origin,
     no forms, no top navigation), so onerror/javascript:/<style> can neither run nor touch this page or its localStorage.
     A CSP meta inside the document and <base target=_blank> are extra layers. Without same-origin the page cannot read the
     frame's content height, so the height is estimated from an inert DOMParser copy; the frame can be resized by dragging. */
  function htmlDoc(h) {
    const dark = document.documentElement.classList.contains('dark');
    const fg = dark ? '#eef0f3' : '#15181d', bg = dark ? '#1c1f24' : '#ffffff', line = dark ? '#2b3037' : '#e3e6ea', link = dark ? '#60a5fa' : '#2563eb';
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; font-src data:">' +
      '<base target="_blank"><meta name="color-scheme" content="' + (dark ? 'dark' : 'light') + '">' +
      '<style>html,body{margin:0;background:' + bg + ';color:' + fg + ';font:13px/1.4 system-ui,sans-serif}body{padding:2px 4px}' +
      'table{border-collapse:collapse}td,th{border:1px solid ' + line + ';padding:2px 6px}a{color:' + link + '}img{max-width:100%}</style></head><body>' + h + '</body></html>';
  }
  function estHeight(h) {
    let n = 1;
    try {
      const d = new DOMParser().parseFromString(h, 'text/html'); /* inert: no scripts run, nothing is fetched */
      d.querySelectorAll('script,style').forEach((e) => e.remove());
      n = d.querySelectorAll('tr,li,p,br,div,pre,h1,h2,h3,h4,h5,h6').length + Math.ceil((d.body.textContent || '').trim().length / 60);
      if (d.querySelector('img,svg')) n += 8;
    } catch (_) { /* default */ }
    return Math.min(480, Math.max(40, n * 19 + 10));
  }
  function htmlFrame(h) {
    const f = document.createElement('iframe');
    f.className = 'html'; f.setAttribute('sandbox', 'allow-popups'); f.setAttribute('referrerpolicy', 'no-referrer'); /* no scripts, no same-origin */
    f.title = 'HTML output'; f.loading = 'eager'; f._raw = h; f.style.height = estHeight(h) + 'px'; f.srcdoc = htmlDoc(h);
    return f;
  }
  function outNode(o) {
    if (o.output_type === 'stream') { const p = document.createElement('pre'); p.className = o.name === 'stderr' ? 'stderr' : 'stdout'; p.textContent = txt(o.text); return p; }
    if (o.output_type === 'error') { const p = document.createElement('pre'); p.className = 'err'; p.textContent = o.traceback && o.traceback.length ? txt(o.traceback.join('\n')) : o.ename + ': ' + o.evalue; return p; }
    const d = o.data || {};
    if (d['image/png']) { const i = document.createElement('img'); i.src = 'data:image/png;base64,' + txt(d['image/png']).replace(/\s/g, ''); i.alt = 'output'; return i; }
    if (d['image/jpeg']) { const i = document.createElement('img'); i.src = 'data:image/jpeg;base64,' + txt(d['image/jpeg']).replace(/\s/g, ''); i.alt = 'output'; return i; }
    if (d['image/svg+xml']) { const i = document.createElement('img'); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt(d['image/svg+xml'])); return i; }
    if (d['text/html']) return htmlFrame(txt(d['text/html']));
    if (d['text/plain'] != null) { const p = document.createElement('pre'); p.className = 'result'; p.textContent = txt(d['text/plain']); return p; }
    return null;
  }
  function renderOutputs(c) { c.outEl.textContent = ''; c.outputs.forEach((o) => { const n = outNode(o); if (n) c.outEl.appendChild(n); }); }
  function addOutput(c, o) {
    const last = c.outputs[c.outputs.length - 1];
    if (o.output_type === 'stream' && last && last.output_type === 'stream' && last.name === o.name) {
      last.text = txt(last.text) + o.text; const n = c.outEl.lastChild; if (n) n.textContent = txt(last.text);
    } else { c.outputs.push(o); const n = outNode(o); if (n) c.outEl.appendChild(n); }
  }

  /* run queue — cells run one at a time, in order */
  let queue = Promise.resolve(), stopAll = false;
  function runCell(c, advance) {
    if (advance) { const i = cells.indexOf(c); const nx = cells[i + 1] || addCell(); select(nx); nx.view.focus(); }
    return enqueue(c);
  }
  function enqueue(c) {
    if (!K.state().kernel) { toast('Start a kernel first'); return Promise.resolve('error'); }
    c.running = true; c.outputs = []; renderOutputs(c); c.cntEl.textContent = '[*]'; c.el.classList.add('running');
    const p = queue.then(() => exec(c)); queue = p.catch(() => {}); return p;
  }
  async function exec(c) {
    if (stopAll) { c.running = false; renderCount(c); return 'skipped'; }
    renderCount(c); let st = 'error', clearWait = false;
    try {
      st = await K.execute(c.view.state.doc.toString(), (kind, v) => {
        if (kind === 'count') { c.count = v; }
        else if (kind === 'clear') { if (v) clearWait = true; else { c.outputs = []; renderOutputs(c); } }
        else { if (clearWait) { clearWait = false; c.outputs = []; renderOutputs(c); } addOutput(c, v); }
      });
    } catch (e) { addOutput(c, { output_type: 'error', ename: 'Error', evalue: e.message || String(e), traceback: [] }); }
    c.running = false; renderCount(c); save();
    return st;
  }
  async function runAll() {
    if (!K.state().kernel) { toast('Start a kernel first'); return; }
    stopAll = false; const ps = cells.map((c) => enqueue(c));
    for (const p of ps) { const st = await p; if (st !== 'ok' && st !== 'skipped') stopAll = true; }
    stopAll = false; msg('Run all finished');
  }

  /* connection bar */
  $('url').value = P.url || ''; $('remember').checked = !!P.rememberToken; if (P.rememberToken && P.token) $('token').value = P.token;
  $('remember').onchange = () => { P.rememberToken = $('remember').checked; P.token = P.rememberToken ? $('token').value.trim() : ''; saveP(); };
  $('token').oninput = () => { if (P.rememberToken) { P.token = $('token').value.trim(); saveP(); } };
  async function doConnect() {
    const b = $('connect-btn');
    if (K.state().connected) { await K.disconnect(); toast('Disconnected'); return; }
    b.disabled = true; msg('Connecting…'); $('status').className = 'sdot busy';
    try {
      $('url').value = $('url').value.trim().replace(/\/+$/, ''); $('token').value = $('token').value.trim();
      const data = await K.connect($('url').value, $('token').value);
      P.url = $('url').value; if (P.rememberToken) P.token = $('token').value; saveP();
      const sel = $('kernel'); sel.textContent = '';
      Object.keys(data.kernelspecs).sort().forEach((n) => {
        const o = document.createElement('option'); o.value = n; o.textContent = (data.kernelspecs[n].spec && data.kernelspecs[n].spec.display_name) || n; sel.appendChild(o);
      });
      sel.value = data.kernelspecs[P.kernel] ? P.kernel : data.default || sel.options[0].value;
      msg('Connected — ' + sel.options.length + ' kernel(s). Press Start.'); toast('Connected');
    } catch (e) { msg(e.message || String(e)); toast(e.message || 'Connect failed'); }
    b.disabled = false; ui();
  }
  $('connect-btn').onclick = doConnect;
  $('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(); });
  $('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(); });
  $('kernel').onchange = () => { P.kernel = $('kernel').value; saveP(); };
  const guard = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message || String(e)); } ui(); };
  $('start-btn').onclick = guard(async () => { msg('Starting ' + $('kernel').value + '…'); P.kernel = $('kernel').value; saveP(); await K.start(P.kernel); msg('Kernel ' + P.kernel + ' started'); }, 'Kernel started');
  $('restart-btn').onclick = guard(async () => { msg('Restarting…'); await K.restart(); cells.forEach((c) => { c.count = null; renderCount(c); }); msg('Kernel restarted'); }, 'Restarted');
  $('intr-btn').onclick = guard(() => K.interrupt(), 'Interrupt sent');
  $('add-btn').onclick = addCell;
  $('runall-btn').onclick = runAll;
  $('clear-btn').onclick = () => { if (cells.some((c) => c.outputs.length || c.count != null) && !confirm('Clear all outputs and run counts? This cannot be undone.')) return; cells.forEach((c) => { c.outputs = []; c.count = null; renderOutputs(c); renderCount(c); }); save(); toast('Outputs cleared'); };

  function ui() {
    const s = K.state(), k = s.kernel;
    const st = $('status');
    st.className = 'sdot' + (s.connected ? (k && k.status === 'busy' ? ' busy' : ' ok') : '');
    st.title = s.connected ? 'Connected' : 'Not connected';
    $('connect-btn').textContent = s.connected ? 'Disconnect' : 'Connect';
    $('kernel').disabled = !s.connected; $('start-btn').disabled = !s.connected;
    $('start-btn').textContent = k ? 'Switch' : 'Start';
    $('restart-btn').disabled = $('intr-btn').disabled = !k;
    $('kstate').textContent = k ? k.status : (s.connected ? 'no kernel' : '—');
    $('kstate').dataset.status = k ? k.status : '';
  }
  K.onChange(ui); ui();

  /* load cells */
  const L = SV.loadCells();
  (L.cells && L.cells.length ? L.cells : []).forEach((d) => { try { makeCell(d); } catch (e) { L.dropped++; try { console.warn('Code Lab: skipped a bad cell', e); } catch (_) { /* */ } } });
  if (!cells.length) makeCell({ source: L.bad || L.dropped ? '' : 'print("Hello from Code Lab")' }); /* never a blank app */
  if (L.bad || L.dropped || L.repaired) {
    const m = L.bad ? 'Saved cells were unreadable: started with an empty cell (original kept as backup).'
      : [L.dropped ? L.dropped + ' damaged cell(s) removed.' : '', L.repaired ? L.repaired + ' cell(s) repaired.' : '', 'Original kept as backup.'].filter(Boolean).join(' ');
    msg(m); toast(m);
  }
  select(cells[0]);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement) document.activeElement.blur(); });
})();
