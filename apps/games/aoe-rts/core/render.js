/** AOE RTS - per-frame drawing (ground, nodes, units, buildings) (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ============================================================================
// RENDER (R9: code-drawn graphics, no image files)
// ============================================================================
/** Deterministic hash 0..1 for per-tile variation */
function hash(x, y, k) { const s = Math.sin(x * 127.1 + y * 311.7 + (k || 0) * 74.7) * 43758.5453; return s - Math.floor(s); }
function shade(col, f) {
    const r = Math.min(255, ((col >> 16) & 255) * f) | 0, g = Math.min(255, ((col >> 8) & 255) * f) | 0, b = Math.min(255, (col & 255) * f) | 0;
    return (r << 16) | (g << 8) | b;
}
/** Bake the grass into CHUNK x CHUNK tile canvases (one image each, hidden when off screen) */
function bakeGround(scene) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    for (let cy0 = 0; cy0 < MAP_SIZE; cy0 += CHUNK) for (let cx0 = 0; cx0 < MAP_SIZE; cx0 += CHUNK) {
        const x1 = Math.min(MAP_SIZE, cx0 + CHUNK), y1 = Math.min(MAP_SIZE, cy0 + CHUNK);
        const left = tileCenter(cx0, y1 - 1).x - hw, right = tileCenter(x1 - 1, cy0).x + hw;
        const top = tileCenter(cx0, cy0).y - hh - 60, bottom = tileCenter(x1 - 1, y1 - 1).y + hh;
        groundChunks.push({ img: null, key: 'ground' + groundChunks.length, cx0, cy0, cx1: x1, cy1: y1, x0: left, y0: top, x1: right, y1: bottom, used: 0 });
    }
}
const GROUND_CACHE = 16;   // baked chunks kept in memory (each ~1100x560 px)
/** ARQ1t3: smooth dome heights on a fine vertex grid (MOUNT_SUB steps per cell): chamfer distance from any vertex touching
 *  non-mountain, blurred once, then a quarter-sine rise to a broad rounded crest (0 at the edge, 1 on top). Cached per map. */
const MOUNT_SUB = 4;
let mHt = null, mHtOf = null;
function mountHeights() { if (mHtOf === mount) return mHt; const n = MOUNT_SUB, S = MAP_SIZE, V = S * n + 1, d = new Float32Array(V * V);
    const inside = (vx, vy) => { for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) { const cx = Math.floor((vx + a * 0.5) / n), cy = Math.floor((vy + b * 0.5) / n);
        if (!inMap(cx, cy) || !mount[cy * S + cx]) return false; } return true; };
    for (let i = 0; i < V * V; i++) d[i] = inside(i % V, (i / V) | 0) ? 1e9 : 0;
    const pass = (s0, s1, st) => { for (let y = s0; y !== s1; y += st) for (let x = s0; x !== s1; x += st) { const i = y * V + x; if (!d[i]) continue;
        [[-st, 0, 1], [0, -st, 1], [-st, -st, 1.41], [st, -st, 1.41]].forEach(([a, b, w]) => { const q = (y + b) * V + x + a; if (x + a >= 0 && x + a < V && y + b >= 0 && y + b < V) d[i] = Math.min(d[i], d[q] + w); }); } };
    pass(0, V, 1); pass(V - 1, -1, -1);
    const h = new Float32Array(V * V), R = n * 2;
    for (let i = 0; i < V * V; i++) h[i] = Math.sin(Math.min(1, d[i] / R) * Math.PI / 2);
    for (let k = 0; k < 3; k++) { const t = h.slice(); for (let y = 1; y < V - 1; y++) for (let x = 1; x < V - 1; x++) { const i = y * V + x;
        if (d[i]) h[i] = (t[i - V - 1] + t[i - V] + t[i - V + 1] + t[i - 1] + t[i] + t[i + 1] + t[i + V - 1] + t[i + V] + t[i + V + 1]) / 9; } }
    mHt = h; mHtOf = mount; return h; }
