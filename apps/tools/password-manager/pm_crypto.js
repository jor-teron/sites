/* Password Manager PW2 — Web Crypto vault (PBKDF2-SHA256 + AES-GCM-256).
   No separate password hash: a successful GCM decrypt is the proof.
   The AES key is non-extractable. Crypto header: {v:1, kdf, iter, salt, iv, ct} (b64).
   Vault JSON version 2 adds tags, custom fields, passwordChanged and tombstones.
   Encrypted backup files wrap the same header in {type, format, exported, hint, ...header}. */
(function (root) {
  'use strict';

  var ITER_DEFAULT = 310000;
  var SALT_LEN = 16;
  var IV_LEN = 12;
  var KDF = 'PBKDF2-SHA256';
  var HEADER_VERSION = 1;
  var VAULT_VERSION = 2;
  var BACKUP_TYPE = 'hub-password-manager-backup';
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
        v: HEADER_VERSION,
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

  function defaultSettings() {
    return {
      autoLockMin: 5,
      lockHiddenMin: 0,
      clipboardSec: 30
    };
  }

  function emptyVault() {
    return {
      version: VAULT_VERSION,
      settings: defaultSettings(),
      entries: [],
      tombstones: []
    };
  }

  function migrateEntry(e) {
    if (!e || typeof e !== 'object') return e;
    if (!Array.isArray(e.tags)) e.tags = [];
    else {
      e.tags = e.tags.map(function (t) { return String(t || '').trim(); }).filter(Boolean);
    }
    if (!Array.isArray(e.fields)) e.fields = [];
    else {
      e.fields = e.fields.map(function (f) {
        if (!f || typeof f !== 'object') return null;
        return {
          id: f.id || (root.PMUtil && PMUtil.uid ? PMUtil.uid() : String(Math.random()).slice(2)),
          name: String(f.name || ''),
          value: String(f.value || ''),
          hidden: !!f.hidden
        };
      }).filter(Boolean);
    }
    if (e.password && !e.passwordChanged) {
      e.passwordChanged = e.updated || e.created || '';
    }
    if (!e.created) e.created = e.updated || '';
    if (!e.updated) e.updated = e.created || '';
    return e;
  }

  // Upgrade a decrypted vault JSON to the current format. Safe to call more than once.
  function migrateVault(vault) {
    if (!vault || typeof vault !== 'object' || Array.isArray(vault)) {
      return emptyVault();
    }
    var out = vault;
    var ver = Number(out.version) || 1;
    if (!out.settings || typeof out.settings !== 'object') out.settings = defaultSettings();
    if (!Array.isArray(out.entries)) out.entries = [];
    if (ver < 2) {
      out.entries = out.entries.map(migrateEntry);
      if (!Array.isArray(out.tombstones)) out.tombstones = [];
      out.version = 2;
    } else {
      out.entries = out.entries.map(migrateEntry);
      if (!Array.isArray(out.tombstones)) out.tombstones = [];
    }
    return out;
  }

  function isHeader(obj) {
    return !!(obj && obj.kdf && obj.salt && obj.iv && obj.ct);
  }

  // Wrap a crypto header as a downloadable backup object (still encrypted).
  function packBackup(header, extra) {
    extra = extra || {};
    if (!isHeader(header)) throw new Error('No encrypted vault to export');
    return {
      type: BACKUP_TYPE,
      format: VAULT_VERSION,
      exported: extra.exported || (new Date()).toISOString(),
      hint: extra.hint ? String(extra.hint) : '',
      v: header.v,
      kdf: header.kdf,
      iter: header.iter,
      salt: header.salt,
      iv: header.iv,
      ct: header.ct
    };
  }

  function backupToText(backup) {
    return JSON.stringify(backup, null, 2);
  }

  // Accept a backup object, a raw crypto header, or a JSON string of either.
  function parseBackup(input) {
    var obj = input;
    if (typeof input === 'string') {
      var text = input.replace(/^\uFEFF/, '').trim();
      if (!text) throw new Error('The backup file is empty');
      try { obj = JSON.parse(text); }
      catch (e) { throw new Error('This is not a Password Manager backup file'); }
    }
    if (!obj || typeof obj !== 'object') throw new Error('This is not a Password Manager backup file');
    if (obj.type && obj.type !== BACKUP_TYPE) {
      throw new Error('This file is not a Password Manager backup');
    }
    if (!isHeader(obj)) throw new Error('The backup file is missing the encrypted vault');
    return {
      type: obj.type || BACKUP_TYPE,
      format: obj.format || 1,
      exported: obj.exported || '',
      hint: obj.hint ? String(obj.hint) : '',
      header: {
        v: obj.v,
        kdf: obj.kdf,
        iter: obj.iter,
        salt: obj.salt,
        iv: obj.iv,
        ct: obj.ct
      }
    };
  }

  function cryptoHeaderOf(rec) {
    if (!rec) return null;
    return {
      v: rec.v,
      kdf: rec.kdf,
      iter: rec.iter,
      salt: rec.salt,
      iv: rec.iv,
      ct: rec.ct
    };
  }

  var api = {
    ITER_DEFAULT: ITER_DEFAULT,
    SALT_LEN: SALT_LEN,
    IV_LEN: IV_LEN,
    KDF: KDF,
    HEADER_VERSION: HEADER_VERSION,
    VAULT_VERSION: VAULT_VERSION,
    BACKUP_TYPE: BACKUP_TYPE,
    b64enc: b64enc,
    b64dec: b64dec,
    randomBytes: randomBytes,
    deriveKey: deriveKey,
    encryptVault: encryptVault,
    decryptVault: decryptVault,
    encryptWithPassword: encryptWithPassword,
    decryptWithPassword: decryptWithPassword,
    emptyVault: emptyVault,
    defaultSettings: defaultSettings,
    migrateEntry: migrateEntry,
    migrateVault: migrateVault,
    packBackup: packBackup,
    backupToText: backupToText,
    parseBackup: parseBackup,
    isHeader: isHeader,
    cryptoHeaderOf: cryptoHeaderOf
  };

  root.PMCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
