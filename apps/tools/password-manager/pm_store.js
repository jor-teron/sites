/* Password Manager PW1 — IndexedDB wrapper for the encrypted vault blob.
   Database name: pwmanager. The decrypted vault is never written here. */
(function (root) {
  'use strict';

  var DB_NAME = 'pwmanager';
  var DB_VER = 1;
  var STORE = 'vault';
  var REC_KEY = 'main';

  function idb() {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    return Promise.resolve(indexedDB);
  }

  function openDb() {
    return idb().then(function () {
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('Could not open the vault store')); };
      });
    });
  }

  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var st = tx.objectStore(STORE);
        var done = false;
        tx.oncomplete = function () {
          db.close();
          if (!done) resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error || new Error('Vault store transaction failed'));
        };
        tx.onabort = function () {
          db.close();
          reject(tx.error || new Error('Vault store transaction aborted'));
        };
        Promise.resolve(fn(st)).then(function (value) {
          done = true;
          resolve(value);
        }, function (err) {
          done = true;
          try { tx.abort(); } catch (_) { /* already done */ }
          reject(err);
        });
      });
    });
  }

  function loadRecord() {
    return withStore('readonly', function (st) {
      return new Promise(function (resolve, reject) {
        var req = st.get(REC_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function saveRecord(rec) {
    return withStore('readwrite', function (st) {
      return new Promise(function (resolve, reject) {
        var req = st.put(rec, REC_KEY);
        req.onsuccess = function () { resolve(rec); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function hasVault(rec) {
    return !!(rec && rec.ct && rec.salt && rec.iv);
  }

  function cryptoHeader(rec) {
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

  // Merge a fresh crypto header with the plain-text hint and fail metadata.
  function mergeHeader(prev, header, extra) {
    extra = extra || {};
    var rec = {
      v: header.v,
      kdf: header.kdf,
      iter: header.iter,
      salt: header.salt,
      iv: header.iv,
      ct: header.ct,
      hint: extra.hint != null ? String(extra.hint) : (prev && prev.hint) || '',
      fails: extra.fails != null ? extra.fails : (prev && prev.fails) || 0,
      delayUntil: extra.delayUntil != null ? extra.delayUntil : (prev && prev.delayUntil) || 0
    };
    return rec;
  }

  var api = {
    DB_NAME: DB_NAME,
    loadRecord: loadRecord,
    saveRecord: saveRecord,
    hasVault: hasVault,
    cryptoHeader: cryptoHeader,
    mergeHeader: mergeHeader
  };

  root.PMStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
