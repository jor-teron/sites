/** AOE RTS - per-map saves and autosave (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// SAVES (R2d): one save per map number in localStorage ('aoe-rts.save.NN'), browser-local
// ============================================================================
const SAVE_VER = 1;
const SAVE_KINDS = ['tree', 'berry', 'gold', 'stone', 'carcass', 'fish', 'farm'];   // ARQ1b farm
const V_STATES = ['idle', 'moving', 'toNode', 'gathering', 'toHunt', 'hunting', 'toBuild', 'building', 'returning'];
const DEER_KEYS = ['x', 'y', 'hx', 'hy', 'state', 'timer', 'gx', 'gy', 'face', 'seed', 'cd', 'fx', 'fy'];
let saveReady = false, saveBlocked = false;
function saveKey(n) { return 'aoe-rts.save.' + (MODE === 'open' ? '' : (MODE === 'play' ? 'vs' : MODE) + '.') + mapLabel(n); }   // ARQ1a: Open World keeps the old key; ARQ1c: Play reuses the Vs AI saves
/** ARQ1c: AI count stored in this map's Play save (old Vs AI saves keep their one AI), else null */
function savedAIs() { try { const s = JSON.parse(localStorage.getItem(saveKey(MAP_NUM))); return s && s.ai ? Object.keys(s.ai).filter(k => TEAM[k]).length : null; } catch (e) { return null; } }
function hasSave(n) { try { return localStorage.getItem(saveKey(n)) !== null; } catch (e) { return false; } }
function dropSave(n) { try { localStorage.removeItem(saveKey(n)); } catch (e) {} }
const r1 = n => Math.round(n * 10) / 10, r4 = n => Math.round(n * 1e4) / 1e4;
/** Snapshot of everything that is not rebuilt from the map seed (water is seeded, so it is not stored) */
function buildSave() {
    const cells = [];
    for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) { const c = mapData[y][x]; if (c && RES_TYPES[c.kind]) cells.push([x, y, c.kind, c.amount, c.max]); }
    return {
        v: SAVE_VER, map: MAP_NUM, size: MAP_SIZE, saved: Date.now(), res: Object.assign({}, resources),
        cells, houses: houses.map(h => [h.x, h.y, r4(h.progress), h.done ? 1 : 0, own(h), Math.round(hpOf(h)), h.type || 0, h.queue || 0, r4(h.timer || 0)]), tch: tcs.map(t => [own(t), Math.round(hpOf(t))]), over: gameOver, ai: JSON.parse(JSON.stringify(factions)),
        villagers: villagers.map(v => ({ fem: v.fem ? 1 : 0, x: r1(v.x), y: r1(v.y), state: v.state, target: v.target ? { x: r1(v.target.x), y: r1(v.target.y) } : null,
            node: v.node ? { x: v.node.x, y: v.node.y } : null, carry: v.carry, carryType: v.carryType, timer: r4(v.timer), face: v.face, seed: r4(v.seed || 0),
            lastKind: v.lastKind || null, house: v.house ? houses.indexOf(v.house) : -1, prey: v.prey ? deer.indexOf(v.prey) : -1, o: own(v), hp: Math.round(hpOf(v)), mil: v.mil ? 1 : 0 })),
        deer: deer.map(d => { const o = { ant: d.ant ? 1 : 0 }; DEER_KEYS.forEach(k => { if (typeof d[k] === 'number') o[k] = r4(d[k]); else if (d[k] != null) o[k] = d[k]; }); return o; }),
        train: { queue: trainQueue, timer: r4(trainTimer), count: trainedCount }, berryT: r4(berryT), animT: Math.round(animT),
        cam: cam ? { x: Math.round(cam.scrollX), y: Math.round(cam.scrollY), z: r4(cam.zoom) } : null
    };
}
function writeSave() {
    if (!saveReady || saveBlocked) return false;
    try { localStorage.setItem(saveKey(MAP_NUM), JSON.stringify(buildSave())); return true; } catch (e) { return false; }
}
/** Validate a parsed save into fresh structures; throws on anything wrong, so a bad save never half-applies */
function decodeSave(s) {
    const num = v => { if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad number'); return v; };
    if (!s || s.v !== SAVE_VER || s.map !== MAP_NUM || s.size !== MAP_SIZE) throw new Error('version / map mismatch');
    if (!Array.isArray(s.cells) || !Array.isArray(s.houses) || !Array.isArray(s.villagers) || !Array.isArray(s.deer) || !s.res) throw new Error('missing parts');
    const res = {}; Object.keys(START_RES).forEach(k => res[k] = Math.max(0, Math.round(num(s.res[k]))));
    const cells = s.cells.map(c => { if (!Array.isArray(c) || !inMap(c[0], c[1]) || SAVE_KINDS.indexOf(c[2]) < 0) throw new Error('bad cell');
        return { x: c[0], y: c[1], cell: { kind: c[2], amount: Math.max(0, num(c[3])), max: Math.max(1, num(c[4])) } }; });
    const hs = s.houses.map(h => { if (!Array.isArray(h) || !inMap(h[0], h[1])) throw new Error('bad house');
        const b = { x: h[0], y: h[1], progress: Math.min(1, Math.max(0, num(h[2]))), done: !!h[3], owner: factions[h[4]] ? h[4] : undefined };
        if (h[6] === 'barracks') Object.assign(b, { type: 'barracks', queue: Math.max(0, Math.round(num(h[7]))), timer: num(h[8]) });
        if (h[5] != null) b.hp = Math.max(1, num(h[5])); return b; });   // ARQ1a saves: no hp / type -> full HP house   // houses on now-blocked tiles are dropped in resumeSave (R2b)
    const ds = s.deer.map(o => { const d = { ant: !!o.ant, state: ['graze', 'walk', 'flee'].indexOf(o.state) >= 0 ? o.state : 'graze', moving: false };
        ['x', 'y', 'hx', 'hy', 'timer', 'gx', 'gy', 'face', 'seed', 'cd'].forEach(k => d[k] = num(o[k]));
        if (d.state === 'flee') { d.fx = num(o.fx); d.fy = num(o.fy); } return d; });
    const vs = s.villagers.map(o => {
        const v = { fem: !!o.fem, x: num(o.x), y: num(o.y), state: V_STATES.indexOf(o.state) >= 0 ? o.state : 'idle', target: o.target ? { x: num(o.target.x), y: num(o.target.y) } : null,
            node: o.node && inMap(o.node.x, o.node.y) ? { x: o.node.x, y: o.node.y } : null, carry: Math.max(0, Math.min(CARRY_MAX, num(o.carry))),
            carryType: o.carryType in START_RES ? o.carryType : null, timer: num(o.timer), selected: false, face: o.face < 0 ? -1 : 1, walking: false,
            seed: num(o.seed), lastKind: o.lastKind || null, house: hs[o.house] || null, prey: ds[o.prey] || null };
        if (o.mil) { v.mil = true; v.fem = false; } v.hp = o.hp != null ? Math.max(1, num(o.hp)) : v.mil ? HP.mil : HP.v;   // ARQ1a saves: full HP
        if (factions[o.o]) v.owner = o.o; else if (o.o && o.o !== 'p') throw new Error('bad owner');
        if (!v.carryType) v.carry = 0;
        // anything whose target is gone falls back to a safe state (re-planned next frame)
        if ((v.state === 'toHunt' || v.state === 'hunting') && !v.prey) v.state = 'idle';
        if ((v.state === 'toBuild' || v.state === 'building') && !v.house) v.state = 'idle';
        if ((v.state === 'toNode' || v.state === 'gathering') && !v.node) v.state = 'idle';
        if ((v.state === 'moving' || v.state === 'toNode' || v.state === 'toBuild') && !v.target) v.state = 'idle';
        return v; });
    const ai = s.ai || {}; Object.keys(factions).forEach(id => { const a = ai[id]; if (!a) return; Object.keys(START_RES).forEach(k => { if (a.res) num(a.res[k]); }); num(a.queue); num(a.timer); });
    const tr = s.train || {};
    const tch = Array.isArray(s.tch) ? s.tch.map(a => [a[0], Math.max(1, num(a[1]))]) : null;
    return { tch, ai, res, cells, hs, ds, vs, queue: Math.max(0, Math.min(QUEUE_MAX, Math.round(num(tr.queue || 0)))), ttimer: num(tr.timer || 0), count: Math.round(num(tr.count || 0)),
        berryT: num(s.berryT || 0), animT: num(s.animT || 0), cam: s.cam && isFinite(s.cam.x) && isFinite(s.cam.y) && isFinite(s.cam.z) ? s.cam : null };
}
/** On scene create: restore this map's save if there is one; a corrupt save is dropped and the map starts fresh */
function resumeSave() {
    let raw = null; try { raw = localStorage.getItem(saveKey(MAP_NUM)); } catch (e) {}
    let msg = null;
    if (raw !== null) {
        try {
            const d = decodeSave(JSON.parse(raw));
            for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) if (mapData[y][x] && mapData[y][x].kind !== 'tc') mapData[y][x] = null;
            // R2b: terrain is rebuilt from the seed, so an older save may put things on new water / rock: drop those
            const fits = (x, y, kind) => kind === 'fish' ? isWater(x, y) : isLand(x, y);
            d.cells.forEach(c => { if (!mapData[c.y][c.x] && fits(c.x, c.y, c.cell.kind)) mapData[c.y][c.x] = c.cell; });
            houses = d.hs.filter(h => !mapData[h.y][h.x] && isLand(h.x, h.y)); houses.forEach(h => { mapData[h.y][h.x] = { kind: 'house', house: h }; });
            Object.assign(resources, d.res); villagers = d.vs; deer = d.ds;
            if (d.tch) tcs.slice().forEach(t => { const k = d.tch.find(a => a[0] === own(t)); if (k) t.hp = k[1]; else hurt(t, 1e9); });   // ARQ1b: destroyed TCs stay gone
            [...villagers, ...deer].forEach(u => { const t = screenToTile(u.x, u.y); if (isLand(t.x, t.y)) return;   // R2b: nudge off water / rock
                const n = nearestLand(t.x, t.y), p = tileCenter(n.x, n.y); u.x = p.x; u.y = p.y; u.route = null; });
            deer.forEach(d => { if (!isLand(d.hx, d.hy)) { const n = nearestLand(Math.round(d.hx), Math.round(d.hy)); d.hx = n.x; d.hy = n.y; } });
            villagers.forEach(v => { if (v.house && houses.indexOf(v.house) < 0) { v.house = null; v.state = 'idle'; } });
            Object.keys(factions).forEach(id => { if (d.ai[id]) factions[id] = d.ai[id]; });
            trainQueue = d.queue; trainTimer = d.ttimer; trainedCount = d.count; berryT = d.berryT; animT = d.animT;
            if (d.cam) { cam.setZoom(Phaser.Math.Clamp(d.cam.z, minZoom(), ZOOM_MAX)); cam.scrollX = d.cam.x; cam.scrollY = d.cam.y; }
            msg = 'Map ' + mapLabel(MAP_NUM) + ' resumed';
        } catch (e) {
            dropSave(MAP_NUM); msg = 'Map ' + mapLabel(MAP_NUM) + ' save was unreadable · started fresh';
            console.warn('aoe-rts: dropped bad save', e && e.message);
        }
    }
    saveReady = true;
    if (msg) flash(msg);
}

// autosave + save on hide / exit
document.addEventListener('visibilitychange', () => { if (document.hidden) { setPaused(true); writeSave(); } });
window.addEventListener('pagehide', () => writeSave());
setInterval(() => writeSave(), AUTOSAVE_MS);   // autosave every 30 s of real time
