/* Video Editor — ve_fx.js: clip looks, speed, crop/rotate size, overlays, migrate. VD3
   Pure helpers (no DOM). */
(function (root) {
  'use strict';

  var E = root.VEEdits;
  if (!E && typeof require === 'function') {
    try { E = require('./ve_edits.js'); } catch (_) { /* ok */ }
  }

  var PROJECT_VERSION = 3;
  var LONG_SIDE = 1280;
  var SPEEDS = [0.25, 0.5, 1, 1.5, 2];
  var OUTPUTS = {
    auto: null,
    '1280x720': { width: 1280, height: 720 },
    '720x1280': { width: 720, height: 1280 },
    '1080x1080': { width: 1080, height: 1080 }
  };
  var PRESETS = {
    center: [0.5, 0.5],
    top: [0.5, 0.16],
    bottom: [0.5, 0.84],
    'top-left': [0.16, 0.16],
    'top-right': [0.84, 0.16],
    'bottom-left': [0.16, 0.84],
    'bottom-right': [0.84, 0.84]
  };

  function clamp(n, a, b) {
    n = Number(n);
    if (!isFinite(n)) n = a;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function even(n) {
    n = Math.max(2, Math.round(n));
    return n % 2 ? n + 1 : n;
  }

  function capLongSide(size, cap) {
    cap = cap || LONG_SIDE;
    var w = Number(size && size.width) || 0;
    var h = Number(size && size.height) || 0;
    if (w < 2) w = 1280;
    if (h < 2) h = 720;
    var long = Math.max(w, h);
    if (long > cap) {
      var s = cap / long;
      w *= s;
      h *= s;
    }
    return { width: even(w), height: even(h) };
  }

  function normalizeSpeed(s) {
    s = Number(s);
    for (var i = 0; i < SPEEDS.length; i++) {
      if (s === SPEEDS[i]) return s;
    }
    return 1;
  }

  function normalizeRotate(r) {
    r = ((Math.round(Number(r) || 0) % 360) + 360) % 360;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  }

  function normalizeOutput(setting) {
    var k = String(setting == null ? 'auto' : setting);
    return OUTPUTS[k] !== undefined ? k : 'auto';
  }

  function normalizeCrop(crop) {
    var c = crop || {};
    var x = clamp(c.x, 0, 1);
    var y = clamp(c.y, 0, 1);
    var w = c.w == null ? 1 : clamp(c.w, 0.02, 1);
    var h = c.h == null ? 1 : clamp(c.h, 0.02, 1);
    if (x + w > 1) w = Math.max(0.02, 1 - x);
    if (y + h > 1) h = Math.max(0.02, 1 - y);
    if (x + w > 1) x = Math.max(0, 1 - w);
    if (y + h > 1) y = Math.max(0, 1 - h);
    return { x: x, y: y, w: w, h: h };
  }

  function isFullCrop(crop) {
    var c = normalizeCrop(crop);
    return c.x <= 1e-6 && c.y <= 1e-6 && c.w >= 1 - 1e-6 && c.h >= 1 - 1e-6;
  }

  function defaultFx() {
    return {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      greyscale: 0,
      sepia: 0,
      blur: 0,
      rotate: 0,
      flipH: false,
      flipV: false,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      speed: 1,
      volume: 100,
      mute: false
    };
  }

  function migrateClip(c) {
    var d = defaultFx();
    if (!c) return d;
    var b = Number(c.brightness);
    var ct = Number(c.contrast);
    var sat = Number(c.saturation);
    var g = Number(c.greyscale);
    var se = Number(c.sepia);
    var bl = Number(c.blur);
    var vol = Number(c.volume);
    return {
      id: c.id,
      fileId: c.fileId,
      name: c.name || 'clip',
      duration: Number(c.duration) || 0,
      width: Number(c.width) || 0,
      height: Number(c.height) || 0,
      thumb: c.thumb || '',
      segments: E && E.mergeNormalize ? E.mergeNormalize(c.segments) : (c.segments || []),
      brightness: isFinite(b) ? clamp(b, 0, 200) : d.brightness,
      contrast: isFinite(ct) ? clamp(ct, 0, 200) : d.contrast,
      saturation: isFinite(sat) ? clamp(sat, 0, 200) : d.saturation,
      greyscale: isFinite(g) ? clamp(g, 0, 100) : d.greyscale,
      sepia: isFinite(se) ? clamp(se, 0, 100) : d.sepia,
      blur: isFinite(bl) ? clamp(bl, 0, 20) : d.blur,
      rotate: normalizeRotate(c.rotate),
      flipH: !!c.flipH,
      flipV: !!c.flipV,
      crop: normalizeCrop(c.crop),
      speed: normalizeSpeed(c.speed),
      volume: isFinite(vol) ? clamp(vol, 0, 200) : d.volume,
      mute: !!c.mute
    };
  }

  function cssFilter(clip) {
    var c = clip || defaultFx();
    var b = isFinite(Number(c.brightness)) ? c.brightness : 100;
    var ct = isFinite(Number(c.contrast)) ? c.contrast : 100;
    var s = isFinite(Number(c.saturation)) ? c.saturation : 100;
    var g = isFinite(Number(c.greyscale)) ? c.greyscale : 0;
    var se = isFinite(Number(c.sepia)) ? c.sepia : 0;
    var bl = isFinite(Number(c.blur)) ? c.blur : 0;
    return 'brightness(' + (b / 100) + ') contrast(' + (ct / 100) + ') saturate(' + (s / 100) +
      ') grayscale(' + (g / 100) + ') sepia(' + (se / 100) + ') blur(' + bl + 'px)';
  }

  function hasFilter(clip) {
    var c = clip || defaultFx();
    return Number(c.brightness) !== 100 || Number(c.contrast) !== 100 ||
      Number(c.saturation) !== 100 || Number(c.greyscale) !== 0 ||
      Number(c.sepia) !== 0 || Number(c.blur) !== 0;
  }

  function audioGain(clip, fadeAlpha) {
    var a = fadeAlpha == null ? 1 : Number(fadeAlpha);
    if (!isFinite(a)) a = 1;
    if (clip && clip.mute) return 0;
    var v = Number(clip && clip.volume);
    if (!isFinite(v)) v = 100;
    return a * clamp(v, 0, 200) / 100;
  }

  function rotatedSize(width, height, rotate) {
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    var r = normalizeRotate(rotate);
    if (r === 90 || r === 270) return { width: h, height: w };
    return { width: w, height: h };
  }

  function clipCroppedSize(clip) {
    var c = migrateClip(clip);
    var rot = rotatedSize(c.width, c.height, c.rotate);
    var crop = normalizeCrop(c.crop);
    return {
      width: Math.max(2, Math.round(rot.width * crop.w)),
      height: Math.max(2, Math.round(rot.height * crop.h))
    };
  }

  function outputSize(clips, setting) {
    setting = normalizeOutput(setting);
    if (setting !== 'auto' && OUTPUTS[setting]) {
      return capLongSide(OUTPUTS[setting], LONG_SIDE);
    }
    var first = (clips || [])[0];
    if (!first || (!(first.width > 0) && !(first.height > 0))) {
      return capLongSide({ width: 1280, height: 720 }, LONG_SIDE);
    }
    return capLongSide(clipCroppedSize(first), LONG_SIDE);
  }

  function clipPlayDuration(clip) {
    var kept = E && E.keptDuration ? E.keptDuration(clip && clip.segments) : 0;
    return kept / normalizeSpeed(clip && clip.speed);
  }

  function defaultOverlay() {
    return {
      id: '',
      text: 'Title',
      start: 0,
      end: 3,
      preset: 'center',
      x: 0.5,
      y: 0.5,
      size: 0.08,
      color: '#ffffff',
      box: true,
      fadeIn: 0.3,
      fadeOut: 0.3
    };
  }

  function presetPosition(preset) {
    return PRESETS[preset] || PRESETS.center;
  }

  function migrateOverlay(o) {
    var d = defaultOverlay();
    if (!o) return d;
    var start = Number(o.start);
    var end = Number(o.end);
    var size = Number(o.size);
    var fi = Number(o.fadeIn);
    var fo = Number(o.fadeOut);
    var preset = PRESETS[o.preset] ? o.preset : (o.preset === 'custom' ? 'custom' : 'center');
    var pos = preset !== 'custom' ? presetPosition(preset) : null;
    var x = Number(o.x);
    var y = Number(o.y);
    var color = String(o.color || d.color);
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = d.color;
    if (isFinite(size) && size > 1) size = size / 720;
    return {
      id: o.id || '',
      text: String(o.text == null ? d.text : o.text),
      start: isFinite(start) && start >= 0 ? start : d.start,
      end: isFinite(end) && end > (isFinite(start) ? start : 0) ? end : (isFinite(start) ? start + 3 : d.end),
      preset: preset,
      x: pos ? pos[0] : (isFinite(x) ? clamp(x, 0, 1) : d.x),
      y: pos ? pos[1] : (isFinite(y) ? clamp(y, 0, 1) : d.y),
      size: isFinite(size) ? clamp(size, 0.02, 0.4) : d.size,
      color: color,
      box: o.box !== false,
      fadeIn: isFinite(fi) ? clamp(fi, 0, 10) : d.fadeIn,
      fadeOut: isFinite(fo) ? clamp(fo, 0, 10) : d.fadeOut
    };
  }

  function copyOverlays(list) {
    return (list || []).map(migrateOverlay);
  }

  function overlayAlpha(overlay, t) {
    if (!overlay) return 0;
    var start = Number(overlay.start) || 0;
    var end = Number(overlay.end);
    var x = Number(t);
    if (!isFinite(end) || end <= start || !isFinite(x)) return 0;
    if (x < start || x >= end) return 0;
    var a = 1;
    var fi = Math.max(0, Number(overlay.fadeIn) || 0);
    var fo = Math.max(0, Number(overlay.fadeOut) || 0);
    if (fi > 0 && x < start + fi) a = Math.min(a, (x - start) / fi);
    if (fo > 0 && x > end - fo) a = Math.min(a, (end - x) / fo);
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    return a;
  }

  function visibleOverlays(overlays, t) {
    return (overlays || []).filter(function (o) { return overlayAlpha(o, t) > 0; });
  }

  function sameCrop(a, b) {
    a = normalizeCrop(a);
    b = normalizeCrop(b);
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 &&
      Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;
  }

  function sameClipFx(a, b) {
    if (!a || !b) return false;
    return a.brightness === b.brightness && a.contrast === b.contrast &&
      a.saturation === b.saturation && a.greyscale === b.greyscale &&
      a.sepia === b.sepia && a.blur === b.blur &&
      a.rotate === b.rotate && !!a.flipH === !!b.flipH && !!a.flipV === !!b.flipV &&
      sameCrop(a.crop, b.crop) && a.speed === b.speed &&
      a.volume === b.volume && !!a.mute === !!b.mute;
  }

  function sameOverlay(a, b) {
    if (!a || !b) return false;
    return a.id === b.id && a.text === b.text && a.start === b.start && a.end === b.end &&
      a.preset === b.preset && a.x === b.x && a.y === b.y && a.size === b.size &&
      a.color === b.color && !!a.box === !!b.box && a.fadeIn === b.fadeIn && a.fadeOut === b.fadeOut;
  }

  function migrateState(state) {
    state = state || {};
    var fade = Number(state.fade);
    if (fade !== 0.5 && fade !== 1) fade = 0;
    return {
      version: PROJECT_VERSION,
      fade: fade,
      outputSize: normalizeOutput(state.outputSize),
      clips: (state.clips || []).map(migrateClip),
      overlays: copyOverlays(state.overlays)
    };
  }

  var api = {
    PROJECT_VERSION: PROJECT_VERSION,
    LONG_SIDE: LONG_SIDE,
    SPEEDS: SPEEDS,
    OUTPUTS: OUTPUTS,
    clamp: clamp,
    even: even,
    capLongSide: capLongSide,
    normalizeSpeed: normalizeSpeed,
    normalizeRotate: normalizeRotate,
    normalizeOutput: normalizeOutput,
    normalizeCrop: normalizeCrop,
    isFullCrop: isFullCrop,
    defaultFx: defaultFx,
    migrateClip: migrateClip,
    cssFilter: cssFilter,
    hasFilter: hasFilter,
    audioGain: audioGain,
    rotatedSize: rotatedSize,
    clipCroppedSize: clipCroppedSize,
    outputSize: outputSize,
    clipPlayDuration: clipPlayDuration,
    defaultOverlay: defaultOverlay,
    presetPosition: presetPosition,
    migrateOverlay: migrateOverlay,
    copyOverlays: copyOverlays,
    overlayAlpha: overlayAlpha,
    visibleOverlays: visibleOverlays,
    sameCrop: sameCrop,
    sameClipFx: sameClipFx,
    sameOverlay: sameOverlay,
    migrateState: migrateState
  };

  root.VEFx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
