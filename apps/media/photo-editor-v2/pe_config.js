/*
 * Photo Editor v2 — pe_config.js
 * Every tunable setting lives here. All pe_*.js files share the single global
 * namespace window.PE (plain <script> tags, no modules, works from file://).
 */
window.PE = window.PE || {};

PE.config = {
  version: '1.0',

  // Working-copy limits. A photo bigger than this is downscaled once on open
  // (phones have much smaller canvas limits than desktops; iOS caps at ~16.7 MP).
  limits: {
    maxPixelsTouch: 16777216,   // 16.7 MP on touch / coarse-pointer devices
    maxPixelsDesktop: 50000000, // 50 MP on desktop (an 8000x6000 photo stays full size)
    maxSide: 16384              // longest side, any device
  },

  // Screen preview: edits are previewed on a screen-sized copy, never the full photo.
  view: {
    dprCap: 2,                  // render at most 2 device pixels per CSS pixel
    previewMaxPixels: 2500000,  // cap for the preview copy (keeps sliders fast when zoomed in)
    pad: 6,                     // gap around the photo in normal view (CSS px)
    zoomMin: 1,                 // relative to "fit to screen"
    zoomMax: 8,
    doubleTapZoom: 2.5,
    rebuildDelay: 160           // ms after zooming before the sharper preview is rebuilt
  },

  crop: {
    pad: 22,                    // gap around the photo in crop mode, so handles stay reachable
    hit: 24,                    // touch radius of a handle (CSS px)
    minSize: 16,                // smallest crop, in photo pixels
    ratios: [
      { id: 'free',  label: 'Free',     r: 0 },
      { id: 'orig',  label: 'Original', r: -1 },
      { id: '1:1',   label: '1:1',      r: 1 },
      { id: '4:3',   label: '4:3',      r: 4 / 3 },
      { id: '16:9',  label: '16:9',     r: 16 / 9 }
    ]
  },

  adjust: {
    min: -100, max: 100,
    sliders: [
      { id: 'b', label: 'Brightness' },
      { id: 'c', label: 'Contrast' },
      { id: 's', label: 'Saturation' },
      { id: 'w', label: 'Warmth' }
    ],
    // A preset adds its "adj" values on top of the sliders, then applies an optional 3x3 colour matrix.
    presets: [
      { id: 'none',  label: 'Original' },
      { id: 'bw',    label: 'B&W',   adj: { s: -100, c: 12 } },
      { id: 'sepia', label: 'Sepia', adj: { c: 5 },
        matrix: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131] },
      { id: 'vivid', label: 'Vivid', adj: { s: 40, c: 15, b: 3 } }
    ]
  },

  save: {
    defaultFormat: 'auto',      // 'auto' = PNG for PNG photos, otherwise JPEG
    jpegQuality: 0.92,
    jpegBackground: '#ffffff',  // transparent areas become this colour in JPEG
    stripRows: 512,             // full-size processing is done in strips of this many rows
    suffix: '-edited'
  },

  historyLimit: 60,

  colors: {
    stage: '#141518',
    dim: 'rgba(0,0,0,0.58)',
    cropLine: '#ffffff',
    cropGrid: 'rgba(255,255,255,0.35)',
    accent: '#8ab4ff'
  },

  // Single keys (lower case). Ctrl/Cmd+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+S save, Ctrl+O open.
  keys: {
    undo: 'z', redo: 'y', save: 's', open: 'o',
    rotate: 'r',        // Shift+R rotates left
    crop: 'c',          // C starts crop; C again (or Enter) applies
    resetZoom: '0',
    flipH: 'h', flipV: 'v',
    adjust: 'a'
  }
};
