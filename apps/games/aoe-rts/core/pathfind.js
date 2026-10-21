/** AOE RTS - 8-dir grid A* route-finding (classic script: shares top-level names with the other core/ and assets/ scripts; see index.html for load order) */
// ---------------------------------------------------------------------------
// PATHFINDING: 8-dir grid A* over land tiles (no corner cutting), LOS-smoothed, cached, budgeted per frame
// ---------------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const pathStats = { calls: 0, cached: 0, totalMs: 0, maxMs: 0, waits: 0 };
let pathBudget = PATH_BUDGET, pathCache = new Map();
let asG = null, asFrom = null, asOpen = null, asClosed = null, asGen = 0, heapI = [], heapF = [];
/** World px -> fractional tile coords (tile centres are integers) */
function tileF(px, py) { const lx = (px - ORIGIN_X) / (TILE_WIDTH / 2), ly = (py - ORIGIN_Y - TILE_HEIGHT / 2) / (TILE_HEIGHT / 2); return { x: (lx + ly) / 2, y: (ly - lx) / 2 }; }
/** Straight walk a->b (world px) stays on land with a little clearance */
function losClear(ax, ay, bx, by) {
    const a = tileF(ax, ay), b = tileF(bx, by), n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4) + 1;
    for (let i = 0; i <= n; i++) { const fx = a.x + (b.x - a.x) * i / n, fy = a.y + (b.y - a.y) * i / n;
        for (let k = 0; k < 4; k++) if (!isLand(Math.round(fx + (k & 1 ? 0.28 : -0.28)), Math.round(fy + (k & 2 ? 0.28 : -0.28)))) return false; }
    return true;
}
/** Nearest land tile to (x,y) (itself when dry) */
function nearestLand(x, y) {
    x = Math.max(0, Math.min(MAP_SIZE - 1, x)); y = Math.max(0, Math.min(MAP_SIZE - 1, y));
    if (isLand(x, y)) return { x, y };
    for (let r = 1; r < MAP_SIZE; r++) { let best = null, bd = Infinity;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !isLand(x + dx, y + dy)) continue;
            const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; } }
        if (best) return best; }
    return { x, y };
}
function heapPush(i, f) { let k = heapI.length; heapI.push(i); heapF.push(f);
    while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; } heapI[k] = i; heapF[k] = f; }
function heapPop() { const top = heapI[0], li = heapI.pop(), lf = heapF.pop(), n = heapI.length;
    if (n) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; } heapI[k] = li; heapF[k] = lf; }
    return top; }
