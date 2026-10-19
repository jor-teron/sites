/*
 * Files actions (apps/tools/files/files_actions.js) — everything that changes or opens files:
 * open, Open with… (Notely / text view / image viewer / download), cut / copy / paste and
 * drag-moves (also between drives: Local ↔ added folder), upload, new folder, rename, delete,
 * download, properties. Name clashes ask Replace / Keep both / Skip ("Do this for all");
 * copying into the same folder keeps both ("name (2).txt"). Long jobs show the progress bar
 * (with Stop) from FX.progress.
 * Open with Notely: hand-off through sessionStorage 'notely-handoff' ({ name, text, t }), read by
 * apps/office/notely/nl_handoff.js (text files up to 2 MB).
 * API FX.act: open, openWith, clip(mode), paste(dir?), transfer(entries, srcDir, destDir, mode),
 *   upload(files, dir?), newFolder, rename(entry), remove(entries), download(entries), props(entries).
 */
(function () {
  'use strict';
  const { st, cur, say, fail, size, kind, pathText } = FX;
  const Dlg = window.UiDialog, O = window.FsOps;
  const NOTELY = 'apps/office/notely/', NOTELY_MAX = 2 * 1024 * 1024;
  const done = () => FX.view.load();
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /* ---------- open ---------- */
  function open(e) {
    if (!e) return;
    if (e.kind === 'directory') { FX.drives.into(e); return; }
    const k = kind(e.name, e.type);
    if (k === 'image') FX.viewer.image(e);
    else if (k === 'text') FX.viewer.text(e);
    else download([e]);
  }
  async function openWith(e) {
    if (!e || e.kind !== 'file') return;
    const k = kind(e.name, e.type);
    const btns = [{ value: 'download', label: '\u2B07 Download' }];
    if (k === 'image') btns.push({ value: 'image', label: '\uD83D\uDDBC Image viewer', kind: 'primary' });
    else {
      btns.push({ value: 'text', label: '\uD83D\uDCC4 Text view' });
      if (k === 'text' || e.size <= NOTELY_MAX) btns.push({ value: 'notely', label: '\uD83D\uDCDD Notely', kind: 'primary' });
    }
    const r = await Dlg.choose('Open \u201c' + e.name + '\u201d with\u2026', '', btns);
    if (!r) return;
    if (r.value === 'download') download([e]);
    else if (r.value === 'image') FX.viewer.image(e);
    else if (r.value === 'text') FX.viewer.text(e);
    else if (r.value === 'notely') toNotely(e);
  }
  /** Hand a text file to Notely (it asks before replacing its notes). */
  async function toNotely(e) {
    try {
      const f = await e.handle.getFile();
      if (f.size > NOTELY_MAX) { say('Too big for Notely (over 2 MB)', true); return; }
      const text = await f.text();
      if (/\u0000/.test(text.slice(0, 2000))) { say('That does not look like a text file', true); return; }
      sessionStorage.setItem('notely-handoff', JSON.stringify({ name: f.name, text, t: Date.now() }));
      let hub = null;
      try { hub = window.parent !== window && window.parent.__hubOpenApp ? window.parent : null; } catch (_) { hub = null; }
      if (hub) hub.__hubOpenApp(NOTELY);
      else window.open('../../office/notely/', '_blank');
      say('Opened in Notely');
    } catch (err) { fail(err); }
  }

  /* ---------- clipboard ---------- */
  function clip(mode) {
    const sel = FX.selected();
    if (!sel.length) return;
    st.clip = { mode, dir: cur(), driveId: st.driveId, entries: sel.map((x) => ({ name: x.name, kind: x.kind, handle: x.handle })) };
    say((mode === 'cut' ? 'Cut ' : 'Copied ') + plural(sel.length, 'item', 'items') + ' \u2014 paste in another folder');
    FX.view.render();
  }
  async function paste(dir) {
    if (!st.clip) return;
    const c = st.clip;
    const ok = await transfer(c.entries, c.dir, dir || cur(), c.mode === 'cut' ? 'move' : 'copy');
    if (ok && c.mode === 'cut') st.clip = null;
    FX.view.render();
  }

  /** Name clash: 'replace' | 'both' | 'skip' | null (stop). memo keeps a "for all" answer. */
  async function clash(name, more, memo) {
    if (memo.all) return memo.all;
    const r = await Dlg.choose('\u201c' + name + '\u201d is already here', 'Replace it, keep both, or skip this one?', [
      { value: 'skip', label: 'Skip' }, { value: 'both', label: 'Keep both' }, { value: 'replace', label: 'Replace', kind: 'danger' }
    ], { allLabel: more ? 'Do this for all clashes' : '' });
    if (!r) return null;
    if (r.all) memo.all = r.value;
    return r.value;
  }
  /** Find a free target name or ask; returns the name to use, '' = skip, null = stop. */
  async function target(dir, name, more, memo, sameDirCopy) {
    if (!(await O.exists(dir, name))) return name;
    if (sameDirCopy) return O.uniqueName(dir, name);
    const how = await clash(name, more, memo);
    if (how === null) return null;
    if (how === 'skip') return '';
    if (how === 'both') return O.uniqueName(dir, name);
    await dir.removeEntry(name, { recursive: true });
    return name;
  }
  async function sameEntry(a, b) { try { return await a.isSameEntry(b); } catch (_) { return false; } }

  /** Copy or move entries from srcDir into destDir (any drives). Returns true when it finished. */
  async function transfer(entries, srcDir, destDir, mode) {
    if (!entries.length || !destDir) return false;
    const same = await sameEntry(srcDir, destDir);
    if (mode === 'move' && same) return false;   // already here
    const p = FX.progress(mode === 'move' ? 'Moving' : 'Copying');
    const memo = {};
    let n = 0, skipped = 0, stopped = false;
    try {
      let total = 0;
      const sizes = [];
      for (const e of entries) { const s = await O.stats(e.handle); sizes.push(s.bytes); total += s.bytes; }
      p.total(total);
      for (let i = 0; i < entries.length; i++) {
        if (p.cancelled) { stopped = true; break; }
        const e = entries[i];
        if (e.kind === 'directory' && (await O.inside(e.handle, destDir))) { say('Can\u2019t put \u201c' + e.name + '\u201d inside itself', true); skipped++; continue; }
        p.label(e.name);
        const name = await target(destDir, e.name, i < entries.length - 1, memo, mode === 'copy' && same);
        if (name === null) { stopped = true; break; }
        if (!name) { skipped++; p.add(sizes[i]); continue; }
        let got = 0;
        const onB = (b) => { got += b; p.add(b); };
        if (mode === 'move') await O.move(e.handle, srcDir, destDir, name, onB);
        else await O.copy(e.handle, destDir, name, onB);
        p.add(Math.max(0, sizes[i] - got));
        n++;
      }
    } catch (err) { fail(err); p.done(); done(); return false; }
    p.done();
    say((mode === 'move' ? 'Moved ' : 'Copied ') + plural(n, 'item', 'items') + (skipped ? ', skipped ' + skipped : '') + (stopped ? ' (stopped)' : ''));
    done();
    return !stopped;
  }

  async function upload(files, dir) {
    dir = dir || cur();
    if (!dir || !files.length) return;
    const p = FX.progress('Uploading');
    p.total(files.reduce((a, f) => a + f.size, 0));
    const memo = {};
    let n = 0, skipped = 0, stopped = false;
    try {
      for (let i = 0; i < files.length; i++) {
        if (p.cancelled) { stopped = true; break; }
        const f = files[i];
        p.label(f.name);
        const bad = O.validName(f.name);
        if (bad) { skipped++; continue; }
        const name = await target(dir, f.name, i < files.length - 1, memo, false);
        if (name === null) { stopped = true; break; }
        if (!name) { skipped++; p.add(f.size); continue; }
        await O.writeFile(dir, name, f, (b) => p.add(b));
        n++;
      }
    } catch (err) { fail(err); }
    p.done();
    say(plural(n, 'file', 'files') + ' uploaded' + (skipped ? ', skipped ' + skipped : '') + (stopped ? ' (stopped)' : ''));
    done();
  }

  /* ---------- simple ones ---------- */
  async function newFolder() {
    if (!cur()) return;
    const name = await O.uniqueName(cur(), 'New folder');
    const n = await Dlg.ask('New folder', name, 'Create');
    if (n == null) return;
    const bad = O.validName(n);
    if (bad) { say(bad, true); return; }
    try { await O.mkdir(cur(), n); say('Folder \u201c' + n + '\u201d created'); st.sel = new Set([n]); } catch (err) { fail(err); }
    done();
  }
  async function rename(e) {
    if (!e) return;
    const n = await Dlg.ask('Rename', e.name, 'Rename');
    if (n == null || n === e.name) return;
    const bad = O.validName(n);
    if (bad) { say(bad, true); return; }
    try { await O.rename(cur(), e, n); say('Renamed to \u201c' + n + '\u201d'); st.sel = new Set([n]); } catch (err) { fail(err); }
    done();
  }
  async function remove(entries) {
    if (!entries.length) return;
    const one = entries.length === 1 ? entries[0] : null;
    const what = one ? (one.kind === 'directory' ? 'the folder \u201c' + one.name + '\u201d and everything in it' : '\u201c' + one.name + '\u201d')
      : plural(entries.length, 'item', 'items') + ' (folders with everything in them)';
    if (!(await Dlg.confirm('Delete?', 'This deletes ' + what + '. It cannot be undone.', 'Delete'))) return;
    const dir = cur();
    let n = 0;
    try { for (const e of entries) { await O.remove(dir, e); n++; } } catch (err) { fail(err); }
    if (n) say('Deleted ' + plural(n, 'item', 'items'));
    st.sel.clear();
    done();
  }
  function saveBlob(f) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function download(entries) {
    const files = entries.filter((e) => e.kind === 'file');
    if (!files.length) { say('Folders can\u2019t be downloaded yet \u2014 open it and pick files', true); return; }
    for (const e of files) { try { saveBlob(await e.handle.getFile()); } catch (err) { fail(err); } }
  }
  async function props(entries) {
    const dir = cur();
    if (!entries.length) {   // the open folder
      const s = await O.stats(dir);
      return Dlg.info('Folder properties', [['Name', st.stack[st.stack.length - 1].name], ['Location', pathText()],
        ['Contains', plural(s.files, 'file', 'files') + ', ' + plural(s.folders, 'folder', 'folders')], ['Size', size(s.bytes)]]);
    }
    if (entries.length > 1) {
      let t = { files: 0, folders: 0, bytes: 0 };
      for (const e of entries) { const s = await O.stats(e.handle); t.files += s.files; t.folders += s.folders + (e.kind === 'directory' ? 1 : 0); t.bytes += s.bytes; }
      return Dlg.info(plural(entries.length, 'item', 'items'), [['Location', pathText()],
        ['Contains', plural(t.files, 'file', 'files') + ', ' + plural(t.folders, 'folder', 'folders')], ['Size', size(t.bytes)]]);
    }
    const e = entries[0];
    if (e.kind === 'directory') {
      const s = await O.stats(e.handle);
      return Dlg.info('Properties', [['Name', e.name], ['Type', 'Folder'], ['Location', pathText()],
        ['Contains', plural(s.files, 'file', 'files') + ', ' + plural(s.folders, 'folder', 'folders')], ['Size', size(s.bytes)]]);
    }
    const ext = (e.name.match(/\.([^.]+)$/) || [])[1];
    return Dlg.info('Properties', [['Name', e.name], ['Type', e.type || (ext ? ext.toUpperCase() + ' file' : 'File')],
      ['Location', pathText()], ['Size', size(e.size) + (e.size >= 1024 ? ' (' + e.size.toLocaleString() + ' bytes)' : '')],
      ['Modified', e.modified ? new Date(e.modified).toLocaleString() : '\u2014']]);
  }

  FX.act = { open, openWith, toNotely, clip, paste, transfer, upload, newFolder, rename, remove, download, saveBlob, props };
})();