/** Bake one grass chunk on demand (only chunks near the view exist as textures) */
function bakeChunk(ch) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
        const t = townCenter, tc = tileCenter(t.x + 0.5, t.y + 0.5);
    const cx0 = ch.cx0, cy0 = ch.cy0, x1 = ch.cx1, y1 = ch.cy1, left = ch.x0, right = ch.x1, top = ch.y0, bottom = ch.y1;
        const W = Math.ceil(right - left), H = Math.ceil(bottom - top);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const c = cv.getContext('2d'); c.translate(-left, -top);
        for (let y = cy0; y < y1; y++) for (let x = cx0; x < x1; x++) {
            const p = tileCenter(x, y), gt = ground[y * MAP_SIZE + x], greens = TerrainArt.palette(gt);
            c.save(); c.beginPath();
            c.moveTo(p.x, p.y - hh - 0.5); c.lineTo(p.x + hw + 0.5, p.y); c.lineTo(p.x, p.y + hh + 0.5); c.lineTo(p.x - hw - 0.5, p.y); c.closePath();
            c.fillStyle = greens[Math.floor(hash(x, y) * greens.length)]; c.fill(); c.clip();
            for (let i = 0; i < 3; i++) {
                c.fillStyle = hash(x, y, i + 10) > 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(0,30,0,0.10)';
                c.beginPath(); c.ellipse(p.x + (hash(x, y, i) - 0.5) * 100, p.y + (hash(x, y, i + 3) - 0.5) * 48, 20 + hash(x, y, i + 6) * 24, 10 + hash(x, y, i + 7) * 10, 0, 0, 7); c.fill();
            }
            c.lineWidth = 1.2;
            TerrainArt.speckle(c, p, gt, hash, x, y);
            for (let i = 0, nb = TerrainArt.BLADES[gt]; i < nb; i++) {
                const bx = p.x + (hash(x, y, i + 20) - 0.5) * 112, by = p.y + (hash(x, y, i + 40) - 0.5) * 56;
                c.strokeStyle = i % 3 ? 'rgba(120,170,80,0.55)' : 'rgba(30,70,25,0.45)';
                c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + (hash(x, y, i + 60) - 0.5) * 4, by - 4, bx + (hash(x, y, i + 60) - 0.5) * 7, by - 5 - hash(x, y, i + 80) * 6); c.stroke();
            }
            if (gt < 3 && hash(x, y, 99) > 0.8) { c.fillStyle = hash(x, y, 98) > 0.5 ? '#f2e46a' : '#f4f4f4'; for (let i = 0; i < 4; i++) { const fx = p.x + (hash(x, y, i + 90) - 0.5) * 72, fy = p.y + (hash(x, y, i + 95) - 0.5) * 28; c.beginPath(); c.arc(fx, fy, 2.4, 0, 7); c.fill(); } }
            if (hash(x, y, 97) > 0.88) { c.fillStyle = '#8c8c7c'; c.beginPath(); c.ellipse(p.x + 20, p.y + 8, 6, 4, 0, 0, 7); c.fill(); c.fillStyle = '#a8a898'; c.beginPath(); c.ellipse(p.x + 19, p.y + 7, 3, 1.6, 0, 0, 7); c.fill(); }
            c.restore();
            c.strokeStyle = 'rgba(0,0,0,0.08)'; c.beginPath();
            c.moveTo(p.x, p.y - hh); c.lineTo(p.x + hw, p.y); c.lineTo(p.x, p.y + hh); c.lineTo(p.x - hw, p.y); c.closePath(); c.stroke();
        }
        drawWaterTiles(c, cx0, cy0, x1, y1);
        const isMount = (hx, hy) => inMap(hx, hy) && mount[hy * MAP_SIZE + hx] === 1, HT = mountHeights(), HV = MAP_SIZE * MOUNT_SUB + 1, ht = (vx, vy) => HT[vy * HV + vx];
        const isHill = (hx, hy) => inMap(hx, hy) && hill[hy * MAP_SIZE + hx] === 1;   // R2b: hills + fords
        for (let y = cy0; y < y1; y++) for (let x = cx0; x < x1; x++) { const i = y * MAP_SIZE + x;
            if (mount[i]) continue; if (ford[i]) TerrainArt.ford(c, tileCenter(x, y), x, y, hash); else { if (hill[i]) TerrainArt.hill(c, tileCenter(x, y), x, y, isHill, hash); if (!water[i]) TerrainArt.foothill(c, tileCenter(x, y), x, y, isMount); } }
        for (let s = cx0 + cy0; s <= x1 + y1 - 2; s++) for (let x = cx0; x < x1; x++) { const y = s - x;   // ARQ1t2: mountains back to front
            if (y >= cy0 && y < y1 && mount[y * MAP_SIZE + x]) TerrainArt.mountain(c, tileCenter(x, y), x, y, ht, MOUNT_SUB); }
        if (Math.abs(tc.x - (left + right) / 2) < W / 2 + 220 && Math.abs(tc.y - (top + bottom) / 2) < H / 2 + 120) {  // dirt around TC
            const grd = c.createRadialGradient(tc.x, tc.y, 20, tc.x, tc.y, 180);
            grd.addColorStop(0, 'rgba(150,120,80,0.9)'); grd.addColorStop(0.6, 'rgba(140,110,70,0.5)'); grd.addColorStop(1, 'rgba(140,110,70,0)');
            c.fillStyle = grd; c.beginPath(); c.ellipse(tc.x, tc.y, 210, 108, 0, 0, 7); c.fill();
        }
        scene.textures.addCanvas(ch.key, cv);
        ch.img = scene.add.image(left, top, ch.key).setOrigin(0, 0).setDepth(-10 + (cx0 + cy0) * 1e-4);   // ARQ1t2: lower chunks over upper (peaks rise into them)
}
/** Water: deep-blue diamonds with ripples, then a sandy shoreline + foam band on edges that touch land */
function drawWaterTiles(c, cx0, cy0, x1, y1) {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    for (let y = cy0; y < y1; y++) for (let x = cx0; x < x1; x++) {
        if (!isWater(x, y)) continue;
        const p = tileCenter(x, y), T = [p.x, p.y - hh], Rr = [p.x + hw, p.y], B = [p.x, p.y + hh], L = [p.x - hw, p.y];
        c.save(); c.beginPath(); c.moveTo(T[0], T[1] - 0.6); c.lineTo(Rr[0] + 0.6, Rr[1]); c.lineTo(B[0], B[1] + 0.6); c.lineTo(L[0] - 0.6, L[1]); c.closePath();
        const g = c.createLinearGradient(p.x - hw, p.y - hh, p.x + hw, p.y + hh); g.addColorStop(0, '#3f86cf'); g.addColorStop(1, hash(x, y, 7) > 0.5 ? '#2a68b0' : '#2c6db6');
        c.fillStyle = g; c.fill(); c.clip();
        c.strokeStyle = 'rgba(200,230,255,0.28)'; c.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) { const rx = p.x + (hash(x, y, i + 30) - 0.5) * 80, ry = p.y + (hash(x, y, i + 33) - 0.5) * 36; c.beginPath(); c.moveTo(rx - 12, ry); c.quadraticCurveTo(rx - 4, ry - 3, rx + 4, ry); c.quadraticCurveTo(rx + 10, ry + 2, rx + 14, ry); c.stroke(); }
        // edges: x+1 = lower-right (R-B), x-1 = upper-left (L-T), y+1 = lower-left (B-L), y-1 = upper-right (T-R)
        [[1, 0, Rr, B], [-1, 0, L, T], [0, 1, B, L], [0, -1, T, Rr]].forEach(e => {
            if (isWater(x + e[0], y + e[1]) || !inMap(x + e[0], y + e[1])) return;
            c.beginPath(); c.moveTo(e[2][0], e[2][1]); c.lineTo(e[3][0], e[3][1]);
            c.strokeStyle = 'rgba(235,248,255,0.55)'; c.lineWidth = 20; c.stroke();     // foam
            c.strokeStyle = '#c9b27a'; c.lineWidth = 10; c.stroke();                    // wet sand
            c.strokeStyle = '#a8905a'; c.lineWidth = 3; c.stroke();
        });
        c.restore();
    }
}
function updateGround(vr) {
    let baked = 0, frame = game.loop.frame;
    groundChunks.forEach(ch => {
        const on = ch.x1 > vr.x0 && ch.x0 < vr.x1 && ch.y1 > vr.y0 && ch.y0 < vr.y1;
        if (on && !ch.img && (baked < 2 || frame < 3)) { bakeChunk(ch); baked++; }
        if (ch.img) { ch.img.setVisible(on); if (on) ch.used = frame; }
    });
    const live = groundChunks.filter(c => c.img);
    if (live.length > GROUND_CACHE) live.filter(c => !c.img.visible).sort((a, b) => a.used - b.used).slice(0, live.length - GROUND_CACHE)
        .forEach(c => { c.img.destroy(); scene.textures.remove(c.key); c.img = null; });
}
function diamond(g, cx, cy, color, alpha) {
    const p = tileCenter(cx, cy), hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    g.fillStyle(color, alpha == null ? 1 : alpha);
    g.beginPath();
    g.moveTo(p.x, p.y - hh); g.lineTo(p.x + hw, p.y); g.lineTo(p.x, p.y + hh); g.lineTo(p.x - hw, p.y);
    g.closePath(); g.fillPath();
}
function shadow(g, x, y, w, h) { g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y, w, h); }
function render() {
    const g = gfx, gu = gUnder;
    g.clear(); gu.clear(); poolN = 0;
    const vr = viewRect(200);
    updateGround(viewRect(64));
    // visible tile range (iso: check the 4 view corners)
    const cs = [screenToTile(vr.x0, vr.y0), screenToTile(vr.x1, vr.y0), screenToTile(vr.x0, vr.y1), screenToTile(vr.x1, vr.y1)];
    const tx0 = Math.max(0, Math.min(...cs.map(c => c.x)) - 1), tx1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.x)) + 1);
    const ty0 = Math.max(0, Math.min(...cs.map(c => c.y)) - 1), ty1 = Math.min(MAP_SIZE - 1, Math.max(...cs.map(c => c.y)) + 3);
    const vis = (x, y) => { const p = tileCenter(x, y); return p.x > vr.x0 && p.x < vr.x1 && p.y > vr.y0 && p.y < vr.y1 + 120; };
    if (placing) {              // show free tiles + hover preview while placing
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (!mapData[y][x] && isLand(x, y) && vis(x, y)) diamond(gu, x, y, 0xffffff, 0.06);
        if (hoverTile && inMap(hoverTile.x, hoverTile.y)) diamond(gu, hoverTile.x, hoverTile.y, mapData[hoverTile.y][hoverTile.x] || !isLand(hoverTile.x, hoverTile.y) ? 0xff3333 : 0x33ff33, 0.45);
    }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const c = mapData[y][x];
        if (!c || c.kind === 'tc' || !vis(x, y)) continue;
        if (c.kind === 'house') drawHouse(g, x, y, c.house); else drawNode(g, x, y, c);
    }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (rock[y * MAP_SIZE + x] && !mount[y * MAP_SIZE + x] && vis(x, y)) {   // R2b rock outcrops
        const p = tileCenter(x, y); sprite('rock' + Math.floor(hash(x, y, 11) * 4), p.x + (hash(x, y, 12) - 0.5) * 10, p.y + 10, p.y + 8, hash(x, y, 13) > 0.5); }
    tcs.forEach(t => drawTC(g, gu, t));
    deer.forEach(d => { if (d.x > vr.x0 && d.x < vr.x1 && d.y > vr.y0 && d.y < vr.y1 + 120) drawDeer(d); });
    villagers.forEach(v => { if (v.x > vr.x0 && v.x < vr.x1 && v.y > vr.y0 && v.y < vr.y1 + 120) drawVillager(g, gu, v); });
    for (let i = poolN; i < pool.length; i++) if (pool[i].visible) pool[i].setVisible(false);
    if (dragSel && dragSel.active) {        // selection rectangle
        const x = Math.min(dragSel.sx, dragSel.ex), y = Math.min(dragSel.sy, dragSel.ey), w = Math.abs(dragSel.ex - dragSel.sx), h = Math.abs(dragSel.ey - dragSel.sy);
        g.fillStyle(0xffffff, 0.08); g.fillRect(x, y, w, h); g.lineStyle(1.5 / cam.zoom, 0xffffff, 0.9); g.strokeRect(x, y, w, h);
    }
}
/** Next pooled image showing art frame `name` at world (x,y), depth-sorted by y */
function sprite(name, x, y, depth, flip) {
    let img = pool[poolN];
    if (!img) { img = scene.add.image(0, 0, 'art0'); pool.push(img); }
    poolN++;
    Art.apply(img, name, x, y, flip, depth); img.clearTint();
    return img;
}
function drawNode(g, x, y, c) {
    const p = tileCenter(x, y), frac = c.amount / c.max, s = hash(x, y, 5);
    if (c.kind === 'tree') {
        const px = p.x + (hash(x, y, 1) - 0.5) * 20, py = p.y + (hash(x, y, 2) - 0.5) * 8, v = Math.floor(hash(x, y, 3) * 3);
        const name = frac < 0.25 ? 'stump' : (s > 0.45 ? 'pine' : 'leafy') + v + (frac < 0.6 ? '_cut' : '');
        sprite(name, px, py, py, hash(x, y, 4) > 0.5);
    } else if (c.kind === 'farm') {   // ARQ1b: tilled field, crop greens -> gold as it is harvested
        diamond(gUnder, x, y, 0x7a5a32, 0.95); const hw = TILE_WIDTH / 2 - 10, hh = TILE_HEIGHT / 2 - 5;
        gUnder.lineStyle(5, frac > 0.5 ? 0x8aa040 : 0xc8a050, 1);
        for (let i = 1; i < 6; i++) { const f = i / 6 - 0.5; gUnder.lineBetween(p.x - hw / 2 + f * hw, p.y - hh / 2 - f * hh, p.x + hw / 2 + f * hw, p.y + hh / 2 - f * hh); }
    } else if (c.kind === 'fish') {
        sprite('fish' + (Math.floor(animT / 260 + s * 4) % 4), p.x, p.y, p.y - 40, s > 0.5);
    } else if (c.kind === 'carcass') {
        sprite('carcass' + Math.max(1, Math.ceil(frac * 3)), p.x, p.y + 4, p.y, s > 0.5);
    } else if (c.kind === 'berry') {
        sprite('berry' + Math.min(4, Math.ceil(frac * 4)), p.x, p.y + 6, p.y, hash(x, y, 4) > 0.5);
    } else {
        sprite(c.kind + Math.max(1, Math.ceil(6 * frac)), p.x, p.y + 8, p.y, hash(x, y, 4) > 0.5);
        if (c.kind === 'gold' && Math.sin(animT / 300 + x * 3 + y) > 0.97) { g.fillStyle(0xffffff, 0.9); g.fillCircle(p.x + 8, p.y - 40, 3); }
    }
}
/** ARQ1b: health bar over a unit / building when selected or damaged (green -> red) */
function hpBar(g, e, x, y, w) {
    const f = hpOf(e) / maxHp(e); if (f >= 1 && !e.selected) return;
    g.fillStyle(0x000000, 0.7); g.fillRect(x - w / 2 - 2, y - 2, w + 4, 9);
    g.fillStyle(f > 0.6 ? 0x44dd44 : f > 0.3 ? 0xe0c030 : 0xe03030, 1); g.fillRect(x - w / 2, y, w * Math.max(0, f), 5);
}
function drawTC(g, gu, t) {
    const c = tileCenter(t.x + 0.5, t.y + 0.5), tint = TEAM[t.owner].tint;
    if (tint) { gu.lineStyle(6, TEAM[t.owner].col, 0.8); gu.strokeEllipse(c.x, c.y, 280, 140); }
    if (t.selected) { gu.lineStyle(4, 0xffffff, 0.9); gu.strokeEllipse(c.x, c.y, 300, 150); }
    sprite('tc', c.x, c.y, c.y + 40);
    const fl = sprite('flag' + (Math.floor(animT / 140) % 4), c.x, c.y - 203, c.y + 40.5); if (tint) fl.setTint(tint);
    hpBar(g, t, c.x, c.y - 270, 120);
    const q = t.owner === 'p' ? trainQueue : factions[t.owner].queue, tt = t.owner === 'p' ? trainTimer : factions[t.owner].timer;
    if (q > 0) {          // training progress bar
        const f = tt / TRAIN_TIME;
        g.fillStyle(0x000000, 0.7); g.fillRect(c.x - 72, c.y - 290, 144, 14);
        g.fillStyle(popCount(t.owner) < popCap(t.owner) ? 0x55dd55 : 0xdd5555, 1); g.fillRect(c.x - 70, c.y - 288, 140 * f, 10);
    }
}
function drawHouse(g, x, y, h) {
    const p = tileCenter(x, y), pr = h.done ? 1 : h.progress;
    const idx = h.done ? 9 : Math.min(8, Math.floor(pr / (1 / 9)));
    if (h.selected) { gUnder.lineStyle(4, 0xffffff, 0.9); gUnder.strokeEllipse(p.x, p.y, 150, 76); }
    const im = sprite(h.type && h.done ? 'barracks' : 'house' + idx, p.x, p.y, p.y + 10); hpBar(g, h, p.x, p.y - 196, 70);
    if (h.type && h.queue) { g.fillStyle(0x000000, 0.7); g.fillRect(p.x - 40, p.y - 180, 80, 10); g.fillStyle(0x55dd55, 1); g.fillRect(p.x - 38, p.y - 178, 76 * h.timer / MILITIA_TIME, 6); } if (h.owner) { im.setTint(TEAM[h.owner].tint); g.fillStyle(TEAM[h.owner].col, 1); g.fillRect(p.x - 3, p.y - 150, 22, 12); g.fillRect(p.x - 3, p.y - 150, 3, 40); }
    if (!h.done) {
        g.fillStyle(0x000000, 0.7); g.fillRect(p.x - 40, p.y - 180, 80, 10);
        g.fillStyle(0x55aaff, 1); g.fillRect(p.x - 38, p.y - 178, 76 * h.progress, 6);
    }
}
function drawDeer(d) {
    const t = animT / 1000 + d.seed * 7, pre = d.ant ? 'deer_a_' : 'deer_';
    let name;
    if (d.moving) name = pre + 'walk' + (Math.floor(t * (d.state === 'flee' ? 16 : 7)) % 4);
    else if (d.state === 'graze' && Math.sin(t * 0.6) < 0.5) name = pre + 'graze' + (Math.floor(t * 2.2) % 2);
    else name = pre + 'idle';
    sprite(name, d.x, d.y, d.y + 0.15, d.face < 0);
}
function drawVillager(g, gu, v) {
    const face = v.face || 1, working = v.state === 'gathering' || v.state === 'building' || v.state === 'hunting';
    const kind = (v.state === 'toHunt' || v.state === 'hunting') ? 'carcass' : v.state === 'building' ? 'hammer' : (v.node && mapData[v.node.y] && mapData[v.node.y][v.node.x] ? mapData[v.node.y][v.node.x].kind : (v.lastKind || null));
    const tool = kind === 'hammer' ? 'hammer' : kind === 'tree' ? 'axe' : (kind === 'gold' || kind === 'stone') ? 'pick' : kind === 'berry' ? 'basket' : kind === 'carcass' ? 'spear' : kind === 'fish' ? 'net' : 'none';
    const t = animT / 1000 + (v.seed || 0) * 3;
    let name; const pre = v.fem ? 'v_f_' : 'v_';
    if (v.mil) name = `v_sword_${v.state === 'attack' && v.swing ? 'work' + Math.floor(t * 6) % 6 : v.walking ? 'walk' + Math.floor(t * 12) % 8 : 'idle'}`;   // ARQ1b Militia
    else if (v.state === 'attack' && v.swing) name = `${pre}none_${'walk' + Math.floor(t * 16) % 8}`;   // villager scuffle
    else if (working && tool !== 'none') name = `${pre}${tool}_work${Math.floor(t * 9) % 6}`;
    else if (v.walking) name = `${pre}${tool}_walk${Math.floor(t * 12) % 8}`;
    else name = `${pre}${tool}_idle`;
    if (v.owner) { gu.lineStyle(4, TEAM[v.owner].col, 0.9); gu.strokeEllipse(v.x, v.y + 2, 46, 18); }   // ARQ1a team ring
    if (v.selected) { gu.lineStyle(3, 0xffff66, 1); gu.strokeEllipse(v.x, v.y + 2, 54, 22); }
    const im = sprite(name, v.x, v.y, v.y + 0.2, face < 0); if (v.owner) im.setTint(TEAM[v.owner].tint);
    hpBar(g, v, v.x, v.y - 140, 36);
    if (v.carry > 0) {
        sprite('carry_' + v.carryType, v.x - face * 15, v.y - 46, v.y + 0.1, face < 0);
        const col = CARRY_COLORS[v.carryType];
        g.fillStyle(0x000000, 0.6); g.fillRect(v.x - 16, v.y - 128, 32, 6);
        g.fillStyle(col, 1); g.fillRect(v.x - 15, v.y - 127, 30 * v.carry / CARRY_MAX, 4);
    }
}
