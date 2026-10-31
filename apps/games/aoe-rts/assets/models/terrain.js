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
    /** ARQ1t mountain: 2-3 tall rocky peaks with lit/shaded faces, strata lines and snow caps (impassable) */
    AOE.models.mountainPeak = (c, v) => {
        shadow(c, 70, 22);
        const base = [0x6a6258, 0x5c564e, 0x726a5e, 0x625a50][v % 4], n = 2 + (v % 2), pk = [];
        for (let i = 0; i < n; i++) pk.push([(i - (n - 1) / 2) * 44 + (rnd() - 0.5) * 16, (rnd() - 0.5) * 10, 34 + rnd() * 12, 80 + rnd() * 50 * (i === 1 ? 1.25 : 1)]);
        pk.sort((a, b) => b[3] - a[3]).sort((a, b) => a[1] - b[1]);
        pk.forEach(([x, y, w, h]) => { const top = [x + (rnd() - 0.5) * 8, y - h], B = [x + w * 0.15, y + 8];
            poly(c, [[x - w, y], top, B], col(base, 1.2), col(base, 0.45), 1);
            poly(c, [B, top, [x + w, y]], col(base, 0.7), col(base, 0.4), 1);
            for (let s = 1; s <= 3; s++) { const t = s / 4; line(c, x - w * (1 - t), y - h * t, B[0] - w * 0.1, y - h * t + 6, 0.9, col(base, 0.5)); }
            const sn = 0.28; poly(c, [[top[0] - w * sn, top[1] + h * sn], top, [top[0] + w * sn, top[1] + h * sn], [top[0] + w * 0.05, top[1] + h * sn * 0.7]], '#eef2f6', '#b8c0c8', 1);
        });
    };
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
