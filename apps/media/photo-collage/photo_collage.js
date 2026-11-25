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

  function createPhotoItem(src, name) {
    return {
      id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      src: src || '',
      name: name || 'Photo',
      rotation: 0, // 0, 90, 180, 270
      fit: 'contain' // 'contain' (Full) or 'cover' (Fill)
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
          fit: p.fit
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
          fit: p.fit === 'contain' ? 'contain' : 'cover'
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

  function updateHistoryButtons() {
    if (dom.btnUndo) {
      dom.btnUndo.disabled = undoStack.length === 0;
    }
    if (dom.btnRedo) {
      dom.btnRedo.disabled = redoStack.length === 0;
    }
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

    attachEvents();
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
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
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
        state.zoom = Math.min(2.0, state.zoom + 0.1);
        applyZoom();
      });
    }
    if (dom.btnZoomOut) {
      dom.btnZoomOut.addEventListener('click', function () {
        state.zoom = Math.max(0.4, state.zoom - 0.1);
        applyZoom();
      });
    }
    if (dom.btnZoomReset) {
      dom.btnZoomReset.addEventListener('click', function () {
        state.zoom = 1.0;
        applyZoom();
      });
    }

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
      img.src = photo.src;
      img.alt = photo.name || 'Photo';
      img.setAttribute('data-rotation', photo.rotation || 0);

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

  // Multi-page PDF Export via bundled jsPDF
  function exportToPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) {
      alert('The PDF generation library is not loaded. Please use the Print button to Save as PDF.');
      return;
    }

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

    // Natural dimensions considering 90/270 rotation
    const isRotated90 = rot === 90 || rot === 270;
    const boundW = isRotated90 ? h : w;
    const boundH = isRotated90 ? w : h;

    const imgAspect = img.naturalWidth / img.naturalHeight;
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

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
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
