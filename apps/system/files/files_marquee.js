/*
 * H124: drag-to-select box in Files (apps/system/files/files_marquee.js), loaded after files_view.js.
 * Mouse / pen only (touch keeps H123's long-press): press the left button on blank space in the folder
 * (#list, grid or list view) and drag → a see-through accent box (.marquee, files.css); every item it
 * touches is selected live (FX.view.paintSel, so the H107 status bar counts as you drag).
 * Ctrl / Cmd held at the start = toggle the touched items against the old selection; Shift = add to it.
 * Near the top / bottom edge the folder scrolls; the box lives in content coordinates, so it keeps
 * growing past what was on screen. Escape while dragging = put the old selection back.
 * Under 4 px of movement it is a plain click (files_view.js: click on blank space clears the selection).
 * A press on an item keeps the native drag-move; right-click (Terminal menu, H121) is untouched.
 */
(function () {
  'use strict';
  const { $, st } = FX;
  const list = $('list');
  const MIN = 4, EDGE = 36, SPEED = 18;
  let m = null, eatClick = false;   // m: the drag in progress

  // where a pointer is, in the list's content box (scrolls with the items)
  function local(cx, cy) {
    const r = list.getBoundingClientRect();
    return { x: cx - r.left - list.clientLeft + list.scrollLeft, y: cy - r.top - list.clientTop + list.scrollTop };
  }
  function blank(e) {
    if (e.button !== 0 || e.pointerType === 'touch') return false;
    const t = e.target;
    if (!(t instanceof Element) || t.closest('.item, .lhead, button, a, input, select, .empty-box')) return false;
    if (!list.querySelector('.item')) return false;
    const r = list.getBoundingClientRect();
    if (e.clientX >= r.left + list.clientLeft + list.clientWidth) return false;   // the scrollbar
    return true;
  }

  function update() {
    if (!m) return;
    const p = local(m.cx, m.cy);
    const x1 = Math.min(m.x0, p.x), y1 = Math.min(m.y0, p.y), x2 = Math.max(m.x0, p.x), y2 = Math.max(m.y0, p.y);
    if (!m.on) {
      if (Math.abs(p.x - m.x0) < MIN && Math.abs(p.y - m.y0) < MIN) return;
      m.on = true;
      m.box = document.createElement('div');
      m.box.className = 'marquee';
      m.box.setAttribute('aria-hidden', 'true');
      list.appendChild(m.box);
      list.classList.add('marqueeing');
    }
    if (!m.box.isConnected) list.appendChild(m.box);   // a re-render (thumbs, reload) replaced the children
    // keep the box inside the scrollable content
    const W = Math.max(list.scrollWidth, list.clientWidth), H = Math.max(list.scrollHeight, list.clientHeight);
    const bx = Math.max(0, x1), by = Math.max(0, y1), bw = Math.min(W, x2) - bx, bh = Math.min(H, y2) - by;
    Object.assign(m.box.style, { left: bx + 'px', top: by + 'px', width: Math.max(0, bw) + 'px', height: Math.max(0, bh) + 'px' });
    // which items does it touch?
    const lr = list.getBoundingClientRect();
    const ox = lr.left + list.clientLeft - list.scrollLeft, oy = lr.top + list.clientTop - list.scrollTop;
    const hit = new Set();
    list.querySelectorAll('.item').forEach((it) => {
      const r = it.getBoundingClientRect();
      const ix1 = r.left - ox, iy1 = r.top - oy, ix2 = r.right - ox, iy2 = r.bottom - oy;
      if (ix1 < x2 && ix2 > x1 && iy1 < y2 && iy2 > y1) hit.add(it.dataset.name);
    });
    st.sel.clear();
    if (m.mode === 'toggle') {
      m.base.forEach((n) => { if (!hit.has(n)) st.sel.add(n); });
      hit.forEach((n) => { if (!m.base.has(n)) st.sel.add(n); });
    } else {
      if (m.mode === 'add') m.base.forEach((n) => st.sel.add(n));
      hit.forEach((n) => st.sel.add(n));
    }
    if (hit.size && !m.anchorSet) { st.anchor = Array.from(hit)[0]; m.anchorSet = true; }
    FX.view.paintSel();
  }

  // edge auto-scroll while the button is held
  function tick() {
    if (!m) return;
    m.raf = requestAnimationFrame(tick);
    if (!m.on) return;
    const r = list.getBoundingClientRect();
    let dy = 0;
    if (m.cy < r.top + EDGE) dy = -Math.ceil(SPEED * Math.min(1, (r.top + EDGE - m.cy) / EDGE));
    else if (m.cy > r.bottom - EDGE) dy = Math.ceil(SPEED * Math.min(1, (m.cy - (r.bottom - EDGE)) / EDGE));
    if (!dy) return;
    const before = list.scrollTop;
    list.scrollTop = before + dy;
    if (list.scrollTop !== before) update();
  }

  function end(cancel) {
    if (!m) return;
    const was = m;
    m = null;
    cancelAnimationFrame(was.raf);
    try { list.releasePointerCapture(was.id); } catch (_) { /* gone */ }
    document.removeEventListener('keydown', onKey, true);
    if (was.box) was.box.remove();
    list.classList.remove('marqueeing');
    if (was.on) {
      eatClick = true;   // the click after a drag must not clear the new selection
      setTimeout(() => { eatClick = false; }, 0);
      if (cancel) { st.sel.clear(); was.base.forEach((n) => st.sel.add(n)); FX.view.paintSel(); }
    }
  }
  function onKey(e) { if (e.key === 'Escape' && m) { e.preventDefault(); e.stopPropagation(); end(true); } }

  list.addEventListener('pointerdown', (e) => {
    if (m || !blank(e)) return;
    const p = local(e.clientX, e.clientY);
    const mode = (e.ctrlKey || e.metaKey) ? 'toggle' : e.shiftKey ? 'add' : 'new';
    m = { id: e.pointerId, x0: p.x, y0: p.y, cx: e.clientX, cy: e.clientY, mode, base: new Set(st.sel), on: false, box: null, raf: 0 };
    try { list.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    document.addEventListener('keydown', onKey, true);
    m.raf = requestAnimationFrame(tick);
  });
  // no text selection / focus jump while starting a box on blank space
  list.addEventListener('mousedown', (e) => { if (m && e.button === 0) { e.preventDefault(); list.focus({ preventScroll: true }); } });
  list.addEventListener('pointermove', (e) => {
    if (!m || e.pointerId !== m.id) return;
    m.cx = e.clientX; m.cy = e.clientY;
    if (!(e.buttons & 1)) { end(false); return; }
    update();
  });
  list.addEventListener('pointerup', (e) => { if (m && e.pointerId === m.id) { m.cx = e.clientX; m.cy = e.clientY; update(); end(false); } });
  list.addEventListener('pointercancel', (e) => { if (m && e.pointerId === m.id) end(true); });
  list.addEventListener('lostpointercapture', (e) => { if (m && e.pointerId === m.id) end(false); });
  list.addEventListener('click', (e) => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('blur', () => end(false));

  FX.marquee = { active: () => !!(m && m.on), cancel: () => end(true) };
})();
