/*
 * Draw — configuration. draw_logic.js reads DRAW_CONFIG.
 * Colours, brush sizes, tools, fill tolerance, zoom, history, autosave, background.
 */
const DRAW_CONFIG = {
  APP: { name: 'Draw', version: '1.0' },

  // Palette (colour popover), first one is the starting colour
  colors: [
    '#111111', '#ffffff', '#e53935', '#fb8c00', '#fdd835',
    '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#8d6e63',
  ],

  // Brush sizes in CSS px at the document's density (size popover; [ ] keys)
  sizes: [2, 6, 14, 30],
  startSize: 1,              // index into sizes

  // Tools in toolbar order; shapes cycle on the Shape button (S key)
  tools: ['pen', 'eraser', 'fill', 'shape'],
  shapes: ['line', 'rect', 'circle'],
  startTool: 'pen',

  // Flood fill: max difference per RGBA channel (0-255) still counted as "same colour"
  fillTolerance: 32,

  // Document (the drawing itself, independent of the screen)
  doc: {
    background: '#ffffff',   // page colour (painted under the drawing, kept on save)
    density: 2,              // max document pixels per CSS px (devicePixelRatio is capped here)
    maxSide: 3000,           // longest side in document pixels
    // First launch: the drawing gets the size of the free screen area. Rotating or
    // resizing later never resizes or crops the drawing; the view just refits.
  },

  // Zoom (1 = whole drawing fits the screen)
  zoom: { min: 0.5, max: 8, wheelStep: 1.15 },

  // Undo / redo steps kept
  historyLimit: 40,

  // Autosave to localStorage (debounced)
  autosave: { key: 'draw-autosave', metaKey: 'draw-autosave-meta', delayMs: 800 },

  // Touch: a second finger within a stroke cancels it (no stray line) and pinches
  // instead. A tap with the Fill tool fills on release if it moved less than this.
  tapMovePx: 10,

  // Keyboard (single keys, no modifier). Undo / redo: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z.
  keys: { pen: 'p', eraser: 'e', fill: 'f', shape: 's', sizeDown: '[', sizeUp: ']', resetZoom: '0' },

  text: {
    pen: 'Pen', eraser: 'Eraser', fill: 'Fill',
    line: 'Line', rect: 'Rectangle', circle: 'Circle',
    color: 'Colour', size: 'Size', undo: 'Undo', redo: 'Redo', more: 'More',
    clear: 'Clear', savePng: 'Save PNG', open: 'Open image',
    clearAsk: 'Clear the whole drawing?', yes: 'Clear', cancel: 'Cancel',
    resetZoom: 'Reset zoom',
    statTool: 'Tool',
    saved: 'Saved', opened: 'Image added', pasted: 'Image pasted',
    storageFull: 'Autosave: storage full',
    filePrefix: 'drawing',
  },
};
