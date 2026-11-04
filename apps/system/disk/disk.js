/*
 * Disk (apps/system/disk/disk.js), R54 — the storage manager. Everything here goes through the
 * shared code the Hub and Files use, so a change shows up everywhere:
 *   drives     window.FsDrives (shared/fs/fs_drives.js): list / access / allow / addFolder / remove,
 *              gdriveState(); redraws on FsDrives.onChange (BroadcastChannel 'sites-fs').
 *   Google     window.GDriveConnect.mount (shared/google/gdrive_connect.js) for Connect / Set up /
 *              Renew; GoogleAuth.signOut for Sign out (same words as Files and the Hub tile).
 *   space      navigator.storage.estimate() + persisted() / persist() ("Keep my data").
 *   sizes      on demand ("Calculate"): walks the drive's folders and adds up file sizes (Google
 *              Drive skipped: it would mean listing the whole Drive over the network).
 *   clean-up   ThumbStore.stats() / clear() (shared/fs/thumbs_store.js, IndexedDB 'sites-thumbs');
 *              "Empty Local" removes every entry of the OPFS root after a danger confirm, then
 *              posts {type:'drives'} on 'sites-fs' so Files and the Hub redraw.
 *   WebDAV     H133 (was Settings › Network drives): window.WebDavAccounts (shared/fs/webdav_accounts.js,
 *              localStorage 'hub-webdav-accounts', same list as before, so Files / Viewer / phone are unchanged)
 *              for Add / Edit / Remove; WebDavFs.test(account) for "Test connection" and the status on each row
 *              (checked once when the page opens and after every change: Checking… / Connected / the error).
 *              Form: Name, URL, User, Password (+ Show), Test connection, Add / Save, Cancel. Deep links:
 *              #add-webdav, #edit=webdav:<n> (Files' ⚙ on a WebDAV drive opens that).
 * Theme: shared/theme/hub_theme.js: html.light / --accent follow the Hub theme (H22, no picker).
 */
