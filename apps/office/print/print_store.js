/*
  Project: print
  File: print_store.js
  Role: Host file history that survives reloads.
  Metadata list in localStorage 'jtprint-history' ([{id,name,mime,size,ts}],
  oldest first). File blobs in IndexedDB: db 'jtprint', store 'files',
  key = the same id. Capped at MAX_FILES; the oldest blobs are deleted.
  Every call is safe: if IndexedDB is missing or full, history still works
  for this session and Print just reports the file is no longer stored.
  API: PrintStore.loadList/saveList/putBlob/getBlob/deleteBlob/clearAll/prune.
*/

const PrintStore = (function () {
  const LIST_KEY = 'jtprint-history';
  const DB_NAME = 'jtprint';
  const STORE = 'files';
  const MAX_FILES = 50;

  let dbPromise = null;

  /* Open (or create) the database once. */
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error('No IndexedDB'));
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    }
    return dbPromise;
  }

  /* Run one request in a transaction; resolves with its result on complete. */
  function run(mode, makeRequest) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, mode);
        const req = makeRequest(tx.objectStore(STORE));
        tx.oncomplete = function () {
          resolve(req ? req.result : undefined);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error);
        };
      });
    });
  }

  /* Saved metadata rows, oldest first. Bad rows are skipped. */
  function loadList() {
    const list = loadJson(LIST_KEY, []);
    if (!Array.isArray(list)) {
      return [];
    }
    return list.filter(function (item) {
      return item && item.id && item.name;
    });
  }

  /* Save metadata rows (no blobs). */
  function saveList(list) {
    saveJson(LIST_KEY, list.map(function (item) {
      return { id: item.id, name: item.name, mime: item.mime, size: item.size, ts: item.ts };
    }));
  }

  /* Store one file blob. */
  function putBlob(id, blob) {
    return run('readwrite', function (store) {
      return store.put(blob, id);
    });
  }

  /* Load one file blob, or undefined. */
  function getBlob(id) {
    return run('readonly', function (store) {
      return store.get(id);
    });
  }

  /* Delete one file blob. */
  function deleteBlob(id) {
    return run('readwrite', function (store) {
      return store.delete(id);
    });
  }

  /* Delete every blob and the metadata list. */
  function clearAll() {
    removeKey(LIST_KEY);
    return run('readwrite', function (store) {
      return store.clear();
    });
  }

  /* Delete blobs whose id is not in keepIds (left over from a crash or a cap). */
  function prune(keepIds) {
    return run('readonly', function (store) {
      return store.getAllKeys();
    }).then(function (keys) {
      const keep = {};
      keepIds.forEach(function (id) {
        keep[id] = true;
      });
      return Promise.all((keys || []).filter(function (key) {
        return !keep[key];
      }).map(deleteBlob));
    });
  }

  return {
    MAX_FILES: MAX_FILES,
    loadList: loadList,
    saveList: saveList,
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    clearAll: clearAll,
    prune: prune
  };
})();
