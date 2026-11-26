/**
 * Photo Collage (apps/media/photo-collage/photo_collage.js)
 * Slim vanilla JS orchestrator & UMD facade wiring modular core/* scripts.
 */
(function (root, factory) {
  var core;
  if (typeof require === 'function' && typeof module === 'object') {
    core = {
      config: require('./core/pc_config.js'),
      photo: require('./core/pc_photo.js'),
      cropMath: require('./core/pc_crop_math.js'),
      storage: require('./core/pc_storage.js'),
      history: require('./core/pc_history.js'),
      hubTitlebar: require('./core/pc_hub_titlebar.js'),
      cropCache: require('./core/pc_crop_cache.js'),
      cropModal: require('./core/pc_crop_modal.js'),
      files: require('./core/pc_files.js'),
      render: require('./core/pc_render.js'),
      pdf: require('./core/pc_pdf.js')
    };
  } else {
    core = root.PhotoCollageCore || {};
  }
  var api = factory(core);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PhotoCollage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  var cfg = core.config;
  var photoMod = core.photo;
  var cropMath = core.cropMath;
  var storage = core.storage;

  var state = {
    layout: '4-grid',
    orientation: 'portrait',
    paper: 'a4',
    margin: 'small',
    bgColor: '#ffffff',
    zoom: 1.0,
    photos: [],
    manualPages: 1,
    activeSlotIndex: null
  };

  var dom = {};

  function scheduleAutoSave() {
    storage.scheduleAutoSave(function () { return state; });
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

  var historyMgr, cropModalCtrl, fileLoader, renderer, pdfExporter;

  function updateHistoryButtons() {
    var counts = historyMgr.getHistoryState();
    if (dom.btnUndo) dom.btnUndo.disabled = counts.undoCount === 0;
    if (dom.btnRedo) dom.btnRedo.disabled = counts.redoCount === 0;
    core.hubTitlebar.updateHubTitleBar();
  }

  historyMgr = core.history.createHistoryManager({
    getState: function () { return state; },
    onApplied: function () {
      syncDomControls();
      if (renderer) renderer.renderSheets();
      scheduleAutoSave();
    },
    onChanged: updateHistoryButtons
  });

  cropModalCtrl = core.cropModal.createCropModalController({
    state: state,
    dom: dom,
    pushHistory: historyMgr.pushHistory,
    renderSheets: function () { if (renderer) renderer.renderSheets(); },
    scheduleAutoSave: scheduleAutoSave
  });

  renderer = core.render.createRenderer({
    state: state,
    dom: dom,
    pushHistory: historyMgr.pushHistory,
    scheduleAutoSave: scheduleAutoSave,
    openCropModal: cropModalCtrl.openCropModal,
    getFileLoader: function () { return fileLoader; }
  });

  fileLoader = core.files.createFileLoader({
    state: state,
    pushHistory: historyMgr.pushHistory,
    renderSheets: renderer.renderSheets,
    scheduleAutoSave: scheduleAutoSave
  });

  pdfExporter = core.pdf.createPdfExporter({
    state: state,
    dom: dom
  });

  function bindSelector(el, prop, updatePrint) {
    if (!el) return;
    el.addEventListener('change', function () {
      historyMgr.pushHistory(state);
      state[prop] = this.value;
      if (prop === 'bgColor' && typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--sheet-bg', state.bgColor);
      }
      if (updatePrint) renderer.updatePrintOrientation();
      renderer.renderSheets();
      scheduleAutoSave();
    });
  }

  function attachEvents() {
    if (dom.btnUndo) dom.btnUndo.addEventListener('click', historyMgr.undo);
    if (dom.btnRedo) dom.btnRedo.addEventListener('click', historyMgr.redo);

    window.addEventListener('keydown', function (e) {
      if (cropModalCtrl.isOpen()) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cropModalCtrl.closeCropModal();
        } else if (e.key === 'Enter') {
          var id = e.target && e.target.id;
          if (id !== 'btn-crop-cancel' && id !== 'btn-crop-close' && id !== 'btn-crop-reset') {
            e.preventDefault();
            cropModalCtrl.applyCropModal();
          }
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      var tag = e.target && e.target.tagName;
      if (e.target && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable)) {
        return;
      }

      var key = e.key ? e.key.toLowerCase() : '';
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) historyMgr.redo();
        else historyMgr.undo();
      } else if (key === 'y') {
        e.preventDefault();
        historyMgr.redo();
      } else if (key === '=' || key === '+') {
        e.preventDefault();
        renderer.setZoom(state.zoom + 0.1);
      } else if (key === '-') {
        e.preventDefault();
        renderer.setZoom(state.zoom - 0.1);
      } else if (key === '0') {
        e.preventDefault();
        renderer.setZoom(1.0);
      }
    });

    bindSelector(dom.layoutSelect, 'layout', false);
    bindSelector(dom.orientSelect, 'orientation', true);
    bindSelector(dom.paperSelect, 'paper', true);
    bindSelector(dom.marginSelect, 'margin', false);
    bindSelector(dom.colorSelect, 'bgColor', false);

    if (dom.btnAddPhotos && dom.fileInput) {
      dom.btnAddPhotos.addEventListener('click', function () { dom.fileInput.click(); });
      dom.fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) {
          fileLoader.handleIncomingFiles(e.target.files);
          dom.fileInput.value = '';
        }
      });
    }

    if (dom.slotFileInput) {
      dom.slotFileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length && state.activeSlotIndex !== null) {
          fileLoader.handleSingleSlotFile(e.target.files[0], state.activeSlotIndex);
          dom.slotFileInput.value = '';
        }
      });
    }

    if (dom.btnAddPage) {
      dom.btnAddPage.addEventListener('click', function () {
        historyMgr.pushHistory(state);
        var slotsPer = cfg.getSlotsPerPage(state.layout);
        var currentPages = cfg.calcTotalPages(state.photos.length, slotsPer, state.manualPages);
        state.manualPages = currentPages + 1;
        renderer.renderSheets();
        scheduleAutoSave();
      });
    }

    if (dom.btnClear) {
      dom.btnClear.addEventListener('click', function () {
        if (state.photos.length === 0) return;
        if (confirm('Clear all photos from the collage?')) {
          historyMgr.pushHistory(state);
          state.photos = [];
          state.manualPages = 1;
          storage.clearPersistedState();
          renderer.renderSheets();
        }
      });
    }

    if (dom.btnPrint) dom.btnPrint.addEventListener('click', function () { window.print(); });
    if (dom.btnPdf) dom.btnPdf.addEventListener('click', pdfExporter.exportToPdf);

    if (dom.btnZoomIn) dom.btnZoomIn.addEventListener('click', function () { renderer.setZoom(state.zoom + 0.1); });
    if (dom.btnZoomOut) dom.btnZoomOut.addEventListener('click', function () { renderer.setZoom(state.zoom - 0.1); });
    if (dom.btnZoomReset) dom.btnZoomReset.addEventListener('click', function () { renderer.setZoom(1.0); });

    document.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY > 0) renderer.setZoom(state.zoom - 0.1);
      else if (e.deltaY < 0) renderer.setZoom(state.zoom + 0.1);
    }, { passive: false });

    window.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (core.files.isDragWithFiles(e) && dom.globalDropZone) {
        dom.globalDropZone.classList.add('active');
      }
    });

    window.addEventListener('dragover', function (e) { e.preventDefault(); });

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
          fileLoader.handleIncomingFiles(e.dataTransfer.files);
        }
      });
    }

    window.addEventListener('resize', renderer.updateAllSlotDimensions);
  }

  function initApp() {
    if (typeof document === 'undefined') return;

    try {
      var savedTheme = localStorage.getItem('sites-hub.theme') || '';
      var isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) document.documentElement.classList.add('dark');
    } catch (_) {}

    var ids = {
      btnUndo: 'btn-undo',
      btnRedo: 'btn-redo',
      layoutSelect: 'layout-select',
      orientSelect: 'orient-select',
      paperSelect: 'paper-select',
      marginSelect: 'margin-select',
      colorSelect: 'color-select',
      sheetsContainer: 'sheets-container',
      statusText: 'status-text',
      globalDropZone: 'global-drop-zone',
      fileInput: 'file-input',
      slotFileInput: 'slot-file-input',
      btnAddPhotos: 'btn-add-photos',
      btnAddPage: 'btn-add-page',
      btnPrint: 'btn-print',
      btnPdf: 'btn-pdf',
      btnClear: 'btn-clear',
      btnZoomIn: 'btn-zoom-in',
      btnZoomOut: 'btn-zoom-out',
      btnZoomReset: 'btn-zoom-reset',
      cropModal: 'crop-modal',
      cropStage: 'crop-stage',
      cropStageFrame: 'crop-stage-frame',
      cropCanvas: 'crop-canvas',
      cropBox: 'crop-box',
      cropDimensions: 'crop-dimensions',
      btnCropClose: 'btn-crop-close',
      btnCropReset: 'btn-crop-reset',
      btnCropCancel: 'btn-crop-cancel',
      btnCropApply: 'btn-crop-apply'
    };
    Object.keys(ids).forEach(function (k) {
      dom[k] = document.getElementById(ids[k]);
    });

    attachEvents();
    cropModalCtrl.attachCropModalEvents();
    core.hubTitlebar.initHubTitleBar({
      getHistoryState: historyMgr.getHistoryState,
      onCommand: function (id) {
        if (id === 'undo') historyMgr.undo();
        else if (id === 'redo') historyMgr.redo();
        else if (id === 'add-photos' && dom.btnAddPhotos) dom.btnAddPhotos.click();
        else if (id === 'add-page' && dom.btnAddPage) dom.btnAddPage.click();
        else if (id === 'print' && dom.btnPrint) dom.btnPrint.click();
        else if (id === 'pdf' && dom.btnPdf) dom.btnPdf.click();
        else if (id === 'clear' && dom.btnClear) dom.btnClear.click();
      }
    });

    storage.loadPersistedState().then(function (saved) {
      if (saved) {
        storage.deserializeState(saved, state);
        syncDomControls();
      }
      renderer.renderSheets();
      updateHistoryButtons();
    }).catch(function () {
      renderer.renderSheets();
      updateHistoryButtons();
    });
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  return {
    LAYOUTS: cfg.LAYOUTS,
    PAPER_SIZES: cfg.PAPER_SIZES,
    getSlotsPerPage: cfg.getSlotsPerPage,
    calcTotalPages: cfg.calcTotalPages,
    getPageSizeCss: cfg.getPageSizeCss,
    getPdfFormat: cfg.getPdfFormat,
    calcPrintSlotDimensions: cfg.calcPrintSlotDimensions,
    createPhotoItem: photoMod.createPhotoItem,
    rotatePhoto: photoMod.rotatePhoto,
    swapPhotos: photoMod.swapPhotos,
    removePhotoAt: photoMod.removePhotoAt,
    applySlotRotationAndFit: photoMod.applySlotRotationAndFit,
    normalizeCrop: cropMath.normalizeCrop,
    cropToVisual: cropMath.cropToVisual,
    visualToCrop: cropMath.visualToCrop,
    calcSourceCropRect: cropMath.calcSourceCropRect,
    computeAspectCropRect: cropMath.computeAspectCropRect,
    stepCropBoxDrag: cropMath.stepCropBoxDrag,
    serializeState: storage.serializeState,
    deserializeState: storage.deserializeState,
    savePersistedState: storage.savePersistedState,
    loadPersistedState: storage.loadPersistedState,
    clearPersistedState: storage.clearPersistedState,
    createSnapshot: historyMgr.createSnapshot,
    restoreSnapshot: historyMgr.restoreSnapshot,
    pushHistory: historyMgr.pushHistory,
    undo: historyMgr.undo,
    redo: historyMgr.redo,
    clearHistory: historyMgr.clearHistory,
    getHistoryState: historyMgr.getHistoryState,
    getState: function () { return state; },
    initApp: initApp
  };
});