(function () {
  'use strict';
  const D = window.FsDrives, Dlg = window.UiDialog, TS = window.ThumbStore;
  const $ = (id) => document.getElementById(id);
  const FILES = '../files/';
  const sizes = new Map();   // drive id → text ('…' while counting)

  // ---- theme: shared/theme/hub_theme.js (H22) follows the Hub automatically ----

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn, title) { const b = el('button', 'btn ' + (cls || ''), text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  let msgT = 0;
  function say(t) { const m = $('msg'); m.textContent = t; m.hidden = false; clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, 3500); }
  function fmt(n) {
    if (!(n >= 0)) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
  }
  const announce = () => { try { const bc = new BroadcastChannel('sites-fs'); bc.postMessage({ type: 'drives' }); bc.close(); } catch (_) { /* old browser */ } };

  // ---- space ----
  async function space() {
    const s = navigator.storage;
    if (!s || !s.estimate) { $('space-txt').textContent = 'This browser does not report storage space.'; return; }
    try {
      const e = await s.estimate();
      const pct = e.quota ? Math.min(100, (e.usage / e.quota) * 100) : 0;
      $('space-bar').firstElementChild.style.width = pct.toFixed(1) + '%';
      $('space-bar').setAttribute('aria-valuenow', pct.toFixed(0));
      $('space-txt').textContent = fmt(e.usage) + ' used of ' + fmt(e.quota) + ' the browser allows (' + pct.toFixed(pct < 1 ? 2 : 0) + '%)';
    } catch (_) { $('space-txt').textContent = 'Could not read storage space.'; }
    let kept = false;
    try { kept = s.persisted ? await s.persisted() : false; } catch (_) { /* no */ }
    $('persist-txt').textContent = kept ? 'Kept: the browser will not clear this data when space runs low.'
      : 'Not kept yet: the browser may clear this data when space runs low.';
    $('persist').hidden = kept || !s.persist;
  }
  $('persist').addEventListener('click', async () => {
    let ok = false;
    try { ok = await navigator.storage.persist(); } catch (_) { /* no */ }
    say(ok ? 'Your data is kept.' : 'The browser said no (it decides by itself; installing the Hub or using it more often helps).');
    space();
  });

  // ---- sizes ----
  async function walk(dir) {
    let total = 0;
    for await (const h of dir.values()) {
      if (h.kind === 'file') { try { total += (await h.getFile()).size; } catch (_) { /* unreadable */ } }
      else total += await walk(h);
    }
    return total;
  }
  async function calc(id) {
    sizes.set(id, 'Counting…'); draw();
    try {
      const h = await D.handle(id);
      sizes.set(id, h ? fmt(await walk(h)) : '—');
    } catch (_) { sizes.set(id, 'Could not read'); }
    draw();
  }

  // ---- drives ----
  let gdMount = null;
  function gdPanel(show) {
    const p = $('gd-panel');
    if (!show) { if (gdMount) gdMount.destroy(); gdMount = null; p.hidden = true; p.textContent = ''; return; }
    if (!window.GDriveConnect) return;
    p.hidden = false;
    if (!gdMount) gdMount = window.GDriveConnect.mount(p, { onDone: () => gdPanel(false), onHowto: () => say('Setup steps: Hub \u2192 Settings \u2192 How-to \u2192 Google Drive.') });
  }
  let drawing = 0;
  async function draw() {
    const my = ++drawing;
    const list = await D.list();
    const rows = await Promise.all(list.map(async (d) => [d, d.kind === 'gdrive' ? D.gdriveState() : await D.access(d.id).catch(() => 'prompt')]));
    if (my !== drawing) return;
    const box = $('drives'); box.textContent = '';
    if (!rows.length) box.appendChild(el('p', 'muted', 'This browser has no drives the Hub can use.'));
    rows.forEach(([d, st]) => {
      const r = el('div', 'drive'); r.setAttribute('role', 'listitem'); r.dataset.drive = d.id;
      // (before H133) r.appendChild(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2'));
      r.appendChild(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : d.kind === 'webdav' ? '\uD83C\uDF10' : '\uD83D\uDCC2'));   // H133: 🌐 WebDAV
      const m = el('div', 'drive-main'); m.appendChild(el('div', 'drive-name', d.name));
      let stText, ok = false, bad = false;
      if (d.kind === 'webdav') {   // H133: status from the last connection check
        const w = wdState.get(d.id);
        if (!w) checkWd(d.id);
        ok = !!(w && w.ok); bad = !!(w && w.state === 'done' && !w.ok);
        stText = 'Network drive (WebDAV) \u00B7 ' + (!w || w.state === 'checking' ? 'Checking\u2026' : w.ok ? 'Connected' : 'Error: ' + w.text);
      } else if (d.kind === 'gdrive') {
        ok = st === 'ok';
        const u = ok && window.GoogleAuth && window.GoogleAuth.user ? window.GoogleAuth.user() : null;
        stText = ok ? 'Connected' + (u && u.email ? ' as ' + u.email : '') : st === 'setup' ? 'Not set up' : st === 'renew' ? 'Sign-in ran out' : 'Not connected';
      } else {
        ok = st === 'granted';
        stText = (d.kind === 'local' ? 'This browser\u2019s private storage' : 'Folder on this computer') + ' \u00B7 ' + (ok ? 'Ready' : st === 'denied' ? 'Access blocked' : 'Needs access');
      }
      // (before H133) const s = el('div', 'drive-st' + (ok ? ' ok' : ''), stText);
      const s = el('div', 'drive-st' + (ok ? ' ok' : '') + (bad ? ' bad' : ''), stText);
      if (d.kind === 'webdav') { const acc = WA && WA.get(d.id); if (acc) m.appendChild(el('div', 'drive-url', acc.url + (acc.user ? ' \u00B7 ' + acc.user : ''))); }
      if (d.kind !== 'gdrive' && sizes.has(d.id)) s.append(' \u00B7 ', el('b', 'drive-size', sizes.get(d.id)));
      m.appendChild(s); r.appendChild(m);
      const a = el('div', 'drive-acts');
      if (d.kind === 'webdav') {   // H133
        a.appendChild(btn('Test connection', '', () => checkWd(d.id, true)));
        a.appendChild(btn('Edit', '', () => wdForm(d.id)));
        a.appendChild(btn('Remove', 'danger', async () => {
          if (!(await Dlg.confirm('Remove \u201C' + d.name + '\u201D?', 'Only the saved connection is removed. No files on the server are touched.', 'Remove', true))) return;
          WA.remove(d.id); wdState.delete(d.id);
          if (wdEditing === d.id) wdForm(null, true);
          say('Removed \u201C' + d.name + '\u201D.'); draw();
        }));
      } else if (d.kind === 'gdrive') {
        if (ok) a.appendChild(btn('Sign out', 'danger', async () => {
          if (!(await Dlg.confirm('Sign out of Google Drive?', 'Disk forgets your Google sign-in and tells Google to cancel it. Your files stay in Google Drive.', 'Sign out', true))) return;
          if (window.GoogleAuth) await window.GoogleAuth.signOut();
          gdPanel(false); draw();
        }));
        else a.appendChild(btn(st === 'setup' ? 'Set up' : st === 'renew' ? 'Renew' : 'Connect', 'primary', () => gdPanel(true)));
      } else {
        if (!ok && d.kind === 'folder') a.appendChild(btn('Allow access', 'primary', async () => { if (await D.allow(d.id)) draw(); else say('The browser did not allow access.'); }));
        if (ok) a.appendChild(btn('Calculate', '', () => calc(d.id), 'Add up the size of every file (can take a while on big folders)'));
        if (d.kind === 'folder') a.appendChild(btn('Remove', 'danger', async () => {
          if (!(await Dlg.confirm('Remove \u201C' + d.name + '\u201D from the list?', 'The Hub only forgets this folder. Your files stay where they are.', 'Remove', true))) return;
          await D.remove(d.id); sizes.delete(d.id); draw();
        }));
      }
      if (d.kind !== 'gdrive' || ok) { const o = el('a', 'btn', 'Open in Files'); o.href = FILES + '#drive=' + encodeURIComponent(d.id); a.appendChild(o); }
      r.appendChild(a); box.appendChild(r);
    });
  }
  /* ---- H133: WebDAV drives (was Settings › Network drives, sec_drives.js) ---- */
  const WA = window.WebDavAccounts, WF = window.WebDavFs;
  const wdState = new Map();   // id → { state: 'checking' | 'done', ok, text }
  /** Plain words for a WebDavFs.test result (same as Settings had). */
  function wdExplain(r) {
    if (r.ok) return 'Connected';
    if (r.name === 'NotAllowedError') return 'wrong user or password (the server refused it)';
    if (r.name === 'NotFoundError') return 'folder not found at that URL';
    if (/reach/.test(r.error || '')) return 'can\u2019t reach the server. Is it on, https, and does it allow CORS (browser requests from this site)?';
    return (r.error || 'failed').replace(/^WebDAV: /, '');
  }
  async function checkWd(id, loud) {
    const acc = WA && WA.get(id);
    if (!acc || !WF) return;
    const cur = wdState.get(id);
    if (cur && cur.state === 'checking') return;
    wdState.set(id, { state: 'checking' });
    if (loud) draw();
    const r = await WF.test(acc);
    wdState.set(id, { state: 'done', ok: r.ok, text: wdExplain(r) });
    if (loud) say(r.ok ? '\u201C' + acc.name + '\u201D is connected.' : '\u201C' + acc.name + '\u201D: ' + wdExplain(r));
    draw();
  }
  let wdEditing = null;
  /** The add / edit form under the list (id = edit that drive, null = add; close = hide it). */
  function wdForm(id, close) {
    const box = $('wd-form');
    wdEditing = null;
    if (close || !WA) { box.hidden = true; box.textContent = ''; $('add-wd').hidden = !WA; return; }
    const acc = id ? WA.get(id) : null;
    if (id && !acc) { say('That drive is not saved any more.'); return; }
    wdEditing = acc ? acc.id : null;
    box.textContent = '';
    const inp = (ph, type, label, v) => { const i = el('input', 'wd-in'); Object.assign(i, { type, placeholder: ph, autocomplete: 'off', spellcheck: false, value: v || '' }); i.setAttribute('aria-label', label); i.setAttribute('autocapitalize', 'off'); return i; };
    const title = el('b', 'wd-title', acc ? 'Edit \u201C' + acc.name + '\u201D' : 'Add WebDAV drive');
    const hint = el('p', 'muted small', 'Works with WebDAV servers, e.g. Nextcloud or rclone serve webdav. The server must be https (or this computer) and allow CORS. The drive shows in Files. The password stays only in this browser.');
    const name = inp('Name, e.g. Home PC', 'text', 'Name', acc && acc.name);
    const url = inp('https://\u2026 (server folder URL)', 'url', 'URL', acc && acc.url);
    const user = inp('User', 'text', 'User', acc && acc.user);
    const pass = inp('Password', 'password', 'Password', acc && acc.pass);
    const eye = btn('Show', 'wd-eye', () => { pass.type = pass.type === 'password' ? 'text' : 'password'; eye.textContent = pass.type === 'password' ? 'Show' : 'Hide'; }, 'Show or hide the password');
    const out = el('p', 'wd-out', '');
    const tell = (t, c) => { out.textContent = t || ''; out.className = 'wd-out' + (c ? ' ' + c : ''); };
    const vals = () => ({ name: name.value.trim(), url: url.value.trim(), user: user.value.trim(), pass: pass.value });
    const valid = (v) => { try { const u = new URL(v.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (_) { tell('Enter the full URL, e.g. https://host/dav/', 'bad'); return false; } return true; };
    const test = btn('Test connection', '', async () => {
      const v = vals(); if (!valid(v)) return;
      test.disabled = true; tell('Testing\u2026');
      const r = await WF.test(v); tell(r.ok ? '\u2713 Connected' : wdExplain(r), r.ok ? 'ok' : 'bad');
      test.disabled = false;
    });
    const save = btn(acc ? 'Save' : 'Add', 'primary', () => {
      const v = vals(); if (!valid(v)) return;
      let sid = wdEditing;
      if (sid) WA.update(sid, v); else sid = WA.add(v);
      wdState.delete(sid);
      say(acc ? 'Saved.' : 'Added \u201C' + (WA.get(sid) || {}).name + '\u201D. It shows in Files.');
      wdForm(null, true); draw();
    });
    const cancel = btn('Cancel', '', () => wdForm(null, true));
    const l1 = el('div', 'wd-line'), l2 = el('div', 'wd-line'), l3 = el('div', 'wd-line');
    l1.append(name, url); l2.append(user, pass, eye); l3.append(test, save, cancel);
    [name, url, user, pass].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } }));
    box.append(title, hint, l1, l2, l3, out);
    box.hidden = false; $('add-wd').hidden = true;
    name.focus();
    box.scrollIntoView({ block: 'nearest' });
  }
  if (!WA || !WF) $('add-wd').hidden = true;
  $('add-wd').addEventListener('click', () => wdForm(null));
  function fromHash() {
    const h = location.hash.slice(1);
    if (h === 'add-webdav') wdForm(null);
    else if (/^edit=webdav%3A\d+$|^edit=webdav:\d+$/.test(h)) wdForm(decodeURIComponent(h.slice(5)));
  }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('storage', (e) => { if (e.key === 'hub-webdav-accounts') draw(); });

  if (!D.canAddFolder) { $('add').hidden = true; $('add-note').hidden = false; }
  $('add').addEventListener('click', async () => { const f = await D.addFolder().catch(() => null); if (f) { say('Added \u201C' + f.name + '\u201D.'); draw(); } });

  // ---- clean-up ----
  async function thumbs() {
    if (!TS) { $('thumb-txt').textContent = 'Not available'; $('thumbs').disabled = true; return; }
    try { const s = await TS.stats(); $('thumb-txt').textContent = s.count + (s.count === 1 ? ' picture, ' : ' pictures, ') + fmt(s.bytes); /* R54b: '1 picture' */ } catch (_) { $('thumb-txt').textContent = '—'; }
  }
  $('thumbs').addEventListener('click', async () => {
    if (!(await Dlg.confirm('Clear the thumbnail cache?', 'Files makes the small previews again when you open a folder.', 'Clear'))) return;
    await TS.clear(); say('Thumbnail cache cleared.'); thumbs(); space();
  });
  $('empty').hidden = !D.hasLocal;
  $('empty').addEventListener('click', async () => {
    if (!(await Dlg.confirm('Empty Local storage?', 'This DELETES every file and folder in Local, for good. Files on your computer and in Google Drive are not touched. This cannot be undone.', 'Delete everything', true))) return;
    try {
      const root = await navigator.storage.getDirectory();
      const names = []; for await (const k of root.keys()) names.push(k);
      for (const n of names) await root.removeEntry(n, { recursive: true });
      sizes.delete('local'); announce(); say('Local storage is empty.');
    } catch (_) { say('Could not empty Local storage.'); }
    draw(); space();
  });

  D.onChange(draw);
  if (window.GoogleAuth && window.GoogleAuth.onChange) window.GoogleAuth.onChange(() => draw());
  if (TS && TS.onClear) TS.onClear(thumbs);
  draw(); space(); thumbs();
  fromHash();   // H133
})();
