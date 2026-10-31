/** AOE RTS - mouse, touch, keys, camera (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// CAMERA
// ============================================================================
function updateCameraKeys(dt) {
    let vx = 0, vy = 0;
    if (pickerOpen()) return;
    if (ctrlHeld) { /* Ctrl+A etc: no pan */ } else if (keys.A.isDown || keys.LEFT.isDown) vx--; if (keys.D.isDown || keys.RIGHT.isDown) vx++;
    if (!ctrlHeld) { if (keys.W.isDown || keys.UP.isDown) vy--; if (keys.S.isDown || keys.DOWN.isDown) vy++; }
    // R4b: no edge scrolling (it panned the map while reaching for buttons); pan with drag, keys or minimap
    if (vx || vy) { cam.scrollX += vx * PAN_SPEED * dt / cam.zoom; cam.scrollY += vy * PAN_SPEED * dt / cam.zoom; }
}
function onWheel(pointer, objs, dx, dy) {
    const z1 = cam.zoom, z2 = Phaser.Math.Clamp(z1 * Math.pow(1.0015, -dy), minZoom(), ZOOM_MAX);
    if (z2 === z1) return;
    const hw = cam.width / 2, hh = cam.height / 2;
    const wx = cam.scrollX + hw + (pointer.x - hw) / z1, wy = cam.scrollY + hh + (pointer.y - hh) / z1;
    cam.setZoom(z2);
    cam.scrollX = wx - hw - (pointer.x - hw) / z2; cam.scrollY = wy - hh - (pointer.y - hh) / z2;
}
/** World rect currently visible (+margin) */
function viewRect(m) {
    const hw = cam.width / 2, hh = cam.height / 2, z = cam.zoom;
    return { x0: cam.scrollX + hw - hw / z - m, y0: cam.scrollY + hh - hh / z - m, x1: cam.scrollX + hw + hw / z + m, y1: cam.scrollY + hh + hh / z + m };
}

