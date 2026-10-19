/*
 * File operations (shared/fs/fs_ops.js) on a FileSystemDirectoryHandle — works the same for
 * the Local drive (OPFS) and a picked folder (fs_drives.js). Used by the Files app.
 *
 * API window.FsOps:
 *   list(dir)                     → Promise<[{ name, kind:'directory'|'file', size, modified, handle }]>
 *                                   folders first, then files, A→Z
 *   mkdir(dir, name)              → new folder handle (fails if the name exists)
 *   writeFile(dir, name, blob)    → file handle (overwrites a file of that name)
 *   readFile(dir, name)           → File
 *   rename(dir, entry, newName)   → uses handle.move() when the browser has it, else copy + delete
 *   remove(dir, entry)            → delete (folders: with everything inside)
 *   exists(dir, name)             → Promise<boolean>
 *   validName(name)               → '' when OK, else a short reason
 */
(function () {
  'use strict';
  async function list(dir) {
    const out = [];
    for await (const [name, h] of dir.entries()) {
      const e = { name, kind: h.kind, size: 0, modified: 0, handle: h };
      if (h.kind === 'file') { try { const f = await h.getFile(); e.size = f.size; e.modified = f.lastModified; } catch (_) { /* unreadable */ } }
      out.push(e);
    }
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return out.sort((a, b) => (a.kind === b.kind ? coll.compare(a.name, b.name) : a.kind === 'directory' ? -1 : 1));
  }
  function validName(n) {
    n = String(n || '');
    if (!n.trim()) return 'Name is empty';
    if (n === '.' || n === '..') return 'Not allowed';
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'No / \\ : * ? " < > | please';
    if (n.length > 200) return 'Too long';
    return '';
  }
  async function exists(dir, name) {
    try { await dir.getFileHandle(name); return true; } catch (_) { /* not a file */ }
    try { await dir.getDirectoryHandle(name); return true; } catch (_) { return false; }
  }
  async function mkdir(dir, name) {
    if (await exists(dir, name)) throw new Error('"' + name + '" already exists');
    return dir.getDirectoryHandle(name, { create: true });
  }
  async function writeFile(dir, name, blob) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(blob); } finally { await w.close(); }
    return fh;
  }
  async function readFile(dir, name) { return (await dir.getFileHandle(name)).getFile(); }
  async function copyInto(src, dir, name) {
    if (src.kind === 'file') return writeFile(dir, name, await src.getFile());
    const nd = await dir.getDirectoryHandle(name, { create: true });
    for await (const [n, h] of src.entries()) await copyInto(h, nd, n);
    return nd;
  }
  async function rename(dir, entry, newName) {
    if (newName === entry.name) return;
    if (await exists(dir, newName)) throw new Error('"' + newName + '" already exists');
    const h = entry.handle;
    if (typeof h.move === 'function') {
      try { await h.move(newName); return; } catch (_) { /* fall back below */ }
      try { await h.move(dir, newName); return; } catch (_) { /* fall back below */ }
    }
    await copyInto(h, dir, newName);
    await dir.removeEntry(entry.name, { recursive: true });
  }
  async function remove(dir, entry) { await dir.removeEntry(entry.name, { recursive: entry.kind === 'directory' }); }
  window.FsOps = { list, mkdir, writeFile, readFile, rename, remove, exists, validName };
})();
