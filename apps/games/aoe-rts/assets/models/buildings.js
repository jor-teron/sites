/** AOE RTS - models: houses, Town Center, flag (code-drawn, baked once into the atlas by assets/models/art.js) */
(() => {
    const { PI, add, rnd, setSeed, col, poly, ell, line, lerp, lin, shadow, leftF, rightF, planks, stones, roofTiles } = AOE.art;
    // ---------- buildings ----------
    function house(c, stage, k) {
        const w = 54, d = 27, H = 62, fh = 8;
        shadow(c, 70, 34);
        poly(c, [[-64, 0], [0, 32], [64, 0], [0, -32]], '#9c8a66'); poly(c, [[-64, 0], [0, 32], [64, 0], [0, -32]], null, 'rgba(60,40,20,0.4)', 1);
        // stone foundation
        poly(c, [[-w, 0], [0, d], [w, 0], [0, -d]], '#8a8478');
        stones(c, w, d, 0, fh, 0x8a8478, -1); stones(c, w, d, 0, fh, 0x6a655c, 1);
        poly(c, [[-w, -fh], [0, d - fh], [w, -fh], [0, -d - fh]], '#a49a88', '#6a655c', 0.8);
        const y = -fh, posts = h => [[-w, 0], [0, d], [w, 0], [0, -d]].forEach(o => { line(c, o[0], y + o[1], o[0], y + o[1] - h, 4.5, '#6b4423'); line(c, o[0] - 1, y + o[1], o[0] - 1, y + o[1] - h, 1.2, '#9a6a3a'); });
        if (stage === 1) { for (let i = 0; i < 3; i++) poly(c, [[-30 + i * 12, y + 6 + i * 3], [-14 + i * 12, y + 14 + i * 3], [-12 + i * 12, y + 11 + i * 3], [-28 + i * 12, y + 3 + i * 3]], '#a07848', '#5a3a1a', 0.6); posts(H * k); return; }
        const wh = stage === 2 ? H * k : H;
        // walls: planks
        poly(c, leftF(w, d, y, wh), lin(c, -w, 0, 0, 0, ['#d8b27a', '#c9a26a']), '#6b4423', 1); planks(c, w, d, y, wh, Math.round(wh / 7), 'rgba(90,58,26,0.55)', -1);
        poly(c, rightF(w, d, y, wh), lin(c, 0, 0, w, 0, ['#b08a55', '#94723f']), '#5a3a1a', 1); planks(c, w, d, y, wh, Math.round(wh / 7), 'rgba(70,44,18,0.6)', 1);
        posts(H);
        const ry = y - H, A = [-w - 8, ry + 2], F = [0, ry + d + 6], B = [w + 8, ry + 2], apex = [0, ry - 58], back = [0, ry - d - 4];
        if (stage === 2) { line(c, A[0] + 8, ry, apex[0], apex[1], 3, '#6b4423'); line(c, B[0] - 8, ry, apex[0], apex[1], 3, '#6b4423'); line(c, F[0], ry + d, apex[0], apex[1], 3, '#6b4423'); return; }
        // door + window
        poly(c, [[-30, y + 11], [-17, y + 17.5], [-17, y - 14], [-30, y - 20]], '#3a2412', '#20140a', 1); ell(c, -20, y - 1, 1.3, 1.3, '#d9b24a');
        poly(c, [[16, y - 22], [30, y - 29], [30, y - 41], [16, y - 34]], stage === 4 ? '#ffd27a' : '#2a2018', '#5a3a1a', 2); line(c, 23, y - 25.5, 23, y - 37.5, 1, '#5a3a1a');
        const a = stage === 3 ? k : 1;
        c.globalAlpha = a;
        poly(c, [back, A, apex], '#9e3c26'); poly(c, [A, F, apex], lin(c, A[0], 0, 0, 0, ['#a8422a', '#8a3220']), '#4a160c', 1); poly(c, [F, B, apex], lin(c, 0, 0, B[0], 0, ['#6a2416', '#561c10']), '#3a100a', 1);
        roofTiles(c, A, F, apex, 8, 'rgba(60,16,8,0.55)'); roofTiles(c, F, B, apex, 8, 'rgba(30,8,4,0.6)');
        line(c, F[0], F[1], apex[0], apex[1], 2, '#c86a4a');
        c.globalAlpha = 1;
        if (stage === 3) { line(c, A[0] + 8, ry, apex[0], apex[1], 3, '#6b4423'); line(c, B[0] - 8, ry, apex[0], apex[1], 3, '#6b4423'); [[-w - 10, 4], [w + 10, 4]].forEach(o => { line(c, o[0], y + o[1], o[0], ry - 10, 2, '#8a6a3a'); for (let i = 0; i < 4; i++) line(c, o[0] - 6, y - i * 18, o[0] + 6, y - i * 18, 1.6, '#8a6a3a'); }); }
        if (stage === 4) { poly(c, [[18, ry - 20], [28, ry - 25], [28, ry - 50], [18, ry - 45]], '#7a756c', '#4a4640', 1); for (let i = 1; i < 4; i++) line(c, 18, ry - 20 - i * 6, 28, ry - 25 - i * 6, 0.7, '#4a4640'); ell(c, 23, ry - 47.5, 5, 2.2, '#3a3632'); }
    }
    function townCenter(c) {
        // paved pad (2x2 tiles)
        shadow(c, 150, 60);
        poly(c, [[-128, 0], [0, 64], [128, 0], [0, -64]], '#a08a62', 'rgba(70,50,30,0.5)', 1.2);
        for (let i = 0; i < 70; i++) { const u = rnd() * 2 - 1, v = rnd() * 2 - 1; if (Math.abs(u) + Math.abs(v) > 0.95) continue; ell(c, u * 110 * 0.5 + v * 110 * 0.5, (v - u) * 28, 6 + rnd() * 4, 3 + rnd() * 1.5, col(0x9a8a6a, 0.85 + rnd() * 0.3)); }
        const W = 112, D = 56, FH = 24;
        poly(c, leftF(W, D, 0, FH), '#8a8478'); poly(c, rightF(W, D, 0, FH), '#6a655c');
        stones(c, W, D, 0, FH, 0x8e887c, -1); stones(c, W, D, 0, FH, 0x6a655c, 1);
        poly(c, [[-W, -FH], [0, D - FH], [W, -FH], [0, -D - FH]], '#a49a88', '#6a655c', 1);
        // steps
        for (let i = 0; i < 3; i++) poly(c, [[-40 + i * 4, 28 - i * 6 + 8], [-14 + i * 4, 41 - i * 6 + 8], [-14 + i * 4, 37 - i * 6 + 8], [-40 + i * 4, 24 - i * 6 + 8]], col(0x9a9284, 1 - i * 0.08), '#5a554c', 0.6);
        const w = 98, d = 49, h = 84, by = -FH;
        poly(c, leftF(w, d, by, h), '#e2d2b0', '#5a3a1a', 1.2); poly(c, rightF(w, d, by, h), '#c0ae8a', '#4a2e12', 1.2);
        planks(c, w, d, by, 16, 3, 'rgba(90,58,26,0.6)', -1); planks(c, w, d, by, 16, 3, 'rgba(70,44,18,0.6)', 1);
        // timber framing
        const bm = (side, t0, y0, t1, y1) => { const P = (t, yy) => side < 0 ? [-w + w * t, by + d * t - yy] : [w * t, by + d - d * t - yy]; const a = P(t0, y0), b = P(t1, y1); line(c, a[0], a[1], b[0], b[1], 4, '#5a3a1a'); line(c, a[0], a[1] - 1, b[0], b[1] - 1, 1, '#8a5a30'); };
        [-1, 1].forEach(s => { [0, 0.25, 0.5, 0.75, 1].forEach(t => bm(s, t, 0, t, h)); bm(s, 0, h / 2, 1, h / 2); bm(s, 0, h - 2, 1, h - 2); bm(s, 0, 16, 1, 16); bm(s, 0, 16, 0.25, h / 2); bm(s, 0.5, h / 2, 0.75, h - 2); });
        // door (left face) + windows
        poly(c, [[-62, by + 18 + 2], [-40, by + 29 + 2], [-40, by - 8], [-62, by - 19]], '#3a2412', '#20140a', 1.5);
        c.beginPath(); c.moveTo(-62, by - 19); c.quadraticCurveTo(-51, by - 30, -40, by - 8); c.fillStyle = '#3a2412'; c.fill();
        line(c, -51, by + 24, -51, by - 18, 1, '#5a3a1a'); ell(c, -44, by + 6, 1.6, 1.6, '#d9b24a');
        [[24, 46], [60, 28]].forEach(p => { poly(c, [[p[0], by - p[1] + 5 - 30], [p[0] + 16, by - p[1] - 3 - 30], [p[0] + 16, by - p[1] - 23 - 30], [p[0], by - p[1] - 15 - 30]], '#ffd27a', '#5a3a1a', 2.5); line(c, p[0] + 8, by - p[1] + 1 - 30, p[0] + 8, by - p[1] - 19 - 30, 1.2, '#5a3a1a'); });
        poly(c, [[-82, by - 40], [-68, by - 33], [-68, by - 53], [-82, by - 60]], '#ffd27a', '#5a3a1a', 2.5);
        // hip roof with tiles
        const ry = by - h, A = [-w - 12, ry + 3], F = [0, ry + d + 9], B = [w + 12, ry + 3], apex = [0, ry - 95], back = [0, ry - d - 6];
        poly(c, [back, A, apex], '#9e3c26'); poly(c, [back, B, apex], '#5a1c10');
        poly(c, [A, F, apex], lin(c, A[0], 0, 0, 0, ['#b04a2e', '#8a3220']), '#4a160c', 1.2); poly(c, [F, B, apex], lin(c, 0, 0, B[0], 0, ['#6e2618', '#561c10']), '#3a100a', 1.2);
        roofTiles(c, A, F, apex, 13, 'rgba(60,16,8,0.6)'); roofTiles(c, F, B, apex, 13, 'rgba(30,8,4,0.6)');
        line(c, F[0], F[1], apex[0], apex[1], 3, '#c86a4a'); line(c, A[0], A[1], F[0], F[1], 2, '#4a160c'); line(c, F[0], F[1], B[0], B[1], 2, '#3a100a');
        // dormer + chimney
        poly(c, [[36, ry - 30], [56, ry - 40], [56, ry - 62], [36, ry - 52]], '#7a756c', '#4a4640', 1); for (let i = 1; i < 4; i++) line(c, 36, ry - 30 - i * 7 + 0, 56, ry - 40 - i * 7, 0.8, '#4a4640'); ell(c, 46, ry - 57, 10, 3.5, '#3a3632');
    }
    function flag(c, f, pal = ['#3a6ad0', '#2a5ab0', '#1d4488', '#163266']) {
        line(c, 0, 0, 0, -52, 2.6, '#3a2a1a'); ell(c, 0, -53, 2.4, 2.4, '#d9b24a');
        const ph = f / 4 * 2 * PI; c.beginPath(); c.moveTo(1, -50);
        for (let i = 0; i <= 8; i++) c.lineTo(1 + i * 3.6, -50 + Math.sin(ph + i * 0.7) * 2.6 + i * 0.3);
        for (let i = 8; i >= 0; i--) c.lineTo(1 + i * 3.6, -32 + Math.sin(ph + i * 0.7) * 2.6 + i * 0.6);
        c.closePath(); c.fillStyle = lin(c, 0, -50, 30, -32, pal.slice(0, 3)); c.fill(); c.strokeStyle = pal[3]; c.lineWidth = 0.8; c.stroke();
        ell(c, 14, -41 + Math.sin(ph + 3) * 2.6, 4, 4, '#d9b24a');
    }
    /** ARQ1b Barracks: dark timber hall on a stone footing, slate roof, crossed swords on the front */
    function barracks(c) {
        const w = 58, d = 29, H = 46, y = -H - 6;
        shadow(c, 74, 36); poly(c, [[-64, 0], [0, 32], [64, 0], [0, -32]], '#8a7a5a');
        poly(c, leftF(w, d, 0, 6), '#8a8478'); poly(c, rightF(w, d, 0, 6), '#6a655c');
        poly(c, leftF(w, d, -6, H), lin(c, -w, 0, 0, 0, ['#8a6238', '#6e4a28']), '#2e1c0a', 1); poly(c, rightF(w, d, -6, H), lin(c, 0, 0, w, 0, ['#5e4226', '#4a321a']), '#22140a', 1);
        planks(c, w, d, -6, H, 6, 'rgba(30,18,8,0.5)', -1); planks(c, w, d, -6, H, 6, 'rgba(30,18,8,0.5)', 1);
        poly(c, [[-38, 4], [-20, 13], [-20, -20], [-38, -29]], '#2a1a0c', '#140c04', 1);
        const A = [-w - 5, y], F = [0, y + d + 3], B = [w + 5, y], apex = [0, y - 36], back = [0, y - d - 3];
        poly(c, [back, A, apex], '#3e3e46'); poly(c, [A, F, apex], lin(c, A[0], 0, 0, 0, ['#6a6a76', '#545460']), '#22222a', 1); poly(c, [F, B, apex], '#40404a', '#22222a', 1);
        roofTiles(c, A, F, apex, 9, 'rgba(20,20,28,0.5)'); roofTiles(c, F, B, apex, 9, 'rgba(10,10,16,0.5)');
        line(c, 18, -36, 40, -18, 3, '#dfe5ea'); line(c, 40, -40, 18, -14, 3, '#dfe5ea'); line(c, 20, -24, 26, -30, 2.4, '#c9a040'); line(c, 32, -30, 38, -24, 2.4, '#c9a040');
    }
    /** ARQ1c: hanging team banner (cloth with a gold trim and a swallow-tail) for building fronts */
    function banner(c, pal) {
        line(c, -9, 1, 9, 1, 2, '#5a3a1a'); poly(c, [[-7, 2], [7, 2], [7, 24], [0, 19], [-7, 24]], lin(c, -7, 0, 7, 0, pal.slice(0, 3)), pal[3], 0.8);
        line(c, -7, 5, 7, 5, 1.2, '#d9b24a'); ell(c, 0, 11, 2.6, 2.6, '#d9b24a');
    }
    Object.assign(AOE.models, { house, townCenter, flag, barracks, banner });
})();
