/* Whiteboard WB1 — the board: model, drawing, pan/zoom, tools, undo/redo.
   Items (world coordinates): {id, by, ts, k:'pen'|'hl'|'line'|'rect'|'ell'|'arrow'|'text', c, w, pts:[x,y,…], text?, fs?}
   c:'ink' = theme ink (light ink on dark boards, dark ink on light ones; PNG uses the current theme).
   Items are kept sorted by (ts, id) so every device stacks them the same way.
   Events: 'live' (in-progress stroke messages: lb begin, lp points, ls shape points, le end, lx abort),
   'op' (committed ops: add, del, clear), 'change' (anything that should autosave), 'view', 'text' (ask for text), 'cursor'.
   Input: pointer events (mouse, touch, pen). One finger/pen/mouse draws; two fingers pan + pinch-zoom;
   once a stylus is seen, single fingers pan (palm rejection). Hand tool, middle button or Space+drag pan; wheel zooms. */
(function () {
  'use strict';
  var B = {}, ev = {};
  var cv, g, W = 0, H = 0, dpr = 1, view = { x: 0, y: 0, z: 1 };
  var items = [], byId = {}, live = {}, cursors = {}, clr = 0;
  var tool = 'pen', shape = 'rect', color = 'ink', size = 4, bg = 'grid';
  var undo = [], redo = [], me = 'local', dirty = false, darkMode = true;
  var ptrs = {}, act = null, penSeen = false, space = false, hover = null;
  var INK_D = '#eef0f3', INK_L = '#15181d', BG_D = '#16191d', BG_L = '#ffffff';
  function on(n, f) { (ev[n] = ev[n] || []).push(f); }
  function emit(n, a, b) { (ev[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cmp(a, b) { return a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

  /* ---------- geometry ---------- */
  function shapePts(it) { // outline points for hit tests
    var p = it.pts, x0 = p[0], y0 = p[1], x1 = p[2], y1 = p[3];
    if (it.k === 'rect') return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];
    if (it.k === 'ell') {
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2, o = [];
      for (var i = 0; i <= 40; i++) { var a = i / 40 * Math.PI * 2; o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
      return o;
    }
    return p;
  }
  var mctx = document.createElement('canvas').getContext('2d');
  function textBox(it) {
    var lines = String(it.text || '').split('\n'), w = 0;
    mctx.font = '500 ' + it.fs + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    lines.forEach(function (l) { w = Math.max(w, mctx.measureText(l).width); });
    return [it.pts[0], it.pts[1], it.pts[0] + w, it.pts[1] + lines.length * it.fs * 1.25];
  }
  function bbox(it) {
    if (it._bb) return it._bb;
    var bb;
    if (it.k === 'text') bb = textBox(it);
    else {
      var p = it.pts, a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (var i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); b = Math.min(b, p[i + 1]); c = Math.max(c, p[i]); d = Math.max(d, p[i + 1]); }
      var m = it.w / 2 + (it.k === 'arrow' ? it.w * 3 + 8 : 0); bb = [a - m, b - m, c + m, d + m];
    }
    it._bb = bb; return bb;
  }
  function segDist(px, py, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l)) : 0;
    var x = x0 + t * dx - px, y = y0 + t * dy - py; return Math.sqrt(x * x + y * y);
  }
  function hit(it, x, y, r) {
    var bb = bbox(it);
    if (x < bb[0] - r || y < bb[1] - r || x > bb[2] + r || y > bb[3] + r) return false;
    if (it.k === 'text') return true;
    var p = shapePts(it), lim = r + it.w / 2;
    if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= lim;
    for (var i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= lim) return true;
    return false;
  }

  /* ---------- drawing ---------- */
  function ink(c, dark) { return c === 'ink' ? (dark ? INK_D : INK_L) : c; }
  function drawItem(ctx, it, dark) {
    var p = it.pts, c = ink(it.c, dark);
    if (!p || p.length < 2) return;
    ctx.save();
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = it.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (it.k === 'hl') ctx.globalAlpha = 0.35;
    if (it.k === 'pen' || it.k === 'hl') {
      if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0], p[1], it.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else {
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        for (var i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
        ctx.lineTo(p[p.length - 2], p[p.length - 1]); ctx.stroke();
      }
    } else if (it.k === 'line' || it.k === 'arrow') {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.stroke();
      if (it.k === 'arrow') {
        var a = Math.atan2(p[3] - p[1], p[2] - p[0]), hl = Math.min(Math.max(12, it.w * 4), Math.hypot(p[2] - p[0], p[3] - p[1]) * 0.6 || 12);
        ctx.beginPath(); ctx.moveTo(p[2] - hl * Math.cos(a - 0.45), p[3] - hl * Math.sin(a - 0.45)); ctx.lineTo(p[2], p[3]);
        ctx.lineTo(p[2] - hl * Math.cos(a + 0.45), p[3] - hl * Math.sin(a + 0.45)); ctx.stroke();
      }
    } else if (it.k === 'rect') {
      ctx.strokeRect(Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.abs(p[2] - p[0]), Math.abs(p[3] - p[1]));
    } else if (it.k === 'ell') {
      ctx.beginPath(); ctx.ellipse((p[0] + p[2]) / 2, (p[1] + p[3]) / 2, Math.abs(p[2] - p[0]) / 2, Math.abs(p[3] - p[1]) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (it.k === 'text') {
      ctx.font = '500 ' + it.fs + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; ctx.textBaseline = 'top';
      String(it.text || '').split('\n').forEach(function (l, i) { ctx.fillText(l, p[0], p[1] + i * it.fs * 1.25); });
    }
    ctx.restore();
  }
  function drawBg(ctx, w, h, v, kind, dark) { // screen space, v = view
    if (kind === 'plain') return;
    var s = 32 * v.z; while (s < 14) s *= 2;
    var ox = ((v.x % s) + s) % s, oy = ((v.y % s) + s) % s;
    ctx.save();
    if (kind === 'grid') {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var x = ox; x < w; x += s) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      for (var y = oy; y < h; y += s) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.stroke();
    } else {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.22)';
      for (var x2 = ox; x2 < w; x2 += s) for (var y2 = oy; y2 < h; y2 += s) ctx.fillRect(x2 - 1, y2 - 1, 2, 2);
    }
    ctx.restore();
  }
  function render() {
    dirty = false;
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = darkMode ? BG_D : BG_L; g.fillRect(0, 0, W, H);
    drawBg(g, W, H, view, bg, darkMode);
    g.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * view.x, dpr * view.y);
    var x0 = -view.x / view.z, y0 = -view.y / view.z, x1 = x0 + W / view.z, y1 = y0 + H / view.z;
    items.forEach(function (it) { var b = bbox(it); if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return; drawItem(g, it, darkMode); });
    Object.keys(live).forEach(function (k) { drawItem(g, live[k], darkMode); });
    if (act && act.it) drawItem(g, act.it, darkMode);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // others' cursors
    var now = Date.now();
    Object.keys(cursors).forEach(function (id) {
      var c = cursors[id]; if (now - c.t > 5000) return;
      var sx = c.x * view.z + view.x, sy = c.y * view.z + view.y;
      g.fillStyle = c.color; g.strokeStyle = darkMode ? '#000' : '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 12, sy + 5); g.lineTo(sx + 5, sy + 12); g.closePath(); g.stroke(); g.fill();
      g.font = '600 12px system-ui,sans-serif'; var tw = g.measureText(c.name).width;
      g.fillRect(sx + 12, sy + 13, tw + 10, 18); g.fillStyle = '#fff'; g.fillText(c.name, sx + 17, sy + 26);
    });
    if (hover && tool === 'eraser') {
      g.strokeStyle = darkMode ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.5)'; g.lineWidth = 1;
      g.beginPath(); g.arc(hover.x, hover.y, eraserR(), 0, Math.PI * 2); g.stroke();
    }
  }
  function redraw() { if (!dirty) { dirty = true; requestAnimationFrame(render); } }
  function resize() {
    var r = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); render();
  }

  /* ---------- model ---------- */
  function insert(it) {
    if (byId[it.id]) return false;
    delete it._bb; byId[it.id] = it;
    var i = items.length; while (i > 0 && cmp(items[i - 1], it) > 0) i--;
    items.splice(i, 0, it); return true;
  }
  function removeIds(ids) {
    var out = [];
    ids.forEach(function (id) { var it = byId[id]; if (!it) return; delete byId[id]; items.splice(items.indexOf(it), 1); out.push(it); });
    return out;
  }
  function clean(it) { var o = {}; for (var k in it) if (k.charAt(0) !== '_') o[k] = it[k]; return o; }
  function changed() { redraw(); emit('change'); }
  function commitLocal(it) {
    insert(it); undo.push({ a: 'add', its: [it] }); redo = [];
    emit('op', { k: 'add', its: [clean(it)] }); changed(); emit('stack');
  }

  /* ---------- input ---------- */
  function toWorld(cx, cy) { var r = cv.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z, sx: cx - r.left, sy: cy - r.top }; }
  function eraserR() { return Math.max(8, size * 3); } // screen px
  function curW() { return tool === 'hl' ? Math.max(12, size * 4) : size; }
  function begin(e) {
    var w = toWorld(e.clientX, e.clientY);
    if (tool === 'text') { act = { kind: 'text', x: w.x, y: w.y }; return; }
    if (tool === 'eraser') { act = { kind: 'erase', gone: [] }; eraseAt(w.x, w.y); return; }
    var k = tool === 'shape' ? shape : tool;
    var it = { id: uid(), by: me, ts: Date.now(), k: k, c: color, w: curW(), pts: k === 'pen' || k === 'hl' ? [w.x, w.y] : [w.x, w.y, w.x, w.y] };
    act = { kind: 'draw', it: it, sent: false };
    if (k === 'pen' || k === 'hl') { act.sent = true; emit('live', { k: 'lb', it: clean(it) }); }
    redraw();
  }
  function move(e) {
    if (!act) return;
    var evs = (act.kind === 'draw' && e.getCoalescedEvents) ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    evs.forEach(function (ce) {
      var w = toWorld(ce.clientX, ce.clientY), it = act.it;
      if (act.kind === 'erase') { eraseAt(w.x, w.y); return; }
      if (act.kind !== 'draw') return;
      if (it.k === 'pen' || it.k === 'hl') {
        var n = it.pts.length, dx = w.x - it.pts[n - 2], dy = w.y - it.pts[n - 1];
        if (dx * dx + dy * dy < Math.pow(0.9 / view.z, 2)) return;
        it.pts.push(w.x, w.y); emit('live', { k: 'lp', id: it.id, p: [w.x, w.y] });
      } else {
        var x = w.x, y = w.y, x0 = it.pts[0], y0 = it.pts[1];
        if (e.shiftKey) {
          if (it.k === 'rect' || it.k === 'ell') { var m = Math.max(Math.abs(x - x0), Math.abs(y - y0)); x = x0 + m * Math.sign(x - x0 || 1); y = y0 + m * Math.sign(y - y0 || 1); }
          else { var a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - x0, y - y0); x = x0 + l * Math.cos(a); y = y0 + l * Math.sin(a); }
        }
        it.pts[2] = x; it.pts[3] = y;
        if (!act.sent) { act.sent = true; emit('live', { k: 'lb', it: clean(it) }); } else emit('live', { k: 'ls', id: it.id, p: it.pts.slice() });
      }
    });
    redraw();
  }
  function end(cancel) {
    var a = act; act = null; if (!a) return;
    if (a.kind === 'draw') {
      var it = a.it, tiny = it.k !== 'pen' && it.k !== 'hl' && Math.hypot(it.pts[2] - it.pts[0], it.pts[3] - it.pts[1]) < 3 / view.z;
      if (cancel || tiny) { if (a.sent) emit('live', { k: 'lx', id: it.id }); redraw(); return; }
      emit('live', { k: 'le', it: clean(it) });
      commitLocal(it);
    } else if (a.kind === 'erase') {
      if (a.gone.length) { undo.push({ a: 'erase', its: a.gone }); redo = []; emit('stack'); }
    } else if (a.kind === 'text' && !cancel) emit('text', { x: a.x, y: a.y });
  }
  function eraseAt(x, y) {
    var r = eraserR() / view.z, ids = [];
    for (var i = items.length - 1; i >= 0; i--) if (hit(items[i], x, y, r)) ids.push(items[i].id);
    if (!ids.length) return;
    var gone = removeIds(ids); act.gone = act.gone.concat(gone);
    emit('op', { k: 'del', ids: ids }); changed();
  }
  function zoomAt(sx, sy, f) {
    var z = Math.max(0.1, Math.min(8, view.z * f)); f = z / view.z;
    view.x = sx - (sx - view.x) * f; view.y = sy - (sy - view.y) * f; view.z = z; redraw(); emit('view', view);
  }
  function pinchStart() {
    var ids = Object.keys(ptrs); if (ids.length < 2) return;
    var a = ptrs[ids[0]], b = ptrs[ids[1]];
    act = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: { x: view.x, y: view.y, z: view.z } };
  }
  function pinchMove() {
    var ids = Object.keys(ptrs); if (ids.length < 2) return;
    var a = ptrs[ids[0]], b = ptrs[ids[1]], r = cv.getBoundingClientRect();
    var d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, v = act.v;
    var z = Math.max(0.1, Math.min(8, v.z * d / act.d));
    var wx = (act.cx - r.left - v.x) / v.z, wy = (act.cy - r.top - v.y) / v.z;
    view.z = z; view.x = cx - r.left - wx * z; view.y = cy - r.top - wy * z; redraw(); emit('view', view);
  }
  function wire() {
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'pen') penSeen = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, type: e.pointerType };
      var n = Object.keys(ptrs).length;
      if (n === 2 && e.pointerType === 'touch') { // second finger: drop the stroke, pinch instead
        if (act && act.kind === 'draw') end(true);
        else if (act && act.kind === 'erase') end(false);
        pinchStart(); return;
      }
      if (n > 1) return;
      if (tool === 'hand' || e.button === 1 || space || (penSeen && e.pointerType === 'touch')) { act = { kind: 'pan', x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; cv.classList.add('panning'); return; }
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      begin(e);
    });
    cv.addEventListener('pointermove', function (e) {
      var w = toWorld(e.clientX, e.clientY);
      hover = { x: w.sx, y: w.sy }; emit('cursor', { x: w.x, y: w.y });
      if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
      if (!act) { if (tool === 'eraser') redraw(); return; }
      if (act.kind === 'pinch') { pinchMove(); return; }
      if (act.kind === 'pan') { view.x = act.vx + e.clientX - act.x; view.y = act.vy + e.clientY - act.y; redraw(); emit('view', view); return; }
      move(e);
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (!act) return;
      if (act.kind === 'pinch') { if (!Object.keys(ptrs).length) act = null; return; }
      if (act.kind === 'pan') { act = null; cv.classList.remove('panning'); return; }
      end(e.type === 'pointercancel');
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', function () { hover = null; if (tool === 'eraser') redraw(); });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = cv.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey) { view.x -= e.deltaY; view.y -= e.deltaX; redraw(); emit('view', view); return; }
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    addEventListener('keydown', function (e) { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { space = true; cv.classList.add('grab'); } });
    addEventListener('keyup', function (e) { if (e.code === 'Space') { space = false; cv.classList.remove('grab'); } });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else addEventListener('resize', resize);
  }

  /* ---------- public ---------- */
  B.init = function (canvas) { cv = canvas; g = cv.getContext('2d'); wire(); resize(); };
  B.on = on; B.redraw = redraw; B.drawItem = drawItem; B.drawBg = drawBg; B.bbox = bbox;
  B.colors = { INK_D: INK_D, INK_L: INK_L, BG_D: BG_D, BG_L: BG_L };
  B.setMe = function (id) { me = id; };
  B.setTool = function (t) { tool = t; cv.dataset.tool = t; redraw(); };
  B.setShape = function (s) { shape = s; };
  B.setColor = function (c) { color = c; };
  B.setSize = function (s) { size = s; };
  B.setBg = function (b) { bg = b; redraw(); };
  B.setDark = function (d) { darkMode = d; redraw(); };
  B.addText = function (x, y, text) {
    if (!text) return;
    commitLocal({ id: uid(), by: me, ts: Date.now(), k: 'text', c: color, w: 1, fs: 12 + size * 4, pts: [x, y], text: text });
  };
  B.items = function () { return items.map(clean); };
  B.count = function () { return items.length; };
  B.clr = function () { return clr; };
  B.canUndo = function () { return undo.length > 0; };
  B.canRedo = function () { return redo.length > 0; };
  B.undo = function () {
    var u = undo.pop(); if (!u) return;
    if (u.a === 'add') { var ids = u.its.map(function (i) { return i.id; }); removeIds(ids); emit('op', { k: 'del', ids: ids }); }
    else { var back = u.its.filter(insert); if (back.length) emit('op', { k: 'add', its: back.map(clean) }); }
    redo.push(u); changed(); emit('stack');
  };
  B.redo = function () {
    var u = redo.pop(); if (!u) return;
    if (u.a === 'add') { var back = u.its.filter(insert); if (back.length) emit('op', { k: 'add', its: back.map(clean) }); }
    else { var ids = u.its.map(function (i) { return i.id; }); removeIds(ids); emit('op', { k: 'del', ids: ids }); }
    undo.push(u); changed(); emit('stack');
  };
  B.clear = function (remote, t) {
    items = []; byId = {}; live = {}; undo = []; redo = []; clr = t || Date.now();
    if (!remote) emit('op', { k: 'clear', t: clr });
    changed(); emit('stack');
  };
  /* load a whole board (autosave or the lobby's state) */
  B.setAll = function (its, c) { items = []; byId = {}; live = {}; undo = []; redo = []; clr = c || 0; (its || []).forEach(function (it) { insert(it); }); changed(); emit('stack'); };
  B.has = function (id) { return !!byId[id]; };
  /* remote messages (already unwrapped) */
  B.apply = function (m, from) {
    if (!m || typeof m !== 'object') return;
    switch (m.k) {
      case 'lb': if (m.it && m.it.id) { live[m.it.id] = m.it; m.it._from = from; } break;
      case 'lp': if (live[m.id]) { Array.prototype.push.apply(live[m.id].pts, m.p || []); } break;
      case 'ls': if (live[m.id]) { live[m.id].pts = m.p; } break;
      case 'lx': delete live[m.id]; break;
      case 'le': delete live[m.it && m.it.id]; break;
      case 'add': (m.its || []).forEach(function (it) { if (it.ts > clr || !clr) insert(it); delete live[it.id]; }); emit('change'); break;
      case 'del': removeIds(m.ids || []); emit('change'); break;
      case 'clear': B.clear(true, m.t); return;
      case 'cur': if (cursors[from] || m.name) cursors[from] = { x: m.x, y: m.y, t: Date.now(), name: m.name || (cursors[from] && cursors[from].name) || '', color: m.color || (cursors[from] && cursors[from].color) || '#888' }; break;
      default: return;
    }
    redraw();
  };
  B.dropPeer = function (id) { delete cursors[id]; Object.keys(live).forEach(function (k) { if (live[k]._from === id) delete live[k]; }); redraw(); };
  B.view = function () { return view; };
  B.zoom = function (f) { zoomAt(W / 2, H / 2, f); };
  B.fit = function () {
    if (!items.length) { view.x = 0; view.y = 0; view.z = 1; redraw(); emit('view', view); return; }
    var a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    items.forEach(function (it) { var bb = bbox(it); a = Math.min(a, bb[0]); b = Math.min(b, bb[1]); c = Math.max(c, bb[2]); d = Math.max(d, bb[3]); });
    var pad = 40, z = Math.max(0.1, Math.min(2, Math.min((W - pad * 2 - 60) / Math.max(1, c - a), (H - pad * 2) / Math.max(1, d - b))));
    view.z = z; view.x = (W - 60) / 2 - (a + c) / 2 * z; view.y = H / 2 - (b + d) / 2 * z; redraw(); emit('view', view);
  };
  window.WBBoard = B;
})();
