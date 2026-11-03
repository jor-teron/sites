/*
 * WebDAV as a "directory handle" (shared/fs/webdav_fs.js) — H115. A small adapter that looks like
 * FileSystemDirectoryHandle / FileSystemFileHandle (same shape as shared/google/gdrive_fs.js), so
 * shared/fs/fs_ops.js and the Files app can work on any WebDAV server (Nextcloud, rclone serve
 * webdav, the launcher relay ...). Plain fetch, no library; Basic auth when account.user is set.
 *
 * WDir (kind 'directory', name, path, parent): entries() (async iterator of [name, handle],
 *   PROPFIND Depth: 1, XML read with DOMParser, any namespace prefix), values(), keys(),
 *   getDirectoryHandle(name, {create}) (MKCOL), getFileHandle(name, {create}) (create = PUT empty),
 *   removeEntry(name, opts) = DELETE (gone for good; WebDAV deletes folders with their contents),
 *   resolve(other) (path array or null), isSameEntry(other), move(newName | destDir, name)
 *   (MOVE, Destination = absolute URL, Overwrite: F), queryPermission / requestPermission → 'granted'.
 * WFile (kind 'file'): getFile() (GET → File), createWritable() → { write(data), close() = PUT,
 *   abort(), truncate() }, move(newName | destDir, name), isSameEntry, meta = { size, modified,
 *   type, thumb: '', dur: 0 } (fs_ops.js uses it so listing a folder doesn't download every file).
 * Errors: 401/403 → NotAllowedError, 404 → NotFoundError, wrong kind → TypeMismatchError, all
 *   'WebDAV: ...'. The browser hides network and CORS failures the same way: from the https Hub
 *   the server must be https too and send CORS headers (Access-Control-Allow-Origin, -Headers:
 *   Authorization, Depth, Destination, Overwrite, Content-Type; -Methods incl. PROPFIND MKCOL MOVE).
 * API window.WebDavFs: root(account) → WDir of the server URL, test(account) → Promise<{ok, error}>.
 *   account = { url, user, pass, name }.
 */
