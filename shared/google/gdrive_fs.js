/*
 * Google Drive as a "directory handle" (shared/google/gdrive_fs.js) — a small adapter that looks
 * like FileSystemDirectoryHandle / FileSystemFileHandle, so shared/fs/fs_ops.js and the Files app
 * work on Google Drive without changes (fs_drives.js lists it as drive id 'gdrive').
 * Drive v3 REST with fetch + GoogleAuth.fetchApi (Bearer token). Scope drive.file: only the files
 * and folders the Hub created (or that were opened with it) are visible.
 *
 * GDir (kind 'directory'): entries() (async iterator of [name, handle], files.list in pages),
 *   getDirectoryHandle(name, {create}), getFileHandle(name, {create}), removeEntry(name) = move to
 *   Drive's Trash (not gone for good), resolve(other), isSameEntry(other), move(newName | destDir, name),
 *   queryPermission / requestPermission → 'granted'.
 * GFile (kind 'file'): getFile() (download; Google Docs / Sheets / Slides are exported as PDF),
 *   createWritable() → { write(data), close() = upload, abort() } (multipart up to 5 MB, larger
 *   = resumable upload), move(newName | destDir, name), isSameEntry, meta = { size, modified, type }
 *   (fs_ops.js uses it so listing a folder doesn't download every file).
 * Duplicate names in one Drive folder: the first one wins (Files works by name).
 * API window.GDriveFs: root() → GDir of "My Drive", api(path, opts) → JSON.
 */
