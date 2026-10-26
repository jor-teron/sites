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
      r.appendChild(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2'));
      const m = el('div', 'drive-main'); m.appendChild(el('div', 'drive-name', d.name));
      let stText, ok = false;
      if (d.kind === 'gdrive') {
        ok = st === 'ok';
        const u = ok && window.GoogleAuth && window.GoogleAuth.user ? window.GoogleAuth.user() : null;
        stText = ok ? 'Connected' + (u && u.email ? ' as ' + u.email : '') : st === 'setup' ? 'Not set up' : st === 'renew' ? 'Sign-in ran out' : 'Not connected';
      } else {
        ok = st === 'granted';
        stText = (d.kind === 'local' ? 'This browser\u2019s private storage' : 'Folder on this computer') + ' \u00B7 ' + (ok ? 'Ready' : st === 'denied' ? 'Access blocked' : 'Needs access');
      }
      const s = el('div', 'drive-st' + (ok ? ' ok' : ''), stText);
      if (d.kind !== 'gdrive' && sizes.has(d.id)) s.append(' \u00B7 ', el('b', 'drive-size', sizes.get(d.id)));
      m.appendChild(s); r.appendChild(m);
      const a = el('div', 'drive-acts');
      if (d.kind === 'gdrive') {
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
})();