// ============================================================================
// INPUT
// ============================================================================
function villagerAt(px, py) {
    let best = null, bd = Infinity;   // villager body box ~40x110 above the feet; front-most (lowest y) wins ties
    villagers.forEach(v => { if (v.owner || Math.abs(px - v.x) > 22 || py > v.y + 6 || py < v.y - 104) return; const d = Math.abs(px - v.x) + Math.abs(py - (v.y - 50)) * 0.3 - v.y * 0.01; if (d < bd) { bd = d; best = v; } });
    return best;
}
function deerAt(px, py) { let best = null, bd = Infinity; deer.forEach(d => { if (Math.abs(px - d.x) > 40 || py > d.y + 12 || py < d.y - 70) return; const k = Math.abs(px - d.x) + Math.abs(py - d.y + 30); if (k < bd) { bd = k; best = d; } }); return best; }
function deselectAll() { villagers.forEach(u => u.selected = false); townCenter.selected = false; }
function onPointerDown(pointer) {
    const px = pointer.worldX, py = pointer.worldY;
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        if (placing) { placing = null; flash('Placement cancelled'); panDrag = null; return; }
        panDrag = { x: pointer.x, y: pointer.y, sx: cam.scrollX, sy: cam.scrollY, moved: false, right: pointer.rightButtonDown(), wx: px, wy: py };
        return;
    }
    Sfx.play('tap', 0.05);
    if (placing === 'house') { placeHouse(screenToTile(px, py)); return; }
    dragSel = { sx: px, sy: py, ex: px, ey: py, x: pointer.x, y: pointer.y, active: false, shift: pointer.event.shiftKey };
}
function onPointerMove(pointer) {
    hoverTile = screenToTile(pointer.worldX, pointer.worldY);
    if (panDrag) {
        const dx = pointer.x - panDrag.x, dy = pointer.y - panDrag.y;
        if (Math.hypot(dx, dy) > 6) panDrag.moved = true;
        if (panDrag.moved) { cam.scrollX = panDrag.sx - dx / cam.zoom; cam.scrollY = panDrag.sy - dy / cam.zoom; }
    } else if (dragSel) {
        dragSel.ex = pointer.worldX; dragSel.ey = pointer.worldY;
        if (Math.hypot(pointer.x - dragSel.x, pointer.y - dragSel.y) > 6) dragSel.active = true;
    }
}
function onPointerUp(pointer) {
    if (panDrag) {
        const p = panDrag; panDrag = null;
        if (!p.moved && p.right) rightClick(p.wx, p.wy);
        return;
    }
    if (!dragSel) return;
    const d = dragSel; dragSel = null;
    if (d.active) {
        const x0 = Math.min(d.sx, d.ex), x1 = Math.max(d.sx, d.ex), y0 = Math.min(d.sy, d.ey), y1 = Math.max(d.sy, d.ey);
        const inside = villagers.filter(v => !v.owner && v.x >= x0 && v.x <= x1 && v.y - 50 >= y0 - 30 && v.y - 50 <= y1 + 30);
        if (!d.shift) deselectAll();
        townCenter.selected = false;
        inside.forEach(v => v.selected = true);
        return;
    }
    leftClick(d.sx, d.sy, d.shift);
}
function leftClick(px, py, shift) {
    const v = villagerAt(px, py);
    if (v) {
        townCenter.selected = false;
        if (shift) v.selected = !v.selected; else { deselectAll(); v.selected = true; }
        return;
    }
    const t = screenToTile(px, py), cell = inMap(t.x, t.y) && mapData[t.y][t.x];
    const tcC = tileCenter(townCenter.x + 0.5, townCenter.y + 0.5);
    const onTC = townCenter.owner === 'p' && ((cell && cell.kind === 'tc' && !cell.tc) || (Math.abs(px - tcC.x) < 110 && py > tcC.y - 250 && py < tcC.y + 40));
    if (onTC && !shift) { deselectAll(); townCenter.selected = true; return; }
    if (!shift) deselectAll();     // empty ground / resource: deselect
}
/** AoE2-style right-click order for the selection */
function rightClick(px, py) {
    const sel = villagers.filter(u => u.selected);
    if (!sel.length) return;
    const t = screenToTile(px, py);
    if (!inMap(t.x, t.y)) return;
    const cell = mapData[t.y][t.x];
    Sfx.play('tap', 0.05);
    const dr = deerAt(px, py);
    if (dr) { sel.forEach(u => orderHunt(u, dr)); return; }
    if (cell && RES_TYPES[cell.kind]) sel.forEach(u => orderGather(u, t.x, t.y));
    else if (cell && cell.kind === 'tc') sel.forEach((u, i) => { if (u.carry > 0) u.state = 'returning'; else orderMove(u, t.x, t.y + 2, i); });
    else if (cell && cell.kind === 'house') { if (!cell.house.done) sel.forEach(u => orderBuild(u, cell.house)); }
    else sel.forEach((u, i) => orderMove(u, t.x, t.y, i));
}

/** Map picker open or a text box focused: game keys are ignored */
function pickerOpen() { const a = document.activeElement; return document.getElementById('title-overlay').style.display === 'flex' || document.getElementById('confirm-overlay').style.display === 'flex' || !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')); }
window.addEventListener('keydown', e => {
    if (pickerOpen()) return;
    if (e.key === 'p' || e.key === 'P') setPaused(!paused);
    else if (e.key === '+' || e.key === '=') setSpeed(speed + 1);
    else if (e.key === '-' || e.key === '_') setSpeed(speed - 1);
    else if (e.key === 'Escape') { if (placing) { placing = null; flash('Placement cancelled'); } else deselectAll(); }
    else if (e.key === ' ') { e.preventDefault(); if (cam) centerOnTC(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); townCenter.selected = false; villagers.forEach(u => u.selected = !u.owner); }
});
