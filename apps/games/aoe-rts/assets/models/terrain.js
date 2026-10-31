/** AOE RTS - R2b models: rock outcrops (atlas frames) + ground painters for hills, fords and ground variety (code-drawn) */
(() => {
    const { PI, rnd, col, poly, ell, line, shadow } = AOE.art;
    /** Rock outcrop: a cluster of angular grey-brown boulders (impassable, not minable) */
    function rockOutcrop(c, v) {
        shadow(c, 54, 18);
        const n = 3 + v, bs = [];
        for (let i = 0; i < n; i++) bs.push([(rnd() - 0.5) * 70, (rnd() - 0.5) * 22, 14 + rnd() * 12, 22 + rnd() * 26 * (i === 0 ? 1.3 : 1)]);
        bs.sort((a, b) => a[1] - b[1]);
        const base = [0x6b5f50, 0x5e5448, 0x74685a, 0x564d44][v % 4];   // darker + browner than the grey stone resource
        bs.forEach(([x, y, w, h]) => {
            const k = 0.6 + rnd() * 0.3, top = [x + (rnd() - 0.5) * w * 0.5, y - h];
            const L = [x - w, y], Rr = [x + w, y], B = [x + w * 0.1, y + w * 0.35], ml = [x - w * 0.8, y - h * k], mr = [x + w * 0.75, y - h * (k - 0.1)];
            poly(c, [L, ml, top, B], col(base, 1.15), col(base, 0.45), 1);           // lit left face
            poly(c, [B, top, mr, Rr], col(base, 0.72), col(base, 0.4), 1);          // shaded right face
            line(c, top[0], top[1], B[0], B[1], 1, col(base, 1.35));                // ridge
            for (let i = 0; i < 3; i++) { const t = 0.2 + rnd() * 0.6; line(c, x - w * 0.6 * t, y - h * t * 0.6, x - w * 0.2 * t, y - h * t * 0.9, 0.8, col(base, 0.55)); }
            if (rnd() > 0.5) ell(c, x - w * 0.4, y - h * 0.5, 4, 2.4, 'rgba(110,140,70,0.7)');   // moss
        });
        for (let i = 0; i < 6; i++) ell(c, (rnd() - 0.5) * 100, 6 + (rnd() - 0.5) * 12, 2 + rnd() * 3, 1.5 + rnd() * 1.5, col(base, 0.9 + rnd() * 0.3));   // pebbles
    }
    AOE.models.rockOutcrop = rockOutcrop;
})();
/** Ground painters used while baking grass chunks (core/render.js bakeChunk) */
const TerrainArt = {
    /** base tile colours per ground type: 0 grass, 1 lush, 2 dry, 3 dirt, 4 sand */
    PALETTES: [
        ['#4a7d3a', '#44753a', '#4f8540', '#3f6e35', '#538a43'],
        ['#3d7232', '#386b30', '#417838', '#35652d', '#447c39'],
        ['#6a8a3e', '#71903f', '#66853c', '#768f45', '#6c8a40'],
        ['#8a7350', '#83704e', '#917a55', '#7c6a49', '#8e7752'],
        ['#c9b27a', '#c2ab74', '#cfb983', '#bea670', '#c6af78']
    ],
    BLADES: [40, 46, 26, 8, 0],                 // grass blades per tile
    palette(g) { return this.PALETTES[g] || this.PALETTES[0]; },
    /** dirt / sand speckles */
    speckle(c, p, g, hash, x, y) {
        if (g !== 3 && g !== 4) return;
        for (let i = 0; i < 14; i++) { const sx = p.x + (hash(x, y, i + 120) - 0.5) * 100, sy = p.y + (hash(x, y, i + 140) - 0.5) * 46;
            c.fillStyle = g === 3 ? (i % 2 ? 'rgba(60,40,20,0.35)' : 'rgba(200,170,120,0.35)') : (i % 2 ? 'rgba(150,120,70,0.35)' : 'rgba(255,245,210,0.45)');
            c.beginPath(); c.ellipse(sx, sy, 2 + hash(x, y, i + 160) * 3, 1.2 + hash(x, y, i + 170) * 1.5, 0, 0, 7); c.fill(); }
    },
    /** Hill tile: lit top, dark slope bands on the down-hill (front) edges, light rim on the back edges */
    hill(c, p, x, y, isHill, hash) {
        const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2, T = [p.x, p.y - hh], Rr = [p.x + hw, p.y], B = [p.x, p.y + hh], L = [p.x - hw, p.y];
        c.save(); c.beginPath(); c.moveTo(T[0], T[1]); c.lineTo(Rr[0], Rr[1]); c.lineTo(B[0], B[1]); c.lineTo(L[0], L[1]); c.closePath(); c.clip();
        const g = c.createLinearGradient(p.x - hw, p.y - hh, p.x + hw * 0.4, p.y + hh); g.addColorStop(0, 'rgba(255,245,190,0.22)'); g.addColorStop(1, 'rgba(255,245,190,0.04)');
        c.fillStyle = g; c.fillRect(p.x - hw, p.y - hh, TILE_WIDTH, TILE_HEIGHT);
        // contour lines
        c.strokeStyle = 'rgba(60,70,30,0.18)'; c.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) { const oy = (hash(x, y, 200 + i) - 0.5) * 30; c.beginPath(); c.moveTo(p.x - hw, p.y + oy); c.quadraticCurveTo(p.x, p.y + oy - 10, p.x + hw, p.y + oy); c.stroke(); }
        // front edges (x+1: R-B, y+1: B-L) -> slope shading; back edges (x-1: L-T, y-1: T-R) -> sunny rim
        [[1, 0, Rr, B, 1], [0, 1, B, L, 1], [-1, 0, L, T, 0], [0, -1, T, Rr, 0]].forEach(e => {
            if (isHill(x + e[0], y + e[1])) return;
            c.beginPath(); c.moveTo(e[2][0], e[2][1]); c.lineTo(e[3][0], e[3][1]);
            if (e[4]) { c.strokeStyle = 'rgba(30,40,15,0.45)'; c.lineWidth = 22; c.stroke(); c.strokeStyle = 'rgba(20,25,10,0.35)'; c.lineWidth = 6; c.stroke(); }
            else { c.strokeStyle = 'rgba(255,250,200,0.30)'; c.lineWidth = 10; c.stroke(); }
        });
        c.restore();
        if (hash(x, y, 210) > 0.7) { c.fillStyle = '#8a8474'; c.beginPath(); c.ellipse(p.x - 14, p.y + 4, 5, 3, 0, 0, 7); c.fill(); }
    },
    /** ARQ1t2 mountain ground tile: a little height-mesh (4 shared corners + a raised centre), so neighbouring cells join into one
     *  range; each facet is lit by its slope, high facets get snow. dep(x, y) = cells to the range edge (0 = not mountain). */
    mountain(c, p, x, y, dep, hash) {
        const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2, LIFT = 46;
        const ch = (u, v) => Math.max(0, Math.min(dep(u - 1, v - 1), dep(u, v - 1), dep(u - 1, v), dep(u, v)) - 1) * 0.8;   // corner (u, v) height
        const P = [[0, -1, ch(x, y)], [1, 0, ch(x + 1, y)], [0, 1, ch(x + 1, y + 1)], [-1, 0, ch(x, y + 1)]], d = dep(x, y);
        const C = [(hash(x, y, 300) - 0.5) * 0.8, (hash(x, y, 301) - 0.5) * 0.6, 0.55 + (d - 1) * 0.75 + hash(x, y, 302) * 0.35];
        for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4];
            // world-ish normal of facet (a, b, C): x = screen-right, y = screen-down, z = up
            const ux = a[0] - C[0], uy = a[1] - C[1], uz = a[2] - C[2], vx = b[0] - C[0], vy = b[1] - C[1], vz = b[2] - C[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const lit = Math.max(0, (-0.6 * nx - 0.5 * ny + 0.62 * nz) / Math.hypot(nx, ny, nz)), f = 0.5 + 0.7 * lit;
            const snow = C[2] > 1.2 && (Math.max(a[2], b[2]) > 0.5 || hash(x, y, 304 + k) > 0.5);
            const base = snow ? [236, 240, 244] : [150 + hash(x, y, 303 + k) * 18, 142, 126];
            c.fillStyle = `rgb(${base.map(v => Math.min(255, v * (snow ? 0.55 + 0.5 * lit : f)) | 0)})`;
            const s = q => [p.x + q[0] * hw, p.y + q[1] * hh - q[2] * LIFT];
            const A = s(a), Bq = s(b), Cq = s(C);
            c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(Bq[0], Bq[1]); c.lineTo(Cq[0], Cq[1]); c.closePath(); c.fill(); c.strokeStyle = c.fillStyle; c.lineWidth = 1; c.stroke();
            c.strokeStyle = 'rgba(40,34,26,0.25)'; c.lineWidth = 1.2;   // strata
            for (let i = 1; i < 3; i++) { const t = i / 3; c.beginPath(); c.moveTo(Cq[0] + (A[0] - Cq[0]) * t, Cq[1] + (A[1] - Cq[1]) * t); c.lineTo(Cq[0] + (Bq[0] - Cq[0]) * t * (0.6 + hash(x, y, 310 + i + k * 3) * 0.4), Cq[1] + (Bq[1] - Cq[1]) * t); c.stroke(); }
        }
    },
    /** ARQ1t2 foothill fade: a soft rocky-brown shadow on the grass edges that touch a mountain (kept inside this tile) */
    foothill(c, p, x, y, isM) {
        const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2, T = [p.x, p.y - hh], Rr = [p.x + hw, p.y], B = [p.x, p.y + hh], L = [p.x - hw, p.y];
        const E = [[1, 0, Rr, B], [0, 1, B, L], [-1, 0, L, T], [0, -1, T, Rr]].filter(e => isM(x + e[0], y + e[1]));
        if (!E.length) return;
        c.save(); c.beginPath(); c.moveTo(T[0], T[1]); c.lineTo(Rr[0], Rr[1]); c.lineTo(B[0], B[1]); c.lineTo(L[0], L[1]); c.closePath(); c.clip(); c.lineCap = 'round';
        E.forEach(e => [[40, 'rgba(110,100,80,0.18)'], [22, 'rgba(100,90,72,0.3)'], [9, 'rgba(85,77,62,0.45)']].forEach(([w, f]) => { c.strokeStyle = f; c.lineWidth = w; c.beginPath(); c.moveTo(e[2][0], e[2][1]); c.lineTo(e[3][0], e[3][1]); c.stroke(); }));
        c.restore();
    },
    /** Ford: shallow, see-through water over sand with pebbles and a gentle current */
    ford(c, p, x, y, hash) {
        const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
        c.save(); c.beginPath(); c.moveTo(p.x, p.y - hh - 0.5); c.lineTo(p.x + hw + 0.5, p.y); c.lineTo(p.x, p.y + hh + 0.5); c.lineTo(p.x - hw - 0.5, p.y); c.closePath();
        c.fillStyle = 'rgba(90,170,200,0.55)'; c.fill(); c.clip();
        for (let i = 0; i < 9; i++) { c.fillStyle = i % 3 ? 'rgba(170,150,110,0.8)' : 'rgba(120,110,90,0.8)'; c.beginPath();
            c.ellipse(p.x + (hash(x, y, i + 220) - 0.5) * 96, p.y + (hash(x, y, i + 230) - 0.5) * 44, 3 + hash(x, y, i + 240) * 4, 2 + hash(x, y, i + 250) * 2, 0, 0, 7); c.fill(); }
        c.strokeStyle = 'rgba(230,248,255,0.5)'; c.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) { const rx = p.x + (hash(x, y, i + 260) - 0.5) * 70, ry = p.y + (hash(x, y, i + 270) - 0.5) * 30; c.beginPath(); c.moveTo(rx - 14, ry); c.quadraticCurveTo(rx, ry - 4, rx + 14, ry); c.stroke(); }
        c.restore();
    },
    MINI: { mount: '#9a958c', rock: '#6e6a62', hill: 'rgba(255,240,170,0.28)', ford: '#7fc0d8', dirt: 'rgba(140,110,70,0.55)', sand: 'rgba(210,190,130,0.7)', lush: 'rgba(20,60,15,0.25)', dry: 'rgba(160,170,70,0.25)' }
};
