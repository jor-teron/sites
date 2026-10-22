/*
 * PDF Tools — selecting and drag-to-reorder.
 * Mouse: click = select only this, Ctrl/⌘ = toggle, Shift = range from the last clicked page;
 *        press and move 6 px = drag. Touch: tap = toggle; long-press (~0.4 s) then move = drag.
 * Dragging a selected page moves every selected page; dragging another page moves just that one.
 */
PT.Select = (() => {
  const { S } = PT;
  const LONG = 400, SLOP_MOUSE = 6, SLOP_TOUCH = 10;
  let st = null;   // { id, x, y, type, timer, drag, ids, ghost, target, after, pid }
  let raf = 0;

  const idOf = (el) => { const c = el && el.closest && el.closest('.cell'); return c ? +c.dataset.id : null; };
  const index = (id) => S.pages.findIndex((p) => p.id === id);

  function click(id, e, touch) {
    if (touch) {
      if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      S.anchor = id;
    } else if (e.shiftKey && S.anchor != null && index(S.anchor) >= 0) {
      const a = index(S.anchor), b = index(id);
      if (!(e.ctrlKey || e.metaKey)) S.sel.clear();
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.sel.add(S.pages[i].id);
    } else if (e.ctrlKey || e.metaKey) {
      if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      S.anchor = id;
    } else {
      const only = S.sel.size === 1 && S.sel.has(id);
      S.sel.clear();
      if (!only) S.sel.add(id);
      S.anchor = id;
    }
    sync();
  }

  function sync() { PT.Thumbs.render(); PT.refresh(); }
  function all() { if (!S.doc) return; const every = S.sel.size === S.pages.length; S.sel = new Set(every ? [] : S.pages.map((p) => p.id)); sync(); }
  function none() { if (S.sel.size) { S.sel.clear(); sync(); } }

  function startDrag() {
    const id = st.id;
    if (!S.sel.has(id)) { S.sel.clear(); S.sel.add(id); S.anchor = id; sync(); }
    st.ids = S.pages.filter((p) => S.sel.has(p.id)).map((p) => p.id);
    st.drag = true;
    if (st.type === 'touch' && navigator.vibrate) { try { navigator.vibrate(15); } catch (_) { /* */ } }
    const g = document.createElement('div');
    g.className = 'ghost-drag';
    const p = S.pages[index(id)];
    const url = PT.Thumbs.url(p.src);
    g.innerHTML = (url ? '<img alt="" src="' + url + '"' + (p.rot ? ' style="transform:rotate(' + p.rot + 'deg)"' : '') + '>' : '') +
      (st.ids.length > 1 ? '<b>' + st.ids.length + '</b>' : '');
    document.body.appendChild(g);
    st.ghost = g;
    st.ids.forEach((i) => { const c = PT.Thumbs.cellOf(i); if (c) c.classList.add('dragging'); });
    placeGhost(st.x, st.y);
  }

  function placeGhost(x, y) {
    st.ghost.style.left = x + 'px'; st.ghost.style.top = y + 'px';
    const under = document.elementFromPoint(x, y);
    const id = idOf(under);
    mark(null);
    if (id == null) return;
    const c = PT.Thumbs.cellOf(id), r = c.getBoundingClientRect();
    st.target = id; st.after = x > r.left + r.width / 2;
    mark(c, st.after);
  }
  function mark(c, after) {
    document.querySelectorAll('.ins-before, .ins-after').forEach((x) => x.classList.remove('ins-before', 'ins-after'));
    if (!c) { if (st) st.target = null; return; }
    c.classList.add(after ? 'ins-after' : 'ins-before');
  }

  function autoscroll() {
    if (!st || !st.drag) return;
    const g = PT.$('grid'), r = g.getBoundingClientRect(), edge = 48;
    let d = 0;
    if (st.y < r.top + edge) d = -Math.ceil((r.top + edge - st.y) / 4);
    else if (st.y > r.bottom - edge) d = Math.ceil((st.y - (r.bottom - edge)) / 4);
    if (d) { g.scrollTop += d; placeGhost(st.x, st.y); }
    raf = requestAnimationFrame(autoscroll);
  }

  function end(commit) {
    if (!st) return;
    clearTimeout(st.timer);
    cancelAnimationFrame(raf);
    if (st.drag) {
      st.ghost.remove();
      document.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
      const t = st.target, after = st.after, ids = st.ids;
      mark(null);
      if (commit && t != null) PT.Edit.move(ids, index(t) + (after ? 1 : 0));
    }
    st = null;
  }

  function init() {
    const grid = PT.$('grid');
    grid.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const id = idOf(e.target);
      if (id == null) { if (e.pointerType === 'mouse' && !e.shiftKey && !e.ctrlKey && !e.metaKey) none(); return; }
      st = { id, x: e.clientX, y: e.clientY, type: e.pointerType, drag: false, pid: e.pointerId, moved: false };
      if (e.pointerType !== 'mouse') {
        st.timer = setTimeout(() => { if (st && !st.moved) { startDrag(); raf = requestAnimationFrame(autoscroll); } }, LONG);
      }
    });
    addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.pid) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) {
        const far = Math.hypot(dx, dy) > (st.type === 'mouse' ? SLOP_MOUSE : SLOP_TOUCH);
        if (!far) return;
        if (st.type === 'mouse') { st.x = e.clientX; st.y = e.clientY; startDrag(); raf = requestAnimationFrame(autoscroll); }
        else { st.moved = true; clearTimeout(st.timer); return; }   // a scroll, not a drag
      }
      st.x = e.clientX; st.y = e.clientY;
      placeGhost(st.x, st.y);
    });
    addEventListener('pointerup', (e) => {
      if (!st || e.pointerId !== st.pid) return;
      if (!st.drag && !st.moved) { const id = st.id, touch = st.type !== 'mouse'; end(false); click(id, e, touch); return; }
      end(true);
    });
    addEventListener('pointercancel', (e) => { if (st && e.pointerId === st.pid) end(false); });
    // While a touch drag is on, stop the grid from scrolling under the finger.
    grid.addEventListener('touchmove', (e) => { if (st && st.drag) e.preventDefault(); }, { passive: false });
    grid.addEventListener('contextmenu', (e) => { if (idOf(e.target) != null && e.pointerType !== 'mouse') e.preventDefault(); });
    grid.addEventListener('dragstart', (e) => e.preventDefault());
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && st) end(false); }, true);
  }
  return { init, all, none, dragging: () => !!(st && st.drag) };
})();
