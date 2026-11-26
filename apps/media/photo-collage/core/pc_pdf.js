/**
 * Photo Collage — On-demand jsPDF loading & multi-page PDF canvas export (core/pc_pdf.js)
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
  root.PhotoCollageCore.pdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, cropMath) {
  'use strict';

  var jsPdfLoadPromise = null;

  // PC7: load jsPDF on demand (kept in vendor/, not on first paint)
  function loadJsPdf() {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (jsPdfLoadPromise) return jsPdfLoadPromise;
    jsPdfLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'vendor/jspdf.umd.min.js';
      s.async = true;
      s.onload = function () {
        var lib = window.jspdf && window.jspdf.jsPDF;
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

  function drawPhotoOnCanvas(ctx, img, photo, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    var rot = (photo.rotation || 0) % 360;
    var rad = (rot * Math.PI) / 180;

    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rad);

    var isRotated90 = rot === 90 || rot === 270;
    var boundW = isRotated90 ? h : w;
    var boundH = isRotated90 ? w : h;

    var srcRect = cropMath.calcSourceCropRect(img.naturalWidth, img.naturalHeight, photo.crop);
    var imgAspect = srcRect.sw / srcRect.sh;
    var slotAspect = boundW / boundH;

    var drawW, drawH;
    if (photo.fit === 'contain') {
      if (imgAspect > slotAspect) {
        drawW = boundW;
        drawH = boundW / imgAspect;
      } else {
        drawH = boundH;
        drawW = boundH * imgAspect;
      }
    } else {
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

  function createPdfExporter(deps) {
    var state = deps.state;
    var dom = deps.dom;

    function renderPageToCanvas(pageIndex, mmW, mmH, slotsPerPage, callback) {
      var dpi = 200;
      var pxW = Math.round((mmW / 25.4) * dpi);
      var pxH = Math.round((mmH / 25.4) * dpi);

      var canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      var ctx = canvas.getContext('2d');

      if (state.bgColor !== 'transparent') {
        ctx.fillStyle = state.bgColor || '#ffffff';
        ctx.fillRect(0, 0, pxW, pxH);
      }

      var marginMm = 8;
      if (state.margin === 'none') marginMm = 0;
      else if (state.margin === 'small') marginMm = 4;
      else if (state.margin === 'wide') marginMm = 12;

      var marginPx = Math.round((marginMm / 25.4) * dpi);
      var gapPx = marginPx;

      var layout = cfg.LAYOUTS[state.layout] || cfg.LAYOUTS['4-grid'];
      var cols = layout.cols;
      var rows = layout.rows;

      var gridW = pxW - (marginPx * 2);
      var gridH = pxH - (marginPx * 2);
      var cellW = (gridW - gapPx * (cols - 1)) / cols;
      var cellH = (gridH - gapPx * (rows - 1)) / rows;

      var slotPhotosToLoad = [];
      for (var s = 0; s < slotsPerPage; s++) {
        var gIdx = pageIndex * slotsPerPage + s;
        var photo = state.photos[gIdx];
        if (photo && photo.src) {
          var col = s % cols;
          var row = Math.floor(s / cols);
          slotPhotosToLoad.push({
            photo: photo,
            x: marginPx + col * (cellW + gapPx),
            y: marginPx + row * (cellH + gapPx),
            w: cellW,
            h: cellH
          });
        }
      }

      if (slotPhotosToLoad.length === 0) {
        callback(canvas);
        return;
      }

      var loaded = 0;
      slotPhotosToLoad.forEach(function (slot) {
        var img = new Image();
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

    function exportToPdfWith(J) {
      if (dom.btnPdf) {
        dom.btnPdf.disabled = true;
        dom.btnPdf.textContent = 'Generating PDF…';
      }

      setTimeout(function () {
        try {
          var isLand = state.orientation === 'landscape';
          var paperDims = cfg.PAPER_SIZES[state.paper] || cfg.PAPER_SIZES.a4;
          var mmWidth = isLand ? paperDims.landscape[0] : paperDims.portrait[0];
          var mmHeight = isLand ? paperDims.landscape[1] : paperDims.portrait[1];
          var pdfFormat = cfg.getPdfFormat(state.paper);

          var doc = new J({
            orientation: isLand ? 'landscape' : 'portrait',
            unit: 'mm',
            format: pdfFormat,
            compress: true
          });

          var slotsPerPage = cfg.getSlotsPerPage(state.layout);
          var totalPages = cfg.calcTotalPages(state.photos.length, slotsPerPage, state.manualPages);

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
                doc.addPage(pdfFormat, isLand ? 'landscape' : 'portrait');
              }
              var isTransparent = state.bgColor === 'transparent';
              var imgFormat = isTransparent ? 'PNG' : 'JPEG';
              var imgData = isTransparent
                ? canvas.toDataURL('image/png')
                : canvas.toDataURL('image/jpeg', 0.94);
              doc.addImage(imgData, imgFormat, 0, 0, mmWidth, mmHeight);
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

    function exportToPdf() {
      var ready = window.jspdf && window.jspdf.jsPDF;
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

    return {
      loadJsPdf: loadJsPdf,
      exportToPdf: exportToPdf,
      exportToPdfWith: exportToPdfWith,
      renderPageToCanvas: renderPageToCanvas,
      drawPhotoOnCanvas: drawPhotoOnCanvas
    };
  }

  return {
    loadJsPdf: loadJsPdf,
    drawPhotoOnCanvas: drawPhotoOnCanvas,
    createPdfExporter: createPdfExporter
  };
});