(function () {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3/';
  const UP = 'https://www.googleapis.com/upload/drive/v3/files';
  const FOLDER = 'application/vnd.google-apps.folder';
  const FIELDS = 'id,name,mimeType,size,modifiedTime';
  const SMALL = 5 * 1024 * 1024;

  const dom = (name, msg) => { try { return new DOMException(msg, name); } catch (_) { const e = new Error(msg); e.name = name; return e; } };
  async function api(path, opts) {
    const r = await GoogleAuth.fetchApi(path.indexOf('https:') === 0 ? path : API + path, opts);
    if (!r.ok) {
      let m = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j.error) m = (j.error.message || j.error) + ' (HTTP ' + r.status + ')'; } catch (_) { /* not json */ }
      throw new Error('Google Drive: ' + m);
    }
    return r.status === 204 ? {} : r.json();
  }
  const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const isNative = (mime) => /^application\/vnd\.google-apps\./.test(mime || '') && mime !== FOLDER;
  const json = (o) => ({ method: o.method || 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(o.body) });

  function make(f, parent) {
    return f.mimeType === FOLDER ? new GDir(f.id, f.name, parent) : new GFile(f, parent);
  }
  async function children(dir, name) {
    const out = [];
    let page = '';
    do {
      const p = new URLSearchParams({
        q: q(dir.id) + ' in parents and trashed = false' + (name != null ? ' and name = ' + q(name) : ''),
        fields: 'nextPageToken,files(' + FIELDS + ')', pageSize: '1000', orderBy: 'folder,name'
      });
      if (page) p.set('pageToken', page);
      const j = await api('files?' + p);
      (j.files || []).forEach((f) => { if (f.mimeType !== 'application/vnd.google-apps.shortcut') out.push(f); });
      page = j.nextPageToken || '';
    } while (page);
    return out;
  }
  /** Shared by both kinds: rename (string) or move into destDir (with a new name). */
  async function moveIt(h, a, b) {
    const name = typeof a === 'string' ? a : (b || h.name);
    const p = new URLSearchParams({ fields: FIELDS });
    if (typeof a !== 'string' && a && a.id) {
      p.set('addParents', a.id);
      if (h.parent) p.set('removeParents', h.parent.id);
    }
    const f = await api('files/' + h.id + '?' + p, json({ method: 'PATCH', body: { name } }));
    h.name = f.name;
    if (typeof a !== 'string' && a) h.parent = a;
  }

  class GDir {
    constructor(id, name, parent) { this.kind = 'directory'; this.id = id; this.name = name; this.parent = parent || null; }
    async *entries() {
      const seen = new Set();
      for (const f of await children(this)) {
        if (seen.has(f.name)) continue;
        seen.add(f.name);
        yield [f.name, make(f, this)];
      }
    }
    async *values() { for await (const [, h] of this.entries()) yield h; }
    async *keys() { for await (const [n] of this.entries()) yield n; }
    async find(name, dir) {
      const all = await children(this, name);
      const hit = all.find((f) => (f.mimeType === FOLDER) === dir);
      if (hit) return make(hit, this);
      if (all.length) throw dom('TypeMismatchError', '\u201c' + name + '\u201d is a ' + (dir ? 'file' : 'folder'));
      return null;
    }
    async getDirectoryHandle(name, o) {
      const h = await this.find(name, true);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', '\u201c' + name + '\u201d not found');
      const f = await api('files?fields=' + FIELDS, json({ body: { name, mimeType: FOLDER, parents: [this.id] } }));
      return make(f, this);
    }
    async getFileHandle(name, o) {
      const h = await this.find(name, false);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', '\u201c' + name + '\u201d not found');
      return new GFile({ id: '', name, mimeType: '', size: 0 }, this);   // created on the first close()
    }
    async removeEntry(name) {
      const all = await children(this, name);
      if (!all.length) throw dom('NotFoundError', '\u201c' + name + '\u201d not found');
      await api('files/' + all[0].id + '?fields=id', json({ method: 'PATCH', body: { trashed: true } }));
    }
    async resolve(other) {
      if (!other || !other.id) return null;
      const path = [];
      for (let p = other; p; p = p.parent) {
        if (p.id === this.id) return path.reverse();
        path.push(p.name);
      }
      return null;
    }
    async isSameEntry(o) { return !!o && o.id === this.id && o.kind === this.kind; }
    async move(a, b) { await moveIt(this, a, b); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  class GFile {
    constructor(f, parent) {
      this.kind = 'file'; this.id = f.id; this.name = f.name; this.parent = parent || null; this.mime = f.mimeType || '';
      this.meta = { size: +f.size || 0, modified: f.modifiedTime ? Date.parse(f.modifiedTime) : 0, type: isNative(f.mimeType) ? 'application/pdf' : (f.mimeType || '') };
    }
    async getFile() {
      if (!this.id) return new File([], this.name);
      const url = isNative(this.mime)
        ? API + 'files/' + this.id + '/export?mimeType=' + encodeURIComponent('application/pdf')
        : API + 'files/' + this.id + '?alt=media';
      const r = await GoogleAuth.fetchApi(url);
      if (!r.ok) throw new Error('Google Drive: download failed (HTTP ' + r.status + ')');
      const b = await r.blob();
      return new File([b], this.name, { type: this.meta.type || b.type, lastModified: this.meta.modified || Date.now() });
    }
    async createWritable() {
      const parts = [], h = this;
      return {
        async write(d) {
          if (d && typeof d === 'object' && d.type === 'write') d = d.data;
          if (d != null) parts.push(d);
        },
        async close() { await h.upload(new Blob(parts)); },
        async abort() { parts.length = 0; },
        async truncate() { parts.length = 0; }
      };
    }
    async upload(blob) {
      const type = blob.type || 'application/octet-stream';
      const meta = this.id ? {} : { name: this.name, parents: [this.parent.id] };
      let f;
      if (blob.size <= SMALL) {
        const B = 'hub' + Math.random().toString(36).slice(2);
        const body = new Blob(['--' + B + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
          '\r\n--' + B + '\r\nContent-Type: ' + type + '\r\n\r\n', blob, '\r\n--' + B + '--']);
        f = await api(UP + (this.id ? '/' + this.id : '') + '?uploadType=multipart&fields=' + FIELDS,
          { method: this.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + B }, body });
      } else {
        const r = await GoogleAuth.fetchApi(UP + (this.id ? '/' + this.id : '') + '?uploadType=resumable&fields=' + FIELDS, {
          method: this.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) },
          body: JSON.stringify(meta)
        });
        const loc = r.ok && r.headers.get('Location');
        if (!loc) throw new Error('Google Drive: large upload could not start (HTTP ' + r.status + (r.ok ? ', no upload address' : '') + ')');
        f = await api(loc, { method: 'PUT', headers: { 'Content-Type': type }, body: blob });
      }
      this.id = f.id; this.mime = f.mimeType || type;
      this.meta = { size: +f.size || blob.size, modified: f.modifiedTime ? Date.parse(f.modifiedTime) : Date.now(), type: this.mime };
    }
    async move(a, b) { await moveIt(this, a, b); }
    async isSameEntry(o) { return !!o && !!this.id && o.id === this.id; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  let rootDir = null;
  window.GDriveFs = {
    root() { if (!rootDir) rootDir = new GDir('root', 'Google Drive', null); return rootDir; },
    api, GDir, GFile
  };
})();
