/* Code Lab — UI. Cells, outputs, connection bar, settings, swipe screens. Persistence only via CodeLabSave. */
(function () {
  'use strict';
  const VERSION = 'N1 · CL3', SWIPE = 75, K = window.CodeLabKernel, SV = window.CodeLabSave, CM = window.CodeLabLib.cm;
  const $ = (id) => document.getElementById(id);
  const P = Object.assign({ theme: 'dark', url: '', kernel: 'python3', rememberToken: false, token: '', timeout: 0, onDisc: 'shutdown', kid: '', kurl: '', kname: '' }, SV.loadSettings());
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
  let saveWarn = '', connWarn = '';
  /* a storage warning (saveWarn) or connection warning (connWarn) stays visible until it is resolved; #msg is an aria-live region
     (assertive while the connection is down) so screen readers hear the change */
  const msg = (s) => {
    const m = $('msg'), w = connWarn || saveWarn; m.dataset.last = s || ''; m.textContent = w || s || ''; m.classList.toggle('warn', !!w); m.title = m.textContent;
    m.setAttribute('aria-live', connWarn ? 'assertive' : 'polite');
  };

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
    const c = { id: data.id || uid(), count: data.count || null, outputs: data.outputs || [], state: 'idle', note: '' };
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
    el.querySelector('.run').onclick = () => enqueue(c, true);
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
  /* c.state: 'idle' | 'queued' | 'running'. c.note is a short, unsaved reason shown next to the count (skipped / interrupted) */
  function renderCount(c) {
    const n = '[' + (c.count == null ? ' ' : c.count) + ']';
    c.cntEl.textContent = c.state === 'running' ? '[*] running…' : c.state === 'queued' ? '[…] queued' : c.note ? n + ' ⚠ ' + c.note : n;
    c.el.classList.toggle('running', c.state === 'running'); c.el.classList.toggle('queued', c.state === 'queued'); c.cntEl.classList.toggle('note', c.state === 'idle' && !!c.note);
    const rb = c.el.querySelector('.run');
    rb.textContent = c.state === 'queued' ? '…' : '▶';
    rb.title = c.state === 'queued' ? 'Queued: click to remove from the queue' : c.state === 'running' ? 'Running (use ■ to interrupt)' : 'Run (Shift+Enter)';
    rb.setAttribute('aria-label', rb.title);
  }
  function move(c, d) {
    const i = cells.indexOf(c), j = i + d; if (j < 0 || j >= cells.length) return;
    cells.splice(i, 1); cells.splice(j, 0, c);
    const box = $('cells'); cells.forEach((x) => box.appendChild(x.el)); save(); c.el.scrollIntoView({ block: 'nearest' });
  }
  function del(c) {
    const busy = c.state !== 'idle';
    if ((busy || c.view.state.doc.length || c.outputs.length) && !confirm((c.state === 'running' ? 'This cell is running. Interrupt it and delete it?' : 'Delete this cell' + (c.view.state.doc.length ? ' and its code' : '') + '?') + ' This cannot be undone.')) return;
    if (c.state === 'queued') dequeue(c);
    else if (c.state === 'running') { c.deleted = true; interruptRun(c, 'deleted'); } /* running cells can be deleted: the kernel is interrupted, or (connection lost) the cell is simply dropped */
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

  /* run queue — cells run one at a time, in order. Explicit list (not a promise chain) so it can be cleared:
     Restart / Interrupt / lost connection / Run-all failure empty it and mark each skipped cell. */
  let queueList = [], active = null, pumping = false, stopAll = false;
  const RUN_GRACE = 6000;
  const kernelOk = () => { const s = K.state(); return !!s.kernel && !s.lost && !s.reconnecting; };
  function runCell(c, advance) {
    if (advance) { const i = cells.indexOf(c); const nx = cells[i + 1] || addCell(); select(nx); nx.view.focus(); }
    return enqueue(c, false);
  }
  /* viaButton: clicking ▶ on a queued cell removes it from the queue; on a running cell it does nothing (never queues twice) */
  function enqueue(c, viaButton) {
    if (c.state === 'running') { toast('Already running. ■ interrupts it.'); return c.p || Promise.resolve('busy'); }
    if (c.state === 'queued') { if (viaButton) { dequeue(c); toast('Removed from queue'); return Promise.resolve('skipped'); } toast('Already queued'); return c.p; }
    const s = K.state();
    if (s.lost || s.reconnecting) { toast('Connection lost: press Reconnect'); return Promise.resolve('error'); }
    if (!s.kernel) { toast('Start a kernel first'); return Promise.resolve('error'); }
    c.note = ''; c.state = 'queued'; renderCount(c);
    c.p = new Promise((res) => { c.res = res; }); queueList.push(c); pump(); return c.p;
  }
  function settle(c, st, note) { c.state = 'idle'; if (note != null) c.note = note; renderCount(c); const r = c.res; c.res = null; if (r) r(st); }
  function dequeue(c) { const i = queueList.indexOf(c); if (i >= 0) queueList.splice(i, 1); settle(c, 'skipped', ''); }
  function clearQueue(why) { const q = queueList; queueList = []; q.forEach((c) => settle(c, 'skipped', 'skipped: ' + why)); return q.length; }
  async function pump() {
    if (pumping) return; pumping = true;
    while (queueList.length) {
      const c = queueList.shift(); active = c;
      let st = 'error'; try { st = await exec(c); } catch (e) { /* exec never throws */ }
      active = null; settle(c, st); if (!c.deleted) save();
    }
    pumping = false;
  }
  const WHY = { lost: 'connection lost', link: 'connection dropped', dead: 'kernel died', restarted: 'kernel restarted', gone: 'kernel was shut down on the server', disconnect: 'disconnected', timeout: 'timed out', interrupt: 'interrupted', deleted: 'cell deleted' };
  /* stop the running cell: interrupt the kernel (and, if it will not answer, stop waiting after a short grace period) */
  function interruptRun(c, why) {
    c.why = c.why || why;
    const ctl = c.ctl, s = K.state();
    if (!s.kernel || s.lost || s.reconnecting) { if (ctl && ctl.abort) ctl.abort(s.lost ? 'lost' : 'link'); return; }
    K.interrupt().catch(() => {});
    clearTimeout(c.graceT); c.graceT = setTimeout(() => { if (c.state === 'running' && ctl && ctl.abort) ctl.abort(why); }, RUN_GRACE);
  }
  async function exec(c) {
    if (c.deleted) return 'skipped';
    if (!kernelOk()) { c.state = 'idle'; c.note = 'skipped: connection lost'; return 'skipped'; }
    c.state = 'running'; c.why = null; c.outputs = []; renderOutputs(c); renderCount(c);
    let st = 'error', clearWait = false; const ctl = c.ctl = {};
    const limit = (+P.timeout || 0) * 1000;
    clearTimeout(c.limitT); if (limit) c.limitT = setTimeout(() => { if (c.state === 'running') { interruptRun(c, 'timeout'); clearQueue('a cell timed out'); } }, limit);
    try {
      st = await K.execute(c.view.state.doc.toString(), (kind, v) => {
        if (kind === 'count') { c.count = v; }
        else if (kind === 'clear') { if (v) clearWait = true; else { c.outputs = []; renderOutputs(c); } }
        else { if (clearWait) { clearWait = false; c.outputs = []; renderOutputs(c); } addOutput(c, v); }
      }, ctl);
    } catch (e) {
      const why = c.why || e.abort;
      if (why) { st = why === 'timeout' ? 'timeout' : 'interrupted'; }
      if (why === 'timeout') note(c, 'TimeoutError', 'the cell ran longer than the ' + fmtT(P.timeout) + ' run timeout, so the kernel was interrupted.' + (e.abort === 'timeout' ? ' The kernel did not answer the interrupt: use Restart if it stays busy.' : ''));
      else if (why === 'lost' || why === 'link') note(c, 'ConnectionLost', 'the connection to the server was lost. The cell may or may not have finished on the server.');
      else if (why === 'deleted') { /* gone */ }
      else if (why) note(c, 'Interrupted', (WHY[why] || why) + '.');
      else addOutput(c, { output_type: 'error', ename: 'Error', evalue: e.message || String(e), traceback: [] });
      return st;
    } finally { clearTimeout(c.limitT); clearTimeout(c.graceT); c.ctl = null; }
    if (c.why === 'timeout') { st = 'timeout'; note(c, 'TimeoutError', 'the cell ran longer than the ' + fmtT(P.timeout) + ' run timeout, so the kernel was interrupted.'); }
    else if (c.why === 'interrupt') st = 'interrupted';
    return st;
  }
  function note(c, ename, text) { addOutput(c, { output_type: 'error', ename, evalue: text, traceback: [] }); }
  function fmtT(sec) { sec = +sec || 0; return sec >= 3600 ? sec / 3600 + ' h' : sec >= 60 ? sec / 60 + ' min' : sec + ' s'; }
  async function runAll() {
    const s = K.state();
    if (s.lost || s.reconnecting) { toast('Connection lost: press Reconnect'); return; }
    if (!s.kernel) { toast('Start a kernel first'); return; }
    stopAll = false; const mine = cells.filter((c) => c.state === 'idle'); const ps = mine.map((c) => enqueue(c, false)); let bad = null;
    for (let i = 0; i < ps.length; i++) { const st = await ps[i]; if (st !== 'ok' && st !== 'skipped' && !bad) { bad = mine[i]; clearQueue('an earlier cell failed'); } }
    msg(bad ? 'Run all stopped at cell ' + (cells.indexOf(bad) + 1) + ' (' + (bad.why === 'timeout' ? 'timed out' : 'failed or interrupted') + ')' : 'Run all finished');
  }

  /* connection bar */
  $('url').value = P.url || ''; $('remember').checked = !!P.rememberToken; if (P.rememberToken && P.token) $('token').value = P.token;
  $('remember').onchange = () => { P.rememberToken = $('remember').checked; P.token = P.rememberToken ? $('token').value.trim() : ''; saveP(); };
  $('token').oninput = () => { if (P.rememberToken) { P.token = $('token').value.trim(); saveP(); } };
  /* remember the kernel THIS app started (id + server), so a reload or Reconnect can reattach instead of leaking a new one */
  function remember(k, url) { const u = url || K.state().baseUrl; P.kid = k ? k.id : ''; P.kurl = k ? u : ''; P.kname = k ? k.name : P.kname; saveP(); }
  function fillKernels(data) {
    const sel = $('kernel'); sel.textContent = '';
    Object.keys(data.kernelspecs).sort().forEach((n) => {
      const o = document.createElement('option'); o.value = n; o.textContent = (data.kernelspecs[n].spec && data.kernelspecs[n].spec.display_name) || n; sel.appendChild(o);
    });
    sel.value = data.kernelspecs[P.kernel] ? P.kernel : data.default || sel.options[0].value;
  }
  async function doConnect(auto) {
    const b = $('connect-btn');
    if (K.state().connected) { await doDisconnect(); return; }
    const wasLost = K.state().lost, hadKid = !!(P.kid && P.kurl);
    b.disabled = true; msg(wasLost ? 'Reconnecting…' : 'Connecting…'); $('status').className = 'sdot busy';
    try {
      $('url').value = $('url').value.trim().replace(/\/+$/, ''); $('token').value = $('token').value.trim();
      const data = await K.connect($('url').value, $('token').value);
      connWarn = ''; lostSeen = false;
      P.url = $('url').value; if (P.rememberToken) P.token = $('token').value; saveP();
      fillKernels(data);
      /* reattach to our own kernel (variables survive), else start a new one if we had one before, else wait for Start */
      const same = P.kid && P.kurl === K.state().baseUrl;
      let k = same ? await K.attach(P.kid) : null;
      if (k) { remember(k); $('kernel').value = data.kernelspecs[k.name] ? k.name : $('kernel').value; msg('Reattached to your running kernel (variables kept).'); toast(wasLost ? 'Reconnected' : 'Reattached to kernel'); }
      else if (hadKid && same) {
        try { k = await K.start($('kernel').value); remember(k); msg('Previous kernel was gone: started a new one (variables lost).'); toast('Started a new kernel'); }
        catch (e) { remember(null); msg('Previous kernel was gone and a new one could not start: ' + (e.message || e)); }
      } else { if (P.kid) remember(null); msg('Connected — ' + $('kernel').options.length + ' kernel(s). Press Start.'); toast('Connected'); }
    } catch (e) { msg(auto ? 'Auto-connect failed: ' + (e.message || e) : e.message || String(e)); if (!auto) toast(e.message || 'Connect failed'); if (wasLost) { connWarn = '⚠ Reconnect failed: ' + (e.message || e) + '. Press Reconnect to retry.'; } msg($('msg').dataset.last); }
    b.disabled = false; ui();
  }
  /* Disconnect: by default also shuts down the kernel this app started (no leaked kernels). Settings: keep it running, or ask. */
  async function doDisconnect() {
    const k = K.state().kernel, bu = K.state().baseUrl; let kill = !!k;
    if (k && P.onDisc === 'keep') kill = false;
    else if (k && P.onDisc === 'ask') kill = confirm('Disconnect.\n\nOK = also shut down the kernel on the server (variables are lost).\nCancel = disconnect but keep the kernel running; the next Connect reattaches to it.');
    try { await K.disconnect({ shutdown: kill }); remember(kill ? null : k, bu); toast(kill ? 'Disconnected, kernel shut down' : 'Disconnected, kernel left running'); }
    catch (e) { toast('Disconnected; kernel shutdown failed: ' + (e.message || e)); }
    connWarn = ''; lostSeen = false; msg(''); ui();
  }
  $('connect-btn').onclick = () => doConnect(false);
  $('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(false); });
  $('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(false); });
  $('kernel').onchange = () => { P.kernel = $('kernel').value; saveP(); };
  const guard = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message || String(e)); } ui(); };
  $('start-btn').onclick = guard(async () => { msg('Starting ' + $('kernel').value + '…'); P.kernel = $('kernel').value; saveP(); const k = await K.start(P.kernel); remember(k); msg('Kernel ' + P.kernel + ' started'); }, 'Kernel started');
  $('restart-btn').onclick = guard(async () => {
    msg('Restarting…'); const n = clearQueue('kernel restarted'); if (active) active.why = 'restarted'; /* queued cells never carry on into the new kernel */
    await K.restart(); cells.forEach((c) => { c.count = null; if (c.state === 'idle') renderCount(c); }); msg('Kernel restarted' + (n ? ' (' + n + ' queued cell(s) skipped)' : ''));
  }, 'Restarted');
  $('intr-btn').onclick = guard(async () => {
    const n = clearQueue('interrupted'); if (active) active.why = 'interrupt'; /* interrupt stops the whole queue, not just the current cell */
    await K.interrupt(); msg('Interrupt sent' + (n ? ' (' + n + ' queued cell(s) skipped)' : ''));
  }, 'Interrupt sent');
  $('add-btn').onclick = addCell;
  $('runall-btn').onclick = runAll;
  $('clear-btn').onclick = () => { if (cells.some((c) => c.outputs.length || c.count != null) && !confirm('Clear all outputs and run counts? This cannot be undone.')) return; cells.forEach((c) => { c.outputs = []; c.count = null; renderOutputs(c); renderCount(c); }); save(); toast('Outputs cleared'); };

  let lostSeen = false, linkSeen = 'ok', backSeen = false, goneSeen = false;
  function ui() {
    const s = K.state(), k = s.kernel;
    const st = $('status');
    const down = s.lost || s.reconnecting;
    st.className = 'sdot' + (s.lost ? '' : s.reconnecting ? ' busy' : s.connected ? (k && k.status === 'busy' ? ' busy' : ' ok') : '');
    const stt = s.lost ? 'Connection lost' : s.reconnecting ? 'Reconnecting…' : s.connected ? 'Connected' : 'Not connected';
    st.title = stt; st.setAttribute('role', 'img'); st.setAttribute('aria-label', stt);
    $('connect-btn').textContent = s.lost ? 'Reconnect' : s.connected ? 'Disconnect' : 'Connect';
    $('connect-btn').classList.toggle('acc', !s.connected || s.lost);
    $('kernel').disabled = !s.connected; $('start-btn').disabled = !s.connected;
    $('start-btn').textContent = k ? 'Switch' : 'Start';
    $('restart-btn').disabled = $('intr-btn').disabled = !k || down;
    $('kstate').textContent = s.lost ? 'lost' : s.reconnecting ? '…' : k ? k.status : (s.connected ? 'no kernel' : '—');
    $('kstate').dataset.status = s.lost ? 'lost' : k ? k.status : '';
    /* connection transitions (announced through #msg, which is aria-live) */
    if (down && linkSeen === 'ok') {
      const n = clearQueue('connection lost');
      connWarn = s.lost ? '⚠ Connection lost: ' + (s.reason || 'server not reachable') + '. Press Reconnect.' : '⚠ Connection to the kernel dropped. Reconnecting…';
      msg(''); toast(s.lost ? 'Connection lost' : 'Connection dropped');
    }
    if (s.lost && linkSeen !== 'lost') { connWarn = '⚠ Connection lost: ' + (s.reason || 'server not reachable') + '. Cells that were running are marked interrupted. Press Reconnect.'; clearQueue('connection lost'); msg(''); if (linkSeen !== 'ok') toast('Connection lost'); }
    if (!down && linkSeen !== 'ok' && s.connected) { connWarn = ''; msg('Connection restored. Cells that were running were interrupted.'); }
    if (s.lost && s.serverBack && !backSeen) { backSeen = true; connWarn = '⚠ Connection lost, but the server answers again. Press Reconnect.'; msg(''); toast('Server is back: press Reconnect'); }
    if (!s.lost) backSeen = false;
    if (s.kernelGone && !goneSeen) { goneSeen = true; remember(null); msg('The kernel was shut down on the server. Press Start for a new one.'); toast('Kernel is gone'); }
    if (!s.kernelGone) goneSeen = false;
    linkSeen = s.lost ? 'lost' : s.reconnecting ? 'reconnecting' : 'ok';
  }
  K.onChange(ui); ui();

  /* settings: run timeout and what Disconnect does with the kernel */
  const tsel = $('timeout'), dsel = $('ondisc');
  if (![...tsel.options].some((o) => +o.value === +P.timeout)) { const o = document.createElement('option'); o.value = P.timeout; o.textContent = fmtT(P.timeout); tsel.appendChild(o); }
  tsel.value = String(P.timeout); dsel.value = P.onDisc;
  tsel.onchange = () => { P.timeout = +tsel.value || 0; saveP(); toast(P.timeout ? 'Run timeout: ' + fmtT(P.timeout) : 'Run timeout off'); };
  dsel.onchange = () => { P.onDisc = dsel.value; saveP(); };

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
  /* a remembered token + a kernel we started earlier: reconnect and reattach by ourselves after a reload */
  if (P.rememberToken && P.token && P.url && P.kid) setTimeout(() => doConnect(true), 0);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement) document.activeElement.blur(); });
})();
