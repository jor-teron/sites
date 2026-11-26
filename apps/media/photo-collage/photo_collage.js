/**
 * Photo Collage (apps/media/photo-collage/photo_collage.js)
 * 100% vanilla JavaScript, zero build tools.
 * Handles drag-and-drop photo slots, auto-pagination across N pages,
 * per-tile 90-degree rotation, containment modes, printing, and multi-page PDF generation.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PhotoCollage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Core configuration and pure calculation helpers (exported for unit testing)
  const LAYOUTS = {
    '4-grid': { name: '4 Photos / Page (2×2)', slots: 4, cols: 2, rows: 2 },
    '2-stack': { name: '2 Photos / Page (Vertical)', slots: 2, cols: 1, rows: 2 },
    '2-split': { name: '2 Photos / Page (Horizontal)', slots: 2, cols: 2, rows: 1 },
    '1-full': { name: '1 Photo / Page (Full)', slots: 1, cols: 1, rows: 1 }
  };

  const PAPER_SIZES = {
    'a4': { name: 'A4', portrait: [210, 297], landscape: [297, 210] },
    'letter': { name: 'Letter', portrait: [215.9, 279.4], landscape: [279.4, 215.9] }
  };

  function getSlotsPerPage(layoutKey) {
    const layout = LAYOUTS[layoutKey];
    return layout ? layout.slots : 4;
  }

  function calcTotalPages(photoCount, slotsPerPage, manualPages) {
    const minPagesFromPhotos = Math.ceil((photoCount || 0) / (slotsPerPage || 1));
    const manual = Number(manualPages) || 0;
    return Math.max(1, minPagesFromPhotos, manual);
  }

  const MIN_CROP_SIZE = 0.05;

  function roundCropVal(v) {
    return Math.round(v * 10000) / 10000;
  }

  function normalizeCrop(crop) {
    if (!crop || typeof crop !== 'object') return null;
    let x = Number(crop.x);
    let y = Number(crop.y);
    let w = Number(crop.w);
    let h = Number(crop.h);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    x = Math.max(0, Math.min(1 - MIN_CROP_SIZE, x));
    y = Math.max(0, Math.min(1 - MIN_CROP_SIZE, y));
    w = Math.max(MIN_CROP_SIZE, Math.min(1 - x, w));
    h = Math.max(MIN_CROP_SIZE, Math.min(1 - y, h));
    if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) {
      return null;
    }
    return {
      x: roundCropVal(x),
      y: roundCropVal(y),
      w: roundCropVal(w),
      h: roundCropVal(h)
    };
  }

  function cropToVisual(crop, rotation) {
    const c = normalizeCrop(crop) || { x: 0, y: 0, w: 1, h: 1 };
    const rot = (((rotation || 0) % 360) + 360) % 360;
    if (rot === 90) {
      return { x: roundCropVal(1 - (c.y + c.h)), y: c.x, w: c.h, h: c.w };
    }
    if (rot === 180) {
      return { x: roundCropVal(1 - (c.x + c.w)), y: roundCropVal(1 - (c.y + c.h)), w: c.w, h: c.h };
    }
    if (rot === 270) {
      return { x: c.y, y: roundCropVal(1 - (c.x + c.w)), w: c.h, h: c.w };
    }
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }

  function visualToCrop(vcrop, rotation) {
    if (!vcrop || typeof vcrop !== 'object') return null;
    const x = Number(vcrop.x);
    const y = Number(vcrop.y);
    const w = Number(vcrop.w);
    const h = Number(vcrop.h);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    const rot = (((rotation || 0) % 360) + 360) % 360;
    let orig;
    if (rot === 90) {
      orig = { x: y, y: 1 - (x + w), w: h, h: w };
    } else if (rot === 180) {
      orig = { x: 1 - (x + w), y: 1 - (y + h), w: w, h: h };
    } else if (rot === 270) {
      orig = { x: 1 - (y + h), y: x, w: h, h: w };
    } else {
      orig = { x: x, y: y, w: w, h: h };
    }
    return normalizeCrop(orig);
  }

  function calcSourceCropRect(naturalW, naturalH, crop) {
    const nw = Math.max(1, Number(naturalW) || 1);
    const nh = Math.max(1, Number(naturalH) || 1);
    const c = normalizeCrop(crop);
    if (!c) {
      return { sx: 0, sy: 0, sw: nw, sh: nh };
    }
    const sx = Math.max(0, Math.min(nw - 1, Math.round(c.x * nw)));
    const sy = Math.max(0, Math.min(nh - 1, Math.round(c.y * nh)));
    const sw = Math.max(1, Math.min(nw - sx, Math.round(c.w * nw)));
    const sh = Math.max(1, Math.min(nh - sy, Math.round(c.h * nh)));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function computeAspectCropRect(visualImgW, visualImgH, targetAspect) {
    const imgW = Math.max(1, Number(visualImgW) || 1);
    const imgH = Math.max(1, Number(visualImgH) || 1);
    const aspect = Number(targetAspect);
    if (!isFinite(aspect) || aspect <= 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const imgAspect = imgW / imgH;
    let w = 1;
    let h = 1;
    if (aspect > imgAspect) {
      w = 1;
      h = imgAspect / aspect;
    } else {
      h = 1;
      w = aspect / imgAspect;
    }
    w = Math.max(MIN_CROP_SIZE, Math.min(1, w));
    h = Math.max(MIN_CROP_SIZE, Math.min(1, h));
    return {
      x: roundCropVal((1 - w) / 2),
      y: roundCropVal((1 - h) / 2),
      w: roundCropVal(w),
      h: roundCropVal(h)
    };
  }

  function createPhotoItem(src, name) {
    return {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      src: src || '',
      name: name || 'Photo',
      rotation: 0, // 0, 90, 180, 270
      fit: 'contain', // 'contain' (Full) or 'cover' (Fill)
      crop: null // null or normalized { x, y, w, h } in original image coordinates
    };
  }

  function rotatePhoto(photo, degrees) {
    if (!photo) return 0;
    const step = typeof degrees === 'number' ? degrees : 90;
    photo.rotation = (((photo.rotation || 0) + step) % 360 + 360) % 360;
    return photo.rotation;
  }

  function swapPhotos(photosList, indexA, indexB) {
    if (!photosList || indexA < 0 || indexB < 0) return false;
    const maxIdx = Math.max(indexA, indexB);
    while (photosList.length <= maxIdx) {
      photosList.push(null);
    }
    const temp = photosList[indexA];
    photosList[indexA] = photosList[indexB];
    photosList[indexB] = temp;
    return true;
  }

  function removePhotoAt(photosList, index) {
    if (!photosList || index < 0 || index >= photosList.length) return null;
    const removed = photosList[index];
    photosList.splice(index, 1);
    return removed;
  }

  // Offline State Persistence (IndexedDB photo-collage-v1 + localStorage fallback)
  const DB_NAME = 'photo-collage-v1';
  const STORE_NAME = 'state';
  const RECORD_KEY = 'current_edit';

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB not supported'));
      }
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
          const db = e.target.result;
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
          crop: normalizeCrop(p.crop)
        };
      }),
      savedAt: Date.now()
    };
  }

  function deserializeState(record, targetState) {
    if (!record || typeof record !== 'object' || !targetState) return false;
    if (record.layout && LAYOUTS[record.layout]) targetState.layout = record.layout;
    if (record.orientation && (record.orientation === 'portrait' || record.orientation === 'landscape')) {
      targetState.orientation = record.orientation;
    }
    if (record.paper && PAPER_SIZES[record.paper]) targetState.paper = record.paper;
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
          crop: normalizeCrop(p.crop)
        };
      });
    }
    return true;
  }

  function savePersistedState(st) {
    const payload = serializeState(st);
    if (!payload) return Promise.resolve(false);

    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(payload, RECORD_KEY);
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
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(RECORD_KEY);
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
          const raw = localStorage.getItem(DB_NAME);
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
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(RECORD_KEY);
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

  let saveTimer = null;
  function scheduleAutoSave() {
    if (typeof window === 'undefined') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      savePersistedState(state);
    }, 300);
  }

  // Undo & Redo History Management
  const MAX_HISTORY = 30;
  let undoStack = [];
  let redoStack = [];

  function createSnapshot(st) {
    return serializeState(st);
  }

  function restoreSnapshot(snap, targetState) {
    return deserializeState(snap, targetState);
  }

  function pushHistory(st) {
    const s = st || state;
    const snap = createSnapshot(s);
    if (!snap) return;
    undoStack.push(snap);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack = [];
    updateHistoryButtons();
  }

  function undo() {
    if (undoStack.length === 0) return false;
    const currentSnap = createSnapshot(state);
    redoStack.push(currentSnap);
    if (redoStack.length > MAX_HISTORY) {
      redoStack.shift();
    }
    const prevSnap = undoStack.pop();
    restoreSnapshot(prevSnap, state);
    syncDomControls();
    renderSheets();
    scheduleAutoSave();
    updateHistoryButtons();
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    const currentSnap = createSnapshot(state);
    undoStack.push(currentSnap);
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    const nextSnap = redoStack.pop();
    restoreSnapshot(nextSnap, state);
    syncDomControls();
    renderSheets();
    scheduleAutoSave();
    updateHistoryButtons();
    return true;
  }

  function clearHistory() {
    undoStack = [];
    redoStack = [];
    updateHistoryButtons();
  }

  function getHistoryState() {
    return {
      undoCount: undoStack.length,
      redoCount: redoStack.length
    };
  }

  // Hub Window Title Bar Integration (H49 / H110 protocol)
  // PC7: listen for Hub hello as soon as this file runs (do not wait for initApp / jsPDF)
  let hubTitleBarLinked = false;
  let hubTitleBarReady = false;

  function hubTitleBarTarget() {
    return (location.origin && location.origin !== 'null') ? location.origin : '*';
  }

  function hubTitleBarButtons() {
    return [
      { id: 'undo', label: 'Undo', icon: '↩', enabled: undoStack.length > 0, title: 'Undo (Ctrl+Z)' },
      { id: 'redo', label: 'Redo', icon: '↪', enabled: redoStack.length > 0, title: 'Redo (Ctrl+Y)' },
      { id: 'add-photos', label: 'Add Photos', icon: '📷', enabled: true, title: 'Add photos to collage' },
      { id: 'add-page', label: '+ Page', icon: '📄', enabled: true, title: 'Add another empty page' },
      { id: 'print', label: 'Print', icon: '⎙', enabled: true, title: 'Print collage (Ctrl+P)' },
      { id: 'pdf', label: 'Save PDF', icon: '⤓', enabled: true, title: 'Save collage as PDF' },
      { id: 'clear', label: 'Clear', icon: '✕', enabled: true, title: 'Clear all photos' }
    ];
  }

  function applyHubTitleBarClass() {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('hub-titlebar');
    }
  }

  function sendHubTitleBar(op) {
    if (!hubTitleBarLinked || typeof window === 'undefined' || window.parent === window) return;
    const msg = { v: 1, op: op, buttons: hubTitleBarButtons() };
    if (op === 'set') msg.align = 'left';
    try {
      window.parent.postMessage({ hubTitleBar: msg }, hubTitleBarTarget());
    } catch (_) {}
  }

  function updateHubTitleBar() {
    sendHubTitleBar('update');
  }

  function handleHubTitleBarHello() {
    hubTitleBarLinked = true;
    applyHubTitleBarClass();
    if (hubTitleBarReady) sendHubTitleBar('set');
  }

  function handleHubTitleBarClick(id) {
    if (!hubTitleBarReady) return;
    if (id === 'undo') undo();
    else if (id === 'redo') redo();
    else if (id === 'add-photos' && dom.btnAddPhotos) dom.btnAddPhotos.click();
    else if (id === 'add-page' && dom.btnAddPage) dom.btnAddPage.click();
    else if (id === 'print' && dom.btnPrint) dom.btnPrint.click();
    else if (id === 'pdf' && dom.btnPdf) dom.btnPdf.click();
    else if (id === 'clear' && dom.btnClear) dom.btnClear.click();
  }

  if (typeof window !== 'undefined' && window.parent !== window) {
    (function installHubTitleBarListener() {
      const target = hubTitleBarTarget();
      window.addEventListener('message', function (e) {
        if (e.source !== window.parent || (target !== '*' && e.origin !== target)) return;
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.hubTitleBarHello && d.hubTitleBarHello.v === 1) {
          handleHubTitleBarHello();
        } else if (hubTitleBarLinked && d.hubTitleBarClick && d.hubTitleBarClick.v === 1 && d.hubTitleBarClick.kind === 'button') {
          handleHubTitleBarClick(d.hubTitleBarClick.id);
        }
      });
    })();
  }

  /* (before PC7)
  function initHubTitleBar() {
    if (typeof window === 'undefined' || window.parent === window) return;
    const target = (location.origin && location.origin !== 'null') ? location.origin : '*';
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || (target !== '*' && e.origin !== target)) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.hubTitleBarHello && d.hubTitleBarHello.v === 1) {
        hubTitleBarLinked = true;
        document.body.classList.add('hub-titlebar');
        try {
          window.parent.postMessage({
            hubTitleBar: {
              v: 1,
              op: 'set',
              align: 'left',
              buttons: [
                { id: 'undo', label: 'Undo', icon: '↩', enabled: undoStack.length > 0, title: 'Undo (Ctrl+Z)' },
                { id: 'redo', label: 'Redo', icon: '↪', enabled: redoStack.length > 0, title: 'Redo (Ctrl+Y)' },
                { id: 'add-photos', label: 'Add Photos', icon: '📷', enabled: true, title: 'Add photos to collage' },
                { id: 'add-page', label: '+ Page', icon: '📄', enabled: true, title: 'Add another empty page' },
                { id: 'print', label: 'Print', icon: '⎙', enabled: true, title: 'Print collage (Ctrl+P)' },
                { id: 'pdf', label: 'Save PDF', icon: '⤓', enabled: true, title: 'Save collage as PDF' },
                { id: 'clear', label: 'Clear', icon: '✕', enabled: true, title: 'Clear all photos' }
              ]
            }
          }, target);
        } catch (_) {}
      } else if (hubTitleBarLinked && d.hubTitleBarClick && d.hubTitleBarClick.v === 1 && d.hubTitleBarClick.kind === 'button') {
        const id = d.hubTitleBarClick.id;
        if (id === 'undo') undo();
        else if (id === 'redo') redo();
        else if (id === 'add-photos' && dom.btnAddPhotos) dom.btnAddPhotos.click();
        else if (id === 'add-page' && dom.btnAddPage) dom.btnAddPage.click();
        else if (id === 'print' && dom.btnPrint) dom.btnPrint.click();
        else if (id === 'pdf' && dom.btnPdf) dom.btnPdf.click();
        else if (id === 'clear' && dom.btnClear) dom.btnClear.click();
      }
    });
  }
  */

  function initHubTitleBar() {
    if (typeof window === 'undefined' || window.parent === window) return;
    hubTitleBarReady = true;
    if (hubTitleBarLinked) {
      applyHubTitleBarClass();
      sendHubTitleBar('set');
    }
  }

  function updateHistoryButtons() {
    if (dom.btnUndo) {
      dom.btnUndo.disabled = undoStack.length === 0;
    }
    if (dom.btnRedo) {
      dom.btnRedo.disabled = redoStack.length === 0;
    }
    updateHubTitleBar();
  }

  function syncDomControls() {
    if (dom.layoutSelect) dom.layoutSelect.value = state.layout;
    if (dom.orientSelect) dom.orientSelect.value = state.orientation;
    if (dom.paperSelect) dom.paperSelect.value = state.paper;
    if (dom.marginSelect) dom.marginSelect.value = state.margin;
    if (dom.colorSelect) dom.colorSelect.value = state.bgColor;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sheet-bg', state.bgColor);
    }
  }

  // Browser UI Controller
  let state = {
    layout: '4-grid',
    orientation: 'portrait',
    paper: 'a4',
    margin: 'normal',
    bgColor: '#ffffff',
    zoom: 1.0,
    photos: [], // Array of photo objects or nulls
    manualPages: 1,
    activeSlotIndex: null
  };

  let dom = {};

  function initApp() {
    if (typeof document === 'undefined') return; // Node environment guard

    // Theme initialization matching Hub standard
    try {
      const savedTheme = localStorage.getItem('sites-hub.theme') || '';
      const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) document.documentElement.classList.add('dark');
    } catch (_) { /* blocked */ }

    // Cache elements
    dom.btnUndo = document.getElementById('btn-undo');
    dom.btnRedo = document.getElementById('btn-redo');
    dom.layoutSelect = document.getElementById('layout-select');
    dom.orientSelect = document.getElementById('orient-select');
    dom.paperSelect = document.getElementById('paper-select');
    dom.marginSelect = document.getElementById('margin-select');
    dom.colorSelect = document.getElementById('color-select');
    dom.sheetsContainer = document.getElementById('sheets-container');
    dom.statusText = document.getElementById('status-text');
    dom.globalDropZone = document.getElementById('global-drop-zone');
    dom.fileInput = document.getElementById('file-input');
    dom.slotFileInput = document.getElementById('slot-file-input');
    dom.btnAddPhotos = document.getElementById('btn-add-photos');
    dom.btnAddPage = document.getElementById('btn-add-page');
    dom.btnPrint = document.getElementById('btn-print');
    dom.btnPdf = document.getElementById('btn-pdf');
    dom.btnClear = document.getElementById('btn-clear');
    dom.btnZoomIn = document.getElementById('btn-zoom-in');
    dom.btnZoomOut = document.getElementById('btn-zoom-out');
    dom.btnZoomReset = document.getElementById('btn-zoom-reset');
    dom.cropModal = document.getElementById('crop-modal');
    dom.cropStage = document.getElementById('crop-stage');
    dom.cropStageFrame = document.getElementById('crop-stage-frame');
    dom.cropCanvas = document.getElementById('crop-canvas');
    dom.cropBox = document.getElementById('crop-box');
    dom.cropDimensions = document.getElementById('crop-dimensions');
    dom.btnCropClose = document.getElementById('btn-crop-close');
    dom.btnCropReset = document.getElementById('btn-crop-reset');
    dom.btnCropCancel = document.getElementById('btn-crop-cancel');
    dom.btnCropApply = document.getElementById('btn-crop-apply');

    attachEvents();
    attachCropModalEvents();
    initHubTitleBar();
    loadPersistedState().then(function (saved) {
      if (saved) {
        deserializeState(saved, state);
        syncDomControls();
      }
      renderSheets();
      updateHistoryButtons();
    }).catch(function () {
      renderSheets();
      updateHistoryButtons();
    });
  }

  function attachEvents() {
    // Undo / Redo controls
    if (dom.btnUndo) {
      dom.btnUndo.addEventListener('click', function () {
        undo();
      });
    }
    if (dom.btnRedo) {
      dom.btnRedo.addEventListener('click', function () {
        redo();
      });
    }

    // Keyboard Shortcuts: Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y, Ctrl+Shift+Z / Cmd+Shift+Z
    window.addEventListener('keydown', function (e) {
      if (cropModalState.open) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeCropModal();
        } else if (e.key === 'Enter') {
          const id = e.target && e.target.id;
          if (id !== 'btn-crop-cancel' && id !== 'btn-crop-close' && id !== 'btn-crop-reset') {
            e.preventDefault();
            applyCropModal();
          }
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const tag = e.target && e.target.tagName;
      if (e.target && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable)) {
        return;
      }

      const key = e.key ? e.key.toLowerCase() : '';
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        setZoom(state.zoom + 0.1);
      } else if (key === '-') {
        e.preventDefault();
        setZoom(state.zoom - 0.1);
      } else if (key === '0') {
        e.preventDefault();
        setZoom(1.0);
      }
    });

    // Selectors
    if (dom.layoutSelect) {
      dom.layoutSelect.addEventListener('change', function () {
        pushHistory(state);
        state.layout = this.value;
        renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.orientSelect) {
      dom.orientSelect.addEventListener('change', function () {
        pushHistory(state);
        state.orientation = this.value;
        updatePrintOrientation();
        renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.paperSelect) {
      dom.paperSelect.addEventListener('change', function () {
        pushHistory(state);
        state.paper = this.value;
        updatePrintOrientation();
        renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.marginSelect) {
      dom.marginSelect.addEventListener('change', function () {
        pushHistory(state);
        state.margin = this.value;
        renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.colorSelect) {
      dom.colorSelect.addEventListener('change', function () {
        pushHistory(state);
        state.bgColor = this.value;
        document.documentElement.style.setProperty('--sheet-bg', state.bgColor);
        renderSheets();
        scheduleAutoSave();
      });
    }

    // Buttons
    if (dom.btnAddPhotos && dom.fileInput) {
      dom.btnAddPhotos.addEventListener('click', function () {
        dom.fileInput.click();
      });

      dom.fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) {
          handleIncomingFiles(e.target.files);
          dom.fileInput.value = '';
        }
      });
    }

    if (dom.slotFileInput) {
      dom.slotFileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length && state.activeSlotIndex !== null) {
          handleSingleSlotFile(e.target.files[0], state.activeSlotIndex);
          dom.slotFileInput.value = '';
        }
      });
    }

    if (dom.btnAddPage) {
      dom.btnAddPage.addEventListener('click', function () {
        pushHistory(state);
        const slotsPer = getSlotsPerPage(state.layout);
        const currentPages = calcTotalPages(state.photos.length, slotsPer, state.manualPages);
        state.manualPages = currentPages + 1;
        renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.btnClear) {
      dom.btnClear.addEventListener('click', function () {
        if (state.photos.length === 0) return;
        if (confirm('Clear all photos from the collage?')) {
          pushHistory(state);
          state.photos = [];
          state.manualPages = 1;
          clearPersistedState();
          renderSheets();
        }
      });
    }

    if (dom.btnPrint) {
      dom.btnPrint.addEventListener('click', function () {
        window.print();
      });
    }

    if (dom.btnPdf) {
      dom.btnPdf.addEventListener('click', function () {
        exportToPdf();
      });
    }

    // Zoom
    if (dom.btnZoomIn) {
      dom.btnZoomIn.addEventListener('click', function () {
        setZoom(state.zoom + 0.1);
      });
    }
    if (dom.btnZoomOut) {
      dom.btnZoomOut.addEventListener('click', function () {
        setZoom(state.zoom - 0.1);
      });
    }
    if (dom.btnZoomReset) {
      dom.btnZoomReset.addEventListener('click', function () {
        setZoom(1.0);
      });
    }

    // PC4: Ctrl+wheel / Ctrl+=/-/0 in-app zoom
    document.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY > 0) setZoom(state.zoom - 0.1);
      else if (e.deltaY < 0) setZoom(state.zoom + 0.1);
    }, { passive: false });

    // Global drag & drop
    window.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (isDragWithFiles(e) && dom.globalDropZone) {
        dom.globalDropZone.classList.add('active');
      }
    });

    window.addEventListener('dragover', function (e) {
      e.preventDefault();
    });

    if (dom.globalDropZone) {
      dom.globalDropZone.addEventListener('dragleave', function (e) {
        if (e.relatedTarget === null || e.target === dom.globalDropZone) {
          dom.globalDropZone.classList.remove('active');
        }
      });

      dom.globalDropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dom.globalDropZone.classList.remove('active');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          handleIncomingFiles(e.dataTransfer.files);
        }
      });
    }

    window.addEventListener('resize', updateAllSlotDimensions);
  }

  function isDragWithFiles(e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return false;
    for (let i = 0; i < e.dataTransfer.types.length; i++) {
      if (e.dataTransfer.types[i] === 'Files') return true;
    }
    return false;
  }

  function setZoom(z) {
    const next = Math.round((Number(z) || 0) * 100) / 100;
    state.zoom = Math.max(0.4, Math.min(2.0, next));
    applyZoom();
  }

  function applyZoom() {
    if (dom.sheetsContainer) {
      dom.sheetsContainer.style.transform = 'scale(' + state.zoom + ')';
      dom.sheetsContainer.style.transformOrigin = 'top center';
    }
    if (dom.btnZoomReset) {
      dom.btnZoomReset.textContent = Math.round(state.zoom * 100) + '%';
    }
  }

  function calcPrintSlotDimensions(paperKey, orientKey, layoutKey, marginKey) {
    const isLand = orientKey === 'landscape';
    const paperDims = PAPER_SIZES[paperKey] || PAPER_SIZES.a4;
    const pageW = isLand ? paperDims.landscape[0] : paperDims.portrait[0];
    const pageH = isLand ? paperDims.landscape[1] : paperDims.portrait[1];

    let marginMm = 8;
    if (marginKey === 'none') marginMm = 0;
    else if (marginKey === 'small') marginMm = 4;
    else if (marginKey === 'wide') marginMm = 12;

    const gapMm = marginMm;
    const layout = LAYOUTS[layoutKey] || LAYOUTS['4-grid'];
    const cols = layout.cols;
    const rows = layout.rows;

    const gridW = pageW - (marginMm * 2);
    const gridH = pageH - (marginMm * 2);

    const slotW = (gridW - (gapMm * (cols - 1))) / cols;
    const slotH = (gridH - (gapMm * (rows - 1))) / rows;

    return {
      pageW: pageW,
      pageH: pageH,
      slotW: slotW,
      slotH: slotH,
      aspect: slotW / slotH
    };
  }

  function applySlotRotationAndFit(img, slot, photo) {
    if (!img || !photo) return;
    const rot = (photo.rotation || 0) % 360;
    img.setAttribute('data-rotation', rot);
    img.className = 'photo-img fit-' + (photo.fit || 'cover');

    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const w = rect.width || slot.offsetWidth || 0;
    const h = rect.height || slot.offsetHeight || 0;

    if (w && h) {
      slot.style.setProperty('--slot-w', w + 'px');
      slot.style.setProperty('--slot-h', h + 'px');
    }

    const isRotated90 = rot === 90 || rot === 270;
    if (isRotated90 && w && h) {
      img.style.width = h + 'px';
      img.style.height = w + 'px';
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
    } else {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = '';
      img.style.maxHeight = '';
    }
  }

  function updateAllSlotDimensions() {
    if (!dom.sheetsContainer) return;
    const slots = dom.sheetsContainer.querySelectorAll('.photo-slot.filled');
    slots.forEach(function (slot) {
      const idx = parseInt(slot.getAttribute('data-slot-index'), 10);
      const photo = state.photos[idx];
      const img = slot.querySelector('.photo-img');
      if (photo && img) {
        applySlotRotationAndFit(img, slot, photo);
      }
    });
  }

  function updatePrintOrientation() {
    let styleEl = document.getElementById('dynamic-print-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-print-style';
      document.head.appendChild(styleEl);
    }
    const paperName = state.paper === 'letter' ? 'letter' : 'A4';
    const orient = state.orientation === 'landscape' ? 'landscape' : 'portrait';
    const dims = calcPrintSlotDimensions(state.paper, state.orientation, state.layout, state.margin);

    styleEl.textContent =
      '@page { size: ' + paperName + ' ' + orient + '; margin: 0; }\n' +
      '@media print {\n' +
      '  .sheet-page .photo-img[data-rotation="90"],\n' +
      '  .sheet-page .photo-img[data-rotation="270"] {\n' +
      '    width: ' + dims.slotH.toFixed(2) + 'mm !important;\n' +
      '    height: ' + dims.slotW.toFixed(2) + 'mm !important;\n' +
      '    max-width: none !important;\n' +
      '    max-height: none !important;\n' +
      '  }\n' +
      '  .sheet-page .photo-img[data-rotation="0"],\n' +
      '  .sheet-page .photo-img[data-rotation="180"] {\n' +
      '    width: 100% !important;\n' +
      '    height: 100% !important;\n' +
      '  }\n' +
      '}';
  }

  // File loading & pagination expansion
  function handleIncomingFiles(fileList) {
    const files = Array.from(fileList).filter(function (file) {
      return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
    });

    if (!files.length) return;

    let loadedCount = 0;
    const newItems = [];

    files.forEach(function (file, idx) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const item = createPhotoItem(e.target.result, file.name);
        newItems[idx] = item;
        loadedCount++;
        if (loadedCount === files.length) {
          // Fill empty slots or append
          appendPhotosToState(newItems);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function appendPhotosToState(newPhotos) {
    if (!newPhotos || !newPhotos.length) return;
    pushHistory(state);
    // Fill any null gaps in state.photos first, then push remaining
    let pIdx = 0;
    for (let i = 0; i < state.photos.length && pIdx < newPhotos.length; i++) {
      if (!state.photos[i]) {
        state.photos[i] = newPhotos[pIdx++];
      }
    }
    while (pIdx < newPhotos.length) {
      state.photos.push(newPhotos[pIdx++]);
    }

    renderSheets();
    scheduleAutoSave();
  }

  function handleSingleSlotFile(file, slotIndex) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      pushHistory(state);
      const item = createPhotoItem(e.target.result, file.name);
      while (state.photos.length <= slotIndex) {
        state.photos.push(null);
      }
      state.photos[slotIndex] = item;
      renderSheets();
      scheduleAutoSave();
    };
    reader.readAsDataURL(file);
  }

  // Rendering sheets and photo slots
  function renderSheets() {
    if (!dom.sheetsContainer) return;

    const slotsPerPage = getSlotsPerPage(state.layout);
    const populatedCount = state.photos.filter(Boolean).length;
    const totalPages = calcTotalPages(state.photos.length, slotsPerPage, state.manualPages);

    // Update status text
    if (dom.statusText) {
      dom.statusText.textContent = populatedCount + ' photo' + (populatedCount === 1 ? '' : 's') +
        ' • ' + totalPages + ' page' + (totalPages === 1 ? '' : 's') +
        ' (' + (state.paper.toUpperCase()) + ' ' + state.orientation + ')' +
        ' • Drop photos anywhere to populate slots';
    }

    // Build DOM for sheets
    dom.sheetsContainer.innerHTML = '';

    for (let p = 0; p < totalPages; p++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'sheet-wrapper';

      // Page Header Bar
      const headerBar = document.createElement('div');
      headerBar.className = 'sheet-header-bar';
      headerBar.innerHTML = '<span>Page ' + (p + 1) + ' of ' + totalPages + '</span>';

      if (totalPages > 1) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn danger';
        delBtn.style.padding = '2px 8px';
        delBtn.style.fontSize = '11px';
        delBtn.textContent = '✕ Remove Page';
        delBtn.addEventListener('click', (function (pageIndex) {
          return function () {
            removePage(pageIndex, slotsPerPage);
          };
        })(p));
        headerBar.appendChild(delBtn);
      }
      pageWrapper.appendChild(headerBar);

      // Sheet Paper Page
      const sheetPage = document.createElement('div');
      const sizeClass = state.paper + '-' + state.orientation;
      sheetPage.className = 'sheet-page ' + sizeClass;
      sheetPage.style.backgroundColor = state.bgColor;

      // Collage Grid
      const grid = document.createElement('div');
      grid.className = 'collage-grid';
      grid.setAttribute('data-layout', state.layout);
      grid.setAttribute('data-margin', state.margin);

      for (let s = 0; s < slotsPerPage; s++) {
        const globalSlotIdx = p * slotsPerPage + s;
        const photo = state.photos[globalSlotIdx] || null;
        const slotEl = createSlotElement(photo, globalSlotIdx);
        grid.appendChild(slotEl);
      }

      sheetPage.appendChild(grid);
      pageWrapper.appendChild(sheetPage);
      dom.sheetsContainer.appendChild(pageWrapper);
    }
    updatePrintOrientation();
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(updateAllSlotDimensions);
    }
  }

  function removePage(pageIndex, slotsPerPage) {
    pushHistory(state);
    const startIdx = pageIndex * slotsPerPage;
    state.photos.splice(startIdx, slotsPerPage);
    if (state.manualPages > 1) {
      state.manualPages--;
    }
    renderSheets();
    scheduleAutoSave();
  }

  function createSlotElement(photo, slotIndex) {
    const slot = document.createElement('div');
    slot.className = 'photo-slot ' + (photo ? 'filled' : 'empty');
    slot.setAttribute('data-slot-index', slotIndex);

    // Slot Drag & Drop listeners
    slot.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.add('dragover');
    });

    slot.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove('dragover');
    });

    slot.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      slot.classList.remove('dragover');

      // Internal swap
      const sourceIdxStr = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (sourceIdxStr && !isNaN(sourceIdxStr)) {
        const sourceIdx = parseInt(sourceIdxStr, 10);
        if (sourceIdx !== slotIndex) {
          pushHistory(state);
          swapPhotos(state.photos, sourceIdx, slotIndex);
          renderSheets();
          scheduleAutoSave();
          return;
        }
      }

      // External files drop
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        if (e.dataTransfer.files.length === 1) {
          handleSingleSlotFile(e.dataTransfer.files[0], slotIndex);
        } else {
          handleIncomingFiles(e.dataTransfer.files);
        }
      }
    });

    if (!photo) {
      // Empty slot UI
      const placeholder = document.createElement('div');
      placeholder.className = 'slot-placeholder';
      placeholder.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
        '<span>Photo ' + (slotIndex + 1) + '</span>' +
        '<small>Click or drop photo here</small>';

      slot.appendChild(placeholder);

      slot.addEventListener('click', function () {
        state.activeSlotIndex = slotIndex;
        if (dom.slotFileInput) dom.slotFileInput.click();
      });
    } else {
      // Populated slot UI
      const imgContainer = document.createElement('div');
      imgContainer.className = 'photo-img-container';

      const img = document.createElement('img');
      img.className = 'photo-img fit-' + (photo.fit || 'cover');
      img.alt = photo.name || 'Photo';
      img.setAttribute('data-rotation', photo.rotation || 0);

      if (photo.crop) {
        const cached = getCachedCroppedUrl(photo);
        img.src = cached || photo.src;
        if (!cached) {
          renderCroppedDataUrl(photo, function (croppedUrl) {
            if (croppedUrl && img.isConnected) {
              img.src = croppedUrl;
            }
          });
        }
      } else {
        img.src = photo.src;
      }

      imgContainer.appendChild(img);
      slot.appendChild(imgContainer);
      applySlotRotationAndFit(img, slot, photo);

      // Slot Action Buttons (Overlay)
      const controls = document.createElement('div');
      controls.className = 'slot-controls';

      // Drag swap handle
      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'slot-btn slot-drag-handle';
      dragHandle.title = 'Drag to swap photo position';
      dragHandle.setAttribute('draggable', 'true');
      dragHandle.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg> Swap';

      dragHandle.addEventListener('dragstart', function (e) {
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', String(slotIndex));
          e.dataTransfer.effectAllowed = 'move';
        }
      });
      controls.appendChild(dragHandle);

      // Rotate 90 deg button
      const rotateBtn = document.createElement('button');
      rotateBtn.type = 'button';
      rotateBtn.className = 'slot-btn';
      rotateBtn.title = 'Rotate photo 90° clockwise';
      rotateBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> 90°';
      rotateBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        pushHistory(state);
        rotatePhoto(photo, 90);
        applySlotRotationAndFit(img, slot, photo);
        scheduleAutoSave();
      });
      controls.appendChild(rotateBtn);

      // Crop button
      const cropBtn = document.createElement('button');
      cropBtn.type = 'button';
      cropBtn.className = 'slot-btn';
      cropBtn.title = photo.crop ? 'Edit or reset crop' : 'Crop photo';
      cropBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg> Crop';
      cropBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openCropModal(slotIndex, slot);
      });
      controls.appendChild(cropBtn);

      // Fit mode (Full / Fill) button
      const fitBtn = document.createElement('button');
      fitBtn.type = 'button';
      fitBtn.className = 'slot-btn';
      fitBtn.title = 'Toggle Image Fit Mode (Full / Fill)';
      fitBtn.innerHTML = photo.fit === 'contain' ? 'Full' : 'Fill';
      fitBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        pushHistory(state);
        photo.fit = photo.fit === 'contain' ? 'cover' : 'contain';
        applySlotRotationAndFit(img, slot, photo);
        fitBtn.innerHTML = photo.fit === 'contain' ? 'Full' : 'Fill';
        scheduleAutoSave();
      });
      controls.appendChild(fitBtn);

      // Remove photo button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'slot-btn danger';
      removeBtn.title = 'Remove photo from slot';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        pushHistory(state);
        state.photos[slotIndex] = null;
        renderSheets();
        scheduleAutoSave();
      });
      controls.appendChild(removeBtn);

      slot.appendChild(controls);
    }

    return slot;
  }

  // Non-destructive Tile Crop Cache & Interactive Modal Controller
  const cropRenderCache = new Map();
  const MAX_CROP_CACHE = 40;

  function makeCropCacheKey(photo) {
    if (!photo || !photo.crop) return '';
    const c = normalizeCrop(photo.crop);
    if (!c) return '';
    return photo.id + '|' + c.x + ',' + c.y + ',' + c.w + ',' + c.h + '|' + (photo.src ? photo.src.length : 0);
  }

  function getCachedCroppedUrl(photo) {
    const key = makeCropCacheKey(photo);
    return key ? (cropRenderCache.get(key) || null) : null;
  }

  function renderCroppedDataUrl(photo, callback) {
    if (!photo || !photo.src || typeof document === 'undefined' || typeof Image === 'undefined') {
      if (callback) callback(photo ? photo.src : '');
      return;
    }
    const c = normalizeCrop(photo.crop);
    if (!c) {
      if (callback) callback(photo.src);
      return;
    }
    const key = makeCropCacheKey(photo);
    if (cropRenderCache.has(key)) {
      if (callback) callback(cropRenderCache.get(key));
      return;
    }
    const img = new Image();
    img.onload = function () {
      try {
        const rect = calcSourceCropRect(img.naturalWidth, img.naturalHeight, c);
        const canvas = document.createElement('canvas');
        canvas.width = rect.sw;
        canvas.height = rect.sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
        const isJpeg = /^data:image\/jpe?g/i.test(photo.src);
        const outUrl = isJpeg ? canvas.toDataURL('image/jpeg', 0.94) : canvas.toDataURL('image/png');
        if (cropRenderCache.size >= MAX_CROP_CACHE) {
          const oldestKey = cropRenderCache.keys().next().value;
          cropRenderCache.delete(oldestKey);
        }
        cropRenderCache.set(key, outUrl);
        if (callback) callback(outUrl);
      } catch (_) {
        if (callback) callback(photo.src);
      }
    };
    img.onerror = function () {
      if (callback) callback(photo.src);
    };
    img.src = photo.src;
  }

  function stepCropBoxDrag(startBox, handle, dx, dy, visualW, visualH, aspect) {
    const base = {
      x: Number(startBox.x) || 0,
      y: Number(startBox.y) || 0,
      w: Math.max(MIN_CROP_SIZE, Number(startBox.w) || 1),
      h: Math.max(MIN_CROP_SIZE, Number(startBox.h) || 1)
    };
    if (handle === 'move') {
      return {
        x: roundCropVal(Math.max(0, Math.min(1 - base.w, base.x + dx))),
        y: roundCropVal(Math.max(0, Math.min(1 - base.h, base.y + dy))),
        w: roundCropVal(base.w),
        h: roundCropVal(base.h)
      };
    }

    let left = base.x;
    let top = base.y;
    let right = base.x + base.w;
    let bottom = base.y + base.h;

    if (!aspect || !isFinite(aspect) || aspect <= 0) {
      if (handle.indexOf('w') !== -1) left = Math.max(0, Math.min(right - MIN_CROP_SIZE, base.x + dx));
      if (handle.indexOf('e') !== -1) right = Math.min(1, Math.max(left + MIN_CROP_SIZE, base.x + base.w + dx));
      if (handle.indexOf('n') !== -1) top = Math.max(0, Math.min(bottom - MIN_CROP_SIZE, base.y + dy));
      if (handle.indexOf('s') !== -1) bottom = Math.min(1, Math.max(top + MIN_CROP_SIZE, base.y + base.h + dy));
      return {
        x: roundCropVal(left),
        y: roundCropVal(top),
        w: roundCropVal(right - left),
        h: roundCropVal(bottom - top)
      };
    }

    // Aspect-locked resize
    const vw = Math.max(1, Number(visualW) || 1);
    const vh = Math.max(1, Number(visualH) || 1);
    const normRatio = aspect * (vh / vw); // w / h in normalized units
    const minW = Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE * normRatio);
    const minH = Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE / normRatio);

    const anchorX = handle.indexOf('w') !== -1 ? right : left;
    const anchorY = handle.indexOf('n') !== -1 ? bottom : top;
    const dirX = handle.indexOf('w') !== -1 ? -1 : 1;
    const dirY = handle.indexOf('n') !== -1 ? -1 : 1;

    let maxW = dirX < 0 ? anchorX : (1 - anchorX);
    let maxH = dirY < 0 ? anchorY : (1 - anchorY);

    let nextW, nextH;
    if (handle === 'n' || handle === 's') {
      maxW = 1 - left;
      const rawH = Math.max(minH, Math.min(maxH, base.h + dirY * dy));
      nextH = Math.min(rawH, maxW / normRatio);
      nextW = nextH * normRatio;
      return {
        x: roundCropVal(left),
        y: roundCropVal(handle === 'n' ? anchorY - nextH : anchorY),
        w: roundCropVal(nextW),
        h: roundCropVal(nextH)
      };
    }
    if (handle === 'e' || handle === 'w') {
      maxH = 1 - top;
      const rawW = Math.max(minW, Math.min(maxW, base.w + dirX * dx));
      nextW = Math.min(rawW, maxH * normRatio);
      nextH = nextW / normRatio;
      return {
        x: roundCropVal(handle === 'w' ? anchorX - nextW : anchorX),
        y: roundCropVal(top),
        w: roundCropVal(nextW),
        h: roundCropVal(nextH)
      };
    }

    // Corner handles: nw, ne, se, sw
    const candW = base.w + dirX * dx;
    const candH = base.h + dirY * dy;
    const rawW = Math.abs(dx) >= Math.abs(dy) ? candW : (candH * normRatio);
    const clampedMaxW = Math.min(maxW, maxH * normRatio);
    nextW = Math.max(minW, Math.min(clampedMaxW, rawW));
    nextH = nextW / normRatio;
    return {
      x: roundCropVal(dirX < 0 ? anchorX - nextW : anchorX),
      y: roundCropVal(dirY < 0 ? anchorY - nextH : anchorY),
      w: roundCropVal(nextW),
      h: roundCropVal(nextH)
    };
  }

  let cropModalState = {
    open: false,
    slotIndex: null,
    slotAspect: 1,
    preset: 'free',
    aspect: null,
    naturalW: 1,
    naturalH: 1,
    visualW: 1,
    visualH: 1,
    rotation: 0,
    vcrop: { x: 0, y: 0, w: 1, h: 1 },
    drag: null,
    img: null
  };

  function updateCropBoxUI() {
    if (!dom.cropBox) return;
    const v = cropModalState.vcrop;
    dom.cropBox.style.left = (v.x * 100) + '%';
    dom.cropBox.style.top = (v.y * 100) + '%';
    dom.cropBox.style.width = (v.w * 100) + '%';
    dom.cropBox.style.height = (v.h * 100) + '%';

    if (dom.cropDimensions) {
      const pxW = Math.max(1, Math.round(v.w * cropModalState.visualW));
      const pxH = Math.max(1, Math.round(v.h * cropModalState.visualH));
      const isFull = v.x <= 0.001 && v.y <= 0.001 && v.w >= 0.999 && v.h >= 0.999;
      dom.cropDimensions.textContent = pxW + ' × ' + pxH + ' px' + (isFull ? ' (Full image)' : '');
    }
  }

  function updateCropPresetButtons() {
    if (!dom.cropModal) return;
    const btns = dom.cropModal.querySelectorAll('.crop-preset-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-aspect') === cropModalState.preset);
    });
  }

  function parseAspectPreset(key, slotAspect) {
    if (key === 'slot') return slotAspect > 0 ? slotAspect : 1;
    if (key === '1:1') return 1;
    if (key === '4:3') return 4 / 3;
    if (key === '3:2') return 3 / 2;
    if (key === '16:9') return 16 / 9;
    return null;
  }

  function renderCropStageCanvas() {
    if (!cropModalState.open || !cropModalState.img || !dom.cropCanvas) return;
    const img = cropModalState.img;
    const isRot90 = cropModalState.rotation === 90 || cropModalState.rotation === 270;
    const vw = cropModalState.visualW;
    const vh = cropModalState.visualH;

    const stageRect = dom.cropStage ? dom.cropStage.getBoundingClientRect() : { width: 800, height: 600 };
    const maxW = Math.max(200, (stageRect.width || 800) - 32);
    const maxH = Math.max(180, (stageRect.height || 600) - 32);
    const scale = Math.min(maxW / vw, maxH / vh);
    const cssW = Math.max(80, Math.round(vw * scale));
    const cssH = Math.max(80, Math.round(vh * scale));

    const canvas = dom.cropCanvas;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    if (dom.cropStageFrame) {
      dom.cropStageFrame.style.width = cssW + 'px';
      dom.cropStageFrame.style.height = cssH + 'px';
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(cssW / 2, cssH / 2);
    ctx.rotate((cropModalState.rotation * Math.PI) / 180);
    const drawW = isRot90 ? cssH : cssW;
    const drawH = isRot90 ? cssW : cssH;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    updateCropBoxUI();
  }

  function openCropModal(slotIndex, slotEl) {
    const photo = state.photos[slotIndex];
    if (!photo || !photo.src || !dom.cropModal || !dom.cropCanvas) return;

    let slotAspect = 1;
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        slotAspect = r.width / r.height;
      }
    }

    cropModalState.open = true;
    cropModalState.slotIndex = slotIndex;
    cropModalState.slotAspect = slotAspect;
    cropModalState.rotation = (((photo.rotation || 0) % 360) + 360) % 360;
    cropModalState.preset = 'free';
    cropModalState.aspect = null;
    cropModalState.vcrop = cropToVisual(photo.crop, cropModalState.rotation);
    cropModalState.img = null;
    updateCropPresetButtons();

    dom.cropModal.hidden = false;

    const img = new Image();
    img.onload = function () {
      if (!cropModalState.open) return;
      const nw = img.naturalWidth || 1;
      const nh = img.naturalHeight || 1;
      const isRot90 = cropModalState.rotation === 90 || cropModalState.rotation === 270;
      cropModalState.naturalW = nw;
      cropModalState.naturalH = nh;
      cropModalState.visualW = isRot90 ? nh : nw;
      cropModalState.visualH = isRot90 ? nw : nh;
      cropModalState.img = img;
      renderCropStageCanvas();
    };
    img.src = photo.src;
  }

  function closeCropModal() {
    cropModalState.open = false;
    cropModalState.drag = null;
    cropModalState.img = null;
    if (dom.cropModal) {
      dom.cropModal.hidden = true;
    }
  }

  function applyCropModal() {
    const idx = cropModalState.slotIndex;
    const photo = idx !== null ? state.photos[idx] : null;
    if (!photo) {
      closeCropModal();
      return;
    }
    const nextCrop = visualToCrop(cropModalState.vcrop, cropModalState.rotation);
    const prevKey = JSON.stringify(normalizeCrop(photo.crop));
    const nextKey = JSON.stringify(nextCrop);
    if (prevKey !== nextKey) {
      pushHistory(state);
      photo.crop = nextCrop;
      renderSheets();
      scheduleAutoSave();
    }
    closeCropModal();
  }

  function attachCropModalEvents() {
    if (!dom.cropModal) return;

    if (dom.btnCropClose) dom.btnCropClose.addEventListener('click', closeCropModal);
    if (dom.btnCropCancel) dom.btnCropCancel.addEventListener('click', closeCropModal);
    if (dom.btnCropApply) dom.btnCropApply.addEventListener('click', applyCropModal);

    if (dom.btnCropReset) {
      dom.btnCropReset.addEventListener('click', function () {
        cropModalState.preset = 'free';
        cropModalState.aspect = null;
        cropModalState.vcrop = { x: 0, y: 0, w: 1, h: 1 };
        updateCropPresetButtons();
        updateCropBoxUI();
      });
    }

    dom.cropModal.addEventListener('click', function (e) {
      if (e.target === dom.cropModal) {
        closeCropModal();
      }
    });

    const presetBtns = dom.cropModal.querySelectorAll('.crop-preset-btn');
    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-aspect') || 'free';
        cropModalState.preset = key;
        cropModalState.aspect = parseAspectPreset(key, cropModalState.slotAspect);
        if (cropModalState.aspect) {
          cropModalState.vcrop = computeAspectCropRect(
            cropModalState.visualW,
            cropModalState.visualH,
            cropModalState.aspect
          );
        }
        updateCropPresetButtons();
        updateCropBoxUI();
      });
    });

    if (dom.cropBox) {
      dom.cropBox.addEventListener('pointerdown', function (e) {
        if (!cropModalState.open || !dom.cropStageFrame) return;
        e.preventDefault();
        e.stopPropagation();
        const handleEl = e.target && e.target.closest ? e.target.closest('.crop-handle') : null;
        const handle = handleEl ? handleEl.getAttribute('data-handle') : 'move';
        const frameRect = dom.cropStageFrame.getBoundingClientRect();
        cropModalState.drag = {
          handle: handle,
          startX: e.clientX,
          startY: e.clientY,
          frameW: Math.max(1, frameRect.width),
          frameH: Math.max(1, frameRect.height),
          startBox: {
            x: cropModalState.vcrop.x,
            y: cropModalState.vcrop.y,
            w: cropModalState.vcrop.w,
            h: cropModalState.vcrop.h
          }
        };
        if (dom.cropBox.setPointerCapture) {
          try { dom.cropBox.setPointerCapture(e.pointerId); } catch (_) {}
        }
      });

      dom.cropBox.addEventListener('pointermove', function (e) {
        const d = cropModalState.drag;
        if (!d) return;
        e.preventDefault();
        const dx = (e.clientX - d.startX) / d.frameW;
        const dy = (e.clientY - d.startY) / d.frameH;
        cropModalState.vcrop = stepCropBoxDrag(
          d.startBox,
          d.handle,
          dx,
          dy,
          cropModalState.visualW,
          cropModalState.visualH,
          cropModalState.aspect
        );
        updateCropBoxUI();
      });

      const endDrag = function (e) {
        if (!cropModalState.drag) return;
        cropModalState.drag = null;
        if (dom.cropBox.releasePointerCapture) {
          try { dom.cropBox.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      dom.cropBox.addEventListener('pointerup', endDrag);
      dom.cropBox.addEventListener('pointercancel', endDrag);
    }

    window.addEventListener('resize', function () {
      if (cropModalState.open) {
        renderCropStageCanvas();
      }
    });
  }

  // Multi-page PDF Export via bundled jsPDF
  // PC7: load jsPDF on demand (kept in vendor/, not on first paint)
  let jsPdfLoadPromise = null;
  function loadJsPdf() {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (jsPdfLoadPromise) return jsPdfLoadPromise;
    jsPdfLoadPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.async = true;
      s.onload = function () {
        const lib = window.jspdf && window.jspdf.jsPDF;
        if (lib) resolve(lib);
        else {
          jsPdfLoadPromise = null;
          reject(new Error('jsPDF missing after load'));
        }
      };
      s.onerror = function () {
        jsPdfLoadPromise = null;
        reject(new Error('jsPDF failed to load'));
      };
      (document.head || document.documentElement).appendChild(s);
    });
    return jsPdfLoadPromise;
  }

  function exportToPdf() {
    /* (before PC7)
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) {
      alert('The PDF generation library is not loaded. Please use the Print button to Save as PDF.');
      return;
    }
    */
    const ready = window.jspdf && window.jspdf.jsPDF;
    if (ready) {
      exportToPdfWith(ready);
      return;
    }
    if (dom.btnPdf) {
      dom.btnPdf.disabled = true;
      dom.btnPdf.textContent = 'Loading PDF…';
    }
    loadJsPdf().then(function (J) {
      exportToPdfWith(J);
    }).catch(function () {
      if (dom.btnPdf) {
        dom.btnPdf.disabled = false;
        dom.btnPdf.textContent = 'Save PDF';
      }
      alert('The PDF generation library is not loaded. Please use the Print button to Save as PDF.');
    });
  }

  function exportToPdfWith(J) {
    if (dom.btnPdf) {
      dom.btnPdf.disabled = true;
      dom.btnPdf.textContent = 'Generating PDF…';
    }

    setTimeout(function () {
      try {
        const isLand = state.orientation === 'landscape';
        const paperDims = PAPER_SIZES[state.paper] || PAPER_SIZES.a4;
        const mmWidth = isLand ? paperDims.landscape[0] : paperDims.portrait[0];
        const mmHeight = isLand ? paperDims.landscape[1] : paperDims.portrait[1];

        const doc = new J({
          orientation: isLand ? 'landscape' : 'portrait',
          unit: 'mm',
          format: state.paper === 'letter' ? 'letter' : 'a4',
          compress: true
        });

        const slotsPerPage = getSlotsPerPage(state.layout);
        const totalPages = calcTotalPages(state.photos.length, slotsPerPage, state.manualPages);

        // Render each page sequentially onto offscreen canvas
        let renderedPages = 0;

        function processNextPage(pageIdx) {
          if (pageIdx >= totalPages) {
            doc.save('photo-collage.pdf');
            if (dom.btnPdf) {
              dom.btnPdf.disabled = false;
              dom.btnPdf.textContent = 'Save PDF';
            }
            return;
          }

          renderPageToCanvas(pageIdx, mmWidth, mmHeight, slotsPerPage, function (canvas) {
            if (pageIdx > 0) {
              doc.addPage(state.paper === 'letter' ? 'letter' : 'a4', isLand ? 'landscape' : 'portrait');
            }
            const imgData = canvas.toDataURL('image/jpeg', 0.94);
            doc.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight);
            processNextPage(pageIdx + 1);
          });
        }

        processNextPage(0);
      } catch (err) {
        alert('PDF Export error: ' + (err && err.message ? err.message : err));
        if (dom.btnPdf) {
          dom.btnPdf.disabled = false;
          dom.btnPdf.textContent = 'Save PDF';
        }
      }
    }, 40);
  }

  function renderPageToCanvas(pageIndex, mmW, mmH, slotsPerPage, callback) {
    const dpi = 200;
    const pxW = Math.round((mmW / 25.4) * dpi);
    const pxH = Math.round((mmH / 25.4) * dpi);

    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');

    // Background fill
    ctx.fillStyle = state.bgColor || '#ffffff';
    ctx.fillRect(0, 0, pxW, pxH);

    // Margins and gap in pixels
    let marginMm = 8;
    if (state.margin === 'none') marginMm = 0;
    else if (state.margin === 'small') marginMm = 4;
    else if (state.margin === 'wide') marginMm = 12;

    const marginPx = Math.round((marginMm / 25.4) * dpi);
    const gapPx = marginPx;

    const layout = LAYOUTS[state.layout] || LAYOUTS['4-grid'];
    const cols = layout.cols;
    const rows = layout.rows;

    const gridW = pxW - (marginPx * 2);
    const gridH = pxH - (marginPx * 2);

    const totalGapW = gapPx * (cols - 1);
    const totalGapH = gapPx * (rows - 1);

    const cellW = (gridW - totalGapW) / cols;
    const cellH = (gridH - totalGapH) / rows;

    let slotPhotosToLoad = [];
    for (let s = 0; s < slotsPerPage; s++) {
      const gIdx = pageIndex * slotsPerPage + s;
      const photo = state.photos[gIdx];
      if (photo && photo.src) {
        const col = s % cols;
        const row = Math.floor(s / cols);
        const x = marginPx + col * (cellW + gapPx);
        const y = marginPx + row * (cellH + gapPx);
        slotPhotosToLoad.push({ photo: photo, x: x, y: y, w: cellW, h: cellH });
      }
    }

    if (slotPhotosToLoad.length === 0) {
      callback(canvas);
      return;
    }

    let loaded = 0;
    slotPhotosToLoad.forEach(function (slot) {
      const img = new Image();
      img.onload = function () {
        drawPhotoOnCanvas(ctx, img, slot.photo, slot.x, slot.y, slot.w, slot.h);
        loaded++;
        if (loaded === slotPhotosToLoad.length) {
          callback(canvas);
        }
      };
      img.onerror = function () {
        loaded++;
        if (loaded === slotPhotosToLoad.length) {
          callback(canvas);
        }
      };
      img.src = slot.photo.src;
    });
  }

  function drawPhotoOnCanvas(ctx, img, photo, x, y, w, h) {
    ctx.save();
    // Clip to slot rectangle
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const rot = (photo.rotation || 0) % 360;
    const rad = (rot * Math.PI) / 180;

    const centerX = x + w / 2;
    const centerY = y + h / 2;

    ctx.translate(centerX, centerY);
    ctx.rotate(rad);

    // Natural dimensions considering crop & 90/270 rotation
    const isRotated90 = rot === 90 || rot === 270;
    const boundW = isRotated90 ? h : w;
    const boundH = isRotated90 ? w : h;

    const srcRect = calcSourceCropRect(img.naturalWidth, img.naturalHeight, photo.crop);
    const imgAspect = srcRect.sw / srcRect.sh;
    const slotAspect = boundW / boundH;

    let drawW, drawH;

    if (photo.fit === 'contain') {
      if (imgAspect > slotAspect) {
        drawW = boundW;
        drawH = boundW / imgAspect;
      } else {
        drawH = boundH;
        drawW = boundH * imgAspect;
      }
    } else {
      // Cover
      if (imgAspect > slotAspect) {
        drawH = boundH;
        drawW = boundH * imgAspect;
      } else {
        drawW = boundW;
        drawH = boundW / imgAspect;
      }
    }

    ctx.drawImage(img, srcRect.sx, srcRect.sy, srcRect.sw, srcRect.sh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  // Automatic boot in browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  return {
    LAYOUTS: LAYOUTS,
    PAPER_SIZES: PAPER_SIZES,
    getSlotsPerPage: getSlotsPerPage,
    calcTotalPages: calcTotalPages,
    createPhotoItem: createPhotoItem,
    normalizeCrop: normalizeCrop,
    cropToVisual: cropToVisual,
    visualToCrop: visualToCrop,
    calcSourceCropRect: calcSourceCropRect,
    computeAspectCropRect: computeAspectCropRect,
    stepCropBoxDrag: stepCropBoxDrag,
    rotatePhoto: rotatePhoto,
    swapPhotos: swapPhotos,
    removePhotoAt: removePhotoAt,
    calcPrintSlotDimensions: calcPrintSlotDimensions,
    applySlotRotationAndFit: applySlotRotationAndFit,
    serializeState: serializeState,
    deserializeState: deserializeState,
    savePersistedState: savePersistedState,
    loadPersistedState: loadPersistedState,
    clearPersistedState: clearPersistedState,
    createSnapshot: createSnapshot,
    restoreSnapshot: restoreSnapshot,
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    clearHistory: clearHistory,
    getHistoryState: getHistoryState,
    getState: function () { return state; },
    initApp: initApp
  };
});
