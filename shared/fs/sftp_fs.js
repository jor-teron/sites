/*
 * SFTP as a "directory handle" (shared/fs/sftp_fs.js) — H119. Same shape as shared/fs/webdav_fs.js
 * (FileSystemDirectoryHandle / FileSystemFileHandle look-alike), so shared/fs/fs_ops.js and the Files
 * app work on any SFTP server (any OpenSSH server, a Pi, a NAS ...). No library.
 * A browser can't speak SSH by itself here, so it goes through the SFTP relay hub/relay/sftp_relay.py
 * on the PC (python3 hub/relay/sftp_relay.py): one WebSocket = one SSH login, JSON requests answered
 * in order; read replies are followed by one binary frame, writes send one binary frame after the JSON.
 *   open {token, host, port, user, pass, root}, then list / stat / read / write / mkdir / rename / delete
 *   with path = array of names under the account folder (see the relay's docstring).
 * The socket opens on the first request, is shared by every handle of the same account, and closes
 * after 2 min idle (the relay then logs out of the server); a dropped socket reopens on the next request.
 *
 * SDir (kind 'directory', name, path, parent): entries() / values() / keys(), getDirectoryHandle(name,
 *   {create}) (mkdir), getFileHandle(name, {create}) (create = write empty), removeEntry(name, {recursive}),
 *   resolve(other), isSameEntry(other), move(newName | destDir, name) (rename, never overwrites),
 *   queryPermission / requestPermission → 'granted'.
 * SFile (kind 'file'): getFile() (read → File), createWritable() → { write(data), close() = write,
 *   abort(), truncate() }, move, isSameEntry, meta = { size, modified, type: '', thumb: '', dur: 0 }.
 * Errors (e.sftp = the relay's code): wrong user / password or relay token → NotAllowedError, missing → NotFoundError, exists →
 *   InvalidModificationError, wrong kind → TypeMismatchError; relay down / not allowed → Error
 *   'SFTP: can’t reach …'. All messages start with 'SFTP: '.
 *   From the https Hub the relay must be wss:// (cert.pem + key.pem next to it, see hub/relay/README.md).
 * API window.SftpFs: root(account) → SDir of the account folder, test(account) → Promise<{ok, error, name}>,
 *   close(account). account = { relay, token, host, port, user, pass, folder, name }.
 */
