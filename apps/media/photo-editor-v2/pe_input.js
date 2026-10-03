/*
 * Photo Editor v2 — pe_input.js
 * Pointer events on the photo (finger, pen, mouse): drag to pan, two-finger pinch to
 * zoom + pan, double-tap / double-click to zoom, mouse wheel to zoom, crop-box dragging.
 * Keyboard: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Ctrl+S, Ctrl+O, R / Shift+R, C, H, V, A,
 * 0 (reset zoom), + / -, Enter (apply crop), Esc (cancel).
 */
(function (PE) {
  'use strict';

  const I = PE.input = {};
  const pts = new Map();
  let mode = 'none', last = null, pinch = null, tap = null, lastTap = 0, lastTapPos = null;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  I.init = () => {
    const st = PE.view.stage;
    st.addEventListener('pointerdown', down);
    st.addEventListener('pointermove', move);
    st.addEventListener('pointerup', up);
    st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    document.addEventListener('contextmenu', (e) => { if (e.target.closest('#stage')) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());   // iOS page zoom
  };

  function pos(e) {
    const r = PE.view.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e) {
    if (e.target.closest('button, #empty')) return;
    if (!PE.state.photo) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    PE.ui.closePopovers();
    try { PE.view.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = pos(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      tap = { id: e.pointerId, x: p.x, y: p.y, t: performance.now(), moved: false };
      if (PE.crop.active) mode = PE.crop.down(p.x, p.y) ? 'crop' : 'none';
      else { mode = 'pan'; last = p; }
    } else if (pts.size === 2) {
      tap = null;
      if (mode === 'crop') PE.crop.abortDrag();       // second finger: undo the half-done crop drag
      if (PE.crop.active) { mode = 'none'; }
      else {
        const v = Array.from(pts.values());
        pinch = { d: dist(v[0], v[1]), m: mid(v[0], v[1]) };
        mode = 'pinch';
      }
    } else { mode = 'none'; }
    e.preventDefault();
  }

  function move(e) {
    const p = pos(e);
    if (!pts.has(e.pointerId)) {
      if (PE.crop.active && e.pointerType === 'mouse') PE.view.stage.style.cursor = PE.crop.cursor(p.x, p.y);
      return;
    }
    pts.set(e.pointerId, p);
    if (tap && tap.id === e.pointerId && Math.hypot(p.x - tap.x, p.y - tap.y) > 8) tap.moved = true;
    if (mode === 'crop') PE.crop.move(p.x, p.y);
    else if (mode === 'pan') { PE.view.panBy(p.x - last.x, p.y - last.y); last = p; }
    else if (mode === 'pinch' && pts.size >= 2) {
      const v = Array.from(pts.values());
      const d = dist(v[0], v[1]), m = mid(v[0], v[1]);
      if (pinch.d > 0) PE.view.zoomAt(d / pinch.d, m.x, m.y);
      PE.view.panBy(m.x - pinch.m.x, m.y - pinch.m.y);
      pinch = { d: d, m: m };
    }
  }

  function up(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (mode === 'crop') PE.crop.up();
    if (tap && tap.id === e.pointerId && !tap.moved && performance.now() - tap.t < 300 && !PE.crop.active) {
      const now = performance.now();
      if (now - lastTap < 320 && lastTapPos && Math.hypot(tap.x - lastTapPos.x, tap.y - lastTapPos.y) < 30) {
        PE.view.toggleZoom(tap.x, tap.y); lastTap = 0;
      } else { lastTap = now; lastTapPos = { x: tap.x, y: tap.y }; }
    }
    tap = null;
    // after a pinch the remaining finger is ignored until every finger is lifted (no jump)
    if (pts.size === 0 || mode === 'pinch') mode = 'none';
  }

  function wheel(e) {
    if (!PE.state.photo || PE.crop.active) return;
    e.preventDefault();
    const p = pos(e);
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    PE.view.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), p.x, p.y);
  }

  function key(e) {
    const K = PE.config.keys, t = e.target, ui = PE.ui;
    if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = (e.key || '').toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === K.undo && !e.shiftKey) ui.act('undo');
      else if (k === K.redo || (k === K.undo && e.shiftKey)) ui.act('redo');
      else if (k === K.save) ui.act('saveDefault');
      else if (k === K.open) ui.act('open');
      else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;
    if (t && t.type === 'range' && /^(arrow|home|end|page)/.test(k)) return;   // let the slider use its keys
    const cx = PE.view.cw / 2, cy = PE.view.ch / 2;
    switch (k) {
      case K.rotate: ui.act(e.shiftKey ? 'rotl' : 'rotr'); break;
      case K.crop: ui.act('crop'); break;
      case K.resetZoom: ui.act('resetZoom'); break;
      case K.flipH: ui.act('fliph'); break;
      case K.flipV: ui.act('flipv'); break;
      case K.adjust: ui.act('adjust'); break;
      case '+': case '=': PE.view.zoomAt(1.25, cx, cy); break;
      case '-': case '_': PE.view.zoomAt(0.8, cx, cy); break;
      case 'escape': ui.act('cancel'); break;
      case 'enter': if (PE.crop.active) ui.act('cropApply'); else return; break;
      default: return;
    }
    e.preventDefault();
  }
})(window.PE);
