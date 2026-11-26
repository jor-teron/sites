/**
 * Photo Collage — Sheet & slot DOM rendering, zoom, and print orientation rules (core/pc_render.js)
 */
(function (root, factory) {
  var cfg = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_config.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.config);
  var photoMod = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_photo.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.photo);
  var cropCache = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_crop_cache.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.cropCache);
  var api = factory(cfg, photoMod, cropCache);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.render = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, photoMod, cropCache) {
  'use strict';

  function createRenderer(deps) {
    var state = deps.state;
    var dom = deps.dom;
    var pushHistory = deps.pushHistory;
    var scheduleAutoSave = deps.scheduleAutoSave;
    var openCropModal = deps.openCropModal;
    var openConfirmModal = deps.openConfirmModal;
    var getFileLoader = deps.getFileLoader;

    function applyZoom() {
      if (dom.sheetsContainer) {
        if ('zoom' in dom.sheetsContainer.style) {
          dom.sheetsContainer.style.zoom = String(state.zoom);
          dom.sheetsContainer.style.transform = '';
          dom.sheetsContainer.style.transformOrigin = '';
        } else {
          dom.sheetsContainer.style.transform = 'scale(' + state.zoom + ')';
          dom.sheetsContainer.style.transformOrigin = 'top left';
        }
      }
      if (dom.btnZoomReset) {
        dom.btnZoomReset.textContent = Math.round(state.zoom * 100) + '%';
      }
    }

    function setZoom(z) {
      var next = Math.round((Number(z) || 0) * 100) / 100;
      state.zoom = Math.max(0.4, Math.min(2.0, next));
      applyZoom();
    }

    function updateAllSlotDimensions() {
      if (!dom.sheetsContainer) return;
      var slots = dom.sheetsContainer.querySelectorAll('.photo-slot.filled');
      slots.forEach(function (slot) {
        var idx = parseInt(slot.getAttribute('data-slot-index'), 10);
        var photo = state.photos[idx];
        var img = slot.querySelector('.photo-img');
        if (photo && img) {
          photoMod.applySlotRotationAndFit(img, slot, photo);
        }
      });
    }

    function updatePrintOrientation() {
      if (typeof document === 'undefined') return;
      var styleEl = document.getElementById('dynamic-print-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-print-style';
        document.head.appendChild(styleEl);
      }
      var pageSizeCss = cfg.getPageSizeCss(state.paper, state.orientation);
      var dims = cfg.calcPrintSlotDimensions(state.paper, state.orientation, state.layout, state.margin);

      styleEl.textContent =
        '@page { size: ' + pageSizeCss + '; margin: 0; }\n' +
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

    function performRemovePage(pageIndex, slotsPerPage) {
      pushHistory(state);
      var startIdx = pageIndex * slotsPerPage;
      state.photos.splice(startIdx, slotsPerPage);
      if (state.manualPages > 1) {
        state.manualPages--;
      }
      renderSheets();
      scheduleAutoSave();
    }

    function removePage(pageIndex, slotsPerPage) {
      var startIdx = pageIndex * slotsPerPage;
      var pagePhotoCount = state.photos.slice(startIdx, startIdx + slotsPerPage).filter(Boolean).length;
      if (typeof openConfirmModal === 'function') {
        var pageNum = pageIndex + 1;
        var message = pagePhotoCount > 0
          ? 'Remove Page ' + pageNum + ' and its ' + pagePhotoCount + ' photo' + (pagePhotoCount === 1 ? '' : 's') + '? Remaining pages will shift up. You can still undo this action.'
          : 'Remove empty Page ' + pageNum + '? You can still undo this action.';
        openConfirmModal({
          title: 'Remove Page ' + pageNum + '?',
          message: message,
          cancelText: 'Cancel',
          confirmText: 'Remove Page',
          danger: true,
          onConfirm: function () {
            performRemovePage(pageIndex, slotsPerPage);
          }
        });
        return;
      }
      performRemovePage(pageIndex, slotsPerPage);
    }

    function createSlotElement(photo, slotIndex) {
      var slot = document.createElement('div');
      slot.className = 'photo-slot ' + (photo ? 'filled' : 'empty');
      slot.setAttribute('data-slot-index', slotIndex);

      slot.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.add('dragover');
      });

      slot.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e && e.relatedTarget && slot.contains && slot.contains(e.relatedTarget)) {
          return;
        }
        slot.classList.remove('dragover');
      });

      slot.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('dragover');

        // Internal swap
        var sourceIdxStr = '';
        if (e.dataTransfer) {
          sourceIdxStr = e.dataTransfer.getData('application/x-photo-collage-slot') ||
            e.dataTransfer.getData('text/plain') || '';
        }
        if (/^\d+$/.test(sourceIdxStr)) {
          var sourceIdx = parseInt(sourceIdxStr, 10);
          if (sourceIdx >= 0 && sourceIdx !== slotIndex) {
            pushHistory(state);
            photoMod.swapPhotos(state.photos, sourceIdx, slotIndex);
            renderSheets();
            scheduleAutoSave();
            return;
          }
        }

        // External files drop
        var loader = getFileLoader ? getFileLoader() : null;
        if (loader && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          if (e.dataTransfer.files.length === 1) {
            loader.handleSingleSlotFile(e.dataTransfer.files[0], slotIndex);
          } else {
            loader.handleIncomingFiles(e.dataTransfer.files);
          }
        }
      });

      if (!photo) {
        var placeholder = document.createElement('div');
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
        var imgContainer = document.createElement('div');
        imgContainer.className = 'photo-img-container';
        imgContainer.setAttribute('draggable', 'true');
        imgContainer.addEventListener('dragstart', function (e) {
          e.stopPropagation();
          slot.classList.add('dragging');
          if (e.dataTransfer) {
            e.dataTransfer.setData('application/x-photo-collage-slot', String(slotIndex));
            e.dataTransfer.setData('text/plain', String(slotIndex));
            e.dataTransfer.effectAllowed = 'move';
          }
        });
        imgContainer.addEventListener('dragend', function () {
          slot.classList.remove('dragging');
        });

        var img = document.createElement('img');
        img.className = 'photo-img fit-' + (photo.fit || 'cover');
        img.alt = photo.name || 'Photo';
        img.setAttribute('data-rotation', photo.rotation || 0);

        if (photo.crop) {
          var cached = cropCache.getCachedCroppedUrl(photo);
          img.src = cached || photo.src;
          if (!cached) {
            cropCache.renderCroppedDataUrl(photo, function (croppedUrl) {
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
        photoMod.applySlotRotationAndFit(img, slot, photo);

        var controls = document.createElement('div');
        controls.className = 'slot-controls';

        // Rotate 90 deg button
        var rotateBtn = document.createElement('button');
        rotateBtn.type = 'button';
        rotateBtn.className = 'slot-btn';
        rotateBtn.title = 'Rotate photo 90° clockwise';
        rotateBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> 90°';
        rotateBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          pushHistory(state);
          photoMod.rotatePhoto(photo, 90);
          photoMod.applySlotRotationAndFit(img, slot, photo);
          scheduleAutoSave();
        });
        controls.appendChild(rotateBtn);

        // Crop button
        var cropBtn = document.createElement('button');
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
        var fitBtn = document.createElement('button');
        fitBtn.type = 'button';
        fitBtn.className = 'slot-btn';
        fitBtn.title = 'Toggle Image Fit Mode (Full / Fill)';
        fitBtn.innerHTML = photo.fit === 'contain' ? 'Full' : 'Fill';
        fitBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          pushHistory(state);
          photo.fit = photo.fit === 'contain' ? 'cover' : 'contain';
          photoMod.applySlotRotationAndFit(img, slot, photo);
          fitBtn.innerHTML = photo.fit === 'contain' ? 'Full' : 'Fill';
          scheduleAutoSave();
        });
        controls.appendChild(fitBtn);

        // Remove photo button
        var removeBtn = document.createElement('button');
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

    function renderSheets() {
      if (!dom.sheetsContainer) return;

      var slotsPerPage = cfg.getSlotsPerPage(state.layout);
      var populatedCount = state.photos.filter(Boolean).length;
      var totalPages = cfg.calcTotalPages(state.photos.length, slotsPerPage, state.manualPages);

      if (dom.statusText) {
        dom.statusText.textContent = populatedCount + ' photo' + (populatedCount === 1 ? '' : 's') +
          ' • ' + totalPages + ' page' + (totalPages === 1 ? '' : 's');
      }

      dom.sheetsContainer.innerHTML = '';

      for (var p = 0; p < totalPages; p++) {
        var pageWrapper = document.createElement('div');
        pageWrapper.className = 'sheet-wrapper';

        var headerBar = document.createElement('div');
        headerBar.className = 'sheet-header-bar';
        headerBar.innerHTML = '<span>Page ' + (p + 1) + ' of ' + totalPages + '</span>';

        if (totalPages > 1) {
          var delBtn = document.createElement('button');
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

        var sheetPage = document.createElement('div');
        var sizeClass = state.paper + '-' + state.orientation;
        sheetPage.className = 'sheet-page ' + sizeClass;
        sheetPage.style.backgroundColor = state.bgColor;

        var grid = document.createElement('div');
        grid.className = 'collage-grid';
        grid.setAttribute('data-layout', state.layout);
        grid.setAttribute('data-margin', state.margin);

        for (var s = 0; s < slotsPerPage; s++) {
          var globalSlotIdx = p * slotsPerPage + s;
          var photo = state.photos[globalSlotIdx] || null;
          grid.appendChild(createSlotElement(photo, globalSlotIdx));
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

    return {
      setZoom: setZoom,
      applyZoom: applyZoom,
      updateAllSlotDimensions: updateAllSlotDimensions,
      updatePrintOrientation: updatePrintOrientation,
      renderSheets: renderSheets,
      removePage: removePage
    };
  }

  return {
    createRenderer: createRenderer
  };
});
