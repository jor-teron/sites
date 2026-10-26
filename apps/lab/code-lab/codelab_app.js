/* Code Lab — UI. Cells, outputs, connection bar, settings, swipe screens. Persistence only via CodeLabSave. */
(function () {
  'use strict';
  const VERSION = 'N1 · CL10', SWIPE = 75, K = window.CodeLabKernel, SV = window.CodeLabSave, CM = window.CodeLabLib.cm;
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
    window.CodeLabOutput && window.CodeLabOutput.refreshFrames(); /* sandboxed HTML outputs follow the theme */
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P[g.dataset.key] = b.dataset.v; saveP(); theme();
  }));

  let tt; function toast(s, ms) { const t = $('toast'); t.textContent = s; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), ms || 2200); }
  let saveWarn = '', connWarn = '';
  /* a storage warning (saveWarn) or connection warning (connWarn) stays visible until it is resolved; #msg is an aria-live region
     (assertive while the connection is down) so screen readers hear the change */
  const msg = (s) => {
    const m = $('msg'), w = connWarn || saveWarn; m.dataset.last = s || ''; m.textContent = w || s || ''; m.classList.toggle('warn', !!w); m.title = m.textContent;
    m.setAttribute('aria-live', connWarn ? 'assertive' : 'polite'); /* #msg is aria-atomic: the whole message is read */
  };

  /* screens + swipe */
  const MODES = ['cells', 'set']; let mode = 'cells';
  /* Only the visible pane is reachable: the other one is inert + aria-hidden (no Tab stops, hidden from screen readers).
     Opening a pane moves focus into it; closing it returns focus to the control that opened it (Esc closes Settings). */
  let opener = null;
  const paneOf = (m) => $(m === 'set' ? 'pane-set' : 'pane-cells');
  function setMode(m, user) {
    const was = mode; mode = m; $('track').style.transform = 'translateX(' + (-MODES.indexOf(m) * 50) + '%)';
    document.querySelectorAll('.dot').forEach((d) => { const on = d.dataset.mode === m; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); d.setAttribute('aria-controls', paneOf(d.dataset.mode).id); });
    MODES.forEach((x) => { const p = paneOf(x), open = x === m; p.inert = !open; p.setAttribute('aria-hidden', open ? 'false' : 'true'); });
    if (!user || was === m) return;
    if (m === 'cells') { const o = opener; opener = null; (o && o.isConnected && !o.closest('.pane[inert]') ? o : paneOf('cells')).focus({ preventScroll: true }); }
    else { opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null; paneOf(m).focus({ preventScroll: true }); }
  }
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode, true); });
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
    setMode(MODES[(i + (dx < 0 ? 1 : -1) + n) % n], true); /* left = next, wraps */
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

  /* keyboard: Tab leaves the editor; "Tab indents" is a mode (Ctrl+M on/off, Esc off). The hint is shown once, and is in About. */
  let tabIndents = false;
  function setTabIndents(on) {
    tabIndents = on; document.documentElement.classList.toggle('tabind', on);
    toast(on ? 'Tab now indents. Press Esc or Ctrl+M to make Tab move focus again.' : 'Tab moves focus to the next control. Ctrl+M makes it indent.', 3500);
  }
  function tabHint() { if (P.tabHint) return; P.tabHint = true; saveP(); toast('Keyboard: Tab moves to the next control. Ctrl+M makes Tab indent (Esc undoes). Details in Settings → About.', 6000); }

  function makeCell(data, at) {
    const c = { id: data.id || uid(), count: data.count || null, outputs: [], state: 'idle', note: '' };
    const el = document.createElement('div'); el.className = 'cell'; el.dataset.id = c.id;
    el.innerHTML = '<div class="main"><div class="cnt"></div><div class="ed"></div><div class="out"></div></div>' +
      '<div class="tools"><button type="button" class="mini run">▶</button>' +
      '<button type="button" class="mini more-btn" aria-haspopup="menu" aria-expanded="false">⋯</button>' +
      '<div class="cmenu" role="menu" hidden>' +
      '<button type="button" role="menuitem" class="above">Add above</button>' +
      '<button type="button" role="menuitem" class="below">Add below</button>' +
      '<button type="button" role="menuitem" class="up">Move up</button>' +
      '<button type="button" role="menuitem" class="down">Move down</button>' +
      '<button type="button" role="menuitem" class="dup">Duplicate</button>' +
      '<button type="button" role="menuitem" class="clr">Clear output</button>' +
      '<button type="button" role="menuitem" class="del danger">Delete</button>' +
      '</div></div>';
    el.setAttribute('role', 'group');
    c.el = el; c.outEl = el.querySelector('.out'); c.cntEl = el.querySelector('.cnt');
    c.view = new CM.EditorView({
      parent: el.querySelector('.ed'),
      state: CM.EditorState.create({
        doc: data.source || '',
        extensions: [
          CM.keymap.of([
            { key: 'Shift-Enter', run: () => { runCell(c, true); return true; } },
            { key: 'Ctrl-Enter', run: () => { runCell(c, false); return true; } },
            /* Tab moves focus (no keyboard trap). Ctrl+M switches "Tab indents" on/off; Esc switches it off. */
            { key: 'Ctrl-m', run: () => { setTabIndents(!tabIndents); return true; } },
            { key: 'Escape', run: () => { if (!tabIndents) return false; setTabIndents(false); return true; } },
            { key: 'Tab', run: (v) => (tabIndents ? CM.indentWithTab.run(v) : false), shift: (v) => (tabIndents ? CM.indentWithTab.shift(v) : false) },
            ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.historyKeymap]),
          CM.lineNumbers(), CM.history(), CM.drawSelection(), CM.indentOnInput(), CM.bracketMatching(), CM.closeBrackets(),
          CM.indentUnit.of('    '), CM.python(), CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
          CM.EditorView.lineWrapping,
          CM.EditorView.updateListener.of((u) => { if (u.docChanged) save(); if (u.focusChanged && u.view.hasFocus) { select(c); tabHint(); } })
        ]
      })
    });
    el.querySelector('.run').onclick = () => enqueue(c, true);
    el.querySelector('.up').onclick = () => move(c, -1);
    el.querySelector('.down').onclick = () => move(c, 1);
    el.querySelector('.del').onclick = (e) => del(c, e.detail === 0);
    wireMenu(c);
    el.addEventListener('pointerdown', () => select(c));
    if (at == null || at >= cells.length) { cells.push(c); $('cells').appendChild(el); }
    else { cells.splice(at, 0, c); $('cells').insertBefore(el, cells[at + 1].el); }
    OUT.init(c, data.outputs || []); relabel();
    return c;
  }
  /* CL10: per-cell ⋯ menu (keyboard: Enter/Space opens, arrows move, Esc closes) */
  let openMenu = null;
  function closeMenu(focusBtn) {
    if (!openMenu) return;
    const m = openMenu;
    openMenu = null;
    m.menu.hidden = true;
    m.btn.setAttribute('aria-expanded', 'false');
    m.cell.el.classList.remove('menu-open');
    if (focusBtn) m.btn.focus({ preventScroll: true });
  }
  function wireMenu(c) {
    const btn = c.el.querySelector('.more-btn');
    const menu = c.el.querySelector('.cmenu');
    const items = () => Array.from(menu.querySelectorAll('[role=menuitem]'));
    btn.onclick = (e) => {
      e.stopPropagation();
      const wasOpen = openMenu && openMenu.menu === menu;
      closeMenu(false);
      if (wasOpen) return;
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      c.el.classList.add('menu-open');
      openMenu = { menu, btn, cell: c };
      select(c);
      items()[0].focus({ preventScroll: true });
    };
    menu.addEventListener('keydown', (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Tab') { closeMenu(false); }
    });
    menu.addEventListener('click', (e) => {
      if (e.target.closest('[role=menuitem]')) closeMenu(e.detail === 0);
    });
    c.el.querySelector('.above').onclick = () => addAt(cells.indexOf(c));
    c.el.querySelector('.below').onclick = () => addAt(cells.indexOf(c) + 1);
    c.el.querySelector('.dup').onclick = () => duplicate(c);
    c.el.querySelector('.clr').onclick = () => clearOutput(c);
  }
  document.addEventListener('pointerdown', (e) => {
    if (openMenu && !openMenu.menu.contains(e.target) && e.target !== openMenu.btn) closeMenu(false);
  });
  function addAt(at) {
    const c = makeCell({}, at);
    select(c);
    c.view.focus();
    c.el.scrollIntoView({ block: 'nearest' });
    save();
    return c;
  }
  function duplicate(c) {
    const copy = makeCell({ source: c.view.state.doc.toString() }, cells.indexOf(c) + 1);
    select(copy);
    copy.el.scrollIntoView({ block: 'nearest' });
    save();
    toast('Cell duplicated');
  }
  function clearOutput(c) {
    if (c.state !== 'idle') { toast('Cell is busy: stop it first'); return; }
    OUT.reset(c);
    c.count = null;
    c.note = '';
    renderCount(c);
    save();
  }
  /* CL10: plain status line, e.g. "Connected · idle" or "Running cell 3…" */
  function statusLine() {
    const s = K.state();
    const k = s.kernel;
    const run = cells.findIndex((x) => x.state === 'running');
    let t;
    if (s.lost) t = 'Connection lost';
    else if (s.reconnecting) t = 'Reconnecting…';
    else if (!s.connected) t = 'Not connected';
    else if (!k) t = 'Connected · no kernel';
    else if (run >= 0) t = 'Running cell ' + (run + 1) + '…';
    else t = 'Connected · ' + k.status;
    $('kstate').textContent = t;
  }
  function select(c) { if (sel) sel.el.classList.remove('sel'); sel = c; if (c) c.el.classList.add('sel'); }
  /* c.state: 'idle' | 'queued' | 'running'. c.note is a short, unsaved reason shown next to the count (skipped / interrupted) */
  function renderCount(c) {
    const n = '[' + (c.count == null ? ' ' : c.count) + ']';
    c.cntEl.textContent = c.state === 'running' ? '[*] running…' : c.state === 'queued' ? '[…] queued' : c.note ? n + ' ⚠ ' + c.note : n;
    c.el.classList.toggle('running', c.state === 'running'); c.el.classList.toggle('queued', c.state === 'queued'); c.cntEl.classList.toggle('note', c.state === 'idle' && !!c.note);
    const rb = c.el.querySelector('.run'), N = cells.indexOf(c) + 1;
    rb.textContent = c.state === 'queued' ? '…' : '▶';
    const lab = (b, label, tip) => { b.setAttribute('aria-label', label); b.title = tip || label; };
    lab(rb, c.state === 'queued' ? 'Remove cell ' + N + ' from the queue' : c.state === 'running' ? 'Cell ' + N + ' is running (use Stop to interrupt)' : 'Run cell ' + N,
      c.state === 'queued' ? 'Queued: click to remove from the queue' : c.state === 'running' ? 'Running (use ■ to interrupt)' : 'Run (Shift+Enter)');
    lab(c.el.querySelector('.up'), 'Move cell ' + N + ' up', 'Move up'); lab(c.el.querySelector('.down'), 'Move cell ' + N + ' down', 'Move down'); lab(c.el.querySelector('.del'), 'Delete cell ' + N, 'Delete');
    c.el.setAttribute('aria-label', 'Cell ' + N + ' of ' + cells.length); c.outEl.setAttribute('role', 'group'); c.outEl.setAttribute('aria-label', 'Output of cell ' + N);
    c.view.contentDOM.setAttribute('aria-label', 'Code of cell ' + N + '. Tab moves to the next control.');
    lab(c.el.querySelector('.more-btn'), 'More actions for cell ' + N, 'More actions');
    if (typeof K !== 'undefined') statusLine();
  }
  /* numbers in the names follow the order: call after add / delete / move */
  function relabel() { cells.forEach(renderCount); }
  function move(c, d) {
    const i = cells.indexOf(c), j = i + d; if (j < 0 || j >= cells.length) return;
    cells.splice(i, 1); cells.splice(j, 0, c);
    const box = $('cells'), f = document.activeElement; cells.forEach((x) => box.appendChild(x.el)); relabel(); save(); c.el.scrollIntoView({ block: 'nearest' });
    if (f && f !== document.body && c.el.contains(f)) f.focus({ preventScroll: true }); /* moving the node drops focus: put it back */
  }
  function del(c, byKey) {
    const busy = c.state !== 'idle';
    if ((busy || c.view.state.doc.length || c.outputs.length) && !confirm((c.state === 'running' ? 'This cell is running. Interrupt it and delete it?' : 'Delete this cell' + (c.view.state.doc.length ? ' and its code' : '') + '?') + ' This cannot be undone.')) return;
    if (c.state === 'queued') dequeue(c);
    else if (c.state === 'running') { c.deleted = true; interruptRun(c, 'deleted'); } /* running cells can be deleted: the kernel is interrupted, or (connection lost) the cell is simply dropped */
    const i = cells.indexOf(c); cells.splice(i, 1); c.view.destroy(); c.el.remove(); OUT.forget(c);
    if (!cells.length) makeCell({});
    relabel(); select(cells[Math.min(i, cells.length - 1)]); save();
    if (byKey) sel.el.querySelector('.run').focus({ preventScroll: true }); /* the deleted button had focus: keyboard users land on the next cell */
  }
  function addCell() {
    const at = sel ? cells.indexOf(sel) + 1 : cells.length;
    const c = makeCell({}, at); select(c); c.view.focus(); c.el.scrollIntoView({ block: 'nearest' }); save(); return c;
  }

  /* outputs: rendering lives in codelab_output.js (CodeLabOutput): terminal-like streams, in-place display updates, size cap */
  const OUT = window.CodeLabOutput;

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
    c.state = 'running'; c.why = null; OUT.reset(c); renderCount(c);
    let st = 'error', clearWait = false; const ctl = c.ctl = {};
    const limit = (+P.timeout || 0) * 1000;
    clearTimeout(c.limitT); if (limit) c.limitT = setTimeout(() => { if (c.state === 'running') { interruptRun(c, 'timeout'); clearQueue('a cell timed out'); } }, limit);
    try {
      st = await K.execute(c.view.state.doc.toString(), (kind, v) => {
        if (kind === 'count') { c.count = v; }
        else if (kind === 'clear') { if (v) clearWait = true; else OUT.reset(c); }
        else { if (clearWait) { clearWait = false; OUT.reset(c); } OUT.add(c, v); }
      }, ctl);
    } catch (e) {
      const why = c.why || e.abort;
      if (why) { st = why === 'timeout' ? 'timeout' : 'interrupted'; }
      if (why === 'timeout') note(c, 'TimeoutError', 'the cell ran longer than the ' + fmtT(P.timeout) + ' run timeout, so the kernel was interrupted.' + (e.abort === 'timeout' ? ' The kernel did not answer the interrupt: use Restart if it stays busy.' : ''));
      else if (why === 'lost' || why === 'link') note(c, 'ConnectionLost', 'the connection to the server was lost. The cell may or may not have finished on the server.');
      else if (why === 'deleted') { /* gone */ }
      else if (why) note(c, 'Interrupted', (WHY[why] || why) + '.');
      else OUT.add(c, { output_type: 'error', ename: 'Error', evalue: e.message || String(e), traceback: [] });
      return st;
    } finally { clearTimeout(c.limitT); clearTimeout(c.graceT); c.ctl = null; }
    if (c.why === 'timeout') { st = 'timeout'; note(c, 'TimeoutError', 'the cell ran longer than the ' + fmtT(P.timeout) + ' run timeout, so the kernel was interrupted.'); }
    else if (c.why === 'interrupt') st = 'interrupted';
    return st;
  }
  function note(c, ename, text) { OUT.add(c, { output_type: 'error', ename, evalue: text, traceback: [] }); }
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
  $('clear-btn').onclick = () => { if (cells.some((c) => c.outputs.length || c.count != null) && !confirm('Clear all outputs and run counts? This cannot be undone.')) return; cells.forEach((c) => { OUT.reset(c); c.count = null; renderCount(c); }); save(); toast('Outputs cleared'); };

  let sttSeen = '', lostSeen = false, linkSeen = 'ok', backSeen = false, goneSeen = false;
  function ui() {
    const s = K.state(), k = s.kernel;
    const st = $('status');
    const down = s.lost || s.reconnecting;
    st.className = 'sdot' + (s.lost ? ' lost' : s.reconnecting ? ' busy' : s.connected ? (k && k.status === 'busy' ? ' busy' : ' ok') : ' off'); /* shape differs too: circle ok, ring busy, square lost, dashed off */
    const stt = s.lost ? 'Connection lost' : s.reconnecting ? 'Reconnecting…' : s.connected ? 'Connected' : 'Not connected';
    const full = stt + (s.connected && k && !down ? ', kernel ' + k.status : '');
    st.title = full; st.setAttribute('role', 'img'); st.setAttribute('aria-label', 'Connection: ' + full);
    if (stt !== sttSeen) { sttSeen = stt; $('sr-status').textContent = 'Connection: ' + stt; } /* announced once per change */
    $('connect-btn').textContent = s.lost ? 'Reconnect' : s.connected ? 'Disconnect' : 'Connect';
    $('connect-btn').classList.toggle('acc', !s.connected || s.lost);
    $('kernel').disabled = !s.connected; $('start-btn').disabled = !s.connected;
    $('start-btn').textContent = k ? '⇆ Switch' : '＋ Start'; /* glyph only: ＋ start a kernel, ⇆ switch to the selected kernel */
    $('start-btn').title = k ? 'Switch kernel (shuts down the current one)' : 'Start kernel';
    $('start-btn').setAttribute('aria-label', $('start-btn').title);
    $('restart-btn').disabled = $('intr-btn').disabled = !k || down;
    statusLine();
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
  K.onDisplayUpdate = (o) => { if (OUT.update(o)) save(); }; /* update_display() from a later cell changes the earlier cell's output */

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
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented && mode === 'set') setMode('cells', true); }); /* Esc closes Settings and returns focus to its opener */
})();
