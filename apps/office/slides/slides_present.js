/* Hub Office Slides SL7 — presenter helpers (SLPresent). No DOM, safe to load in Node for tests.
   Notes (plain text), slide transitions (none | fade | push | wipe), kept ink strokes, timer formatting,
   and the BroadcastChannel / postMessage envelope used to sync the audience window with Presenter view.
   prefers-reduced-motion is honoured by effectiveTrans() (callers pass a flag; no matchMedia here). */
(function (root) {
  'use strict';
  var TRANS = ['none', 'fade', 'push', 'wipe'];
  var LABELS = { none: 'None', fade: 'Fade', push: 'Push', wipe: 'Wipe' };
  var COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#111827'];
  var MAX_NOTES = 4000, MAX_STROKES = 200, MAX_PTS = 400, MAX_W = 32;
  var CHAN = 'hub-slides-present';

  function str(x, max) { return (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : '')).slice(0, max || 2000); }
  function cleanNotes(s) {
    return str(s, MAX_NOTES).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  function cleanTrans(s) {
    s = String(s == null ? '' : s).toLowerCase();
    if (s === 'slide' || s === 'cover') s = 'push';
    if (s === '') s = 'none';
    return TRANS.indexOf(s) >= 0 ? s : 'none';
  }
  function effectiveTrans(s, o) {
    o = o || {};
    if (o.reduce) return 'none';
    return cleanTrans(typeof s === 'string' ? s : (s && (s.trans || s.transition)));
  }
  function cleanColor(c) {
    c = String(c || '').trim().toLowerCase();
    if (/^#([0-9a-f]{3})$/.test(c)) { c = c.slice(1); c = '#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; }
    if (COLORS.indexOf(c) >= 0) return c;
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    return '';
  }
  function num(x, lo, hi, d) { x = +x; return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; }
  function cleanPt(p) {
    if (!p || typeof p !== 'object') return null;
    var x = +p.x, y = +p.y;
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x: Math.round(Math.max(-100, Math.min(1060, x)) * 10) / 10, y: Math.round(Math.max(-100, Math.min(640, y)) * 10) / 10 };
  }
  function cleanStroke(s) {
    s = s && typeof s === 'object' ? s : {};
    var tool = s.tool === 'erase' || s.erase ? 'erase' : 'pen';
    var pts = (Array.isArray(s.pts) ? s.pts : []).map(cleanPt).filter(Boolean).slice(0, MAX_PTS);
    if (pts.length < 1) return null;
    var o = { tool: tool, width: Math.round(num(s.width != null ? s.width : s.w, 1, MAX_W, 4)), pts: pts };
    if (tool === 'pen') o.color = cleanColor(s.color) || '#ef4444';
    return o;
  }
  function cleanInk(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, MAX_STROKES).map(cleanStroke).filter(Boolean);
  }
  function cloneInk(arr) { return JSON.parse(JSON.stringify(cleanInk(arr))); }
  function hasInk(arr) { return cleanInk(arr).length > 0; }
  function addPoint(stroke, x, y, minDist) {
    minDist = minDist == null ? 1.6 : minDist;
    var p = cleanPt({ x: x, y: y }); if (!p) return stroke;
    stroke = stroke || { tool: 'pen', color: '#ef4444', width: 4, pts: [] };
    var pts = stroke.pts || (stroke.pts = []);
    var last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < minDist) return stroke;
    if (pts.length < MAX_PTS) pts.push(p);
    else pts[pts.length - 1] = p;
    return stroke;
  }
  function inkOut(arr) {
    return cleanInk(arr).map(function (s) {
      var o = { tool: s.tool, width: s.width, pts: s.pts.map(function (p) { return [p.x, p.y]; }) };
      if (s.color) o.color = s.color;
      return o;
    });
  }
  function inkIn(arr) {
    if (!Array.isArray(arr)) return [];
    return cleanInk(arr.map(function (s) {
      if (!s || typeof s !== 'object') return s;
      var pts = s.pts;
      if (Array.isArray(pts) && pts.length && Array.isArray(pts[0])) {
        pts = pts.map(function (p) { return { x: p[0], y: p[1] }; });
      }
      return { tool: s.tool, color: s.color, width: s.width, pts: pts };
    }));
  }

  function formatTimer(sec) {
    sec = Math.max(0, Math.floor(+sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? h + ':' + two(m) + ':' + two(s) : two(m) + ':' + two(s);
  }

  /* message envelope: { v:1, ch:'hub-slides', k:<session>, type, ... } */
  var TYPES = { hello: 1, state: 1, go: 1, next: 1, prev: 1, exit: 1, blank: 1, tool: 1, ink: 1, timer: 1, keep: 1, poke: 1, clear: 1 };
  function pack(msg, key) {
    msg = msg && typeof msg === 'object' ? msg : {};
    var o = { v: 1, ch: 'hub-slides', k: String(key || ''), type: String(msg.type || '') };
    Object.keys(msg).forEach(function (k) { if (k !== 'v' && k !== 'ch' && k !== 'k') o[k] = msg[k]; });
    return o;
  }
  function accept(data, key) {
    if (!data || typeof data !== 'object') return null;
    if (data.v !== 1 || data.ch !== 'hub-slides') return null;
    if (key && data.k !== key) return null;
    if (!TYPES[data.type]) return null;
    return data;
  }
  function cleanBlank(s) { s = String(s || ''); return s === 'black' || s === 'white' ? s : 'none'; }
  function cleanState(m) {
    m = m && typeof m === 'object' ? m : {};
    return {
      type: 'state',
      i: Math.max(0, m.i | 0),
      atEnd: !!m.atEnd,
      n: Math.max(0, m.n | 0),
      blank: cleanBlank(m.blank),
      tool: m.tool === 'pen' || m.tool === 'erase' || m.tool === 'laser' ? m.tool : '',
      color: cleanColor(m.color) || '#ef4444',
      elapsed: Math.max(0, +m.elapsed || 0),
      running: !!m.running,
      keep: !!m.keep
    };
  }
  function presentUrl(href, key, deckId) {
    href = String(href || 'slides.html');
    var base = href.split('#')[0], hash = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#')) : '';
    var parts = base.split('?'), path = parts[0], q = [];
    (parts[1] || '').split('&').forEach(function (p) {
      if (!p) return;
      var k = p.split('=')[0];
      if (k === 'pv' || k === 'k' || k === 'd') return;
      q.push(p);
    });
    q.push('pv=1');
    if (key) q.push('k=' + encodeURIComponent(key));
    if (deckId) q.push('d=' + encodeURIComponent(deckId));
    return path + '?' + q.join('&') + hash;
  }
  function isPresenterSearch(search) {
    return /(?:^|[?&])pv=1(?:&|$)/.test(String(search || ''));
  }
  function param(search, name) {
    var m = new RegExp('(?:^|[?&])' + name + '=([^&]*)').exec(String(search || ''));
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  var API = {
    TRANS: TRANS, LABELS: LABELS, COLORS: COLORS, MAX_NOTES: MAX_NOTES, MAX_STROKES: MAX_STROKES, CHAN: CHAN,
    cleanNotes: cleanNotes, cleanTrans: cleanTrans, effectiveTrans: effectiveTrans,
    cleanColor: cleanColor, cleanInk: cleanInk, cloneInk: cloneInk, hasInk: hasInk,
    cleanStroke: cleanStroke, addPoint: addPoint, inkOut: inkOut, inkIn: inkIn,
    formatTimer: formatTimer, pack: pack, accept: accept, cleanBlank: cleanBlank, cleanState: cleanState,
    presentUrl: presentUrl, isPresenterSearch: isPresenterSearch, param: param
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLPresent = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
