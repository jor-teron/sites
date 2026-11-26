/**
 * Photo Collage — Photo record operations & slot rotation/fit helper (core/pc_photo.js)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.photo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
    var step = typeof degrees === 'number' ? degrees : 90;
    photo.rotation = (((photo.rotation || 0) + step) % 360 + 360) % 360;
    return photo.rotation;
  }

  function swapPhotos(photosList, indexA, indexB) {
    if (!photosList || indexA < 0 || indexB < 0) return false;
    var maxIdx = Math.max(indexA, indexB);
    while (photosList.length <= maxIdx) {
      photosList.push(null);
    }
    var temp = photosList[indexA];
    photosList[indexA] = photosList[indexB];
    photosList[indexB] = temp;
    return true;
  }

  function removePhotoAt(photosList, index) {
    if (!photosList || index < 0 || index >= photosList.length) return null;
    var removed = photosList[index];
    photosList.splice(index, 1);
    return removed;
  }

  function applySlotRotationAndFit(img, slot, photo) {
    if (!img || !photo) return;
    var rot = (photo.rotation || 0) % 360;
    img.setAttribute('data-rotation', rot);
    img.className = 'photo-img fit-' + (photo.fit || 'cover');

    if (!slot) return;
    var rect = (!slot.clientWidth && !slot.offsetWidth && slot.getBoundingClientRect)
      ? slot.getBoundingClientRect()
      : null;
    var w = slot.clientWidth || slot.offsetWidth || (rect && rect.width) || 0;
    var h = slot.clientHeight || slot.offsetHeight || (rect && rect.height) || 0;

    if (w && h) {
      slot.style.setProperty('--slot-w', w + 'px');
      slot.style.setProperty('--slot-h', h + 'px');
    }

    var isRotated90 = rot === 90 || rot === 270;
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

  return {
    createPhotoItem: createPhotoItem,
    rotatePhoto: rotatePhoto,
    swapPhotos: swapPhotos,
    removePhotoAt: removePhotoAt,
    applySlotRotationAndFit: applySlotRotationAndFit
  };
});
