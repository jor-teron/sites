/* Island Conquest — pointer, touch, and keyboard. Calls actions; does not change rules. */
(function (IC) {
  const canvas = IC.render.canvas;
  const down = new Set();
  const edges = [];
  let pid = null;
  let startX = 0;
  let startY = 0;
  let fromId = null;

  function session() { return IC.session; }

  function worldPos(e) {
    const rect = canvas.getBoundingClientRect();
    return IC.render.toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  function tap(x, y) {
    const s = session();
    if (!s || s.mode !== 'play' || !s.world) return;
    const hit = s.world.islandAt(x, y, IC.render.hitPad());
    if (!hit) { s.world.clearSelect(); return; }
    if (hit.owner === IC.config.owner.player) { s.world.toggleSelect(hit.id); return; }
    const ids = s.world.selectedIds();
    if (ids.length) s.world.send(ids, hit.id, s.ratio, IC.config.owner.player);
  }

  function drop(originId, x, y) {
    const s = session();
    if (!s || s.mode !== 'play' || !s.world) return;
    const hit = s.world.islandAt(x, y, IC.render.hitPad());
    if (!hit || hit.id === originId) return;
    const ids = s.world.selectedIds();
    let found = false;
    for (let i = 0; i < ids.length; i++) if (ids[i] === originId) found = true;
    if (!found) ids.push(originId);
    s.world.send(ids, hit.id, s.ratio, IC.config.owner.player);
  }

  function onKey(code) {
    const s = session();
    if (!s) return;
    const actions = IC.actions;
    if (code === 'Escape') {
      if (s.mode === 'play') actions.pause(); else actions.menu();
      return;
    }
    if (code === 'Enter') { actions.primary(); return; }
    if (s.mode === 'menu') {
      if (code === 'ArrowLeft') actions.cycleMap(-1);
      else if (code === 'ArrowRight') actions.cycleMap(1);
      else if (code === 'ArrowUp' || code === 'ArrowDown') actions.cycleDifficulty(code === 'ArrowDown' ? 1 : -1);
      else if (code === 'Space') actions.start();
      return;
    }
    if (code === 'KeyP') {
      if (s.mode === 'play') actions.pause();
      else if (s.mode === 'pause') actions.resume();
      return;
    }
    if (code === 'KeyR' && (s.mode === 'pause' || s.mode === 'win' || s.mode === 'lose')) {
      actions.restart();
      return;
    }
    if (s.mode !== 'play') {
      if (code === 'Space') actions.primary();
      return;
    }
    if (code === 'Digit1' || code === 'Numpad1') actions.setRatio(IC.config.ship.ratios[0]);
    else if (code === 'Digit2' || code === 'Numpad2') actions.setRatio(IC.config.ship.ratios[1]);
    else if (code === 'Digit3' || code === 'Numpad3') actions.setRatio(IC.config.ship.ratios[2]);
    else if (code === 'KeyA') s.world.selectAll();
    else if (code === 'KeyC') s.world.clearSelect();
    else if (code === 'Space') {
      s.reticle.on = true;
      tap(s.reticle.x, s.reticle.y);
    }
  }

  function update(dt) {
    const s = session();
    if (!s) { edges.length = 0; return; }
    if (s.mode === 'play') {
      let mx = 0;
      let my = 0;
      if (down.has('ArrowLeft')) mx -= 1;
      if (down.has('ArrowRight')) mx += 1;
      if (down.has('ArrowUp')) my -= 1;
      if (down.has('ArrowDown')) my += 1;
      if (mx || my) {
        s.reticle.on = true;
        const step = IC.config.input.reticle * dt / Math.hypot(mx, my);
        s.reticle.x = Math.max(0, Math.min(IC.config.world, s.reticle.x + mx * step));
        s.reticle.y = Math.max(0, Math.min(IC.config.world, s.reticle.y + my * step));
      }
    }
    while (edges.length) onKey(edges.shift());
  }

  canvas.addEventListener('pointerdown', function (e) {
    const s = session();
    if (!s || s.mode !== 'play' || pid !== null) return;
    pid = e.pointerId;
    try { canvas.setPointerCapture(pid); } catch (err) { /* already gone */ }
    const w = worldPos(e);
    startX = e.clientX;
    startY = e.clientY;
    const hit = s.world.islandAt(w.x, w.y, IC.render.hitPad());
    fromId = hit && hit.owner === IC.config.owner.player ? hit.id : null;
    s.drag = fromId ? { fromId: fromId, x: w.x, y: w.y } : null;
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== pid) return;
    const s = session();
    if (!s || !s.drag) return;
    const w = worldPos(e);
    s.drag.x = w.x;
    s.drag.y = w.y;
    e.preventDefault();
  });

  function endPointer(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    const s = session();
    const dragging = s && s.drag;
    if (s) s.drag = null;
    if (!s || s.mode !== 'play') return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    const w = worldPos(e);
    if (moved < IC.config.input.dragPx || !fromId) {
      if (moved < IC.config.input.dragPx) tap(w.x, w.y);
    } else if (dragging) drop(fromId, w.x, w.y);
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    /* Enter and Space also activate a focused button; keep a single handler. */
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
    }
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    down.add(e.code);
    edges.push(e.code);
  });
  window.addEventListener('keyup', function (e) { down.delete(e.code); });
  window.addEventListener('blur', function () {
    down.clear();
    pid = null;
    const s = session();
    if (s) s.drag = null;
  });

  /* Block scroll, pinch, and gesture zoom while the match is on screen. */
  document.addEventListener('touchmove', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey && e.cancelable) e.preventDefault();
  }, { passive: false });

  IC.input = { update: update, tap: tap };
})(window.IslandConquest);
