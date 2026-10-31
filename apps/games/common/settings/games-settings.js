/*
 * File: apps/games/common/settings/games-settings.js
 * Release: GS1 — shared settings for the whole Games category.
 *          LC3 (LandCraft) added renderDistance, pixelRatio, autoJump, holdRepeat.
 * Purpose: Tiny no-build library (classic script, works from file://) that
 *          exposes window.GameSettings. Every setting lives in ONE localStorage
 *          key, 'games.settings', as JSON. Unknown keys are ignored and bad
 *          values fall back to defaults, so a corrupt store never breaks a game.
 * API: get(key), set(key, value), all(), onChange(cb), reset(),
 *      fps(), frameMs(), mountGear(elOrPosition, gameName), pageUrl(gameName),
 *      SCHEMA, KEY, clearGameProgress(), progressKeys()  (see README.md)
 */
(function (root) {
  'use strict';
  var KEY = 'games.settings';

  /* Schema: type + default + allowed values / range. Add new settings here (see README). */
  var SCHEMA = {
    theme:         { type: 'enum',  def: 'auto',   values: ['auto', 'light', 'dark'] },
    fpsLimit:      { type: 'enum',  def: 30,       values: [30, 45, 60] },
    lowGraphics:   { type: 'bool',  def: false },
    screenShake:   { type: 'bool',  def: true },
    masterVolume:  { type: 'num',   def: 0.8, min: 0,   max: 1 },
    music:         { type: 'bool',  def: true },
    sfx:           { type: 'bool',  def: true },
    vibration:     { type: 'bool',  def: true },
    controlsSide:  { type: 'enum',  def: 'right',  values: ['right', 'left'] },
    joystickSize:  { type: 'num',   def: 1.0, min: 0.6, max: 1.6 },
    buttonOpacity: { type: 'num',   def: 0.8, min: 0.2, max: 1 },
    sensitivity:   { type: 'num',   def: 1.0, min: 0.3, max: 2 },
    showHints:     { type: 'bool',  def: true },
    difficulty:    { type: 'enum',  def: 'normal', values: ['easy', 'normal', 'hard'] },
    autoPause:     { type: 'bool',  def: true },
    showFps:       { type: 'bool',  def: false },
    // LC3: for 3D / first-person games (LandCraft first). 'auto' = the game's own default.
    renderDistance: { type: 'enum', def: 5,      values: [3, 4, 5] },          // chunks (16 blocks each)
    pixelRatio:    { type: 'enum',  def: 'auto', values: ['auto', 1, 1.5, 2] }, // lower = faster on weak phones
    autoJump:      { type: 'bool',  def: true },  // touch: hop up 1-block steps while walking
    holdRepeat:    { type: 'bool',  def: true },  // touch: holding an action button repeats it
  };

  /* Return a valid value for key k, or undefined if v is not acceptable. */
  function clean(k, v) {
    var s = SCHEMA[k];
    if (!s) return undefined;
    if (s.type === 'bool') return typeof v === 'boolean' ? v : (v === 'true' ? true : v === 'false' ? false : undefined);
    if (s.type === 'num') {
      var n = Number(v);
      return (v === '' || v === null || isNaN(n)) ? undefined : Math.min(s.max, Math.max(s.min, n));
    }
    // enum: accept '60' for 60 (HTML selects give strings)
    for (var i = 0; i < s.values.length; i++) if (String(s.values[i]) === String(v)) return s.values[i];
    return undefined;
  }

  function defaults() {
    var o = {};
    for (var k in SCHEMA) o[k] = SCHEMA[k].def;
    return o;
  }

  /* Merge stored JSON over defaults, validating every field. Never throws. */
  function load() {
    var o = defaults(), raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    if (raw && typeof raw === 'object') {
      for (var k in SCHEMA) if (k in raw) { var v = clean(k, raw[k]); if (v !== undefined) o[k] = v; }
    }
    return o;
  }

  var cache = load(), listeners = [];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* private mode: in-memory only */ } }
  function emit(changed) {
    listeners.slice().forEach(function (cb) { try { cb(changed, all()); } catch (e) { console.warn('GameSettings listener', e); } });
  }
  function all() { var o = {}; for (var k in cache) o[k] = cache[k]; return o; }

  /* Another tab (e.g. the settings page) changed the store: reload and notify. */
  try {
    root.addEventListener('storage', function (e) {
      if (e.key !== KEY && e.key !== null) return;
      var old = cache, changed = {};
      cache = load();
      for (var k in cache) if (cache[k] !== old[k]) changed[k] = cache[k];
      if (Object.keys(changed).length) emit(changed);
    });
  } catch (e) { /* no window */ }

  /*
   * Progress keys: localStorage keys that belong to games. Conservative rule:
   * a key matches only if it starts with a known game prefix followed by
   * '.', '-' or '_' (or equals one of the exact keys). Never 'games.settings'.
   */
  var GAME_PREFIXES = ['2048', 'aeroplane', 'ant-farm', 'aoe-rts', 'aquarium', 'ar-game', 'browser-fps',
    'car-run', 'chess', 'contra-alpha', 'demolisher', 'desert-road', 'dino-run', 'gravity-sandbox',
    'hero-builder', 'island-alpha', 'island-conquest', 'island-demo', 'landcraft', 'neon-fist-3d',
    'neon-fist', 'neon-raid', 'pacman', 'ping-pong', 'sling-birds', 'snake', 'solar-system',
    'space-invader', 'swell-foop', 'tennis-throw', 'tetris', 'tic-tac-toe', 'tower-defence', 'turbo-lap',
    // short aliases some games already use
    'td', 'nf3d', 'slingbirds', 'hero-viewer'];
  var GAME_EXACT = ['td_best'];
  function isGameKey(k) {
    if (k === KEY) return false;
    if (GAME_EXACT.indexOf(k) >= 0) return true;
    return GAME_PREFIXES.some(function (p) { return k.length > p.length + 1 && k.indexOf(p) === 0 && '.-_'.indexOf(k[p.length]) >= 0; });
  }
  function progressKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (isGameKey(k)) out.push(k); } } catch (e) {}
    return out.sort();
  }

  /* URL of the settings page, from this script's own location (works on file:// and http). */
  var here = (document.currentScript && document.currentScript.src) || '';
  function pageUrl(game) {
    var base = here ? here.replace(/[^/]*$/, '') : '../common/settings/';
    return base + 'games-settings.html' + (game ? '?from=' + encodeURIComponent(game) : '');
  }

  var GS = {
    KEY: KEY, SCHEMA: SCHEMA, defaults: defaults,
    get: function (k) { return cache[k]; },
    /* Validate and store; returns the stored value (or undefined if rejected). */
    set: function (k, v) {
      var c = clean(k, v);
      if (c === undefined) { console.warn('GameSettings: invalid', k, v); return undefined; }
      if (cache[k] !== c) { cache[k] = c; save(); var ch = {}; ch[k] = c; emit(ch); }
      return c;
    },
    all: all,
    /* cb(changed, all) — same tab and other tabs. Returns an unsubscribe function. */
    onChange: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (f) { return f !== cb; }); }; },
    reset: function () { cache = defaults(); try { localStorage.removeItem(KEY); } catch (e) {} emit(all()); },
    /* Import an object (e.g. from exported JSON); invalid fields are skipped. Returns count applied. */
    importAll: function (obj) {
      var n = 0, ch = {};
      if (!obj || typeof obj !== 'object') return 0;
      for (var k in SCHEMA) if (k in obj) { var v = clean(k, obj[k]); if (v !== undefined) { cache[k] = v; ch[k] = v; n++; } }
      save(); emit(ch); return n;
    },
    fps: function () { return cache.fpsLimit; },
    frameMs: function () { return 1000 / cache.fpsLimit; },
    progressKeys: progressKeys,
    clearGameProgress: function () { var ks = progressKeys(); ks.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} }); return ks; },
    pageUrl: pageUrl,
    /*
     * Small ⚙ button that opens the settings page (same tab, with ?from= for Back).
     * target: an element to append to, or 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' (fixed).
     */
    mountGear: function (target, game) {
      var a = document.createElement('a');
      a.href = pageUrl(game);
      a.className = 'gs-gear';
      a.title = a.ariaLabel = 'Game settings';
      a.textContent = '⚙';
      a.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;' +
        'border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font:22px/1 system-ui,sans-serif;' +
        'text-decoration:none;z-index:50;user-select:none;-webkit-tap-highlight-color:transparent;';
      if (typeof target === 'string' || !target) {
        var p = (target || 'top-right').split('-');
        a.style.position = 'fixed';
        a.style[p[0]] = '10px'; a.style[p[1] || 'right'] = '10px';
        document.body.appendChild(a);
      } else target.appendChild(a);
      return a;
    },
  };
  root.GameSettings = GS;
})(window);
