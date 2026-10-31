/** AOE RTS - HUD: pause, speed, minimap, command bar, mute, map picker (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// PAUSE + KEYS
// ============================================================================
const pauseBtn = document.getElementById('pause-btn'), pauseOv = document.getElementById('pause-overlay');
function setPaused(p) {
    if (!p && document.getElementById('title-overlay').style.display === 'flex') return;
    if (p && !paused) writeSave();
    paused = p; pauseBtn.textContent = p ? '▶' : '⏸'; pauseOv.style.display = p ? 'flex' : 'none';
}
pauseBtn.addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(!paused); });
document.getElementById('resume-btn').addEventListener('pointerdown', e => { e.stopPropagation(); setPaused(false); });
const speedBtn = document.getElementById('speed-btn');
function setSpeed(n) { speed = Math.max(1, Math.min(5, n)); speedBtn.textContent = speed + 'x'; document.getElementById('pause-speed').textContent = 'Speed ' + speed + 'x'; }
speedBtn.addEventListener('pointerdown', e => { e.stopPropagation(); setSpeed(speed >= 5 ? 1 : speed + 1); });
setSpeed(1);

// ============================================================================
// MINIMAP (DOM canvas, ~4 refreshes / s + camera frame)
// ============================================================================
let mm = null, mmCtx = null, mmBase = null, mmScale = 1, mmNext = 0, mmDrag = false;
function initMinimap() {
    mm = document.getElementById('minimap');
    mmScale = MINIMAP_W / WORLD_W;
    mm.width = MINIMAP_W; mm.height = Math.round(WORLD_H * mmScale);
    mmCtx = mm.getContext('2d', { willReadFrequently: true }); // CPU canvas: avoids a GPU layer ghost seen in Chromium
    mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height;
    const b = mmBase.getContext('2d'), s = mmScale;
    b.fillStyle = '#1a2a16'; b.fillRect(0, 0, mm.width, mm.height);
    const a = tileCenter(0, 0), r = tileCenter(MAP_SIZE - 1, 0), d = tileCenter(MAP_SIZE - 1, MAP_SIZE - 1), l = tileCenter(0, MAP_SIZE - 1);
    b.fillStyle = '#4a7d3a'; b.beginPath();
    b.moveTo(a.x * s, (a.y - 16) * s); b.lineTo((r.x + 32) * s, r.y * s); b.lineTo(d.x * s, (d.y + 16) * s); b.lineTo((l.x - 32) * s, l.y * s); b.closePath(); b.fill();
    const M = TerrainArt.MINI, GM = [null, M.lush, M.dry, M.dirt, M.sand];
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const i = y * MAP_SIZE + x;   // R2b: water + terrain
        const fill = water[i] ? '#3a78c8' : mount[i] ? M.mount : rock[i] ? M.rock : ford[i] ? M.ford : GM[ground[i]];
        const layers = [fill, !water[i] && !rock[i] && hill[i] ? M.hill : null];
        layers.forEach(f => { if (!f) return; const p = tileCenter(x, y), hw = TILE_WIDTH / 2 * s + 0.4, hh = TILE_HEIGHT / 2 * s + 0.4; b.fillStyle = f;
            b.beginPath(); b.moveTo(p.x * s, p.y * s - hh); b.lineTo(p.x * s + hw, p.y * s); b.lineTo(p.x * s, p.y * s + hh); b.lineTo(p.x * s - hw, p.y * s); b.closePath(); b.fill(); }); }
    const move = e => { const rc = mm.getBoundingClientRect(); cam.centerOn((e.clientX - rc.left) / rc.width * WORLD_W, (e.clientY - rc.top) / rc.height * WORLD_H); };
    mm.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return; mmDrag = true; mm.setPointerCapture(e.pointerId); move(e); });
    mm.addEventListener('pointermove', e => { if (mmDrag) move(e); });
    mm.addEventListener('pointerup', () => { mmDrag = false; });
    mm.addEventListener('contextmenu', e => e.preventDefault());
}
const MM_COL = { fish: '#9ad8ff', carcass: '#6a3a1a', tree: '#1d4a1a', berry: '#d04a8a', gold: '#f0d040', stone: '#b0b0b0', house: '#3a6ad0', tc: '#3a6ad0' };
let mmDots = null;
function updateMinimap(time) {
    const c = mmCtx, s = mmScale;
    if (time >= mmNext || !mmDots) {      // rebuild resource/building layer 4x / s
        mmNext = time + 250;
        mmDots = document.createElement('canvas'); mmDots.width = mm.width; mmDots.height = mm.height;
        const d = mmDots.getContext('2d'); d.drawImage(mmBase, 0, 0);
        for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
            const cell = mapData[y][x]; if (!cell) continue;
            const p = tileCenter(x, y); d.fillStyle = MM_COL[cell.kind] || '#fff';
            const z = cell.kind === 'tc' ? 4 : cell.kind === 'tree' ? 2 : 3; d.fillRect(p.x * s - z / 2, p.y * s - z / 2, z, z);
        }
    }
    c.drawImage(mmDots, 0, 0);
    c.fillStyle = '#8a4a1a'; deer.forEach(d => c.fillRect(d.x * s - 1.5, d.y * s - 1.5, 3, 3));   // deer: small brown dots
    c.fillStyle = '#ffffff';
    villagers.forEach(v => { c.fillStyle = v.selected ? '#ffff66' : '#ffffff'; c.fillRect(v.x * s - 1.5, v.y * s - 1.5, 3, 3); });
    const r = viewRect(0);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(r.x0 * s + 0.5, r.y0 * s + 0.5, (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
}

// ============================================================================
// COMMAND BAR (DOM, big touch buttons)
// ============================================================================
const bar = document.getElementById('command-bar');
const DEFAULT_INFO = 'Left-click/drag to select · right-click to gather, move or build · wheel zoom · right-drag pan · Space = Town Center · P pause · +/- speed';
let flashTimer = 0;
function flash(msg) {
    infoText.setText(msg); clearTimeout(flashTimer);
    flashTimer = setTimeout(() => infoText.setText(DEFAULT_INFO), 1800);
}
let barKey = '';
function button(id, label, sub, enabled) {
    return `<button class="cmd" data-cmd="${id}" ${enabled ? '' : 'disabled'}><b>${label}</b><small>${sub}</small></button>`;
}
function updateBar() {
    const sel = villagers.filter(u => u.selected);
    let html = '';
    if (townCenter.selected) {
        const full = popCount() >= popCap();
        const pct = trainQueue ? Math.round(trainTimer / TRAIN_TIME * 100) : 0;
        html = `<span class="sel">Town Center</span>` +
            button('train', 'Train Villager', costText(VILLAGER_COST) + ` · ${TRAIN_TIME}s`, canAfford(VILLAGER_COST) && trainQueue < QUEUE_MAX) +
            (trainQueue ? button('cancel', 'Cancel', 'refund 50 food', true) : '') +
            `<span class="queue">Queue ${trainQueue}${trainQueue ? ' · ' + pct + '%' : ''}${full && trainQueue ? ' · need House!' : ''}</span>`;
    } else if (sel.length) {
        html = `<span class="sel">${sel.length} villager${sel.length > 1 ? 's' : ''}</span>` +
            button('house', placing ? 'Click a tile… (Esc)' : 'Build House', costText(HOUSE_COST) + ` · +${POP_PER_HOUSE} pop`, canAfford(HOUSE_COST)) +
            button('deselect', 'Deselect', 'clear selection', true);
    } else {
        html = `<span class="sel">Nothing selected</span>` + button('idle', 'Select Idle', villagers.filter(u => u.state === 'idle').length + ' idle', true);
    }
    if (html !== barKey) { bar.innerHTML = html; barKey = html; }
}
bar.addEventListener('pointerdown', e => {
    const b = e.target.closest('button.cmd');
    e.stopPropagation();
    if (!b || b.disabled) return;
    const cmd = b.dataset.cmd;
    Sfx.init(); Sfx.play('tap');
    if (cmd === 'train') { if (canAfford(VILLAGER_COST) && trainQueue < QUEUE_MAX) { pay(VILLAGER_COST); trainQueue++; } }
    else if (cmd === 'cancel') { if (trainQueue) { trainQueue--; refund(VILLAGER_COST); if (!trainQueue) trainTimer = 0; } }
    else if (cmd === 'house') { placing = placing ? null : 'house'; if (placing) flash('Left-click a free tile to place the House · right-click or Esc cancels'); }
    else if (cmd === 'deselect') { villagers.forEach(u => u.selected = false); placing = null; }
    else if (cmd === 'idle') { villagers.forEach(u => u.selected = u.state === 'idle'); }
});

// ============================================================================
// AUDIO: start on first tap, mute toggle (saved)
// ============================================================================
window.addEventListener('pointerdown', () => Sfx.init(), { capture: true });
const muteBtn = document.getElementById('mute-btn');
function syncMute() { muteBtn.textContent = Sfx.isMuted() ? '🔇' : '🔊'; }
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.init(); Sfx.toggle(); syncMute(); });
window.addEventListener('keydown', e => { if (pickerOpen()) return; if (e.key === 'm' || e.key === 'M') { Sfx.toggle(); syncMute(); } });
syncMute();

// ============================================================================
// MAP PICKER (title overlay): 2-digit box + Resume / Restart / Random; map number on the pause overlay
// ============================================================================
/** In-game confirm box (Restart / Cancel): game input is blocked while it is open (see pickerOpen) */
const askConfirm = (() => {
    const ov = document.getElementById('confirm-overlay'), msg = document.getElementById('confirm-msg');
    const ok = document.getElementById('confirm-ok'), cancel = document.getElementById('confirm-cancel');
    let onYes = null, back = null;
    ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'pointerup', 'click'].forEach(t => ov.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    const hide = () => { ov.style.display = 'none'; onYes = null; if (back && back.focus) back.focus(); back = null; };
    ok.addEventListener('click', () => { const f = onYes; hide(); if (f) f(); });
    cancel.addEventListener('click', hide);
    ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); hide(); } });
    return (text, yes) => { msg.textContent = text; onYes = yes; back = document.activeElement; ov.style.display = 'flex'; cancel.focus(); };
})();
(function mapPicker() {
    const ov = document.getElementById('title-overlay'), inp = document.getElementById('map-input'), note = document.getElementById('map-note');
    const bResume = document.getElementById('map-resume-btn'), bRestart = document.getElementById('map-restart-btn'), bRandom = document.getElementById('map-random-btn');
    const remember = n => { try { localStorage.setItem('aoe-rts.map', String(n)); } catch (e) {} };
    /** Box text -> map number (one digit = same map: 7 -> 07), or null */
    const pick = () => /^\d{1,2}$/.test(inp.value) ? parseInt(inp.value, 10) : null;
    const show = () => {
        const n = pick();
        bResume.disabled = bRestart.disabled = n === null;
        if (n === null) { note.textContent = 'Type a map number 00-99'; return; }
        note.textContent = 'Map ' + mapLabel(n) + ' · ' + (hasSave(n) ? 'saved' : 'new') + (n === 0 ? ' · demo' : '') + (n === MAP_NUM ? ' · current' : '');
    };
    inp.addEventListener('input', () => { const t = inp.value.replace(/\D/g, '').slice(0, 2); if (t !== inp.value) inp.value = t; show(); });
    inp.addEventListener('keydown', e => e.stopPropagation());
    // keep taps inside the dialog away from the game (nothing steals focus or closes the picker)
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(t => ov.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    const go = n => { remember(n); location.search = '?map=' + mapLabel(n); };   // other map = page reload into it
    const close = () => { ov.style.display = 'none'; inp.blur(); setPaused(false); };
    bResume.addEventListener('click', () => {
        const n = pick(); if (n === null) return;
        remember(n);
        if (n === MAP_NUM) { close(); return; }       // same map: just carry on
        writeSave(); go(n);
    });
    bRestart.addEventListener('click', () => {
        const n = pick(); if (n === null) return;
        askConfirm('Restart map ' + mapLabel(n) + '? Its saved progress will be deleted.', () => {
            if (n === MAP_NUM) saveBlocked = true; else writeSave();
            dropSave(n); go(n);
        });
    });
    bRandom.addEventListener('click', () => { inp.value = mapLabel(Math.floor(Math.random() * 100)); show(); });
    document.getElementById('picker-cancel').addEventListener('click', close);
    document.getElementById('pause-map').textContent = 'Map ' + mapLabel(MAP_NUM);
    const open = () => { setPaused(true); pauseOv.style.display = 'none'; ov.style.display = 'flex'; inp.value = mapLabel(MAP_NUM); show(); };
    document.getElementById('newmap-btn').addEventListener('click', e => { e.stopPropagation(); open(); });
    document.getElementById('newmap-btn').addEventListener('pointerdown', e => e.stopPropagation());
    // Auto start: straight into the map (?map=NN, last played, or 00) and resume its save (see resumeSave)
    remember(MAP_NUM); inp.value = mapLabel(MAP_NUM);
    window.aoeTest.save = { buildSave, writeSave, hasSave, saveKey, open, get houses() { return houses; } };
})();
