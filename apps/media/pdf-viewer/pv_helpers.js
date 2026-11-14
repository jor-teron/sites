/* PDF Viewer — pv_helpers.js: pure zoom / fit / page-window helpers. PV1 */
(function (root) {
  'use strict';

  var ZOOM_MIN = 0.5;
  var ZOOM_MAX = 3;
  var ZOOM_STEP = 0.25;
  var MAX_RENDERED = 6;
  var LOOK_AHEAD = 1;
  var LOOK_BEHIND = 1;
  var DPR_CAP = 2;
  var PRINT_PAGE_WARN = 100;

  function clampZoom(z) {
    var n = Number(z);
    if (!isFinite(n)) n = 1;
    if (n < ZOOM_MIN) return ZOOM_MIN;
    if (n > ZOOM_MAX) return ZOOM_MAX;
    return Math.round(n / ZOOM_STEP) * ZOOM_STEP;
  }

  function stepZoom(z, dir) {
    var cur = clampZoom(z);
    return clampZoom(cur + (dir < 0 ? -ZOOM_STEP : ZOOM_STEP));
  }

  /** Fit-width scale: container CSS width / page width (PDF units at scale 1). */
  function fitScale(pageWidth, containerWidth, padding) {
    var pad = padding == null ? 0 : padding;
    var avail = Math.max(1, Number(containerWidth) - pad);
    var pw = Math.max(1, Number(pageWidth));
    return avail / pw;
  }

  /** Display scale = fitScale * zoom (zoom 1 = fit width). */
  function displayScale(fit, zoom) {
    return Math.max(0.01, Number(fit) * clampZoom(zoom));
  }

  function zoomLabel(zoom) {
    var z = clampZoom(zoom);
    if (Math.abs(z - 1) < 0.001) return 'Fit';
    return Math.round(z * 100) + '%';
  }

  /**
   * Pages that should stay rendered around `current` (1-based), plus any
   * extra intersecting ones. Returns a sorted unique 1-based list.
   */
  function pagesAround(current, total, behind, ahead) {
    var t = Math.max(0, Number(total) | 0);
    if (t < 1) return [];
    var c = Math.min(Math.max(1, Number(current) | 0), t);
    var b = behind == null ? LOOK_BEHIND : Math.max(0, behind | 0);
    var a = ahead == null ? LOOK_AHEAD : Math.max(0, ahead | 0);
    var out = [];
    var i;
    for (i = Math.max(1, c - b); i <= Math.min(t, c + a); i++) out.push(i);
    return out;
  }

  /**
   * Given currently rendered page numbers and the set we must keep,
   * pick pages to evict so that after eviction |rendered − evicted + keep|
   * stays ≤ maxKeep. Prefer evicting farthest from `current`.
   * Returns sorted list of page numbers to free.
   */
  function chooseEvictions(rendered, keep, current, maxKeep) {
    var max = maxKeep == null ? MAX_RENDERED : Math.max(1, maxKeep | 0);
    var keepSet = Object.create(null);
    var i;
    for (i = 0; i < keep.length; i++) keepSet[keep[i]] = true;

    var renderedList = [];
    for (i = 0; i < rendered.length; i++) {
      var p = rendered[i];
      if (!keepSet[p]) renderedList.push(p);
    }
    // Pages already in keep never evict.
    var keepCount = 0;
    for (i = 0; i < rendered.length; i++) if (keepSet[rendered[i]]) keepCount++;
    // After adding any missing keep pages, total would be keepCount + renderedList.length
    // plus new keeps not yet rendered — we only decide which non-keep rendered to drop.
    var room = Math.max(0, max - keep.length);
    if (renderedList.length <= room) return [];

    renderedList.sort(function (a, b) {
      return Math.abs(a - current) - Math.abs(b - current);
    });
    // Keep the closest `room` non-keep pages; evict the rest (farthest first).
    var evict = renderedList.slice(room);
    evict.sort(function (a, b) { return a - b; });
    return evict;
  }

  function devicePixelRatioCapped(dpr, cap) {
    var c = cap == null ? DPR_CAP : cap;
    var d = Number(dpr);
    if (!isFinite(d) || d < 1) d = 1;
    return Math.min(d, c);
  }

  var api = {
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    ZOOM_STEP: ZOOM_STEP,
    MAX_RENDERED: MAX_RENDERED,
    LOOK_AHEAD: LOOK_AHEAD,
    LOOK_BEHIND: LOOK_BEHIND,
    DPR_CAP: DPR_CAP,
    PRINT_PAGE_WARN: PRINT_PAGE_WARN,
    clampZoom: clampZoom,
    stepZoom: stepZoom,
    fitScale: fitScale,
    displayScale: displayScale,
    zoomLabel: zoomLabel,
    pagesAround: pagesAround,
    chooseEvictions: chooseEvictions,
    devicePixelRatioCapped: devicePixelRatioCapped
  };

  root.PVHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
