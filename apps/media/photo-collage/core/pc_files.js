/**
 * Photo Collage — Drag-drop file ingestion and single/batch loading (core/pc_files.js)
 */
(function (root, factory) {
  var photoMod = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_photo.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.photo);
  var api = factory(photoMod);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.files = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (photoMod) {
  'use strict';

  function isDragWithFiles(e) {
    if (!e.dataTransfer || !e.dataTransfer.types) return false;
    for (var i = 0; i < e.dataTransfer.types.length; i++) {
      if (e.dataTransfer.types[i] === 'Files') return true;
    }
    return false;
  }

  function createFileLoader(deps) {
    var state = deps.state;
    var pushHistory = deps.pushHistory;
    var renderSheets = deps.renderSheets;
    var scheduleAutoSave = deps.scheduleAutoSave;

    function appendPhotosToState(newPhotos) {
      if (!newPhotos || !newPhotos.length) return;
      pushHistory(state);
      var pIdx = 0;
      for (var i = 0; i < state.photos.length && pIdx < newPhotos.length; i++) {
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

    function handleIncomingFiles(fileList) {
      var files = Array.from(fileList).filter(function (file) {
        return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
      });

      if (!files.length) return;

      var loadedCount = 0;
      var newItems = [];

      files.forEach(function (file, idx) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var item = photoMod.createPhotoItem(e.target.result, file.name);
          newItems[idx] = item;
          loadedCount++;
          if (loadedCount === files.length) {
            appendPhotosToState(newItems);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    function handleSingleSlotFile(file, slotIndex) {
      if (!file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        pushHistory(state);
        var item = photoMod.createPhotoItem(e.target.result, file.name);
        while (state.photos.length <= slotIndex) {
          state.photos.push(null);
        }
        state.photos[slotIndex] = item;
        renderSheets();
        scheduleAutoSave();
      };
      reader.readAsDataURL(file);
    }

    return {
      isDragWithFiles: isDragWithFiles,
      appendPhotosToState: appendPhotosToState,
      handleIncomingFiles: handleIncomingFiles,
      handleSingleSlotFile: handleSingleSlotFile
    };
  }

  return {
    isDragWithFiles: isDragWithFiles,
    createFileLoader: createFileLoader
  };
});
