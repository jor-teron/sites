/*
 * Files drives (apps/system/files/files_drives.js) — the drives list (R54b: connected drives only; R56: plus added
 * folders that need access again, greyed with "Allow access" +
 * "Manage drives" → Disk; until R54b also "Allow access", remove ✕, "Add folder"), opening a drive / a path,
 * the clickable path (breadcrumb) and the hash: #drive=<id>&path=<a/b> (kept up to date with
 * replaceState so a Hub window session reopens the same drive + folder).
 * Drives and path crumbs are drop targets (drag items onto them = move, Ctrl = copy).
 * Google Drive (kind 'gdrive'): ☁ row with "Connect" (or "Set up") until signed in; opening it
 * then shows the QR sign-in panel (#gd-panel, shared/google/gdrive_connect.js) instead of files;
 * signed in → a normal drive (Drive adapter, shared/google/gdrive_fs.js) with a ⏏ Sign out button,
 * opened at the "hub" folder of My Drive (crumb "Google Drive › hub"); "Renew" when a phone sign-in ran out.
 * H118: drives are grouped: Local + added folders, then "🌐 Network drives" (Google Drive when signed in and each
 *   saved WebDAV server, kind 'webdav', 🌐 + its name, a small ⚙ to Settings › Network drives). No network drive
 *   → just a small "+ Add network drive" link there. Opening a WebDAV drive first lists its top folder; a wrong
 *   password / no reply shows the "not connected" note (+ Settings button) and a red dot on the row until it opens.
 * H119: SFTP servers (kind 'sftp', shared/fs/sftp_fs.js through hub/relay/sftp_relay.py) join the same group, 🔐 + name + ⚙,
 *   after the WebDAV drives; the same first-open check, with relay-specific messages (token, relay down, allowlist).
 * H109: quick links (Documents, Photos, ... on Local; made on first click) and the storage meter.
 * API FX.drives: draw(), open(id, fromClick, path), go(depth), up(), fromHash(), meter().
 */
