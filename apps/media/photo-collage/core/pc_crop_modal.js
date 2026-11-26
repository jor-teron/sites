/**
 * Photo Collage — Interactive crop modal controller (core/pc_crop_modal.js)
 */
(function (root, factory) {
  var cropMath = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_crop_math.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.cropMath);
  var api = factory(cropMath);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.cropModal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cropMath) {
  'use strict';

  function parseAspectPreset(key, slotAspect) {
    if (key === 'slot') return slotAspect > 0 ? slotAspect : 1;
    if (key === '1:1') return 1;
    if (key === '4:3') return 4 / 3;
    if (key === '3:2') return 3 / 2;
    if (key === '16:9') return 16 / 9;
    return null;
  }

  function createCropModalController(deps) {
    var state = deps.state;
    var dom = deps.dom;
    var pushHistory = deps.pushHistory;
    var renderSheets = deps.renderSheets;
    var scheduleAutoSave = deps.scheduleAutoSave;

    var modalState = {
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
      var v = modalState.vcrop;
      dom.cropBox.style.left = (v.x * 100) + '%';
      dom.cropBox.style.top = (v.y * 100) + '%';
      dom.cropBox.style.width = (v.w * 100) + '%';
      dom.cropBox.style.height = (v.h * 100) + '%';

      if (dom.cropDimensions) {
        var pxW = Math.max(1, Math.round(v.w * modalState.visualW));
        var pxH = Math.max(1, Math.round(v.h * modalState.visualH));
        var isFull = v.x <= 0.001 && v.y <= 0.001 && v.w >= 0.999 && v.h >= 0.999;
        dom.cropDimensions.textContent = pxW + ' × ' + pxH + ' px' + (isFull ? ' (Full image)' : '');
      }
    }

    function updateCropPresetButtons() {
      if (!dom.cropModal) return;
      var btns = dom.cropModal.querySelectorAll('.crop-preset-btn');
      btns.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-aspect') === modalState.preset);
      });
    }

    function renderCropStageCanvas() {
      if (!modalState.open || !modalState.img || !dom.cropCanvas) return;
      var img = modalState.img;
      var isRot90 = modalState.rotation === 90 || modalState.rotation === 270;
      var vw = modalState.visualW;
      var vh = modalState.visualH;

      var stageRect = dom.cropStage ? dom.cropStage.getBoundingClientRect() : { width: 800, height: 600 };
      var maxW = Math.max(200, (stageRect.width || 800) - 32);
      var maxH = Math.max(180, (stageRect.height || 600) - 32);
      var scale = Math.min(maxW / vw, maxH / vh);
      var cssW = Math.max(80, Math.round(vw * scale));
      var cssH = Math.max(80, Math.round(vh * scale));

      var canvas = dom.cropCanvas;
      var dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      if (dom.cropStageFrame) {
        dom.cropStageFrame.style.width = cssW + 'px';
        dom.cropStageFrame.style.height = cssH + 'px';
      }

      var ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(cssW / 2, cssH / 2);
      ctx.rotate((modalState.rotation * Math.PI) / 180);
      var drawW = isRot90 ? cssH : cssW;
      var drawH = isRot90 ? cssW : cssH;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      updateCropBoxUI();
    }

    function openCropModal(slotIndex, slotEl) {
      var photo = state.photos[slotIndex];
      if (!photo || !photo.src || !dom.cropModal || !dom.cropCanvas) return;

      var slotAspect = 1;
      if (slotEl) {
        var r = slotEl.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) {
          slotAspect = r.width / r.height;
        }
      }

      modalState.open = true;
      modalState.slotIndex = slotIndex;
      modalState.slotAspect = slotAspect;
      modalState.rotation = (((photo.rotation || 0) % 360) + 360) % 360;
      modalState.preset = 'free';
      modalState.aspect = null;
      modalState.vcrop = cropMath.cropToVisual(photo.crop, modalState.rotation);
      modalState.img = null;
      updateCropPresetButtons();

      dom.cropModal.hidden = false;

      var img = new Image();
      img.onload = function () {
        if (!modalState.open) return;
        var nw = img.naturalWidth || 1;
        var nh = img.naturalHeight || 1;
        var isRot90 = modalState.rotation === 90 || modalState.rotation === 270;
        modalState.naturalW = nw;
        modalState.naturalH = nh;
        modalState.visualW = isRot90 ? nh : nw;
        modalState.visualH = isRot90 ? nw : nh;
        modalState.img = img;
        renderCropStageCanvas();
      };
      img.src = photo.src;
    }

    function closeCropModal() {
      modalState.open = false;
      modalState.drag = null;
      modalState.img = null;
      if (dom.cropModal) {
        dom.cropModal.hidden = true;
      }
    }

    function applyCropModal() {
      var idx = modalState.slotIndex;
      var photo = idx !== null ? state.photos[idx] : null;
      if (!photo) {
        closeCropModal();
        return;
      }
      var nextCrop = cropMath.visualToCrop(modalState.vcrop, modalState.rotation);
      var prevKey = JSON.stringify(cropMath.normalizeCrop(photo.crop));
      var nextKey = JSON.stringify(nextCrop);
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
          modalState.preset = 'free';
          modalState.aspect = null;
          modalState.vcrop = { x: 0, y: 0, w: 1, h: 1 };
          updateCropPresetButtons();
          updateCropBoxUI();
        });
      }

      dom.cropModal.addEventListener('click', function (e) {
        if (e.target === dom.cropModal) {
          closeCropModal();
        }
      });

      var presetBtns = dom.cropModal.querySelectorAll('.crop-preset-btn');
      presetBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-aspect') || 'free';
          modalState.preset = key;
          modalState.aspect = parseAspectPreset(key, modalState.slotAspect);
          if (modalState.aspect) {
            modalState.vcrop = cropMath.computeAspectCropRect(
              modalState.visualW,
              modalState.visualH,
              modalState.aspect
            );
          }
          updateCropPresetButtons();
          updateCropBoxUI();
        });
      });

      if (dom.cropBox) {
        dom.cropBox.addEventListener('pointerdown', function (e) {
          if (!modalState.open || !dom.cropStageFrame) return;
          e.preventDefault();
          e.stopPropagation();
          var handleEl = e.target && e.target.closest ? e.target.closest('.crop-handle') : null;
          var handle = handleEl ? handleEl.getAttribute('data-handle') : 'move';
          var frameRect = dom.cropStageFrame.getBoundingClientRect();
          modalState.drag = {
            handle: handle,
            startX: e.clientX,
            startY: e.clientY,
            frameW: Math.max(1, frameRect.width),
            frameH: Math.max(1, frameRect.height),
            startBox: {
              x: modalState.vcrop.x,
              y: modalState.vcrop.y,
              w: modalState.vcrop.w,
              h: modalState.vcrop.h
            }
          };
          if (dom.cropBox.setPointerCapture) {
            try { dom.cropBox.setPointerCapture(e.pointerId); } catch (_) {}
          }
        });

        dom.cropBox.addEventListener('pointermove', function (e) {
          var d = modalState.drag;
          if (!d) return;
          e.preventDefault();
          var dx = (e.clientX - d.startX) / d.frameW;
          var dy = (e.clientY - d.startY) / d.frameH;
          modalState.vcrop = cropMath.stepCropBoxDrag(
            d.startBox,
            d.handle,
            dx,
            dy,
            modalState.visualW,
            modalState.visualH,
            modalState.aspect
          );
          updateCropBoxUI();
        });

        var endDrag = function (e) {
          if (!modalState.drag) return;
          modalState.drag = null;
          if (dom.cropBox.releasePointerCapture) {
            try { dom.cropBox.releasePointerCapture(e.pointerId); } catch (_) {}
          }
        };
        dom.cropBox.addEventListener('pointerup', endDrag);
        dom.cropBox.addEventListener('pointercancel', endDrag);
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', function () {
          if (modalState.open) {
            renderCropStageCanvas();
          }
        });
      }
    }

    return {
      isOpen: function () { return modalState.open; },
      openCropModal: openCropModal,
      closeCropModal: closeCropModal,
      applyCropModal: applyCropModal,
      attachCropModalEvents: attachCropModalEvents,
      renderCropStageCanvas: renderCropStageCanvas
    };
  }

  return {
    parseAspectPreset: parseAspectPreset,
    createCropModalController: createCropModalController
  };
});
