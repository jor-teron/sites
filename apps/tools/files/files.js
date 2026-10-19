/*
 * Files app (apps/tools/files/files.js) — drives on the left (Local + added folders, with
 * "Allow access" / remove ✕ / "Add folder"), the open folder on the right: ⇧ Up, a clickable
 * path, New folder, Upload (into this folder), Refresh; each row shows icon, name, size and
 * Download / Rename / Delete (asks first). A folder opens on click; a text or image file opens
 * in the preview (files_preview.js), other files download.
 * #drive=<id> opens that drive (the Hub desktop's drive tiles use it; hashchange too).
 */
(function () {
  'use strict';
  const D = window.FsDrives, F = window.FsOps, Dlg = window.FilesDialog, Pv = window.FilesPreview;
  const $ = (id) => document.getElementById(id);
  const drivesEl = $('drives'), listEl = $('list'), crumbsEl = $('crumbs'), msgEl = $('msg'), fileIn = $('file-in');
  let driveId = '', stack = [];   // stack[0] = drive root { name, handle }, last = open folder
  const cur = () => (stack.length ? stack[stack.length - 1].handle : null);

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, title, fn) {
    const b = el('button', cls, text); b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }
  function say(text, bad) { msgEl.hidden = !text; msgEl.textContent = text || ''; msgEl.classList.toggle('bad', !!bad); }
  function size(n) {
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }
  function icon(e) {
    if (e.kind === 'directory') return '\uD83D\uDCC1';
    const k = Pv.kind(e.name, '');
    if (k === 'image') return '\uD83D\uDDBC\uFE0F';
    if (k === 'text') return '\uD83D\uDCC4';
    if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(e.name)) return '\uD83C\uDFB5';
    if (/\.(mp4|webm|mkv|mov)$/i.test(e.name)) return '\uD83C\uDFAC';
    if (/\.(zip|7z|rar|gz|tar)$/i.test(e.name)) return '\uD83D\uDDDC\uFE0F';
    if (/\.pdf$/i.test(e.name)) return '\uD83D\uDCD5';
    return '\uD83D\uDCE6';
  }
  const fail = (e) => say((e && e.message) || 'Something went wrong', true);

  /* ---------- drives ---------- */
  async function drawDrives() {
    const list = await D.list();
    const rows = [];
    for (const d of list) {
      const r = el('div', 'drive' + (d.id === driveId ? ' on' : ''));
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', 'Open ' + d.name, () => openDrive(d.id, true));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      r.appendChild(open);
      if (d.kind === 'folder') {
        if ((await D.access(d.id)) !== 'granted') {
          r.appendChild(btn('drive-allow', 'Allow access', 'Allow access to ' + d.name, async () => { if (await D.allow(d.id)) { await drawDrives(); openDrive(d.id, true); } }));
        }
        r.appendChild(btn('drive-x', '\u00D7', 'Remove ' + d.name + ' from the list (files stay)', async () => {
          if (!(await Dlg.confirm('Remove "' + d.name + '"?', 'It is only removed from this list. No files are deleted.', 'Remove'))) return;
          await D.remove(d.id);
          if (driveId === d.id) { driveId = ''; stack = []; drawList(); }
          drawDrives();
        }));
      }
      rows.push(r);
    }
    if (D.canAddFolder) {
      rows.push(btn('drive-add', '\uFF0B Add folder', 'Add a folder from this computer', async () => {
        const d = await D.addFolder();
        if (d) { await drawDrives(); openDrive(d.id, true); }
      }));
    }
    if (!list.length) rows.unshift(el('p', 'drive-none', 'This browser has no file storage for web pages.'));
    drivesEl.replaceChildren(...rows);
  }

  async function openDrive(id, fromClick) {
    say('');
    const h = await D.handle(id);
    if (!h) { fail(new Error('Drive not found')); return; }
    if ((await D.access(id)) !== 'granted') {
      if (!fromClick || !(await D.allow(id))) {
        driveId = id; stack = []; drawDrives(); drawList();
        say('Click \u201cAllow access\u201d to open this folder.');
        return;
      }
    }
    const list = await D.list();
    const d = list.find((x) => x.id === id);
    driveId = id;
    stack = [{ name: d ? d.name : h.name, handle: h }];
    if (location.hash !== '#drive=' + id) history.replaceState(null, '', '#drive=' + encodeURIComponent(id));
    drawDrives();
    drawList();
  }

  /* ---------- folder view ---------- */
  function drawCrumbs() {
    const parts = stack.map((s, i) => {
      const b = btn('crumb', s.name, null, () => { stack = stack.slice(0, i + 1); drawList(); });
      if (i === stack.length - 1) b.setAttribute('aria-current', 'page');
      return b;
    });
    const out = [];
    parts.forEach((p, i) => { if (i) out.push(el('span', 'crumb-sep', '\u203A')); out.push(p); });
    crumbsEl.replaceChildren(...out);
    $('up').disabled = stack.length < 2;
    ['mkdir', 'upload', 'refresh'].forEach((x) => { $(x).disabled = !stack.length; });
  }

  async function drawList() {
    drawCrumbs();
    const dir = cur();
    if (!dir) { listEl.replaceChildren(el('p', 'empty', 'Pick a drive on the left.')); return; }
    let items;
    try { items = await F.list(dir); } catch (e) { listEl.replaceChildren(); fail(e); return; }
    if (dir !== cur()) return;   // moved on meanwhile
    if (!items.length) { listEl.replaceChildren(el('p', 'empty', 'This folder is empty. Use \uFF0B Folder or \u21EA Upload.')); return; }
    listEl.replaceChildren(...items.map(row));
  }

  function row(e) {
    const r = el('div', 'row');
    r.setAttribute('role', 'listitem');
    const main = btn('row-main', '', (e.kind === 'directory' ? 'Open ' : 'Open ') + e.name, () => openEntry(e));
    main.append(el('span', 'row-ico', icon(e)), el('span', 'row-name', e.name),
      el('span', 'row-size', e.kind === 'file' ? size(e.size) : ''));
    r.appendChild(main);
    const acts = el('div', 'row-acts');
    if (e.kind === 'file') acts.appendChild(btn('act', '\u2B07', 'Download ' + e.name, () => download(e)));
    acts.appendChild(btn('act', '\u270E', 'Rename ' + e.name, () => renameEntry(e)));
    acts.appendChild(btn('act danger', '\uD83D\uDDD1', 'Delete ' + e.name, () => deleteEntry(e)));
    r.appendChild(acts);
    return r;
  }

  async function openEntry(e) {
    if (e.kind === 'directory') { stack.push({ name: e.name, handle: e.handle }); say(''); drawList(); return; }
    try {
      const f = await e.handle.getFile();
      if (Pv.kind(f.name, f.type)) Pv.show(f, saveBlob); else saveBlob(f);
    } catch (err) { fail(err); }
  }
  function saveBlob(f) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function download(e) { try { saveBlob(await e.handle.getFile()); } catch (err) { fail(err); } }

  async function renameEntry(e) {
    const n = await Dlg.ask('Rename', e.name, 'Rename');
    if (n == null || n === e.name) return;
    const bad = F.validName(n);
    if (bad) { say(bad, true); return; }
    try { await F.rename(cur(), e, n); say('Renamed to \u201c' + n + '\u201d'); } catch (err) { fail(err); }
    drawList();
  }
  async function deleteEntry(e) {
    const what = e.kind === 'directory' ? 'the folder \u201c' + e.name + '\u201d and everything in it' : '\u201c' + e.name + '\u201d';
    if (!(await Dlg.confirm('Delete?', 'This deletes ' + what + '. It cannot be undone.', 'Delete'))) return;
    try { await F.remove(cur(), e); say('Deleted \u201c' + e.name + '\u201d'); } catch (err) { fail(err); }
    drawList();
  }

  $('up').addEventListener('click', () => { if (stack.length > 1) { stack.pop(); say(''); drawList(); } });
  $('refresh').addEventListener('click', () => { say(''); drawList(); });
  $('mkdir').addEventListener('click', async () => {
    const n = await Dlg.ask('New folder', 'New folder', 'Create');
    if (n == null) return;
    const bad = F.validName(n);
    if (bad) { say(bad, true); return; }
    try { await F.mkdir(cur(), n); say('Folder \u201c' + n + '\u201d created'); } catch (err) { fail(err); }
    drawList();
  });
  $('upload').addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const files = Array.from(fileIn.files || []);
    fileIn.value = '';
    if (!files.length || !cur()) return;
    const dir = cur();
    let n = 0;
    for (const f of files) {
      say('Uploading ' + (n + 1) + ' of ' + files.length + ': ' + f.name + '\u2026');
      try { await F.writeFile(dir, f.name, f); n++; } catch (err) { fail(err); drawList(); return; }
    }
    say(n + (n === 1 ? ' file' : ' files') + ' uploaded');
    drawList();
  });

  function fromHash() {
    const m = /^#drive=(.+)$/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : '';
  }
  window.addEventListener('hashchange', () => { const id = fromHash(); if (id && id !== driveId) openDrive(id, false); });
  D.onChange(drawDrives);

  (async () => {
    await drawDrives();
    const id = fromHash() || (D.hasLocal ? 'local' : '');
    if (id) openDrive(id, false); else drawList();
  })();
})();