/** A* from tile (sx,sy) to (gx,gy), both land. Returns tile list [[x,y]...] incl. both ends, or null */
function findPath(sx, sy, gx, gy) {
    const S = MAP_SIZE, N = S * S, key = (sy * S + sx) * N + gy * S + gx;
    if (pathCache.has(key)) { pathStats.cached++; return pathCache.get(key); }
    const t0 = performance.now();
    if (!asG || asG.length !== N) { asG = new Float32Array(N); asFrom = new Int32Array(N); asOpen = new Uint32Array(N); asClosed = new Uint32Array(N); asGen = 0; }
    asGen++; heapI.length = 0; heapF.length = 0;
    const s0 = sy * S + sx, g0 = gy * S + gx, h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
    asG[s0] = 0; asFrom[s0] = -1; asOpen[s0] = asGen; heapPush(s0, h(sx, sy));
    let found = false;
    while (heapI.length) {
        const i = heapPop(); if (asClosed[i] === asGen) continue; asClosed[i] = asGen;
        if (i === g0) { found = true; break; }
        const x = i % S, y = (i - x) / S;
        for (let k = 0; k < 8; k++) { const dx = DIRS[k][0], dy = DIRS[k][1], nx = x + dx, ny = y + dy;
            if (!isLand(nx, ny)) continue;
            if (dx && dy && (!isLand(x + dx, y) || !isLand(x, y + dy))) continue;   // no corner cutting
            const j = ny * S + nx; if (asClosed[j] === asGen) continue;
            const g = asG[i] + (dx && dy ? 1.4142 : 1);
            if (asOpen[j] !== asGen || g < asG[j]) { asOpen[j] = asGen; asG[j] = g; asFrom[j] = i; heapPush(j, g + h(nx, ny)); } }
    }
    let path = null;
    if (found) { path = []; for (let i = g0; i !== -1; i = asFrom[i]) path.push([i % S, (i - i % S) / S]); path.reverse(); }
    const ms = performance.now() - t0; pathStats.calls++; pathStats.totalMs += ms; pathStats.maxMs = Math.max(pathStats.maxMs, ms);
    if (pathCache.size > 300) pathCache.clear();
    pathCache.set(key, path);
    return path;
}
/** Plan a route for v to world point t: list of world waypoints ending at the (land) goal */
function planRoute(v, t) {
    const gt = screenToTile(t.x, t.y), gl = nearestLand(gt.x, gt.y), goalDry = gl.x === gt.x && gl.y === gt.y;
    const end = goalDry ? { x: t.x, y: t.y } : tileCenter(gl.x, gl.y);
    if (losClear(v.x, v.y, end.x, end.y)) return [end];
    if (pathBudget <= 0) { pathStats.waits++; return null; }
    pathBudget--;
    const st = screenToTile(v.x, v.y), sl = nearestLand(st.x, st.y);
    const tiles = findPath(sl.x, sl.y, gl.x, gl.y);
    if (!tiles) return [end];
    // LOS smoothing: from each anchor, run forward while the straight line stays dry
    const pts = tiles.map(p => tileCenter(p[0], p[1])); pts[pts.length - 1] = end;
    const out = []; let ax = v.x, ay = v.y, i = 0;
    while (i < pts.length - 1) { let j = i + 1; while (j + 1 < pts.length && losClear(ax, ay, pts[j + 1].x, pts[j + 1].y)) j++;
        if (j === i + 1 && !losClear(ax, ay, pts[j].x, pts[j].y)) j = i;   // can't see next: go via current tile centre
        if (j === i) { out.push(pts[i]); ax = pts[i].x; ay = pts[i].y; i++; continue; }
        out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j; }
    if (!out.length || out[out.length - 1] !== end) out.push(end);
    return out;
}
/** Move toward target along a planned path, returns true when arrived (or as close as land allows) */
function stepTo(v, t, dt, stopDist) {
    let dx = t.x - v.x, dy = t.y - v.y, d = Math.hypot(dx, dy);
    if (d <= stopDist) { v.route = null; return true; }
    const gt = screenToTile(t.x, t.y), gkey = gt.y * 4096 + gt.x;
    if (!v.route || v.routeKey !== gkey) { const r = planRoute(v, t); if (!r) return false; v.route = r; v.routeKey = gkey; }
    else { const last = v.route[v.route.length - 1]; if (isLand(gt.x, gt.y)) { last.x = t.x; last.y = t.y; } }   // goal drifts inside its tile (drop point)
    let s = VILLAGER_SPEED * dt;
    while (s > 0 && v.route.length) {
        const w = v.route[0], wx = w.x - v.x, wy = w.y - v.y, wd = Math.hypot(wx, wy), final = v.route.length === 1;
        if (final && Math.hypot(t.x - v.x, t.y - v.y) <= stopDist) break;
        v.walking = true; if (Math.abs(wx) > 0.5) v.face = wx > 0 ? 1 : -1;
        if (wd <= s) { v.x = w.x; v.y = w.y; s -= wd; v.route.shift(); }
        else { v.x += wx / wd * s; v.y += wy / wd * s; s = 0; }
    }
    if (!v.route.length) { v.route = null; return true; }   // reached the end (goal itself, or nearest dry tile)
    return Math.hypot(t.x - v.x, t.y - v.y) <= stopDist;
}
