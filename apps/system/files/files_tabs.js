/*
 * Files tabs (apps/system/files/files_tabs.js), H126: browser-style tabs above the path bar.
 * Each tab keeps its own drive + folder, Back / Forward history, selection, search text, view (grid / list)
 * and scroll. The open tab lives in FX.st (+ the history in files_drives.js); a tab you leave is saved into
 * its tab object and put back when you come back to it.
 *   + / Ctrl+T new tab (Local, else the open folder) · × / middle-click / Ctrl+W close (at least one stays)
 *   Ctrl+Tab / Ctrl+Shift+Tab next / previous · right-click a tab = New tab, Duplicate, Close, Close other tabs
 *   Folder menu "Open in new tab" (files_menu.js), middle-click a folder = new tab in the background.
 *   Drop items on a tab = move into that tab's folder (Ctrl = copy), files from the computer = upload there.
 * Saved in localStorage 'sites-hub.filesTabs' = { v: 1, active, tabs: [{ drive, path, view, name }] } on every
 * folder change; after a reload the tabs come back (each one opens its folder when you first switch to it;
 * the Back / Forward history and the selection are not kept). A #drive=…&path=… link (the Hub) opens in the active tab.
 * The browser may keep Ctrl+T / Ctrl+W / Ctrl+Tab for itself (Chrome does in a normal tab); the buttons always work.
 * API FX.tabs: init(hash), sync(), add(place, background), close(i), next(d), openFolder(entry, background), list().
 */