(function () {
  'use strict';
  const IDLE_MS = 120000, OPEN_MS = 25000;
  const dom = (name, msg) => { try { return new DOMException(msg, name); } catch (_) { const e = new Error(msg); e.name = name; return e; } };
  const NAMES = { auth: 'NotAllowedError', token: 'NotAllowedError', denied: 'NotAllowedError', notfound: 'NotFoundError', exists: 'InvalidModificationError' };
  function err(code, msg) {
    const m = 'SFTP: ' + (msg || code || 'failed');
    const e = NAMES[code] ? dom(NAMES[code], m) : new Error(m);
    e.sftp = code || 'failed';   // not .code: DOMException.code is a read-only getter
    return e;
  }
  const keyOf = (a) => [a.relay, a.user, a.host, a.port || 22, a.folder || ''].join('|');
  const conns = new Map();   // account key → Conn (one socket per account)

  class Conn {
    constructor(a) {
      this.a = Object.assign({}, a); this.key = keyOf(a);
      this.name = a.name || ((a.user ? a.user + '@' : '') + (a.host || 'SFTP'));
      this.ws = null; this.ready = null; this.seq = 0; this.wait = new Map(); this.bin = []; this.timer = 0;
    }
    open() {
      if (this.ready) return this.ready;
      const a = this.a;
      this.ready = new Promise((res, rej) => {
        let ws, done = false;
        const stop = (e) => { if (!done) { done = true; rej(e); } this.drop(e); };
        try { ws = new WebSocket(String(a.relay || '').trim()); } catch (_) { stop(err('reach', 'bad relay URL \u201c' + (a.relay || '') + '\u201d (ws://\u2026 or wss://\u2026)')); return; }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        const t = setTimeout(() => { stop(err('reach', 'the relay or the server did not answer')); try { ws.close(); } catch (_) { /* closed */ } }, OPEN_MS);
        ws.onopen = () => ws.send(JSON.stringify({ op: 'open', token: a.token || '', host: a.host, port: +a.port || 22, user: a.user || '', pass: a.pass || '', root: a.folder || '' }));
        ws.onerror = () => { /* onclose follows */ };
        ws.onclose = () => {
          clearTimeout(t);
          stop(err('reach', done ? 'the relay closed the connection' : 'can\u2019t reach the relay ' + (a.relay || '') + ' (is it running? from the https Hub it must be wss://)'));
        };
        ws.onmessage = (ev) => {
          if (!done) {
            let m = null;
            try { m = JSON.parse(ev.data); } catch (_) { /* ignore */ }
            if (!m || m.id !== 0) return;
            clearTimeout(t);
            if (!m.ok) { stop(err(m.code, m.error)); try { ws.close(); } catch (_) { /* closed */ } return; }
            done = true; this.root = m.root; this.max = +m.max || 0; res(this);
            return;
          }
          this.onMsg(ev.data);
        };
      });
      return this.ready;
    }
    onMsg(d) {
      if (typeof d !== 'string') {   // the bytes of the oldest read reply
        const w = this.bin.shift();
        if (w) { this.wait.delete(w.id); w.res(Object.assign(w.reply, { data: d })); }
        return;
      }
      let m;
      try { m = JSON.parse(d); } catch (_) { return; }
      const w = this.wait.get(m.id);
      if (!w) return;
      if (!m.ok) { this.wait.delete(m.id); w.rej(err(m.code, m.error)); return; }
      if (w.op === 'read') { w.reply = m; this.bin.push(w); return; }
      this.wait.delete(m.id); w.res(m);
    }
    drop(e) {
      const ws = this.ws;
      this.ws = null; this.ready = null; this.bin = [];
      clearTimeout(this.timer);
      if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch (_) { /* closed */ } }
      const w = Array.from(this.wait.values()); this.wait.clear();
      w.forEach((x) => x.rej(e || err('reach', 'the relay closed the connection')));
    }
    idle() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (!this.wait.size) this.drop(); }, IDLE_MS);
    }
    async req(op, path, extra, blob) {
      await this.open();
      const ws = this.ws;
      if (!ws || ws.readyState !== 1) { this.drop(); return this.req(op, path, extra, blob); }
      const id = ++this.seq;
      if (blob && this.max && blob.size > this.max) throw err('toobig', 'the file is larger than the relay limit (' + Math.round(this.max / 1048576) + ' MB, relay --max-mb)');
      const buf = blob ? await blob.arrayBuffer() : null;
      const p = new Promise((res, rej) => this.wait.set(id, { id, op, res, rej }));
      ws.send(JSON.stringify(Object.assign({ id, op, path: path || [] }, extra || {}, buf ? { size: buf.byteLength } : {})));
      if (op === 'write') ws.send(buf || new ArrayBuffer(0));
      try { return await p; } finally { this.idle(); }
    }
  }
  function conn(a) {
    const k = keyOf(a);
    let c = conns.get(k);
    if (!c || c.a.pass !== a.pass || c.a.token !== a.token) { if (c) c.drop(); c = new Conn(a); conns.set(k, c); }
    c.name = a.name || c.name;
    return c;
  }

  const list = async (dir) => ((await dir.conn.req('list', dir.path)).entries || []);
  const make = (e, parent) => e.isDir ? new SDir(parent.conn, parent.path.concat(e.name), parent) : new SFile(parent.conn, e, parent);
  const same = (a, b) => !!a && !!b && !!a.conn && a.conn.key === b.conn.key;

  /** Shared by both kinds: rename (string) or move into destDir (with a new name). */
  async function moveIt(h, a, b) {
    const into = typeof a === 'string' ? h.parent : a;
    const name = typeof a === 'string' ? a : (b || h.name);
    if (!into) throw dom('InvalidModificationError', 'SFTP: the drive\u2019s top folder can\u2019t be moved');
    if (!same(into, h)) throw dom('InvalidModificationError', 'SFTP: move works only within one server');
    await h.conn.req('rename', h.path, { to: into.path.concat(name) });
    h.name = name; h.parent = into; h.path = into.path.concat(name);
  }

  class SDir {
    constructor(c, path, parent) {
      this.kind = 'directory'; this.conn = c; this.path = path; this.parent = parent || null;
      this.name = path.length ? path[path.length - 1] : c.name;
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
      if (!!hit.isDir !== dir) throw dom('TypeMismatchError', 'SFTP: \u201c' + name + '\u201d is a ' + (dir ? 'file' : 'folder'));
      return make(hit, this);
    }
    async getDirectoryHandle(name, o) {
      const h = await this.find(name, true);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', 'SFTP: \u201c' + name + '\u201d not found');
      await this.conn.req('mkdir', this.path.concat(name));
      return new SDir(this.conn, this.path.concat(name), this);
    }
    async getFileHandle(name, o) {
      const h = await this.find(name, false);
      if (h) return h;
      if (!(o && o.create)) throw dom('NotFoundError', 'SFTP: \u201c' + name + '\u201d not found');
      const f = new SFile(this.conn, { name, size: 0, mtime: Date.now() }, this);
      await f.put(new Blob([]));
      return f;
    }
    async removeEntry(name, o) {
      await this.conn.req('delete', this.path.concat(name), { recursive: !!(o && o.recursive) });
    }
    async resolve(other) {
      if (!same(other, this) || other.path.length < this.path.length) return null;
      for (let i = 0; i < this.path.length; i++) if (other.path[i] !== this.path[i]) return null;
      return other.path.slice(this.path.length);
    }
    async isSameEntry(o) { return same(o, this) && o.kind === this.kind && o.path.join('/') === this.path.join('/'); }
    async move(a, b) { await moveIt(this, a, b); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  class SFile {
    constructor(c, e, parent) {
      this.kind = 'file'; this.conn = c; this.name = e.name; this.parent = parent; this.path = parent.path.concat(e.name);
      this.meta = { size: e.size || 0, modified: e.mtime || 0, type: '', thumb: '', dur: 0 };
    }
    async getFile() {
      const r = await this.conn.req('read', this.path);
      return new File([r.data], this.name, { lastModified: this.meta.modified || Date.now() });
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
      await this.conn.req('write', this.path, null, blob);
      this.meta = { size: blob.size, modified: Date.now(), type: blob.type || '', thumb: '', dur: 0 };
    }
    async move(a, b) { await moveIt(this, a, b); }
    async isSameEntry(o) { return same(o, this) && o.kind === 'file' && o.path.join('/') === this.path.join('/'); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  window.SftpFs = {
    root(account) { return new SDir(conn(account || {}), [], null); },
    async test(account) {
      const c = new Conn(account || {});   // a fresh login, so a changed password is really tried
      try { await c.req('list', []); return { ok: true, error: '' }; }
      catch (e) { return { ok: false, error: (e && e.message) || String(e), name: e && e.name, code: e && e.sftp }; }
      finally { c.drop(); }
    },
    close(account) { const c = conns.get(keyOf(account || {})); if (c) { c.drop(); conns.delete(c.key); } },
    SDir, SFile
  };
})();
