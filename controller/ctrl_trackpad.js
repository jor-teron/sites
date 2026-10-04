/*
 * Gamepad Controller — Trackpad board (Keyboard & Mouse → Trackpad).
 * Registered like the keyboards: CTRL_KB.register('trackpad', build). Sends over the normal
 * hub link (kit.api.send); the hub draws the pointer and clicks (hub/hub_pointer.js):
 *   one finger drag      {t:'ptr', dx, dy}    batched once per animation frame (~60 Hz)
 *   tap                  {t:'tap', b:0}       left click
 *   two-finger tap       {t:'tap', b:2}       right click (contextmenu)
 *   two-finger drag      {t:'wheel', dx, dy}  scroll (finger movement; the hub scales it)
 *   Left / Middle / Right {t:'mb', b, s:1|0}  held while pressed
 *   Hold-drag toggle     {t:'mb', b:0, s:1} … moves … {t:'mb', b:0, s:0}
 * Settings: CONTROLLER_CONFIG.trackpad (speed / acceleration / scroll speed are hub settings).
 */
(function () {
  'use strict';
  if (!window.CTRL_KB) return;

  CTRL_KB.register('trackpad', function build(host, kit) {
    const CFG = CONTROLLER_CONFIG;
    const TC = CFG.trackpad || {};
    const TXT = CFG.text;
    const M = CFG.messages;
    const api = kit.api;
    const el = kit.el;
    const dec = Math.pow(10, TC.decimals == null ? 1 : TC.decimals);
    const r = (v) => Math.round(v * dec) / dec;

    const root = el('div', 'kb tp');
    const surface = el('div', 'tp-surface');
    surface.appendChild(el('div', 'tp-hint', null, TXT.tpHint));
    const barEl = el('div', 'tp-bar');
    const btnL = el('button', 'kk tp-btn', { mb: '0' }, TXT.tpLeft);
    const btnM = el('button', 'kk tp-btn mid', { mb: '1' }, TXT.tpMiddle);
    const btnR = el('button', 'kk tp-btn', { mb: '2' }, TXT.tpRight);
    const dragBtn = el('button', 'kk tp-btn tp-drag', null, '✋ ' + TXT.tpDrag);
    barEl.append(btnL, btnM, btnR, dragBtn);
    root.append(surface, barEl);
    host.appendChild(root);

    /* ---------- batched sending ---------- */
    const pend = { dx: 0, dy: 0, wx: 0, wy: 0 };
    let raf = 0;
    function flush() {
      raf = 0;
      if (pend.dx || pend.dy) {
        const dx = r(pend.dx), dy = r(pend.dy);
        if (dx || dy) api.send({ t: M.ptr, dx: dx, dy: dy });
        pend.dx -= dx; pend.dy -= dy;
      }
      if (pend.wx || pend.wy) {
        const wx = r(pend.wx), wy = r(pend.wy);
        if (wx || wy) api.send({ t: M.wheel, dx: wx, dy: wy });
        pend.wx -= wx; pend.wy -= wy;
      }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(flush); }

    /* ---------- surface gestures ---------- */
    const pts = new Map();     // pointerId -> {x, y}
    let g = null;              // gesture: { t0, moved, max }

    function centroid() {
      let x = 0, y = 0;
      for (const p of pts.values()) { x += p.x; y += p.y; }
      return { x: x / pts.size, y: y / pts.size };
    }

    surface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      api.firstTouch();
      try { surface.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g) g = { t0: performance.now(), moved: 0, max: 0 };
      g.max = Math.max(g.max, pts.size);
      g.c = centroid();
      surface.classList.add('touching');
    });
    surface.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !g) return;
      e.preventDefault();
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1 && g.max === 1) {
        g.moved += Math.abs(dx) + Math.abs(dy);
        pend.dx += dx; pend.dy += dy;
        schedule();
      } else if (pts.size >= 2) {
        const c = centroid();
        const cdx = c.x - g.c.x, cdy = c.y - g.c.y;
        g.c = c;
        g.moved += Math.abs(cdx) + Math.abs(cdy);
        pend.wx += cdx; pend.wy += cdy;
        schedule();
      }
    });
    function end(e, cancelled) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size) { g.c = centroid(); return; }
      surface.classList.remove('touching');
      const st = g;
      g = null;
      if (cancelled || !st) return;
      const quick = performance.now() - st.t0 <= (TC.tapMs || 250) * (st.max > 1 ? 1.4 : 1);
      if (quick && st.moved <= (TC.tapSlopPx || 10)) {
        flush();
        api.send({ t: M.tap, b: st.max > 1 ? 2 : 0 });
        api.vibrate(TC.hapticMs || 0);
      }
    }
    surface.addEventListener('pointerup', (e) => end(e, false));
    surface.addEventListener('pointercancel', (e) => end(e, true));

    /* ---------- bottom bar ---------- */
    const held = new Set();
    let dragOn = false;
    function mb(b, s) { flush(); api.send({ t: M.mb, b: b, s: s ? 1 : 0 }); }
    [btnL, btnM, btnR].forEach((b) => {
      const n = Number(b.dataset.mb);
      let pid = null;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        api.firstTouch();
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (pid != null) return;
        pid = e.pointerId;
        b.classList.add('active');
        if (n === 0 && dragOn) return;          // already held by the drag lock
        held.add(n);
        mb(n, 1);
        api.vibrate(TC.hapticMs || 0);
      });
      const up = (e) => {
        if (e.pointerId !== pid) return;
        pid = null;
        b.classList.remove('active');
        if (!held.has(n)) return;
        held.delete(n);
        mb(n, 0);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
    function setDrag(on) {
      if (on === dragOn) return;
      dragOn = on;
      dragBtn.classList.toggle('on', on);
      dragBtn.textContent = '✋ ' + (on ? TXT.tpDragOn : TXT.tpDrag);
      if (!held.has(0)) mb(0, on);
    }
    dragBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      api.firstTouch();
      setDrag(!dragOn);
      api.vibrate(TC.hapticMs || 0);
    });

    /** Mode switch / blur / disconnect: let go of every button. */
    function release() {
      pts.clear();
      g = null;
      surface.classList.remove('touching');
      flush();
      for (const n of held) mb(n, 0);
      held.clear();
      [btnL, btnM, btnR].forEach((b) => b.classList.remove('active'));
      if (dragOn) setDrag(false);
    }

    return { el: root, release: release };
  });
})();
