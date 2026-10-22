/*
 * SSH — S4 key core: parse, generate, export and seal private keys. Web Crypto only, no DOM (node unit-tests it).
 * Keys are kept as a JWK (EC P-256 / P-384 or RSA) plus a comment.
 *   parse(text, passphrase?) -> Promise<{ jwk, alg, comment }>   (OpenSSH, PKCS#8, PKCS#1 RSA, SEC1 EC, PEM)
 *     OpenSSH keys with a passphrase: bcrypt-pbkdf + aes128/192/256-ctr, -cbc, or aes128/256-gcm@openssh.com.
 *     PKCS#8 "ENCRYPTED PRIVATE KEY": PBES2 (PBKDF2 SHA-1/SHA-256/384/512 + AES-CBC).
 *     Rejects with Error .code: need-pass, bad-pass, ed25519, unsupported, public, bad.
 *   generate() -> { jwk, alg }  (ECDSA P-256)
 *   info(jwk, comment) -> { alg, blob, line, fp }   (public key line for authorized_keys, SHA256 fingerprint)
 *   toOpenSSH(jwk, comment, passphrase?) -> PEM text ("BEGIN OPENSSH PRIVATE KEY"; passphrase: bcrypt + aes256-ctr)
 *   seal(obj, passphrase) / unseal(box, passphrase): PBKDF2-SHA256 (600k) + AES-256-GCM, for keys saved on the device.
 *   bcryptPbkdf(pass, salt, rounds, len) (OpenBSD bcrypt_pbkdf; Blowfish tables are the hex digits of pi, computed once).
 */
