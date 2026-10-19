/*
 * File operations (shared/fs/fs_ops.js) on a FileSystemDirectoryHandle — work the same for
 * the Local drive (OPFS) and a picked folder (fs_drives.js), and across them. Used by Files.
 * Google Drive (shared/google/gdrive_fs.js) looks like a directory handle too; its file handles
 * carry .meta {size, modified, type}, used instead of getFile() (no download just to list).
 *
 * API window.FsOps:
 *   list(dir)                       → [{ name, kind:'directory'|'file', size, modified, type, handle }]
 *   mkdir(dir, name)                → new folder (fails if the name exists)
 *   writeFile(dir, name, blob, onBytes?)  → file handle (overwrites; files over 8 MB are written
 *                                     in 4 MB pieces, onBytes(n) after each)
 *   readFile(dir, name)             → File
 *   exists(dir, name)               → boolean
 *   uniqueName(dir, name)           → 'name (2).ext' style name that is free ("Keep both")
 *   stats(handle)                   → { files, folders, bytes } of a file / whole folder
 *   copy(handle, destDir, name, onBytes?)   → copies a file or a whole folder into destDir
 *   move(handle, srcDir, destDir, name, onBytes?)  → handle.move() when possible (same drive),
 *                                     else copy + delete
 *   inside(folder, dir)             → true when dir is folder itself or somewhere inside it
 *   rename(dir, entry, newName), remove(dir, entry), validName(name) → '' or a reason
 */
(function () {
  'use strict';
  const BIG = 8 * 1024 * 1024, PIECE = 4 * 1024 * 1024;

  async function list(dir) {
    const out = [];
    for await (const [name, h] of dir.entries()) {
      const e = { name, kind: h.kind, size: 0, modified: 0, type: '', handle: h };
      if (h.kind === 'file' && h.meta) Object.assign(e, { size: h.meta.size, modified: h.meta.modified, type: h.meta.type });   // Google Drive: no download
      else if (h.kind === 'file') { try { const f = await h.getFile(); e.size = f.size; e.modified = f.lastModified; e.type = f.type; } catch (_) { /* unreadable */ } }
      out.push(e);
    }
    return out;
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
  async function uniqueName(dir, name) {
    if (!(await exists(dir, name))) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    const stem = base.replace(/ \(\d+\)$/, '');
    for (let i = 2; i < 1000; i++) { const n = stem + ' (' + i + ')' + ext; if (!(await exists(dir, n))) return n; }
    return stem + ' (' + Date.now() + ')' + ext;
  }
  async function mkdir(dir, name) {
    if (await exists(dir, name)) throw new Error('\u201c' + name + '\u201d already exists');
    return dir.getDirectoryHandle(name, { create: true });
  }
  async function writeFile(dir, name, blob, onBytes) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try {
      if (blob.size > BIG) {
        for (let at = 0; at < blob.size; at += PIECE) {
          const part = blob.slice(at, at + PIECE);
          await w.write(part);
          if (onBytes) onBytes(part.size);
        }
      } else {
        await w.write(blob);
        if (onBytes) onBytes(blob.size);
      }
    } catch (e) { try { await w.abort(); } catch (_) { /* ignore */ } throw e; }
    await w.close();
    return fh;
  }
  async function readFile(dir, name) { return (await dir.getFileHandle(name)).getFile(); }
  async function stats(h) {
    if (h.kind === 'file' && h.meta) return { files: 1, folders: 0, bytes: h.meta.size || 0 };
    if (h.kind === 'file') { let s = 0; try { s = (await h.getFile()).size; } catch (_) { /* ignore */ } return { files: 1, folders: 0, bytes: s }; }
    const t = { files: 0, folders: 0, bytes: 0 };
    for await (const [, c] of h.entries()) {
      if (c.kind === 'directory') t.folders++;
      const s = await stats(c);
      t.files += s.files; t.folders += s.folders; t.bytes += s.bytes;
    }
    return t;
  }
  async function copy(h, destDir, name, onBytes) {
    if (h.kind === 'file') return writeFile(destDir, name, await h.getFile(), onBytes);
    const nd = await destDir.getDirectoryHandle(name, { create: true });
    for await (const [n, c] of h.entries()) await copy(c, nd, n, onBytes);
    return nd;
  }
  async function inside(folder, dir) {
    if (folder.kind !== 'directory') return false;
    try { return (await folder.resolve(dir)) !== null; } catch (_) { return false; }
  }
  async function move(h, srcDir, destDir, name, onBytes) {
    let same = false;
    try { same = (await srcDir.resolve(destDir)) !== null || (await destDir.resolve(srcDir)) !== null; } catch (_) { same = false; }
    if (same && typeof h.move === 'function') {
      try { await h.move(destDir, name); return h; } catch (_) { /* fall back to copy + delete */ }
    }
    const out = await copy(h, destDir, name, onBytes);
    await srcDir.removeEntry(h.name, { recursive: h.kind === 'directory' });
    return out;
  }
  async function rename(dir, entry, newName) {
    if (newName === entry.name) return;
    if (await exists(dir, newName)) throw new Error('\u201c' + newName + '\u201d already exists');
    const h = entry.handle;
    if (typeof h.move === 'function') {
      try { await h.move(newName); return; } catch (_) { /* fall back below */ }
    }
    await copy(h, dir, newName);
    await dir.removeEntry(entry.name, { recursive: true });
  }
  async function remove(dir, entry) { await dir.removeEntry(entry.name, { recursive: entry.kind === 'directory' }); }
  window.FsOps = { list, mkdir, writeFile, readFile, exists, uniqueName, stats, copy, move, inside, rename, remove, validName };
})();
