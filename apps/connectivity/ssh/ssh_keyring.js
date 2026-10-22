/*
 * SSH — S4 key ring: the user's private keys for public-key login.
 * Session keys live in memory only (gone on reload). "Remember on this device" also stores the key in IndexedDB
 * (db ssh-keys-v1, store keys), sealed with a device passphrase (PBKDF2-SHA256 600k + AES-256-GCM, SSH.Keys.seal):
 *   { id: fp, name, alg, fp, pub (public line), created, box: { v, kdf, iter, enc, salt, iv, ct } }  — never plaintext.
 * A remembered key loads locked; unlock(id, passphrase) decrypts it into memory for this visit.
 * Keys are identified by their SHA256 fingerprint; saved hosts reference that (host.key).
 * SSH.Ring: ready (Promise), list(), get(fp), add(o), unlock(fp, pass), lock(fp), remember(fp, pass), forget(fp),
 *           libKey(fp) -> library KeyPair, exportText(fp, pass?), canRemember, onChange(fn)
 */
SSH.Ring = (() => {
  const K = SSH.Keys, L = window.SSHLib;
  const DB = 'ssh-keys-v1', ST = 'keys';
  const ring = new Map(); /* fp -> { fp, name, alg, bits, line, comment, jwk|null, saved, box, created, lib } */
  const subs = [];
  let db = null, canRemember = true;
  const changed = () => subs.forEach((f) => { try { f(); } catch (_) { /* ignore */ } });

  function openDb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB is not available'));
      let r;
      try { r = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('IndexedDB failed'));
      r.onblocked = () => rej(new Error('IndexedDB blocked'));
    });
  }
  function tx(mode, fn) {
    return new Promise((res, rej) => {
      if (!db) return rej(new Error('Saving keys is not available in this browser (no IndexedDB).'));
      const t = db.transaction(ST, mode), s = t.objectStore(ST);
      let out;
      const req = fn(s);
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error || new Error('IndexedDB error'));
      t.onabort = () => rej(t.error || new Error('IndexedDB aborted'));
    });
  }
  const validRec = (r) => r && typeof r.fp === 'string' && /^SHA256:/.test(r.fp) && r.box && r.box.ct && typeof r.pub === 'string';

  const ready = (async () => {
    try {
      db = await openDb();
      const recs = await tx('readonly', (s) => s.getAll());
      (recs || []).filter(validRec).forEach((r) => {
        ring.set(r.fp, { fp: r.fp, name: String(r.name || '').slice(0, 60) || r.alg, alg: String(r.alg || ''), line: r.pub, comment: '', jwk: null, saved: true, box: r.box, created: r.created || 0, lib: null });
      });
    } catch (_) { canRemember = false; db = null; }
    changed();
  })();

  const list = () => Array.from(ring.values()).sort((a, b) => a.name.localeCompare(b.name));
  const get = (fp) => ring.get(fp) || null;

  /* add({ jwk, comment, name }) -> entry (merges with an existing key that has the same fingerprint). */
  async function add(o) {
    const info = await K.info(o.jwk, o.comment);
    const old = ring.get(info.fp);
    const name = String(o.name || '').trim().slice(0, 60) || o.comment || (info.alg + ' key');
    const e = Object.assign(old || { saved: false, box: null, created: Date.now() }, { fp: info.fp, name, alg: info.alg, bits: info.bits, line: info.line, comment: o.comment || '', jwk: o.jwk, lib: null });
    ring.set(e.fp, e);
    if (old && old.saved) await tx('readwrite', (s) => s.put(record(e))).catch(() => {});
    changed();
    return e;
  }
  const record = (e) => ({ id: e.fp, name: e.name, alg: e.alg, fp: e.fp, pub: e.line, created: e.created, box: e.box });

  async function remember(fp, pass) {
    const e = ring.get(fp);
    if (!e || !e.jwk) throw new Error('Unlock the key first.');
    if (!db) throw new Error('Saving keys is not available in this browser (no IndexedDB). The key stays for this visit only.');
    const box = await K.seal({ jwk: e.jwk, comment: e.comment }, pass);
    const prev = { saved: e.saved, box: e.box };
    e.box = box; e.saved = true;
    try { await tx('readwrite', (s) => s.put(record(e))); } catch (err) { Object.assign(e, prev); throw err; }
    changed();
  }

  async function unlock(fp, pass) {
    const e = ring.get(fp);
    if (!e) throw new Error('Key not found.');
    if (e.jwk) return e;
    const o = await K.unseal(e.box, pass); /* rejects with .code 'bad-pass' */
    const info = await K.info(o.jwk, o.comment);
    if (info.fp !== e.fp) throw new Error('The saved key is damaged (fingerprint mismatch).');
    e.jwk = o.jwk; e.comment = o.comment || ''; e.bits = info.bits; e.lib = null;
    changed();
    return e;
  }

  /* lock: drop the private key from memory (a session-only key is removed completely). */
  function lock(fp) {
    const e = ring.get(fp);
    if (!e) return;
    if (!e.saved) ring.delete(fp); else { e.jwk = null; e.lib = null; }
    changed();
  }

  async function forget(fp) {
    const e = ring.get(fp);
    if (e && e.saved) await tx('readwrite', (s) => s.delete(fp));
    ring.delete(fp);
    changed();
  }

  /* Library KeyPair (WebECDsa / WebRsa) for SshClientSession.authenticate({ publicKeys }). */
  async function libKey(fp) {
    const e = ring.get(fp);
    if (!e || !e.jwk) return null;
    if (e.lib) return e.lib;
    const j = e.jwk;
    const bi = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return L.BigInt.fromBytes(L.Buffer.from(u), { unsigned: true }); };
    let kp;
    if (j.kty === 'RSA') {
      kp = new L.Rsa.KeyPair('SHA-512');
      await kp.importParameters({ modulus: bi(j.n), exponent: bi(j.e), d: bi(j.d), p: bi(j.p), q: bi(j.q), dp: bi(j.dp), dq: bi(j.dq), qi: bi(j.qi) });
      /* S4-F3: the library writes the signature name (rsa-sha2-512) as the key type inside the public key blob;
         servers expect "ssh-rsa" there (RFC 8332) and reject the login. Always write ssh-rsa. */
      const pkb = kp.getPublicKeyBytes.bind(kp);
      kp.getPublicKeyBytes = (name) => pkb(name && /^rsa-sha2-/.test(name) ? 'ssh-rsa' : name);
    } else {
      kp = new L.ECDsa.KeyPair();
      await kp.importParameters({ curve: { name: j.crv === 'P-384' ? 'nistp384' : 'nistp256' }, x: bi(j.x), y: bi(j.y), d: bi(j.d) });
    }
    e.lib = kp;
    return kp;
  }

  async function exportText(fp, pass) {
    const e = ring.get(fp);
    if (!e || !e.jwk) throw new Error('Unlock the key first.');
    return K.toOpenSSH(e.jwk, e.comment || e.name, pass || '');
  }

  return { ready, list, get, add, unlock, lock, remember, forget, libKey, exportText, get canRemember() { return canRemember; }, onChange: (f) => subs.push(f) };
})();