(() => {
  const sub = globalThis.crypto.subtle, rnd = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
  const te = new TextEncoder(), td = new TextDecoder();
  const kerr = (code, msg) => Object.assign(new Error(msg), { code });
  const ED_MSG = 'Ed25519 keys are not supported yet (the SSH library in this app has no Ed25519). Use an ECDSA or RSA key, for example: ssh-keygen -t ecdsa -b 256 — or Generate one here.';

  /* ---- bytes ---- */
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const b = atob(s.replace(/\s+/g, '')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  const b64u = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const strip = (u8) => { let i = 0; while (i < u8.length - 1 && u8[i] === 0) i++; return u8.subarray(i); };
  const pad = (u8, n) => { u8 = strip(u8); if (u8.length > n) throw kerr('bad', 'Key value too long.'); const o = new Uint8Array(n); o.set(u8, n - u8.length); return o; };
  const toBig = (u8) => (u8.length ? BigInt('0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')) : 0n);
  const fromBig = (v) => { let h = v.toString(16); if (h.length % 2) h = '0' + h; const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; };

  /* SSH wire format */
  function reader(u8) {
    let p = 0;
    const need = (n) => { if (p + n > u8.length) throw kerr('bad', 'The key file is damaged or not a private key.'); };
    return {
      u32() { need(4); const v = ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0; p += 4; return v; },
      bytes() { const n = this.u32(); need(n); const v = u8.subarray(p, p + n); p += n; return v; },
      str() { return td.decode(this.bytes()); },
      raw(n) { need(n); const v = u8.subarray(p, p + n); p += n; return v; },
      get left() { return u8.length - p; },
    };
  }
  function writer() {
    const parts = [];
    const w = {
      u32(v) { parts.push(new Uint8Array([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255])); return w; },
      bytes(b) { w.u32(b.length); parts.push(b); return w; },
      str(s) { return w.bytes(te.encode(s)); },
      mpint(b) { b = strip(b); if (b.length === 1 && b[0] === 0) b = new Uint8Array(0); if (b.length && b[0] & 0x80) b = cat(new Uint8Array([0]), b); return w.bytes(b); },
      raw(b) { parts.push(b); return w; },
      out: () => cat(...parts),
    };
    return w;
  }

  /* ---- curves ---- */
  const CURVES = {
    'P-256': { ssh: 'nistp256', len: 32, oid: '1.2.840.10045.3.1.7' },
    'P-384': { ssh: 'nistp384', len: 48, oid: '1.3.132.0.34' },
  };
  const bySsh = (n) => Object.keys(CURVES).find((c) => CURVES[c].ssh === n);
  const byOid = (o) => Object.keys(CURVES).find((c) => CURVES[c].oid === o);
  const algOf = (jwk) => (jwk.kty === 'RSA' ? 'ssh-rsa' : 'ecdsa-sha2-' + CURVES[jwk.crv].ssh);
  const isEd = (t) => /ed25519|ed448/i.test(t);

  /* ---- JWK helpers ---- */
  function ecJwk(crv, q, d) {
    const c = CURVES[crv];
    if (!c) throw kerr('unsupported', 'Only ECDSA P-256 and P-384 keys are supported (P-521 is not).');
    if (q[0] !== 4 || q.length !== 1 + 2 * c.len) throw kerr('bad', 'Unsupported EC public key encoding.');
    return { kty: 'EC', crv, x: b64u(q.subarray(1, 1 + c.len)), y: b64u(q.subarray(1 + c.len)), d: b64u(pad(d, c.len)) };
  }
  function rsaJwk(n, e, d, p, q, qi) {
    const D = toBig(d), P = toBig(p), Q = toBig(q);
    const u = (b) => b64u(strip(b));
    return { kty: 'RSA', n: u(n), e: u(e), d: u(d), p: u(p), q: u(q), dp: b64u(fromBig(D % (P - 1n))), dq: b64u(fromBig(D % (Q - 1n))), qi: u(qi) };
  }
  const clean = (j) => (j.kty === 'RSA' ? { kty: 'RSA', n: j.n, e: j.e, d: j.d, p: j.p, q: j.q, dp: j.dp, dq: j.dq, qi: j.qi } : { kty: 'EC', crv: j.crv, x: j.x, y: j.y, d: j.d });
  const imp = (j) => (j.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: j.crv });

  /* check(jwk): Web Crypto accepts it and the private key matches the public key (sign + verify). */
  async function check(jwk) {
    try {
      const a = imp(jwk), pr = await sub.importKey('jwk', jwk, a, false, ['sign']);
      const pubJ = Object.assign({}, jwk); ['d', 'p', 'q', 'dp', 'dq', 'qi'].forEach((k) => delete pubJ[k]);
      const pu = await sub.importKey('jwk', pubJ, a, false, ['verify']);
      const sa = jwk.kty === 'RSA' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' };
      const msg = te.encode('ssh-key-check');
      if (!(await sub.verify(sa, pu, await sub.sign(sa, pr, msg), msg))) throw new Error('mismatch');
    } catch (e) { throw kerr('bad', 'The key could not be used (' + (e.message || e) + ').'); }
  }

  /* ---- public key ---- */
  function blob(jwk) {
    if (jwk.kty === 'RSA') return writer().str('ssh-rsa').mpint(unb64u(jwk.e)).mpint(unb64u(jwk.n)).out();
    const c = CURVES[jwk.crv];
    return writer().str('ecdsa-sha2-' + c.ssh).str(c.ssh).bytes(cat(new Uint8Array([4]), pad(unb64u(jwk.x), c.len), pad(unb64u(jwk.y), c.len))).out();
  }
  async function info(jwk, comment) {
    const bl = blob(jwk), alg = algOf(jwk);
    const fp = 'SHA256:' + b64(new Uint8Array(await sub.digest('SHA-256', bl))).replace(/=+$/, '');
    const bits = jwk.kty === 'RSA' ? strip(unb64u(jwk.n)).length * 8 : CURVES[jwk.crv].len * 8;
    return { alg, bits, blob: bl, fp, line: alg + ' ' + b64(bl) + (comment ? ' ' + String(comment).replace(/[\r\n]+/g, ' ') : '') };
  }

  /* ---- bcrypt_pbkdf (OpenBSD) ---- */
  let PI = null;
  function piWords() { /* 1042 32-bit words of the fraction of pi = Blowfish P (18) + S boxes (4 x 256) */
    if (PI) return PI;
    const n = 1042, bits = BigInt(n * 32), g = 64n, one = 1n << (bits + g);
    const atanInv = (x) => { x = BigInt(x); const x2 = x * x; let t = one / x, s = t, k = 1n, neg = true; while (t > 0n) { t /= x2; const term = t / (2n * k + 1n); s = neg ? s - term : s + term; neg = !neg; k++; } return s; };
    const pi = (16n * atanInv(5) - 4n * atanInv(239)) >> g;
    const hex = (pi - (3n << bits)).toString(16).padStart(n * 8, '0');
    PI = new Uint32Array(n);
    for (let i = 0; i < n; i++) PI[i] = parseInt(hex.substr(i * 8, 8), 16);
    return PI;
  }
  function bfEnc(P, S, a, o) {
    let l = a[o], r = a[o + 1];
    const F = (x) => ((((S[x >>> 24] + S[256 + ((x >>> 16) & 255)]) >>> 0) ^ S[512 + ((x >>> 8) & 255)]) + S[768 + (x & 255)]) >>> 0;
    l = (l ^ P[0]) >>> 0;
    for (let i = 1; i <= 16; i += 2) { r = (r ^ F(l) ^ P[i]) >>> 0; l = (l ^ F(r) ^ P[i + 1]) >>> 0; }
    a[o] = (r ^ P[17]) >>> 0; a[o + 1] = l;
  }
  function s2w(d, st) { let w = 0; for (let i = 0; i < 4; i++) { if (st.j >= d.length) st.j = 0; w = ((w << 8) | d[st.j++]) >>> 0; } return w; }
  function expand(P, S, data, key) { /* data null = expand0state */
    let st = { j: 0 };
    for (let i = 0; i < 18; i++) P[i] = (P[i] ^ s2w(key, st)) >>> 0;
    st = { j: 0 }; const lr = new Uint32Array(2);
    const step = (arr, i) => { if (data) { lr[0] ^= s2w(data, st); lr[1] ^= s2w(data, st); } bfEnc(P, S, lr, 0); arr[i] = lr[0]; arr[i + 1] = lr[1]; };
    for (let i = 0; i < 18; i += 2) step(P, i);
    for (let i = 0; i < 1024; i += 2) step(S, i);
  }
  const MAGIC = te.encode('OxychromaticBlowfishSwatDynamite');
  function bcryptHash(sha2pass, sha2salt) {
    const W = piWords(), P = W.slice(0, 18), S = W.slice(18);
    expand(P, S, sha2salt, sha2pass);
    for (let i = 0; i < 64; i++) { expand(P, S, null, sha2salt); expand(P, S, null, sha2pass); }
    const c = new Uint32Array(8), st = { j: 0 };
    for (let i = 0; i < 8; i++) c[i] = s2w(MAGIC, st);
    for (let i = 0; i < 64; i++) for (let k = 0; k < 8; k += 2) bfEnc(P, S, c, k);
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { out[4 * i + 3] = c[i] >>> 24; out[4 * i + 2] = (c[i] >>> 16) & 255; out[4 * i + 1] = (c[i] >>> 8) & 255; out[4 * i] = c[i] & 255; }
    return out;
  }
  const sha512 = async (u8) => new Uint8Array(await sub.digest('SHA-512', u8));
  async function bcryptPbkdf(pass, salt, rounds, keylen) {
    if (typeof pass === 'string') pass = te.encode(pass);
    if (rounds < 1 || keylen < 1 || keylen > 1024) throw kerr('bad', 'Bad bcrypt parameters.');
    const key = new Uint8Array(keylen), stride = Math.ceil(keylen / 32); let amt = Math.ceil(keylen / stride);
    const sha2pass = await sha512(pass);
    let left = keylen;
    for (let count = 1; left > 0; count++) {
      let sha2salt = await sha512(cat(salt, new Uint8Array([count >>> 24, (count >>> 16) & 255, (count >>> 8) & 255, count & 255])));
      let tmp = bcryptHash(sha2pass, sha2salt); const out = tmp.slice();
      for (let i = 1; i < rounds; i++) { sha2salt = await sha512(tmp); tmp = bcryptHash(sha2pass, sha2salt); for (let j = 0; j < 32; j++) out[j] ^= tmp[j]; }
      amt = Math.min(amt, left);
      let i = 0;
      for (; i < amt; i++) { const dest = i * stride + (count - 1); if (dest >= keylen) break; key[dest] = out[i]; }
      left -= i;
    }
    return key;
  }

  /* ---- OpenSSH private key format ---- */
  const OSSH_MAGIC = te.encode('openssh-key-v1\0');
  const CIPHERS = {
    'aes128-ctr': { k: 16, iv: 16, mode: 'AES-CTR' }, 'aes192-ctr': { k: 24, iv: 16, mode: 'AES-CTR' }, 'aes256-ctr': { k: 32, iv: 16, mode: 'AES-CTR' },
    'aes128-cbc': { k: 16, iv: 16, mode: 'AES-CBC' }, 'aes192-cbc': { k: 24, iv: 16, mode: 'AES-CBC' }, 'aes256-cbc': { k: 32, iv: 16, mode: 'AES-CBC' },
    'aes128-gcm@openssh.com': { k: 16, iv: 12, mode: 'AES-GCM' }, 'aes256-gcm@openssh.com': { k: 32, iv: 12, mode: 'AES-GCM' },
  };
  async function aes(mode, enc, key, iv, data) {
    if (mode === 'AES-CBC-RAW') { /* CBC without PKCS#7 (OpenSSH pads itself): append an encrypted full padding block so Web Crypto can strip it */
      const ke = await sub.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
      const last = data.length ? data.subarray(data.length - 16) : iv;
      const extra = new Uint8Array(await sub.encrypt({ name: 'AES-CBC', iv: last }, ke, new Uint8Array(16).fill(16))).subarray(0, 16);
      return aes('AES-CBC', false, key, iv, cat(data, extra));
    }
    let k;
    try { k = await sub.importKey('raw', key, mode, false, [enc ? 'encrypt' : 'decrypt']); } catch (_) { throw kerr('unsupported', 'This browser cannot use ' + key.length * 8 + '-bit AES. Re-encrypt the key: ssh-keygen -p -Z aes256-ctr -f keyfile'); }
    const p = mode === 'AES-CTR' ? { name: mode, counter: iv, length: 128 } : { name: mode, iv };
    return new Uint8Array(await (enc ? sub.encrypt(p, k, data) : sub.decrypt(p, k, data)));
  }

  async function parseOpenSSH(der, pass) {
    if (der.length < OSSH_MAGIC.length || !OSSH_MAGIC.every((b, i) => der[i] === b)) throw kerr('bad', 'Not an OpenSSH private key.');
    const r = reader(der.subarray(OSSH_MAGIC.length));
    const cipher = r.str(), kdf = r.str(), kdfo = r.bytes(), n = r.u32();
    if (n !== 1) throw kerr('unsupported', 'The key file holds ' + n + ' keys; only one key per file is supported.');
    const pubType = reader(r.bytes()).str();
    if (isEd(pubType)) throw kerr('ed25519', ED_MSG);
    let priv = r.bytes();
    if (cipher !== 'none') {
      const c = CIPHERS[cipher];
      if (!c || kdf !== 'bcrypt') throw kerr('unsupported', 'This key is encrypted with ' + cipher + ' / ' + kdf + ', which is not supported. Re-encrypt it: ssh-keygen -p -Z aes256-ctr -f keyfile');
      if (!pass) throw kerr('need-pass', 'This key has a passphrase. Enter it.');
      const kr = reader(kdfo), salt = kr.bytes(), rounds = kr.u32();
      if (rounds > 1000) throw kerr('unsupported', 'bcrypt rounds too high (' + rounds + ').');
      const k = await bcryptPbkdf(pass, salt, rounds, c.k + c.iv);
      const tag = c.mode === 'AES-GCM' ? r.raw(16) : new Uint8Array(0);
      if (priv.length % 16) throw kerr('bad', 'The key file is damaged.');
      try { priv = await aes(c.mode === 'AES-CBC' ? 'AES-CBC-RAW' : c.mode, false, k.subarray(0, c.k), k.subarray(c.k), cat(priv, tag)); } catch (e) { if (e.code) throw e; throw kerr('bad-pass', 'Wrong passphrase for this key.'); }
    }
    const p = reader(priv);
    if (p.u32() !== p.u32()) throw kerr(cipher === 'none' ? 'bad' : 'bad-pass', cipher === 'none' ? 'The key file is damaged.' : 'Wrong passphrase for this key.');
    const type = p.str();
    let jwk;
    if (/^ecdsa-sha2-/.test(type)) {
      const curve = p.str(), q = p.bytes(), d = p.bytes();
      const crv = bySsh(curve);
      if (!crv) throw kerr('unsupported', 'Only ECDSA P-256 and P-384 keys are supported (this key is ' + curve + ').');
      jwk = ecJwk(crv, q, d);
    } else if (type === 'ssh-rsa') {
      const nn = p.bytes(), e = p.bytes(), d = p.bytes(), qi = p.bytes(), pp = p.bytes(), q = p.bytes();
      jwk = rsaJwk(nn, e, d, pp, q, qi);
    } else throw kerr('unsupported', 'Key type ' + type + ' is not supported. Use ECDSA (P-256/P-384) or RSA.');
    return { jwk, comment: p.str() };
  }

  async function toOpenSSH(jwk, comment, pass) {
    const bl = blob(jwk), alg = algOf(jwk);
    const w = writer(); const ci = rnd(4); const chk = (ci[0] << 24 | ci[1] << 16 | ci[2] << 8 | ci[3]) >>> 0;
    w.u32(chk).u32(chk).str(alg);
    if (jwk.kty === 'RSA') ['n', 'e', 'd', 'qi', 'p', 'q'].forEach((k) => w.mpint(unb64u(jwk[k])));
    else { const r = reader(bl); r.str(); w.str(r.str()).bytes(r.bytes()).mpint(unb64u(jwk.d)); }
    w.str(comment || '');
    let priv = w.out();
    const bs = pass ? 16 : 8, padN = (bs - (priv.length % bs)) % bs;
    priv = cat(priv, Uint8Array.from({ length: padN }, (_, i) => i + 1));
    let cipher = 'none', kdf = 'none', kdfo = new Uint8Array(0);
    if (pass) {
      const salt = rnd(16), rounds = 16;
      const k = await bcryptPbkdf(pass, salt, rounds, 48);
      priv = await aes('AES-CTR', true, k.subarray(0, 32), k.subarray(32), priv);
      cipher = 'aes256-ctr'; kdf = 'bcrypt'; kdfo = writer().bytes(salt).u32(rounds).out();
    }
    const der = cat(OSSH_MAGIC, writer().str(cipher).str(kdf).bytes(kdfo).u32(1).bytes(bl).bytes(priv).out());
    return '-----BEGIN OPENSSH PRIVATE KEY-----\n' + b64(der).replace(/(.{70})/g, '$1\n').replace(/\n$/, '') + '\n-----END OPENSSH PRIVATE KEY-----\n';
  }

  /* ---- DER (PKCS#8, PKCS#1, SEC1) ---- */
  function derRead(u8) {
    let p = 0;
    if (u8.length < 2) throw kerr('bad', 'The key file is damaged.');
    const tag = u8[p++]; let len = u8[p++];
    if (len & 0x80) { const n = len & 0x7f; if (n > 4) throw kerr('bad', 'The key file is damaged.'); len = 0; for (let i = 0; i < n; i++) len = len * 256 + u8[p++]; }
    if (p + len > u8.length) throw kerr('bad', 'The key file is damaged.');
    const v = u8.subarray(p, p + len);
    const node = { tag, v, end: p + len };
    if (tag & 0x20) { node.kids = []; let q = 0; while (q < v.length) { const k = derRead(v.subarray(q)); node.kids.push(k); q += k.end; } }
    return node;
  }
  function oid(u8) {
    const out = [Math.floor(u8[0] / 40), u8[0] % 40]; let v = 0;
    for (let i = 1; i < u8.length; i++) { v = v * 128 + (u8[i] & 0x7f); if (!(u8[i] & 0x80)) { out.push(v); v = 0; } }
    return out.join('.');
  }
  function derLen(n) { if (n < 128) return [n]; const b = []; while (n) { b.unshift(n & 255); n >>>= 8; } return [0x80 | b.length, ...b]; }
  const tlv = (tag, ...parts) => { const v = cat(...parts); return cat(new Uint8Array([tag, ...derLen(v.length)]), v); };
  function oidEnc(s) {
    const a = s.split('.').map(Number), out = [a[0] * 40 + a[1]];
    a.slice(2).forEach((n) => { const t = [n & 0x7f]; n = Math.floor(n / 128); while (n) { t.unshift(0x80 | (n & 0x7f)); n = Math.floor(n / 128); } out.push(...t); });
    return tlv(6, new Uint8Array(out));
  }
  const O = { rsa: '1.2.840.113549.1.1.1', ec: '1.2.840.10045.2.1', ed25519: '1.3.101.112', ed448: '1.3.101.113', pbes2: '1.2.840.113549.1.5.13', pbkdf2: '1.2.840.113549.1.5.12' };
  const PRF = { '1.2.840.113549.2.7': 'SHA-1', '1.2.840.113549.2.9': 'SHA-256', '1.2.840.113549.2.10': 'SHA-384', '1.2.840.113549.2.11': 'SHA-512' };
  const ENC = { '2.16.840.1.101.3.4.1.2': 16, '2.16.840.1.101.3.4.1.22': 24, '2.16.840.1.101.3.4.1.42': 32 };

  async function fromPkcs8(der) {
    let alg;
    try {
      const t = derRead(der), a = t.kids[1].kids, id = oid(a[0].v);
      if (id === O.ed25519 || id === O.ed448) throw kerr('ed25519', ED_MSG);
      if (id === O.rsa) alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
      else if (id === O.ec) {
        const crv = a[1] && a[1].tag === 6 ? byOid(oid(a[1].v)) : null;
        if (!crv) throw kerr('unsupported', 'Only ECDSA P-256 and P-384 keys are supported.');
        alg = { name: 'ECDSA', namedCurve: crv };
      } else throw kerr('unsupported', 'This key type is not supported (' + id + '). Use ECDSA (P-256/P-384) or RSA.');
    } catch (e) { if (e.code) throw e; throw kerr('bad', 'The key file is damaged or not a private key.'); }
    let jwk;
    try { jwk = await sub.exportKey('jwk', await sub.importKey('pkcs8', der, alg, true, ['sign'])); } catch (e) { throw kerr('bad', 'The browser could not read this key (' + (e.message || e) + ').'); }
    return clean(jwk);
  }
  async function decryptPkcs8(der, pass) {
    let prf, iter, salt, klen, iv, ct;
    try {
      const t = derRead(der), a = t.kids[0].kids;
      if (oid(a[0].v) !== O.pbes2) throw kerr('unsupported', 'This encrypted key uses an old scheme. Re-encrypt it: ssh-keygen -p -f keyfile (OpenSSH format).');
      const kdf = a[1].kids[0].kids, enc = a[1].kids[1].kids;
      if (oid(kdf[0].v) !== O.pbkdf2) throw kerr('unsupported', 'Unsupported key encryption (only PBKDF2).');
      const kp = kdf[1].kids;
      salt = kp[0].v; iter = Number(toBig(kp[1].v));
      const prfNode = kp.find((k, i) => i >= 2 && k.tag === 0x30);
      prf = prfNode ? PRF[oid(prfNode.kids[0].v)] : 'SHA-1';
      klen = ENC[oid(enc[0].v)]; iv = enc[1].v; ct = t.kids[1].v;
      if (!prf || !klen) throw kerr('unsupported', 'Unsupported key encryption (only AES-CBC with PBKDF2 SHA-1/SHA-2).');
    } catch (e) { if (e.code) throw e; throw kerr('bad', 'The key file is damaged.'); }
    if (!pass) throw kerr('need-pass', 'This key has a passphrase. Enter it.');
    let plain;
    try {
      const bk = await sub.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
      const kb = new Uint8Array(await sub.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: prf }, bk, klen * 8));
      plain = await aes('AES-CBC', false, kb, iv, ct);
    } catch (e) {
      if (e.code) throw e;
      throw kerr('bad-pass', 'Wrong passphrase for this key.');
    }
    try { derRead(plain); } catch (_) { throw kerr('bad-pass', 'Wrong passphrase for this key.'); }
    return plain;
  }
  const pkcs1To8 = (der) => tlv(0x30, tlv(2, new Uint8Array([0])), tlv(0x30, oidEnc(O.rsa), new Uint8Array([5, 0])), tlv(4, der));
  function sec1To8(der) {
    let crvOid = null;
    try { const t = derRead(der); const p = t.kids.find((k) => k.tag === 0xa0); if (p) crvOid = oid(derRead(p.v).v); } catch (_) { throw kerr('bad', 'The key file is damaged.'); }
    if (!crvOid) throw kerr('unsupported', 'This EC key does not name its curve.');
    if (!byOid(crvOid)) throw kerr('unsupported', 'Only ECDSA P-256 and P-384 keys are supported.');
    return tlv(0x30, tlv(2, new Uint8Array([0])), tlv(0x30, oidEnc(O.ec), oidEnc(crvOid)), tlv(4, der));
  }

  /* ---- parse any supported private key text ---- */
  async function parse(text, pass) {
    text = String(text || '').replace(/\r/g, '').trim();
    if (!text) throw kerr('bad', 'Paste a private key or pick a key file.');
    if (/^(ssh-ed25519|ssh-ed448|sk-ssh-ed25519)/.test(text)) throw kerr('ed25519', ED_MSG);
    if (/^(ssh-|ecdsa-|sk-)/.test(text) || /BEGIN (SSH2 |RSA )?PUBLIC KEY/.test(text)) throw kerr('public', 'This is a public key. Import the private key file (the one without .pub).');
    const m = /-----BEGIN ([A-Z0-9 ]+)-----\n([\s\S]*?)-----END \1-----/.exec(text);
    if (!m) throw kerr('bad', 'Not a private key. Expected a file starting with -----BEGIN … PRIVATE KEY-----.');
    const type = m[1]; let body = m[2];
    const head = body.split('\n\n');
    if (head.length > 1 && /:/.test(head[0])) {
      if (/ENCRYPTED/.test(head[0])) throw kerr('unsupported', 'Old-style encrypted PEM keys (Proc-Type: ENCRYPTED) are not supported. Convert the key: ssh-keygen -p -f keyfile (rewrites it in OpenSSH format, keeps the passphrase).');
      body = head.slice(1).join('\n');
    }
    let der;
    try { der = unb64(body); } catch (_) { throw kerr('bad', 'The key file is damaged (bad base64).'); }
    let jwk, comment = '';
    if (type === 'OPENSSH PRIVATE KEY') ({ jwk, comment } = await parseOpenSSH(der, pass));
    else if (type === 'PRIVATE KEY') jwk = await fromPkcs8(der);
    else if (type === 'ENCRYPTED PRIVATE KEY') jwk = await fromPkcs8(await decryptPkcs8(der, pass));
    else if (type === 'RSA PRIVATE KEY') jwk = await fromPkcs8(pkcs1To8(der));
    else if (type === 'EC PRIVATE KEY') jwk = await fromPkcs8(sec1To8(der));
    else if (/SSH2/.test(type)) throw kerr('unsupported', 'ssh.com (SSH2) keys are not supported. Convert: ssh-keygen -i -f keyfile');
    else throw kerr('bad', 'Not a supported private key (' + type + ').');
    await check(jwk);
    return { jwk, alg: algOf(jwk), comment };
  }

  async function generate() {
    const kp = await sub.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = clean(await sub.exportKey('jwk', kp.privateKey));
    return { jwk, alg: algOf(jwk) };
  }

  /* ---- sealed box for keys saved on this device ---- */
  const ITER = 600000;
  async function boxKey(pass, salt, iter, use) {
    const bk = await sub.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return sub.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, bk, { name: 'AES-GCM', length: 256 }, false, [use]);
  }
  async function seal(obj, pass, iter) {
    iter = iter || ITER;
    const salt = rnd(16), iv = rnd(12);
    const ct = new Uint8Array(await sub.encrypt({ name: 'AES-GCM', iv }, await boxKey(pass, salt, iter, 'encrypt'), te.encode(JSON.stringify(obj))));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter, enc: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function unseal(box, pass) {
    if (!box || box.v !== 1 || !box.ct) throw kerr('bad', 'The saved key is damaged.');
    let pt;
    try { pt = await sub.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await boxKey(pass, unb64(box.salt), box.iter, 'decrypt'), unb64(box.ct)); } catch (_) { throw kerr('bad-pass', 'Wrong passphrase.'); }
    return JSON.parse(td.decode(pt));
  }

  const api = { parse, generate, info, toOpenSSH, seal, unseal, bcryptPbkdf, algOf, ED_MSG, _piWords: piWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else SSH.Keys = api;
})();
