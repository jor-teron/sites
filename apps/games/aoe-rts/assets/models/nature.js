/** AOE RTS - models: trees, stumps, berry bushes, gold and stone piles (code-drawn, baked once into the atlas by assets/models/art.js) */
(() => {
    const { PI, add, rnd, setSeed, col, poly, ell, line, lerp, lin, shadow, leftF, rightF, planks, stones, roofTiles } = AOE.art;
    // ---------- trees ----------
    function trunk(c, w, h, base) {
        poly(c, [[-w / 2 - 2, 0], [w / 2 + 2, 0], [w / 2 - 1, -h], [-w / 2 + 1, -h]], lin(c, -w / 2, 0, w / 2, 0, [col(base, 1.25), col(base, 1), col(base, 0.6)]), col(base, 0.45), 0.8);
        for (let i = 0; i < 5; i++) { const x = -w / 2 + 2 + rnd() * (w - 4); line(c, x, -2 - rnd() * 4, x + (rnd() - 0.5) * 2, -h * (0.4 + rnd() * 0.6), 0.8, col(base, 0.5)); }
        for (let i = 0; i < 3; i++) ell(c, (rnd() - 0.5) * w * 0.6, -h * rnd(), 1.6, 1, col(base, 0.45));
        ell(c, 0, 0, w / 2 + 4, 3, col(base, 0.7));  // roots
    }
    function pine(c, v, lean) {
        shadow(c, 40 * lean, 14);
        const H = 1 + v * 0.08; trunk(c, 12, 46 * H, 0x6a4422);
        const greens = [0x1c4a20, 0x22582a, 0x2a6630, 0x347438];
        for (let i = 0; i < 4; i++) {
            const base = -32 * H - i * 27 * H, w = (48 - i * 9) * lean, top = base - 50 * H, pts = [[0, top]];
            const n = 7; for (let k = 0; k <= n; k++) { const t = k / n, x = w * (1 - 2 * t), y = base + (k % 2 ? -7 : 2) + Math.sin(t * PI) * 5; pts.push([x, y]); }
            pts.push([0, top]); pts.reverse();
            poly(c, pts, lin(c, -w, 0, w, 0, [col(greens[i], 1.35), col(greens[i], 1), col(greens[i], 0.6)]), col(greens[i], 0.5), 0.8);
            for (let k = 0; k < 6; k++) { const x = (rnd() - 0.5) * w * 1.3, y = base - rnd() * 40 * H; line(c, x, y, x + (x < 0 ? -5 : 5), y + 5, 1, col(greens[i], 1.6)); }
        }
    }
    function leafy(c, v, lean) {
        shadow(c, 46 * lean, 15);
        const H = 1 + v * 0.07; trunk(c, 15, 70 * H, 0x5e3c1c);
        line(c, -2, -55 * H, -18 * lean, -82 * H, 4, '#5e3c1c'); line(c, 3, -60 * H, 20 * lean, -88 * H, 4, '#5e3c1c');
        const cy = -112 * H, cl = [];
        for (let i = 0; i < 16; i++) { const a = rnd() * 2 * PI, r = Math.sqrt(rnd()); cl.push([Math.cos(a) * r * 40 * lean, cy + Math.sin(a) * r * 32 * H, 14 + rnd() * 9]); }
        cl.sort((a, b) => a[1] - b[1]);
        cl.forEach(p => { ell(c, p[0] + 2, p[1] + 3, p[2] * lean, p[2] * 0.9, '#1f4a1c'); });
        cl.forEach(p => { ell(c, p[0], p[1], p[2] * lean, p[2] * 0.88, '#2f6a2a'); ell(c, p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.55 * lean, p[2] * 0.45, '#46883a'); ell(c, p[0] - p[2] * 0.45, p[1] - p[2] * 0.5, p[2] * 0.2, p[2] * 0.15, '#6aa84e'); });
        for (let i = 0; i < 40; i++) ell(c, (rnd() - 0.5) * 80 * lean, cy + (rnd() - 0.5) * 66, 1.6, 1.1, rnd() > 0.5 ? '#5a9a44' : '#1c4418');
    }
    function stump(c) {
        shadow(c, 26, 9);
        poly(c, [[30, -2], [34, -8], [6, -16], [2, -10]], '#7a4e28', '#3e2410', 0.8); ell(c, 32, -5, 3.4, 4, '#d0a26a');
        poly(c, [[-11, 0], [11, 0], [10, -16], [-10, -16]], lin(c, -11, 0, 11, 0, ['#8a5a30', '#6b4423', '#4a2e14']));
        ell(c, 0, -16, 10, 4.2, '#d4a66c'); c.strokeStyle = '#9a6a3a'; c.lineWidth = 0.6; [7, 4.5, 2].forEach(r => { c.beginPath(); c.ellipse(0, -16, r, r * 0.42, 0, 0, 2 * PI); c.stroke(); });
        for (let i = 0; i < 6; i++) ell(c, (rnd() - 0.5) * 40, (rnd() - 0.5) * 6, 2, 1, '#c8a060');   // chips
    }
    // ---------- berry bush ----------
    function bush(c, n) {
        shadow(c, 54, 16);
        const cl = []; for (let i = 0; i < 22; i++) { const a = PI + rnd() * PI, r = 0.3 + rnd() * 0.7; cl.push([Math.cos(a) * r * 50, -8 + Math.sin(a) * r * 70, 13 + rnd() * 9]); }
        cl.push([0, -20, 26], [-26, -16, 20], [26, -16, 20]); cl.sort((a, b) => a[1] - b[1]);
        cl.forEach(p => ell(c, p[0] + 1, p[1] + 3, p[2], p[2] * 0.85, '#173f1a'));
        cl.forEach(p => { ell(c, p[0], p[1], p[2], p[2] * 0.82, '#25602a'); ell(c, p[0] - p[2] * 0.3, p[1] - p[2] * 0.3, p[2] * 0.5, p[2] * 0.4, '#3a7e3a'); });
        for (let i = 0; i < 30; i++) { const x = (rnd() - 0.5) * 90, y = -10 - rnd() * 66; ell(c, x, y, 3, 1.4, '#4e9a46'); }
        setSeed(777);
        for (let i = 0; i < n; i++) { const x = (rnd() - 0.5) * 84, y = -14 - rnd() * 58; for (let k = 0; k < 3; k++) { const bx = x + (k - 1) * 4, by = y + (k === 1 ? -3 : 0); ell(c, bx, by, 3.4, 3.4, '#8a1440'); ell(c, bx - 0.4, by - 0.4, 2.8, 2.8, '#c8205c'); ell(c, bx - 1.2, by - 1.2, 1, 1, '#ffb0d0'); } }
    }
    // ---------- rock piles ----------
    const ROCKS = [[0, -6, 58], [-34, 4, 40], [32, 6, 38], [-14, 14, 30], [20, -34, 34], [-26, -30, 32]];
    function rock(c, x, y, s, base, gold) {
        const pts = [], n = 8; for (let k = 0; k < n; k++) { const a = k / n * 2 * PI + 0.2, r = 0.82 + rnd() * 0.3; pts.push([x + Math.cos(a) * s * 0.62 * r, y - s * 0.42 + Math.sin(a) * s * 0.48 * r]); }
        poly(c, pts, col(base, 0.78), col(base, 0.45), 1);
        const top = pts.filter((p, k) => k >= 4 && k <= 7).concat([[x, y - s * 0.36]]);
        poly(c, top, col(base, 1.15)); poly(c, [pts[0], pts[1], pts[2], [x + s * 0.05, y - s * 0.3]], col(base, 0.6));
        poly(c, [pts[5], pts[6], [x - s * 0.05, y - s * 0.55]], col(base, 1.4));
        line(c, pts[7][0], pts[7][1], x, y - s * 0.36, 0.8, col(base, 0.5)); line(c, x, y - s * 0.36, pts[2][0], pts[2][1], 0.8, col(base, 0.5));
        if (gold) for (let i = 0; i < 4; i++) { const gx = x + (rnd() - 0.5) * s * 0.7, gy = y - s * 0.42 + (rnd() - 0.5) * s * 0.5, r = s * (0.06 + rnd() * 0.06); poly(c, [[gx, gy - r], [gx + r * 1.3, gy], [gx, gy + r], [gx - r * 1.3, gy]], '#e8c33a', '#9a7a18', 0.6); ell(c, gx - r * 0.3, gy - r * 0.3, r * 0.35, r * 0.25, '#fff2a0'); }
        else for (let i = 0; i < 3; i++) { const sx = x + (rnd() - 0.5) * s * 0.6, sy = y - s * 0.4 + (rnd() - 0.5) * s * 0.4; line(c, sx, sy, sx + 5, sy + 2, 0.8, col(base, 0.5)); }
    }
    function pile(c, kind, n) {
        const gold = kind === 'gold', base = gold ? 0x7a6e5e : 0x9a9a94;
        shadow(c, 60 * (0.6 + 0.4 * n / 6), 18);
        const order = [1, 2, 3, 0, 4, 5].slice(0, n).map(i => ROCKS[i]).sort((a, b) => a[1] - b[1]);
        // keep the big centre boulder when n >= 4; smaller piles get their rocks pushed up so they stay ~100 tall
        order.forEach(r => rock(c, r[0], r[1] + (n < 4 ? 0 : 0), r[2] * (n < 3 ? 1.35 : 1), base, gold));
    }
    Object.assign(AOE.models, { pine, leafy, stump, bush, pile });
})();