(function () {
  'use strict';
  const { $, el, st } = FX;
  const KEY = 'sites-hub.filesTabs';
  const strip = $('tabs'), list = $('list');
  let tabs = [], active = 0, seq = 0, busy = 0;

  const freshHist = () => ({ back: [], fwd: [], here: null, busy: false });
  const pathOf = (stack) => (stack || []).slice(1).map((s) => s.name).join('/');
  function mk(o) {
    return { id: ++seq, driveId: o.driveId || '', driveName: o.driveName || '', path: o.path || '', name: o.name || '',
      stack: o.stack || null, hist: o.hist || freshHist(), sel: new Set(), anchor: '', q: '', view: o.view || st.view, scroll: 0 };
  }

  /* ---------- saved tabs ---------- */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, active,
        tabs: tabs.map((t) => ({ drive: t.driveId, path: t.path, view: t.view, name: t.name })) }));
    } catch (_) { /* blocked */ }
  }
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || !Array.isArray(o.tabs) || !o.tabs.length) return null;
      return { active: Math.max(0, Math.min(o.tabs.length - 1, o.active | 0)),
        tabs: o.tabs.slice(0, 30).map((x) => mk({ driveId: String(x.drive || ''), path: String(x.path || ''), view: x.view === 'list' ? 'list' : 'grid', name: String(x.name || '') })) };
    } catch (_) { return null; }
  }

  /* ---------- the open tab <-> FX.st ---------- */
  /** Copy the open folder's state into tab t (the one being left). */
  function keep(t) {
    t.driveId = st.driveId; t.driveName = st.driveName; t.stack = st.stack.slice(); t.path = pathOf(st.stack);
    t.name = titleOf(t); t.sel = new Set(st.sel); t.anchor = st.anchor; t.q = st.q; t.view = st.view;
    t.scroll = list.scrollTop; t.hist = FX.drives.getHist();
  }
  /** Put tab t back into FX.st and show it. */
  async function show(t) {
    const my = ++busy;
    FX.say('');
    FX.drives.setHist(t.hist);
    st.view = t.view;
    if (t.stack && t.stack.length) {
      st.driveId = t.driveId; st.driveName = t.driveName; st.stack = t.stack.slice();
      st.sel = new Set(t.sel); st.anchor = t.anchor; st.q = t.q; $('search').value = t.q;
      FX.drives.gdPanel(false);
      FX.drives.crumbs(); FX.drives.setHash(); FX.drives.draw();
      await FX.view.load();
      if (my === busy) { list.scrollTop = t.scroll; FX.view.paintSel(); }
    } else {
      st.sel.clear(); st.anchor = '';
      const id = t.driveId || (FsDrives.hasLocal ? 'local' : '');
      if (id) await FX.drives.open(id, false, t.path);
      else { st.driveId = ''; st.stack = []; FX.drives.crumbs(); FX.view.load(); }
    }
    draw();
  }
  async function switchTo(i) {
    if (i < 0 || i >= tabs.length || i === active) return;
    keep(tabs[active]);
    active = i;
    draw(); save();
    await show(tabs[i]);
  }

  /* ---------- titles ---------- */
  function titleOf(t) {
    if (t === tabs[active]) return st.stack.length ? st.stack[st.stack.length - 1].name : (st.driveName || 'Files');
    if (t.stack && t.stack.length) return t.stack[t.stack.length - 1].name;
    const p = t.path.split('/').filter(Boolean);
    return p.length ? p[p.length - 1] : (t.name || t.driveName || driveLabel(t.driveId));
  }
  const driveLabel = (id) => (id === 'local' ? 'Local' : id === 'gdrive' ? 'Google Drive' : id || 'Files');
  function tipOf(t) {
    if (t === tabs[active]) return st.stack.length ? st.stack.map((s) => s.name).join(' \u203A ') : (st.driveName || 'Files');
    const root = (t.stack && t.stack[0] && t.stack[0].name) || t.driveName || driveLabel(t.driveId);
    return [root].concat(t.path.split('/').filter(Boolean)).join(' \u203A ');
  }

  /* ---------- the strip ---------- */
  const NEW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  function draw() {
    const out = tabs.map((t, i) => {
      const on = i === active;
      const b = el('div', 'tab' + (on ? ' on' : ''));
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1; b.dataset.i = i;
      const name = titleOf(t);
      b.title = tipOf(t);
      b.append(el('span', 'tab-ico', '\uD83D\uDCC1'), el('span', 'tab-name', name));
      const x = el('button', 'tab-x', '\u00D7'); x.type = 'button'; x.title = 'Close tab (Ctrl+W)'; x.setAttribute('aria-label', 'Close tab ' + name);
      x.tabIndex = -1;
      b.appendChild(x);
      FX.view.dropTarget(b, () => dirOf(t));   // drop items on a tab = into its folder
      return b;
    });
    const plus = el('button', 'tab-new'); plus.type = 'button'; plus.id = 'tab-new';
    plus.title = 'New tab (Ctrl+T)'; plus.setAttribute('aria-label', 'New tab'); plus.innerHTML = NEW_SVG;
    const row = el('div', 'tabs-row'); row.setAttribute('role', 'tablist'); row.setAttribute('aria-label', 'Tabs');
    row.append(...out, plus);
    strip.replaceChildren(row);
    strip.classList.toggle('one', tabs.length < 2);   // H108a: files.css hides .tabs.one on phone
    const on = row.querySelector('.tab.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /** The folder handle of tab t (opens the drive + walks the path for a tab not shown yet). */
  async function dirOf(t) {
    if (t === tabs[active]) return FX.cur();
    if (t.stack && t.stack.length) return t.stack[t.stack.length - 1].handle;
    try {
      let h = await FsDrives.handle(t.driveId);
      for (const part of t.path.split('/').filter(Boolean)) h = await h.getDirectoryHandle(part);
      return h;
    } catch (e) { FX.fail(e); return null; }
  }

  strip.addEventListener('click', (e) => {
    if (e.target.closest('.tab-new')) { add(); return; }
    const b = e.target.closest('.tab');
    if (!b) return;
    if (e.target.closest('.tab-x')) { close(+b.dataset.i); return; }
    switchTo(+b.dataset.i);
  });
  strip.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // no auto-scroll
  strip.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const b = e.target.closest('.tab');
    e.preventDefault();
    if (b) close(+b.dataset.i);
  });
  strip.addEventListener('dblclick', (e) => { if (!e.target.closest('.tab, .tab-new')) add(); });
  strip.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.tab');
    if (e.shiftKey) return;
    e.preventDefault();
    const i = b ? +b.dataset.i : -1;
    CtxMenu.open(e.clientX, e.clientY, [
      { label: 'New tab', icon: '\uFF0B', hint: 'Ctrl+T', action: () => add() },
      { label: 'Duplicate tab', icon: '\u2398', disabled: i < 0, action: () => duplicate(i) },
      { sep: true },
      { label: 'Close tab', icon: '\u00D7', hint: 'Ctrl+W', disabled: i < 0 || tabs.length < 2, action: () => close(i) },
      { label: 'Close other tabs', icon: '\u2715', disabled: i < 0 || tabs.length < 2, action: () => closeOthers(i) }
    ]);
  });
  strip.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.tab');
    if (!b) return;
    const i = +b.dataset.i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      switchTo((i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length).then(() => { const n = strip.querySelector('.tab.on'); if (n) n.focus(); });
    } else if (e.key === 'Delete') { e.preventDefault(); close(i); }
  });

  /* ---------- open / close ---------- */
  /** New tab at place { driveId, path, stack? } (default: Local, else the open folder); background = don't switch. */
  async function add(place, background) {
    let p = place;
    if (!p) p = FsDrives.hasLocal ? { driveId: 'local', path: '' } : { driveId: st.driveId, path: pathOf(st.stack), stack: st.stack.length ? [st.stack[0]] : null, driveName: st.driveName };
    const t = mk(p);
    tabs.splice(active + 1, 0, t);
    if (background) { draw(); save(); return t; }
    keep(tabs[active]);
    active = active + 1;
    draw(); save();
    await show(t);
    return t;
  }
  function duplicate(i) {
    if (i === active) keep(tabs[active]);
    const s = tabs[i];
    const t = mk({ driveId: s.driveId, driveName: s.driveName, path: s.path, stack: s.stack ? s.stack.slice() : null, view: s.view, name: s.name });
    tabs.splice(i + 1, 0, t);
    if (i < active) active++;
    draw(); save();
  }
  async function close(i) {
    if (tabs.length < 2 || i < 0 || i >= tabs.length) return;   // at least one tab stays
    if (i === active) {
      const j = i < tabs.length - 1 ? i + 1 : i - 1;
      tabs.splice(i, 1);
      active = j > i ? j - 1 : j;
      draw(); save();
      await show(tabs[active]);
    } else {
      tabs.splice(i, 1);
      if (i < active) active--;
      draw(); save();
    }
  }
  function closeOthers(i) {
    if (i < 0) return;
    const keepTab = tabs[i];
    const was = active;
    if (was === i) { tabs = [keepTab]; active = 0; draw(); save(); return; }
    keep(tabs[active]);
    tabs = [keepTab]; active = 0;
    draw(); save();
    show(keepTab);
  }
  function next(d) { if (tabs.length > 1) switchTo((active + d + tabs.length) % tabs.length); }
  /** "Open in new tab" for a folder of the open folder (background: middle-click). */
  function openFolder(entry, background) {
    if (!entry || entry.kind !== 'directory' || !st.stack.length) return;
    const stack = st.stack.concat([{ name: entry.name, handle: entry.handle }]);
    return add({ driveId: st.driveId, driveName: st.driveName, stack, path: pathOf(stack), view: st.view }, background);
  }
  /** Called by files_drives.js setHash(): the open tab now shows another folder. */
  function sync() {
    const t = tabs[active];
    if (!t) return;
    t.driveId = st.driveId; t.driveName = st.driveName; t.path = pathOf(st.stack); t.view = st.view;
    t.name = titleOf(t);
    draw(); save();
  }

  /* middle-click a folder = open it in a new tab (in the background) */
  list.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.item')) e.preventDefault(); });
  list.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const it = e.target.closest('.item');
    if (!it) return;
    e.preventDefault();
    const en = FX.view.entryOf(it);
    if (en && en.kind === 'directory') openFolder(en, true);
  });

  /* keys: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab (also Ctrl+PageDown / PageUp) */
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if ((FX.viewer && FX.viewer.isOpen()) || CtxMenu.isOpen() || document.querySelector('.uid-back')) return;
    const k = e.key;
    let used = true;
    if ((k === 't' || k === 'T') && !e.shiftKey) add();
    else if ((k === 'w' || k === 'W') && !e.shiftKey) { if (tabs.length > 1) close(active); else used = false; }
    else if (k === 'Tab' || k === 'PageDown' || k === 'PageUp') next(k === 'PageUp' || (k === 'Tab' && e.shiftKey) ? -1 : 1);
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('pagehide', () => { if (tabs[active]) { tabs[active].view = st.view; save(); } });

  /** Start-up (files.js): saved tabs come back; a hash (#drive=…) wins for the active tab. */
  async function init(h) {
    const saved = load();
    if (saved) { tabs = saved.tabs; active = saved.active; }
    else tabs = [mk({ driveId: h.id || (FsDrives.hasLocal ? 'local' : ''), path: h.path || '', view: st.view })];
    const t = tabs[active];
    if (h.id) { t.driveId = h.id; t.path = h.path || ''; t.name = ''; }
    st.view = t.view;
    draw();
    const id = t.driveId || (FsDrives.hasLocal ? 'local' : '');
    if (id) await FX.drives.open(id, false, t.path); else FX.view.load();
    draw(); save();
  }

  FX.tabs = { init, sync, add, close, next, openFolder, list: () => tabs.map((t, i) => ({ name: titleOf(t), drive: t.driveId, path: i === active ? pathOf(st.stack) : t.path, on: i === active })), get active() { return active; } };
})();