(function () {
  'use strict';
  const { $, el, btn, st, say, fail } = FX;
  const D = window.FsDrives, Dlg = window.UiDialog;

  /* R54b: Files only browses. The list shows CONNECTED drives (Local; added folders with access;
   * Google Drive when signed in) plus a small "Manage drives" link to Disk (apps/system/disk/), which
   * now does Add folder / Allow access / Remove / Google sign-in and sign-out. Old draw(): LEGACY below. */
  const DISK = '../disk/';
  function openDisk() {
    let hub = null;
    try { hub = window.parent !== window && window.parent.__hubOpenApp ? window.parent : null; } catch (_) { hub = null; }
    if (!(hub && hub.__hubOpenApp('apps/system/disk/') !== false)) location.href = DISK;
  }
  /* H118: Settings › Network drives (#drives), in the Hub when Files runs inside it, else this tab. */
  function openNetSettings() {
    let hub = null;
    try { hub = window.parent !== window && window.parent.__hubOpenApp ? window.parent : null; } catch (_) { hub = null; }
    if (!(hub && hub.__hubOpenApp('apps/system/settings/', { hash: 'drives' }) !== false)) location.href = '../settings/#drives';
  }
  /* H119: why an SFTP drive didn't open (codes from hub/relay/sftp_relay.py via shared/fs/sftp_fs.js). */
  function sftpMsg(e, name) {
    const c = (e && e.sftp) || '', q = '\u201c' + name + '\u201d';
    const fix = ' Check it in Settings \u203A Network drives.';
    if (c === 'token') return 'The relay refused the token for ' + q + '.' + fix;
    if (c === 'auth' || c === 'denied') return 'Wrong user or password for ' + q + '.' + fix;
    if (c === 'allow') return 'The relay doesn\u2019t allow ' + q + ': add its host:port to the relay allowlist.';
    if (c === 'hostkey') return 'The server key of ' + q + ' changed, so the relay refused it (see sftp_known_hosts next to the relay).';
    if (c === 'notfound') return 'The folder of ' + q + ' was not found on the server.' + fix;
    return 'Can\u2019t reach ' + q + '. Is the SFTP relay running (python3 hub/relay/sftp_relay.py) and the server on? From the https Hub the relay must be wss://.';
  }
  const netBad = new Map();   // H118: drive id → message of the last failed open (red dot until it opens)
  async function draw() {
    const list = await D.list();
    const rows = [];
    let netHead = false;
    // (before H119) const isNet = (d) => d.kind === 'gdrive' || d.kind === 'webdav';
    const isNet = (d) => d.kind === 'gdrive' || d.kind === 'webdav' || d.kind === 'sftp';   // H119: + SFTP
    for (const d of list.filter((x) => !isNet(x)).concat(list.filter(isNet))) {   // H118: local + folders first
      // (before H119) const net = d.kind === 'gdrive' || d.kind === 'webdav';
      const net = isNet(d);
      if (net && !(d.kind === 'gdrive' && D.gdriveState() !== 'ok') && !netHead) {
        netHead = true; rows.push(el('p', 'drive-group', '\uD83C\uDF10 Network drives'));
      }
      if (d.kind === 'gdrive' && D.gdriveState() !== 'ok') continue;
      // R56: an added folder that needs access again (after every reload) is listed greyed with
      //  "Allow access" (a click = the user gesture requestPermission needs) instead of being hidden
      const lock = d.kind === 'folder' && (await D.access(d.id)) !== 'granted';
      const r = el('div', 'drive' + (d.id === st.driveId ? ' on' : '') + (lock ? ' locked' : '') + (netBad.has(d.id) ? ' bad' : ''));
      if (netBad.has(d.id)) r.title = netBad.get(d.id);
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', lock ? 'Allow access to ' + d.name : 'Open ' + d.name, () => (lock ? allowDrive(d) : openDrive(d.id, true)));
      // (before H119) open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : d.kind === 'webdav' ? '\uD83C\uDF10' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : d.kind === 'webdav' ? '\uD83C\uDF10' : d.kind === 'sftp' ? '\uD83D\uDD10' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));   // H119: 🔐 SFTP
      r.appendChild(open);
      // (before H119) if (d.kind === 'webdav') r.appendChild(btn('drive-x drive-set', '\u2699', d.name + ': settings (Settings \u203A Network drives)', openNetSettings));
      if (d.kind === 'webdav' || d.kind === 'sftp') r.appendChild(btn('drive-x drive-set', '\u2699', d.name + ': settings (Settings \u203A Network drives)', openNetSettings));   // H119: + SFTP
      if (lock) r.appendChild(btn('drive-allow', 'Allow access', 'Allow access to ' + d.name, () => allowDrive(d)));
      else FX.view.dropTarget(open, () => D.handle(d.id), d.id);
      rows.push(r);
    }
    // (before H119) if (!list.some((d) => d.kind === 'webdav') && window.WebDavAccounts) {   // H118
    if (!list.some((d) => d.kind === 'webdav' || d.kind === 'sftp') && (window.WebDavAccounts || window.SftpAccounts)) {   // H118, H119: + SFTP
      const a = el('a', 'drive-addnet', '\uFF0B Add network drive'); a.href = '../settings/#drives';
      // (before H119) a.title = 'Add a WebDAV server in Settings \u203A Network drives';
      a.title = 'Add a WebDAV or SFTP server in Settings \u203A Network drives';
      a.addEventListener('click', (e) => { e.preventDefault(); openNetSettings(); });
      rows.push(a);
    }
    if (!list.length) rows.unshift(el('p', 'drive-none', 'This browser has no file storage for web pages.'));
    // H109: "Manage drives" is a small icon row in the sidebar footer (above the storage meter)
    const m = el('a', 'drive-manage'); m.href = DISK; m.id = 'manage-drives'; m.title = 'Add or remove drives in Disk';
    m.innerHTML = svg(GEAR); m.append(el('span', '', 'Manage drives'));
    m.addEventListener('click', (e) => { e.preventDefault(); openDisk(); });
    $('manage-slot').replaceChildren(m);
    $('drives').replaceChildren(...rows);
    drawQuick(list.some((d) => d.id === 'local'));
    meter();
  }

  /* H109: quick links — Documents, Photos, Downloads, Music, Videos: folders at the top of the Local drive.
     A missing folder is made on its first click (never at start-up), then opened. */
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const GEAR = 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z';
  const QUICK = [
    ['Documents', 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6'],
    ['Photos', 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01'],
    ['Downloads', 'M12 4v11M7 10l5 5 5-5M4 19h16'],
    ['Music', 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    ['Videos', 'M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM16 10l5-3v10l-5-3']
  ];
  function drawQuick(hasLocal) {
    const q = $('quick');
    q.hidden = !hasLocal;
    if (!hasLocal) { q.replaceChildren(); return; }
    const rows = [el('p', 'quick-title', 'Quick access')];
    for (const [name, d] of QUICK) {
      const b = btn('quick-link', '', 'Open ' + name + ' (Local)', () => openQuick(name));
      b.dataset.q = name; b.innerHTML = svg(d); b.append(el('span', '', name));
      rows.push(b);
    }
    q.replaceChildren(...rows);
    paintQuick();
  }
  function paintQuick() {
    const here = st.driveId === 'local' && st.stack.length === 2 ? st.stack[1].name : '';
    $('quick').querySelectorAll('.quick-link').forEach((b) => {
      const on = b.dataset.q === here;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  async function openQuick(name) {
    try {
      const root = await D.handle('local');
      if (!root) throw new Error('Local drive not found');
      await root.getDirectoryHandle(name, { create: true });   // made on first use
      await openDrive('local', true, name);
    } catch (e) { fail(e); }
  }

  /* H109: storage meter — navigator.storage.estimate(): what this site uses of its quota (Local drive,
     caches, settings). Hidden when the browser has no estimate. */
  let meterT = 0;
  function meter() { clearTimeout(meterT); meterT = setTimeout(paintMeter, 250); }
  async function paintMeter() {
    const box = $('storage');
    const S = navigator.storage;
    if (!S || typeof S.estimate !== 'function') { box.hidden = true; return; }
    let est;
    try { est = await S.estimate(); } catch (_) { box.hidden = true; return; }
    const used = est.usage || 0, quota = est.quota || 0;
    if (!quota) { box.hidden = true; return; }
    const pct = Math.min(100, used / quota * 100);
    box.querySelector('i').style.width = Math.max(pct, used ? 1.5 : 0) + '%';
    box.classList.toggle('full', pct >= 90);
    box.querySelector('span').textContent = FX.size(used) + ' of ' + FX.size(quota) + ' used';
    box.title = 'Storage for this site (Local drive, caches, settings): ' + pct.toFixed(pct < 1 ? 2 : 0) + '% used';
    box.hidden = false;
  }
  /** R56: "Allow access" click → ask the browser, then redraw and open the folder. */
  async function allowDrive(d) {
    if (await D.allow(d.id)) { await draw(); openDrive(d.id, true); }
  }
  /** R54b: a drive that is not connected → a short note + "Open Disk" instead of the QR panel / allow button.
   *  R56: an added folder (d) also gets an "Allow access" button. */
  function notConnected(text, d, net) {
    const p = $('gd-panel');
    $('list').hidden = true;
    const b = net ? btn('tb drive-allow', 'Open Settings', 'Settings \u203A Network drives', openNetSettings)   // H118
      : btn('tb drive-allow', 'Open Disk', 'Manage drives in Disk', openDisk);
    const a = d ? btn('tb drive-allow', 'Allow access', 'Allow access to ' + d.name, () => allowDrive(d)) : null;
    p.replaceChildren(el('p', 'nc-text', text), ...(a ? [a, b] : [b]));
    p.hidden = false; p.classList.add('nc');
  }

  /* ===== LEGACY (until R54b, not run): draw() with Allow access / ✕ / Add folder / Google buttons =====
  async function draw() {
    const list = await D.list();
    const rows = [];
    for (const d of list) {
      const r = el('div', 'drive' + (d.id === st.driveId ? ' on' : ''));
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', 'Open ' + d.name, () => openDrive(d.id, true));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      r.appendChild(open);
      if (d.kind === 'gdrive') {
        const gs = D.gdriveState();
        if (gs !== 'ok') r.appendChild(btn('drive-allow', gs === 'setup' ? 'Set up' : gs === 'renew' ? 'Renew' : 'Connect', 'Google Drive: ' + (gs === 'setup' ? 'how to set it up' : gs === 'renew' ? 'the sign-in ran out \u2014 renew it from your phone' : 'sign in'), () => openDrive('gdrive', true)));
        else r.appendChild(btn('drive-x', '\u23CF', 'Sign out of Google Drive', async () => {
          if (!(await Dlg.confirm('Sign out of Google Drive?', 'Files forgets your Google sign-in and tells Google to cancel it. Your files stay in Google Drive.', 'Sign out', true))) return;
          await window.GoogleAuth.signOut();
        }));
      }
      FX.view.dropTarget(open, () => D.handle(d.id), d.id);
      if (d.kind === 'folder') {
        if ((await D.access(d.id)) !== 'granted') {
          r.appendChild(btn('drive-allow', 'Allow access', 'Allow access to ' + d.name, async () => { if (await D.allow(d.id)) { await draw(); openDrive(d.id, true); } }));
        }
        r.appendChild(btn('drive-x', '\u00D7', 'Remove ' + d.name + ' from the list (files stay)', async () => {
          if (!(await Dlg.confirm('Remove \u201c' + d.name + '\u201d?', 'It is only removed from this list. No files are deleted.', 'Remove'))) return;
          await D.remove(d.id);
          if (st.driveId === d.id) { st.driveId = ''; st.stack = []; FX.view.load(); }
          draw();
        }));
      }
      rows.push(r);
    }
    if (D.canAddFolder) {
      rows.push(btn('drive-add', '\uFF0B Add folder', 'Add a folder from this computer', async () => {
        const d = await D.addFolder();
        if (d) { await draw(); openDrive(d.id, true); }
      }));
    }
    if (!list.length) rows.unshift(el('p', 'drive-none', 'This browser has no file storage for web pages.'));
    $('drives').replaceChildren(...rows);
  }

  ===== end LEGACY ===== */

  function setHash() {
    const p = st.stack.slice(1).map((s) => s.name).join('/');
    const h = st.driveId ? '#drive=' + encodeURIComponent(st.driveId) + (p ? '&path=' + encodeURIComponent(p) : '') : '';
    if (location.hash !== h) { history.replaceState(null, '', location.pathname + location.search + h); FX.hubSave(); }
  }
  function fromHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    return { id: q.get('drive') || '', path: q.get('path') || '' };
  }

  /** R54b: hide the "not connected" note (the Google QR panel moved to Disk; old gdPanel is LEGACY below). */
  function gdPanel(on) {
    const p = $('gd-panel');
    if (!p || on) return;
    $('list').hidden = false; p.hidden = true; p.classList.remove('nc'); p.replaceChildren();
  }
  /* ===== LEGACY (until R54b, not run): the Google sign-in panel inside Files =====
  // Google Drive not signed in yet: the QR panel instead of the file list.
  let gdMount = null;
  function gdPanel(on) {
    const p = $('gd-panel');
    if (!p) return;
    $('list').hidden = !!on;
    if (!on) { if (gdMount) gdMount.destroy(); gdMount = null; p.hidden = true; p.replaceChildren(); return; }
    p.hidden = false;
    if (!gdMount || p.dataset.state !== D.gdriveState()) {
      if (gdMount) gdMount.destroy();
      p.dataset.state = D.gdriveState();
      gdMount = window.GDriveConnect.mount(p, { onHowto: () => say('Setup steps: Hub \u2192 Settings \u2192 How-to \u2192 Google Drive (or apps/lab/gdrive-test/README.md).') });
    }
  }
  ===== end LEGACY ===== */
  async function openDrive(id, fromClick, path) {
    say('');
    if (id === 'gdrive' && D.gdriveState() !== 'ok') {
      st.driveId = id; st.driveName = 'Google Drive'; st.stack = [];
      draw(); crumbs(); setHash(); FX.view.load();
      notConnected(D.gdriveState() === 'setup' ? 'Google Drive is not set up yet.' : D.gdriveState() === 'renew' ? 'Your Google Drive sign-in ran out. Renew it in Disk.' : 'Google Drive is not connected. Connect it in Disk.');   // R54b (was gdPanel(true))
      return;
    }
    gdPanel(false);
    let h;
    try { h = await D.handle(id); } catch (e) { st.driveId = id; st.stack = []; draw(); FX.view.load(); fail(e); return; }
    if (!h) { fail(new Error('Drive not found')); return; }
    if ((await D.access(id)) !== 'granted') {   // R54b: no allow here (was: allow on click, else 'Click Allow access')
      st.driveId = id; st.stack = []; draw(); FX.view.load();
      notConnected('\u201c' + h.name + '\u201d needs access again.', { id, name: h.name });   // R56: + Allow access
      return;
    }
    const d = (await D.list()).find((x) => x.id === id);
    // (before H119) if (d && d.kind === 'webdav') {   // H118: try the server once; a failure = note + red dot
    if (d && (d.kind === 'webdav' || d.kind === 'sftp')) {   // H118: try the server once; a failure = note + red dot (H119: + SFTP)
      try { for await (const _ of h.keys()) break; netBad.delete(id); }
      catch (e) {
        const m = d.kind === 'sftp' ? sftpMsg(e, d.name) : e && e.name === 'NotAllowedError' ? 'Wrong user or password for \u201c' + d.name + '\u201d. Check it in Settings \u203A Network drives.'
          : 'Can\u2019t reach \u201c' + d.name + '\u201d. Check it in Settings \u203A Network drives (it must be on, https and allow CORS).';
        netBad.set(id, m);
        st.driveId = id; st.driveName = d.name; st.stack = []; draw(); crumbs(); setHash(); FX.view.load();
        notConnected(m, null, true);
        return;
      }
    }
    st.driveId = id; st.driveName = d ? d.name : h.name;
    st.stack = [{ name: h.crumb || st.driveName, handle: h }];   // Google Drive: "Google Drive › hub"
    // walk into the saved path as far as it still exists
    for (const part of String(path || '').split('/').filter(Boolean)) {
      try { st.stack.push({ name: part, handle: await st.stack[st.stack.length - 1].handle.getDirectoryHandle(part) }); } catch (_) { break; }
    }
    draw();
    go(st.stack.length - 1);
  }

  /* H106: breadcrumbs — drive › folder › sub-folder; each crumb opens that folder. Long paths keep the
     drive and the last 2 folders and fold the middle into "…" (a menu of the hidden folders). */
  function crumbs() {
    const out = [], n = st.stack.length;
    const fold = n > 4 ? [1, n - 3] : null;   // hidden: stack[1 .. n-3]
    st.stack.forEach((s, i) => {
      if (fold && i >= fold[0] && i <= fold[1]) {
        if (i === fold[0]) {
          out.push(el('span', 'crumb-sep', '\u203A'));
          const hid = st.stack.slice(fold[0], fold[1] + 1);
          out.push(btn('crumb crumb-more', '\u2026', 'Show ' + hid.length + ' hidden folders', (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            CtxMenu.open(r.left, r.bottom + 4, hid.map((h, j) => ({ label: h.name, icon: '\uD83D\uDCC1', action: () => go(fold[0] + j) })));
          }));
        }
        return;
      }
      if (i) out.push(el('span', 'crumb-sep', '\u203A'));
      const b = btn('crumb', s.name, null, () => go(i));
      if (i === n - 1) b.setAttribute('aria-current', 'page');
      else FX.view.dropTarget(b, () => s.handle);
      out.push(b);
    });
    $('crumbs').replaceChildren(...out);
    $('crumbs').scrollLeft = 1e6;   // keep the open folder in view
    $('up').disabled = n < 2;
    $('back').disabled = !hist.back.length;
    $('fwd').disabled = !hist.fwd.length;
    paintQuick();   // H109
  }

  /* H106: navigation history (Back / Forward). Each place = { id, stack } (a copy of the folder path
     with its handles); go() records the place it leaves. Storage logic is unchanged. */
  const hist = { back: [], fwd: [], here: null, busy: false };
  const keyOf = (p) => p ? p.id + '/' + p.stack.map((s) => s.name).join('/') : '';
  function track() {
    const now = st.driveId && st.stack.length ? { id: st.driveId, stack: st.stack.slice() } : null;
    if (!hist.busy && hist.here && now && keyOf(hist.here) !== keyOf(now)) {
      hist.back.push(hist.here); hist.fwd = [];
      if (hist.back.length > 50) hist.back.shift();
    }
    if (now) hist.here = now;
  }
  async function travel(from, to) {
    if (!from.length || hist.busy) return;
    const p = from.pop();
    if (hist.here) to.push(hist.here);
    hist.busy = true;
    try {
      if (p.id === st.driveId) { st.stack = p.stack.slice(); go(st.stack.length - 1); }
      else await openDrive(p.id, false, p.stack.slice(1).map((s) => s.name).join('/'));
    } finally { hist.busy = false; }
    hist.here = st.driveId && st.stack.length ? { id: st.driveId, stack: st.stack.slice() } : p;
    crumbs();
  }
  const back = () => travel(hist.back, hist.fwd);
  const forward = () => travel(hist.fwd, hist.back);

  /** Show folder number `depth` of the path (0 = drive root). */
  function go(depth) {
    st.stack = st.stack.slice(0, depth + 1);
    st.sel.clear(); st.anchor = ''; st.q = '';
    $('search').value = '';
    track();   // H106
    crumbs();
    setHash();
    FX.view.load();
  }
  function up() { if (st.stack.length > 1) go(st.stack.length - 2); }
  /** Into a sub-folder of the open one. */
  function into(entry) { st.stack.push({ name: entry.name, handle: entry.handle }); go(st.stack.length - 1); }

  D.onChange(() => {
    draw();
    // signed in / out while Google Drive is the open drive → show its files / the QR again
    if (st.driveId === 'gdrive' && D.gdriveState) {
      const ok = D.gdriveState() === 'ok';
      if (ok === !st.stack.length) openDrive('gdrive', false);
    }
  });
  FX.drives = { draw, open: openDrive, go, up, into, fromHash, crumbs, back, forward, meter };   // H106: + back, forward; H109: + meter
})();
