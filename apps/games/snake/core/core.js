/**
 * Snake — shared core: config shortcuts, DOM refs, constants, game state, canvas sizing.
 * Every tunable value comes from SNAKE_CONFIG (core/config.js).
 * All modules share the window.SN namespace; mutable game state lives in SN.G.
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const CFG = SN.CFG = SNAKE_CONFIG;
  SN.K = CFG.keys;
  SN.TX = CFG.text;
  SN.CL = CFG.colors;
  SN.SZ = CFG.sizes;

  const $ = (id) => document.getElementById(id);
  SN.el = {
    canvas: $('c'), score: $('score'), best: $('best'), wrapInd: $('wrap-ind'),
    overlay: $('overlay'), title: $('title'), msg: $('msg'), sub: $('sub'),
    dpad: $('dpad'), dpadToggle: $('dpad-toggle'),
  };
  SN.ctx = SN.el.canvas.getContext('2d');
  $('help').textContent = SN.TX.help;

  // Match a key event against a binding list by KeyboardEvent.code OR .key.
  SN.isKey = (list, e) => list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;

  SN.COLS = CFG.grid.cols;
  SN.ROWS = CFG.grid.rows;
  SN.BASE_STEP = CFG.timing.baseStep; // seconds per cell
  SN.BOOST_STEP = CFG.timing.boostStep;
  SN.BEST_KEY = CFG.bestKey;
  SN.APP = CFG.APP || { name: 'Snake', version: '' };
  SN.WRAP_START = CFG.WRAP_WALLS !== undefined ? !!CFG.WRAP_WALLS : !!(CFG.start && CFG.start.wrap);
  if (SN.APP.name) document.title = SN.APP.name + ' SNR1a';   // release label (title only)

  SN.OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  SN.DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // Mutable game state. state: title | play | pause | over
  const G = SN.G = {
    state: 'title', snake: null, dir: null, nextDir: null, dirQueue: null, food: null,
    score: 0, best: 0, wrap: false, boost: false, acc: 0, last: 0,
    clickStartAt: -Infinity, // time a tap/click started the game
    dpadOn: false,
  };
  try { G.best = Number(localStorage.getItem(SN.BEST_KEY) || 0) || 0; } catch (_) { G.best = 0; }
  SN.el.best.textContent = 'BEST ' + G.best;

  // Canvas view (CSS px), DPR-aware; the board is centered with square cells.
  const V = SN.view = { dpr: 1, W: 0, H: 0, cell: 0, ox: 0, oy: 0 };
  SN.resize = function () {
    const canvas = SN.el.canvas;
    V.dpr = Math.min(window.devicePixelRatio || 1, 3);
    V.W = window.innerWidth;
    V.H = window.innerHeight;
    canvas.width = Math.floor(V.W * V.dpr);
    canvas.height = Math.floor(V.H * V.dpr);
    canvas.style.width = V.W + 'px';
    canvas.style.height = V.H + 'px';
    SN.ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    V.cell = Math.floor(Math.min(V.W / SN.COLS, V.H / SN.ROWS));
    V.ox = Math.floor((V.W - V.cell * SN.COLS) / 2);
    V.oy = Math.floor((V.H - V.cell * SN.ROWS) / 2);
  };
})();
