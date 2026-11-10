/* Password Manager PW1 — Web Crypto vault (PBKDF2-SHA256 + AES-GCM-256).
   No separate password hash: a successful GCM decrypt is the proof.
   The AES key is non-extractable. Header: {v, kdf, iter, salt, iv, ct} (b64). */
(function (root) {
  'use strict';

  var ITER_DEFAULT = 310000;
  var SALT_LEN = 16;
  var IV_LEN = 12;
  var KDF = 'PBKDF2-SHA256';
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function subtle() {
    var c = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c || !c.subtle) throw new Error('Web Crypto is not available');
    return { crypto: c, subtle: c.subtle };
  }

  function b64enc(u8) {
    var bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64dec(s) {
    if (typeof s !== 'string' || !s) throw new Error('Missing base64 data');
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = atob(s);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function randomBytes(n) {
    var u8 = new Uint8Array(n);
    subtle().crypto.getRandomValues(u8);
    return u8;
  }

  function importPassword(password) {
    return subtle().subtle.importKey(
      'raw',
      enc.encode(String(password || '')),
      'PBKDF2',
      false,
      ['deriveKey']
    );
  }

  // Returns a non-extractable AES-GCM-256 CryptoKey.
  function deriveKey(password, saltU8, iter) {
    var n = iter || ITER_DEFAULT;
    return importPassword(password).then(function (material) {
      return subtle().subtle.deriveKey(
        { name: 'PBKDF2', salt: saltU8, iterations: n, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  }

  function encryptVault(vaultObj, key, saltU8, iter) {
    var iv = randomBytes(IV_LEN);
    var pt = enc.encode(JSON.stringify(vaultObj));
    return subtle().subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, pt).then(function (ctBuf) {
      return {
        v: 1,
        kdf: KDF,
        iter: iter || ITER_DEFAULT,
        salt: b64enc(saltU8),
        iv: b64enc(iv),
        ct: b64enc(ctBuf)
      };
    });
  }

  function decryptVault(header, key) {
    if (!header || header.v !== 1) return Promise.reject(new Error('Unsupported vault version'));
    if (header.kdf !== KDF) return Promise.reject(new Error('Unsupported key derivation'));
    var iv = b64dec(header.iv);
    var ct = b64dec(header.ct);
    return subtle().subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(function (ptBuf) {
      var text = dec.decode(ptBuf);
      var obj = JSON.parse(text);
      if (!obj || typeof obj !== 'object') throw new Error('Vault is not an object');
      return obj;
    });
  }

  function encryptWithPassword(vaultObj, password, iter) {
    var n = iter || ITER_DEFAULT;
    var salt = randomBytes(SALT_LEN);
    return deriveKey(password, salt, n).then(function (key) {
      return encryptVault(vaultObj, key, salt, n).then(function (header) {
        return { header: header, key: key };
      });
    });
  }

  function decryptWithPassword(header, password) {
    if (!header) return Promise.reject(new Error('No vault'));
    var salt = b64dec(header.salt);
    var n = header.iter || ITER_DEFAULT;
    return deriveKey(password, salt, n).then(function (key) {
      return decryptVault(header, key).then(function (vault) {
        return { vault: vault, key: key, header: header };
      });
    });
  }

  function emptyVault() {
    return {
      version: 1,
      settings: {
        autoLockMin: 5,
        lockHiddenMin: 0,
        clipboardSec: 30
      },
      entries: []
    };
  }

  var api = {
    ITER_DEFAULT: ITER_DEFAULT,
    SALT_LEN: SALT_LEN,
    IV_LEN: IV_LEN,
    KDF: KDF,
    b64enc: b64enc,
    b64dec: b64dec,
    randomBytes: randomBytes,
    deriveKey: deriveKey,
    encryptVault: encryptVault,
    decryptVault: decryptVault,
    encryptWithPassword: encryptWithPassword,
    decryptWithPassword: decryptWithPassword,
    emptyVault: emptyVault
  };

  root.PMCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
