/**
 * Photo Collage — Layout, paper size, page, and print dimension helpers (core/pc_config.js)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.config = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LAYOUTS = {
    '4-grid': { name: '4 Photos / Page (2×2)', slots: 4, cols: 2, rows: 2 },
    '2-stack': { name: '2 Photos / Page (Vertical)', slots: 2, cols: 1, rows: 2 },
    '2-split': { name: '2 Photos / Page (Horizontal)', slots: 2, cols: 2, rows: 1 },
    '1-full': { name: '1 Photo / Page (Full)', slots: 1, cols: 1, rows: 1 }
  };

  var PAPER_SIZES = {
    'a4': { name: 'A4', portrait: [210, 297], landscape: [297, 210] },
    'letter': { name: 'Letter', portrait: [215.9, 279.4], landscape: [279.4, 215.9] },
    'india-legal': { name: 'India Legal', portrait: [215, 345], landscape: [345, 215] }
  };

  function getSlotsPerPage(layoutKey) {
    var layout = LAYOUTS[layoutKey];
    return layout ? layout.slots : 4;
  }

  function calcTotalPages(photoCount, slotsPerPage, manualPages) {
    var minPagesFromPhotos = Math.ceil((photoCount || 0) / (slotsPerPage || 1));
    var manual = Number(manualPages) || 0;
    return Math.max(1, minPagesFromPhotos, manual);
  }

  function getPageSizeCss(paperKey, orientKey) {
    var orient = orientKey === 'landscape' ? 'landscape' : 'portrait';
    if (paperKey === 'a4') return 'A4 ' + orient;
    if (paperKey === 'letter') return 'letter ' + orient;
    var paperDims = PAPER_SIZES[paperKey] || PAPER_SIZES.a4;
    var dims = orient === 'landscape' ? paperDims.landscape : paperDims.portrait;
    return dims[0] + 'mm ' + dims[1] + 'mm';
  }

  function getPdfFormat(paperKey) {
    if (paperKey === 'letter') return 'letter';
    if (paperKey === 'a4' || !PAPER_SIZES[paperKey]) return 'a4';
    return PAPER_SIZES[paperKey].portrait;
  }

  function calcPrintSlotDimensions(paperKey, orientKey, layoutKey, marginKey) {
    var isLand = orientKey === 'landscape';
    var paperDims = PAPER_SIZES[paperKey] || PAPER_SIZES.a4;
    var pageW = isLand ? paperDims.landscape[0] : paperDims.portrait[0];
    var pageH = isLand ? paperDims.landscape[1] : paperDims.portrait[1];

    var marginMm = 8;
    if (marginKey === 'none') marginMm = 0;
    else if (marginKey === 'small') marginMm = 4;
    else if (marginKey === 'wide') marginMm = 12;

    var gapMm = marginMm;
    var layout = LAYOUTS[layoutKey] || LAYOUTS['4-grid'];
    var cols = layout.cols;
    var rows = layout.rows;

    var gridW = pageW - (marginMm * 2);
    var gridH = pageH - (marginMm * 2);

    var slotW = (gridW - (gapMm * (cols - 1))) / cols;
    var slotH = (gridH - (gapMm * (rows - 1))) / rows;

    return {
      pageW: pageW,
      pageH: pageH,
      slotW: slotW,
      slotH: slotH,
      aspect: slotW / slotH
    };
  }

  return {
    LAYOUTS: LAYOUTS,
    PAPER_SIZES: PAPER_SIZES,
    getSlotsPerPage: getSlotsPerPage,
    calcTotalPages: calcTotalPages,
    getPageSizeCss: getPageSizeCss,
    getPdfFormat: getPdfFormat,
    calcPrintSlotDimensions: calcPrintSlotDimensions
  };
});
