/* Video Editor — ve_store.js: IndexedDB projects and clip files. VD2
   Database `videoeditor`, stores `files` and `projects`. */
(function (root) {
  'use strict';

  var DB_NAME = 'videoeditor';
  var DB_VERSION = 1;
  var LOW_RATIO = 0.85;
  var LOW_REMAINING = 50 * 1024 * 1024;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        dbPromise = null;
        reject(req.error || new Error('Could not open project storage.'));
      };
    });
    return dbPromise;
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('Storage transaction failed.')); };
      tx.onabort = function () { reject(tx.error || new Error('Storage transaction aborted.')); };
    });
  }

  function reqOf(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function isQuota(err) {
    if (!err) return false;
    var name = err.name || '';
    var msg = String(err.message || err);
    return name === 'QuotaExceededError' || /quota/i.test(msg);
  }

  function putFile(fileId, file) {
    return openDb().then(function (db) {
      var tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({
        id: fileId,
        name: file && file.name || 'clip',
        type: file && file.type || 'video/*',
        size: file && file.size || 0,
        blob: file
      });
      return txDone(tx);
    });
  }

  function putFiles(map) {
    var ids = Object.keys(map || {});
    if (!ids.length) return Promise.resolve();
    return openDb().then(function (db) {
      var tx = db.transaction('files', 'readwrite');
      var store = tx.objectStore('files');
      ids.forEach(function (id) {
        var file = map[id];
        if (!file) return;
        store.put({
          id: id,
          name: file.name || 'clip',
          type: file.type || 'video/*',
          size: file.size || 0,
          blob: file
        });
      });
      return txDone(tx);
    });
  }

  function getFile(fileId) {
    return openDb().then(function (db) {
      return reqOf(db.transaction('files', 'readonly').objectStore('files').get(fileId));
    });
  }

  function getFiles(ids) {
    return openDb().then(function (db) {
      var store = db.transaction('files', 'readonly').objectStore('files');
      return Promise.all((ids || []).map(function (id) { return reqOf(store.get(id)); }));
    }).then(function (rows) {
      var out = {};
      (rows || []).forEach(function (row) {
        if (row && row.id && row.blob) out[row.id] = row.blob;
      });
      return out;
    });
  }

  function deleteFiles(ids) {
    ids = ids || [];
    if (!ids.length) return Promise.resolve();
    return openDb().then(function (db) {
      var tx = db.transaction('files', 'readwrite');
      var store = tx.objectStore('files');
      ids.forEach(function (id) { store.delete(id); });
      return txDone(tx);
    });
  }

  function saveProject(project) {
    return openDb().then(function (db) {
      var tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      return txDone(tx);
    });
  }

  function getProject(id) {
    return openDb().then(function (db) {
      return reqOf(db.transaction('projects', 'readonly').objectStore('projects').get(id));
    });
  }

  function listProjects() {
    return openDb().then(function (db) {
      return reqOf(db.transaction('projects', 'readonly').objectStore('projects').getAll());
    }).then(function (rows) {
      var list = rows || [];
      list.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
      return list;
    });
  }

  function deleteProject(id) {
    return openDb().then(function (db) {
      var tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete(id);
      return txDone(tx);
    });
  }

  /** File ids referenced by any saved project. */
  function referencedFileIds() {
    return listProjects().then(function (list) {
      var ids = {};
      (list || []).forEach(function (p) {
        (p.clips || []).forEach(function (c) { if (c.fileId) ids[c.fileId] = true; });
      });
      return ids;
    });
  }

  /** Drop files that no saved project uses, keeping `keepIds` (current session / undo). */
  function gcFiles(keepIds) {
    keepIds = keepIds || [];
    return openDb().then(function (db) {
      return referencedFileIds().then(function (used) {
        keepIds.forEach(function (id) { used[id] = true; });
        return reqOf(db.transaction('files', 'readonly').objectStore('files').getAllKeys()).then(function (keys) {
          var drop = (keys || []).filter(function (k) { return !used[k]; });
          return deleteFiles(drop);
        });
      });
    });
  }

  function estimate() {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return Promise.resolve({ usage: 0, quota: 0, supported: false, low: false });
    }
    return navigator.storage.estimate().then(function (info) {
      var usage = Number(info.usage) || 0;
      var quota = Number(info.quota) || 0;
      var low = false;
      if (quota > 0) {
        low = (usage / quota) >= LOW_RATIO || (quota - usage) < LOW_REMAINING;
      }
      return { usage: usage, quota: quota, supported: true, low: low };
    }).catch(function () {
      return { usage: 0, quota: 0, supported: false, low: false };
    });
  }

  root.VEStore = {
    DB_NAME: DB_NAME,
    isQuota: isQuota,
    putFile: putFile,
    putFiles: putFiles,
    getFile: getFile,
    getFiles: getFiles,
    deleteFiles: deleteFiles,
    saveProject: saveProject,
    getProject: getProject,
    listProjects: listProjects,
    deleteProject: deleteProject,
    gcFiles: gcFiles,
    estimate: estimate
  };
})(typeof window !== 'undefined' ? window : globalThis);
