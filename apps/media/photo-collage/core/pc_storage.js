/**
 * Photo Collage — IndexedDB persistence, localStorage fallback, and state serialization (core/pc_storage.js)
 */
(function (root, factory) {
  var cfg = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_config.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.config);
  var cropMath = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_crop_math.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.cropMath);
  var api = factory(cfg, cropMath);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.storage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, cropMath) {
  'use strict';

  var DB_NAME = 'photo-collage-v1';
  var STORE_NAME = 'state';
  var RECORD_KEY = 'current_edit';

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported'));
      }
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = function (e) {
          resolve(e.target.result);
        };
        req.onerror = function (e) {
          reject(e.target.error || new Error('Failed to open IndexedDB'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  function serializeState(st) {
    if (!st) return null;
    return {
      version: 1,
      layout: st.layout,
      orientation: st.orientation,
      paper: st.paper,
      margin: st.margin,
      bgColor: st.bgColor,
      manualPages: st.manualPages,
      photos: (st.photos || []).map(function (p) {
        if (!p) return null;
        return {
          id: p.id,
          src: p.src,
          name: p.name,
          rotation: p.rotation,
          fit: p.fit,
          crop: cropMath.normalizeCrop(p.crop)
        };
      }),
      savedAt: Date.now()
    };
  }

  function deserializeState(record, targetState) {
    if (!record || typeof record !== 'object' || !targetState) return false;
    if (record.layout && cfg.LAYOUTS[record.layout]) targetState.layout = record.layout;
    if (record.orientation && (record.orientation === 'portrait' || record.orientation === 'landscape')) {
      targetState.orientation = record.orientation;
    }
    if (record.paper && cfg.PAPER_SIZES[record.paper]) targetState.paper = record.paper;
    if (record.margin) targetState.margin = record.margin;
    if (record.bgColor) targetState.bgColor = record.bgColor;
    if (typeof record.manualPages === 'number') targetState.manualPages = Math.max(1, record.manualPages);
    if (Array.isArray(record.photos)) {
      targetState.photos = record.photos.map(function (p) {
        if (!p || !p.src) return null;
        return {
          id: p.id || ('photo_' + Date.now()),
          src: p.src,
          name: p.name || 'Photo',
          rotation: Number(p.rotation) || 0,
          fit: p.fit === 'contain' ? 'contain' : 'cover',
          crop: cropMath.normalizeCrop(p.crop)
        };
      });
    }
    return true;
  }

  function savePersistedState(st) {
    var payload = serializeState(st);
    if (!payload) return Promise.resolve(false);

    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          var req = store.put(payload, RECORD_KEY);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function (e) { reject(e.target.error); };
        } catch (e) {
          reject(e);
        }
      });
    }).catch(function () {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(DB_NAME, JSON.stringify(payload));
          return true;
        }
      } catch (_) { /* blocked or quota exceeded */ }
      return false;
    });
  }

  function loadPersistedState() {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var store = tx.objectStore(STORE_NAME);
          var req = store.get(RECORD_KEY);
          req.onsuccess = function (e) {
            resolve(e.target.result || null);
          };
          req.onerror = function (e) {
            reject(e.target.error);
          };
        } catch (e) {
          reject(e);
        }
      });
    }).catch(function () {
      try {
        if (typeof localStorage !== 'undefined') {
          var raw = localStorage.getItem(DB_NAME);
          return raw ? JSON.parse(raw) : null;
        }
      } catch (_) { /* blocked */ }
      return null;
    });
  }

  function clearPersistedState() {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          var req = store.delete(RECORD_KEY);
          req.onsuccess = function () { resolve(true); };
          req.onerror = function (e) { reject(e.target.error); };
        } catch (e) {
          reject(e);
        }
      });
    }).catch(function () {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(DB_NAME);
          return true;
        }
      } catch (_) { /* blocked */ }
      return false;
    });
  }

  var saveTimer = null;
  function scheduleAutoSave(getState) {
    if (typeof window === 'undefined') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      savePersistedState(typeof getState === 'function' ? getState() : getState);
    }, 300);
  }

  return {
    serializeState: serializeState,
    deserializeState: deserializeState,
    savePersistedState: savePersistedState,
    loadPersistedState: loadPersistedState,
    clearPersistedState: clearPersistedState,
    scheduleAutoSave: scheduleAutoSave
  };
});