(function () {
  'use strict';
  const DAV = 'DAV:';
  const PROPS = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/>' +
    '<d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>';

  const dom = (name, msg) => { try { return new DOMException(msg, name); } catch (_) { const e = new Error(msg); e.name = name; return e; } };
  const enc = (parts) => parts.map((p) => encodeURIComponent(p)).join('/');
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

  class Conn {
    constructor(a) {
      let u = String(a.url || '').trim();
      if (!/\/$/.test(u)) u += '/';
      this.base = u; this.name = a.name || u; this.user = a.user || ''; this.pass = a.pass || '';
      this.basePath = new URL(u).pathname;
    }
    url(path, dir) { return this.base + enc(path) + (dir && path.length ? '/' : ''); }
    async req(method, path, opts) {
      opts = opts || {};
      const h = Object.assign({}, opts.headers || {});
      if (this.user) h.Authorization = 'Basic ' + b64(this.user + ':' + this.pass);
      let r;
      try {
        r = await fetch(opts.href || this.url(path, opts.dir), { method, headers: h, body: opts.body, cache: 'no-store', credentials: 'omit' });
      } catch (e) {
        throw new Error('WebDAV: can\u2019t reach ' + this.base + ' (offline, or blocked by the browser: from the https Hub the server must be https and send CORS headers)');
      }
      if (r.ok || (opts.ok && opts.ok.indexOf(r.status) >= 0)) return r;
      const what = path.length ? '\u201c' + path[path.length - 1] + '\u201d' : this.name;
      if (r.status === 401 || r.status === 403) throw dom('NotAllowedError', 'WebDAV: access denied (HTTP ' + r.status + ', check user and password)');
      if (r.status === 404) throw dom('NotFoundError', 'WebDAV: ' + what + ' not found');
      if (r.status === 412) throw dom('InvalidModificationError', 'WebDAV: ' + what + ' already exists at the destination');
      throw new Error('WebDAV: ' + method + ' ' + what + ' failed (HTTP ' + r.status + ')');
    }
  }

  function tags(el, name) {
    let l = el.getElementsByTagNameNS(DAV, name);
    if (!l.length) l = el.getElementsByTagName(name);
    if (!l.length) l = Array.from(el.getElementsByTagName('*')).filter((x) => (x.localName || '').toLowerCase() === name.toLowerCase());
    return Array.from(l);
  }
  const text = (el, name) => { const t = tags(el, name)[0]; return t ? (t.textContent || '').trim() : ''; };
  const decode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };

  /** PROPFIND Depth 1 → [{name, isDir, size, mtime, type}] without the folder itself. */
  async function list(dir) {
    const c = dir.conn;
    const r = await c.req('PROPFIND', dir.path, { dir: true, headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPS });
    const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
    const self = (c.basePath + enc(dir.path)).replace(/\/+$/, '');
    const out = [];
    tags(xml, 'response').forEach((resp) => {
      let href = text(resp, 'href');
      if (!href) return;
      try { href = new URL(href, c.base).pathname; } catch (_) { /* keep */ }
      const p = href.replace(/\/+$/, '');
      if (decode(p) === decode(self)) return;
      const name = decode(p.split('/').pop());
      if (!name) return;
      const rt = tags(resp, 'resourcetype')[0];
      const isDir = !!(rt && tags(rt, 'collection').length);
      const lm = text(resp, 'getlastmodified');
      out.push({ name, isDir, size: +text(resp, 'getcontentlength') || 0, mtime: lm ? Date.parse(lm) || 0 : 0, type: text(resp, 'getcontenttype') });
    });
    return out;
  }
  const make = (e, parent) => e.isDir ? new WDir(parent.conn, parent.path.concat(e.name), parent) : new WFile(parent.conn, e, parent);

  /** Shared by both kinds: rename (string) or move into destDir (with a new name). */
  async function moveIt(h, a, b) {
    const into = typeof a === 'string' ? h.parent : a;
    const name = typeof a === 'string' ? a : (b || h.name);
    if (!into) throw dom('InvalidModificationError', 'WebDAV: the server root can\u2019t be moved');
    if (into.conn.base !== h.conn.base) throw dom('InvalidModificationError', 'WebDAV: move works only within one server');
    const dir = h.kind === 'directory';
    const dest = new URL(into.conn.url(into.path.concat(name), dir), location.href).href;
    await h.conn.req('MOVE', h.path, { dir, headers: { Destination: dest, Overwrite: 'F' } });
    h.name = name; h.parent = into; h.path = into.path.concat(name);
  }

  class WDir {
    constructor(conn, path, parent) {
      this.kind = 'directory'; this.conn = conn; this.path = path; this.parent = parent || null;
      this.name = path.length ? path[path.length - 1] : conn.name;
    }
    async *entries() {
      const seen = new Set();
      for (const e of await list(this)) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        yield [e.name, make(e, this)];
      }
    }
    async *values() { for await (const [, h] of this.entries()) yield h; }
    async *keys() { for await (const [n] of this.entries()) yield n; }
    async find(name, dir) {
      const hit = (await list(this)).find((e) => e.name === name);
      if (!hit) return null;
      if (hit.isDir !== dir) throw dom('TypeMismatchError', 'WebDAV: \u201c' + name + '\u201d is a ' + (dir ? 'file' : 'folder'));
      return make(hit, this);
    }
    async getDirectoryHandle(name, o) {
      const h = await this.find(name, true);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', 'WebDAV: \u201c' + name + '\u201d not found');
      await this.conn.req('MKCOL', this.path.concat(name), { dir: true });
      return new WDir(this.conn, this.path.concat(name), this);
    }
    async getFileHandle(name, o) {
      const h = await this.find(name, false);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', 'WebDAV: \u201c' + name + '\u201d not found');
      const f = new WFile(this.conn, { name, size: 0, mtime: Date.now(), type: '' }, this);
      await f.put(new Blob([]));
      return f;
    }
    async removeEntry(name) {
      const hit = (await list(this)).find((e) => e.name === name);
      if (!hit) throw dom('NotFoundError', 'WebDAV: \u201c' + name + '\u201d not found');
      await this.conn.req('DELETE', this.path.concat(name), { dir: hit.isDir });
    }
    async resolve(other) {
      if (!other || !other.conn || other.conn.base !== this.conn.base || other.path.length < this.path.length) return null;
      for (let i = 0; i < this.path.length; i++) if (other.path[i] !== this.path[i]) return null;
      return other.path.slice(this.path.length);
    }
    async isSameEntry(o) { return !!o && o.kind === this.kind && !!o.conn && o.conn.base === this.conn.base && o.path.join('/') === this.path.join('/'); }
    async move(a, b) { await moveIt(this, a, b); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  class WFile {
    constructor(conn, e, parent) {
      this.kind = 'file'; this.conn = conn; this.name = e.name; this.parent = parent; this.path = parent.path.concat(e.name);
      this.meta = { size: e.size || 0, modified: e.mtime || 0, type: e.type || '', thumb: '', dur: 0 };
    }
    async getFile() {
      const r = await this.conn.req('GET', this.path);
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
        async close() { await h.put(new Blob(parts)); },
        async abort() { parts.length = 0; },
        async truncate() { parts.length = 0; }
      };
    }
    async put(blob) {
      await this.conn.req('PUT', this.path, { body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
      this.meta = { size: blob.size, modified: Date.now(), type: blob.type || this.meta.type, thumb: '', dur: 0 };
    }
    async move(a, b) { await moveIt(this, a, b); }
    async isSameEntry(o) { return !!o && o.kind === 'file' && !!o.conn && o.conn.base === this.conn.base && o.path.join('/') === this.path.join('/'); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  window.WebDavFs = {
    root(account) { return new WDir(new Conn(account || {}), [], null); },
    async test(account) {
      try { await list(this.root(account)); return { ok: true, error: '' }; }
      catch (e) { return { ok: false, error: (e && e.message) || String(e), name: e && e.name }; }
    },
    WDir, WFile
  };
})();
