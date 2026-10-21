/**
 * AOE RTS - R1b art: every map item is drawn ONCE with Canvas 2D at 2x resolution into texture atlas
 * pages, then shown as plain Phaser images (crisp when zoomed, cheap per frame).
 * Sizes are in world px at zoom 1 (tile = 128x64): villager ~110 tall, trees ~150-185, piles/bush ~100+,
 * house ~160, Town Center ~280 (+ flag).
 */
const Art = (() => {
    const RES = 2, PAGE = 4096, PI = Math.PI;
    const pages = [], frames = {};
    let cur = null;
    function newPage() { const cv = document.createElement('canvas'); cv.width = PAGE; cv.height = PAGE; cur = { cv, c: cv.getContext('2d'), x: 0, y: 0, rowH: 0, list: [] }; pages.push(cur); }
    /** w,h,ax,ay in world px; draw(c) with origin at the anchor (foot / footprint centre) */
    function add(name, w, h, ax, ay, draw) {
        const pw = Math.ceil(w * RES) + 2, ph = Math.ceil(h * RES) + 2;
        if (!cur) newPage();
        if (cur.x + pw > PAGE) { cur.x = 0; cur.y += cur.rowH; cur.rowH = 0; }
        if (cur.y + ph > PAGE) newPage();
        const c = cur.c; c.save(); c.translate(cur.x + 1, cur.y + 1); c.beginPath(); c.rect(0, 0, pw - 2, ph - 2); c.clip();
        c.scale(RES, RES); c.translate(ax, ay); c.lineJoin = 'round'; c.lineCap = 'round'; draw(c); c.restore();
        cur.list.push({ name, x: cur.x + 1, y: cur.y + 1, w: pw - 2, h: ph - 2 });
        frames[name] = { page: pages.length - 1, ox: ax * RES / (pw - 2), oy: ay * RES / (ph - 2) };
        cur.x += pw; cur.rowH = Math.max(cur.rowH, ph);
    }
    // ---------- helpers ----------
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    function col(hex, f) { const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0; return `rgb(${r},${g},${b})`; }
    function poly(c, pts, fill, stroke, lw) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } }
    function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 2 * PI); c.fillStyle = fill; c.fill(); }
    function line(c, x1, y1, x2, y2, w, s) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = s; c.stroke(); }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
    const shadow = (c, rx, ry) => ell(c, 0, 0, rx, ry, 'rgba(0,0,0,0.25)');
    // iso box faces: footprint half-width w, half-depth d, base y, height h
    const leftF = (w, d, y, h) => [[-w, y], [0, y + d], [0, y + d - h], [-w, y - h]];
    const rightF = (w, d, y, h) => [[0, y + d], [w, y], [w, y - h], [0, y + d - h]];
    function planks(c, w, d, y, h, n, s, side) {   // horizontal boards following the iso slope
        for (let k = 1; k < n; k++) { const t = h * k / n; if (side < 0) line(c, -w, y - t, 0, y + d - t, 0.8, s); else line(c, 0, y + d - t, w, y - t, 0.8, s); }
    }
    function stones(c, w, d, y, h, base, side) {    // stone blocks on a face
        const rows = Math.max(1, Math.round(h / 8));
        for (let r = 0; r < rows; r++) { const n = Math.round(w / 12); for (let i = 0; i < n; i++) {
            const t0 = (i + (r % 2) * 0.5) / n, t1 = Math.min(1, t0 + 1 / n - 0.02); if (t0 >= 1) continue;
            const yb = y - r * h / rows, yt = yb - h / rows + 1;
            const P = t => side < 0 ? [-w + w * t, d * t] : [w * t, d - d * t];
            const a = P(t0), b = P(t1);
            poly(c, [[a[0], yb + a[1]], [b[0], yb + b[1]], [b[0], yt + b[1]], [a[0], yt + a[1]]], col(base, 0.85 + rnd() * 0.3), col(base, 0.55), 0.7);
        } }
    }
    function roofTiles(c, A, B, apex, n, s) {       // rows of tiles on a triangular roof face
        for (let k = 1; k < n; k++) { const f = k / n, p = lerp(A, apex, f), q = lerp(B, apex, f); line(c, p[0], p[1], q[0], q[1], 0.9, s);
            const m = Math.max(2, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 7)); for (let i = 0; i < m; i++) { const r = lerp(p, q, (i + (k % 2) * 0.5) / m), r2 = lerp(lerp(A, apex, f - 1 / n), lerp(B, apex, f - 1 / n), (i + (k % 2) * 0.5) / m); line(c, r[0], r[1], r[0] * 0.7 + r2[0] * 0.3, r[1] * 0.7 + r2[1] * 0.3, 0.6, s); } }
    }
    // ---------- villager ----------
    const SKIN = '#efc49a', SKIN_D = '#c9966a';
    function leg(c, hipX, footDX, shade) {
        const hy = -34, fx = hipX + footDX, fy = -4;
        line(c, hipX, hy, (hipX + fx) / 2 + 1, -19, 8.5, shade);
        line(c, (hipX + fx) / 2 + 1, -19, fx, fy, 7.5, shade);
        ell(c, fx + 3, -2, 7, 3.6, '#2a1c10'); ell(c, fx + 4, -3.2, 4, 1.6, '#4a3424');
    }
    function arm(c, sx, sy, th, sleeve, len) {
        const ex = sx + Math.sin(th) * len, ey = sy + Math.cos(th) * len;
        line(c, sx, sy, sx + Math.sin(th) * len * 0.55, sy + Math.cos(th) * len * 0.55, 7, sleeve);
        line(c, sx + Math.sin(th) * len * 0.5, sy + Math.cos(th) * len * 0.5, ex, ey, 5.5, SKIN);
        ell(c, ex, ey, 3.6, 3.6, SKIN); ell(c, ex + 0.8, ey + 0.8, 2, 2, SKIN_D);
        return [ex, ey];
    }
    function tool(c, kind, hx, hy, th) {
        if (!kind || kind === 'none' || kind === 'basket') return;
        const dx = Math.sin(th), dy = Math.cos(th), L = kind === 'hammer' ? 20 : 30;
        const bx = hx - dx * 6, by = hy - dy * 6, tx = hx + dx * L, ty = hy + dy * L;
        line(c, bx, by, tx, ty, 3.4, '#6b4423'); line(c, bx, by, tx, ty, 1.2, '#9a6a3a');
        const px = -dy, py = dx;                 // perpendicular (forward side = +)
        if (kind === 'axe') {
            poly(c, [[tx - dx * 2, ty - dy * 2], [tx + px * 13 - dx * 6, ty + py * 13 - dy * 6], [tx + px * 14 + dx * 6, ty + py * 14 + dy * 6], [tx + dx * 4, ty + dy * 4]], '#b9c0c6', '#5a6066', 1);
            line(c, tx + px * 13 - dx * 6, ty + py * 13 - dy * 6, tx + px * 14 + dx * 6, ty + py * 14 + dy * 6, 1.4, '#eef3f6');
        } else if (kind === 'pick') {
            c.beginPath(); c.moveTo(tx - px * 14 - dx * 4, ty - py * 14 - dy * 4); c.quadraticCurveTo(tx + dx * 4, ty + dy * 4, tx + px * 14 - dx * 4, ty + py * 14 - dy * 4);
            c.lineWidth = 3.6; c.strokeStyle = '#8a9096'; c.stroke(); c.lineWidth = 1; c.strokeStyle = '#d6dadd'; c.stroke();
        } else if (kind === 'hammer') {
            poly(c, [[tx - px * 7 - dx * 3, ty - py * 7 - dy * 3], [tx + px * 7 - dx * 3, ty + py * 7 - dy * 3], [tx + px * 7 + dx * 4, ty + py * 7 + dy * 4], [tx - px * 7 + dx * 4, ty - py * 7 + dy * 4]], '#7a7a7a', '#3e3e3e', 1);
        }
    }
    function villager(c, kind, pose, f) {
        let ph = 0, bob = 0, lg = 0, backTh = 0.15, frontTh = 0.25;
        if (pose === 'walk') { ph = f / 8 * 2 * PI; bob = Math.abs(Math.sin(ph)) * 3; lg = Math.sin(ph); backTh = -Math.sin(ph) * 0.55; frontTh = Math.sin(ph) * 0.55; }
        if (pose === 'work') {
            const sw = [0, 0.2, 0.55, 0.9, 1, 0.5][f];
            if (kind === 'basket') { frontTh = 0.7 + Math.sin(f / 6 * 2 * PI) * 0.35; backTh = 0.5 + Math.cos(f / 6 * 2 * PI) * 0.3; }
            else { frontTh = 2.8 - sw * 2.1; backTh = frontTh - 0.25; }
            bob = pose === 'work' && kind !== 'basket' ? -sw * 1.5 + 1.5 : 0;
        }
        shadow(c, 20, 7);
        leg(c, -4, -lg * 9, '#3c2e1e');
        leg(c, 5, lg * 9, '#4f3e2a');
        c.save(); c.translate(0, -bob);
        // back arm
        arm(c, -3, -58, backTh, '#1a3f80', 22);
        if (kind === 'basket') { ell(c, -15, -40, 9, 7, '#7a5a30'); for (let i = 0; i < 3; i++) line(c, -23, -42 + i * 3, -7, -42 + i * 3, 0.7, '#4a3418'); ell(c, -15, -46, 8, 2.4, '#5a3e1e'); }
        // tunic
        c.beginPath(); c.moveTo(-12, -63); c.quadraticCurveTo(0, -67, 12, -63); c.lineTo(13, -40); c.quadraticCurveTo(16, -32, 16, -27);
        c.quadraticCurveTo(0, -23, -16, -27); c.quadraticCurveTo(-15, -33, -12, -40); c.closePath();
        c.fillStyle = lin(c, -14, 0, 16, 0, ['#4a7ad4', '#2f60bc', '#1d4488']); c.fill(); c.strokeStyle = '#163266'; c.lineWidth = 1; c.stroke();
        // folds
        [[-6, -36, -8, -27], [2, -36, 3, -25], [8, -37, 11, -27], [-3, -60, -5, -48]].forEach(l => line(c, l[0], l[1], l[2], l[3], 0.9, 'rgba(10,30,70,0.55)'));
        line(c, 4, -60, 6, -46, 0.8, 'rgba(255,255,255,0.18)');
        // belt
        poly(c, [[-13, -41], [13, -41], [13.5, -37], [-13.5, -37]], '#5a3a1a', '#3a2410', 0.8); poly(c, [[3, -41.5], [8, -41.5], [8, -36.5], [3, -36.5]], '#d9b24a', '#7a5a1a', 0.7);
        // neck + head
        poly(c, [[-3, -66], [5, -66], [5, -62], [-3, -62]], SKIN_D);
        const hx = 2, hy = -77;
        c.beginPath(); c.arc(hx, hy, 12, 0, 2 * PI); c.fillStyle = lin(c, hx - 12, hy - 12, hx + 12, hy + 12, ['#f6d2ac', SKIN, '#d9a77a']); c.fill();
        // hair (cap + back)
        c.beginPath(); c.arc(hx - 1, hy - 2, 12.5, PI * 0.95, PI * 2.05); c.quadraticCurveTo(hx + 6, hy - 9, hx - 2, hy - 7); c.quadraticCurveTo(hx - 9, hy - 3, hx - 11, hy + 6); c.closePath();
        c.fillStyle = '#6b4423'; c.fill(); [[-6, -86, -2, -80], [0, -88, 4, -82], [-9, -82, -8, -74]].forEach(l => line(c, l[0], l[1], l[2], l[3], 0.8, '#3e2612'));
        ell(c, hx - 3, hy + 1, 2.6, 3.4, SKIN_D);                               // ear
        ell(c, hx + 6.5, hy - 1, 2.2, 2.4, '#fff'); ell(c, hx + 7.3, hy - 0.8, 1.2, 1.4, '#2a1a10');  // eye
        line(c, hx + 4, hy - 5, hx + 9, hy - 5.5, 1.3, '#4a2e16');               // brow
        line(c, hx + 11.5, hy - 1, hx + 13, hy + 3, 1.4, '#c98e62');              // nose
        line(c, hx + 6, hy + 6.5, hx + 10, hy + 6, 1.1, '#9a4a3a');               // mouth
        ell(c, hx + 8, hy + 3, 2.4, 1.4, 'rgba(230,120,110,0.35)');              // cheek
        // front arm + tool
        const hand = arm(c, 7, -58, frontTh, '#2a56a8', 22);
        tool(c, kind, hand[0], hand[1], frontTh);
        c.restore();
    }
    function carry(c, type) {
        if (type === 'wood') { for (let i = 0; i < 3; i++) { const y = -i * 5.5; poly(c, [[-12, y - 2.5], [12, y - 2.5], [12, y + 2.5], [-12, y + 2.5]], '#8b5a2b', '#4a2e12', 0.8); ell(c, 12, y, 2.6, 2.8, '#d0a26a'); ell(c, 12, y, 1.2, 1.3, '#8b5a2b'); } line(c, -4, 3, -4, -14, 1.2, '#3a2a16'); }
        else if (type === 'food') { ell(c, 0, 0, 11, 8, '#8a6a3a'); for (let i = 0; i < 3; i++) line(c, -10, -2 + i * 3, 10, -2 + i * 3, 0.7, '#5a4020'); for (let i = 0; i < 6; i++) { ell(c, -6 + i * 2.4, -7 + (i % 2) * 2, 2.4, 2.4, '#b82058'); ell(c, -6.7 + i * 2.4, -7.7 + (i % 2) * 2, 0.9, 0.9, '#ff9ac4'); } }
        else { c.beginPath(); c.moveTo(-9, 6); c.quadraticCurveTo(-12, -6, -4, -10); c.lineTo(4, -10); c.quadraticCurveTo(12, -6, 9, 6); c.closePath(); c.fillStyle = '#7a5a34'; c.fill(); c.strokeStyle = '#3e2a14'; c.lineWidth = 0.8; c.stroke();
            line(c, -4, -9, 4, -9, 1.6, '#3e2a14'); const g = type === 'gold'; for (let i = 0; i < 3; i++) ell(c, -3 + i * 3, -12 + (i % 2), 2.6, 2.2, g ? '#f0c83a' : '#a8a8a2'); ell(c, -3.6, -12.8, 0.9, 0.7, g ? '#fff4b0' : '#e4e4e0'); }
    }
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
        seed = 777;
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
    function flag(c, f) {
        line(c, 0, 0, 0, -52, 2.6, '#3a2a1a'); ell(c, 0, -53, 2.4, 2.4, '#d9b24a');
        const ph = f / 4 * 2 * PI; c.beginPath(); c.moveTo(1, -50);
        for (let i = 0; i <= 8; i++) c.lineTo(1 + i * 3.6, -50 + Math.sin(ph + i * 0.7) * 2.6 + i * 0.3);
        for (let i = 8; i >= 0; i--) c.lineTo(1 + i * 3.6, -32 + Math.sin(ph + i * 0.7) * 2.6 + i * 0.6);
        c.closePath(); c.fillStyle = lin(c, 0, -50, 30, -32, ['#3a6ad0', '#2a5ab0', '#1d4488']); c.fill(); c.strokeStyle = '#163266'; c.lineWidth = 0.8; c.stroke();
        ell(c, 14, -41 + Math.sin(ph + 3) * 2.6, 4, 4, '#d9b24a');
    }
    // ---------- build all ----------
    function build(scene) {
        const T0 = performance.now();
        const kinds = ['none', 'axe', 'pick', 'hammer', 'basket'];
        kinds.forEach(k => {
            add(`v_${k}_idle`, 100, 130, 50, 118, c => villager(c, k, 'idle', 0));
            for (let f = 0; f < 8; f++) add(`v_${k}_walk${f}`, 100, 130, 50, 118, c => villager(c, k, 'walk', f));
            if (k !== 'none') for (let f = 0; f < 6; f++) add(`v_${k}_work${f}`, 100, 130, 50, 118, c => villager(c, k, 'work', f));
        });
        ['wood', 'food', 'gold', 'stone'].forEach(t => add('carry_' + t, 36, 34, 18, 20, c => carry(c, t)));
        for (let v = 0; v < 3; v++) {
            seed = 101 + v; add(`pine${v}`, 120, 200, 60, 185, c => pine(c, v, 1)); seed = 101 + v; add(`pine${v}_cut`, 120, 200, 60, 185, c => pine(c, v, 0.82));
            seed = 201 + v; add(`leafy${v}`, 120, 200, 60, 185, c => leafy(c, v, 1)); seed = 201 + v; add(`leafy${v}_cut`, 120, 200, 60, 185, c => leafy(c, v, 0.82));
        }
        seed = 301; add('stump', 80, 40, 30, 22, stump);
        for (let n = 0; n <= 4; n++) { seed = 401; add('berry' + n, 136, 112, 68, 96, c => bush(c, n * 4)); }
        ['gold', 'stone'].forEach(k => { for (let n = 1; n <= 6; n++) { seed = k === 'gold' ? 501 : 601; add(`${k}${n}`, 140, 112, 70, 94, c => pile(c, k, n)); } });
        [[1, 0.33], [1, 0.66], [1, 1], [2, 0.33], [2, 0.66], [2, 1], [3, 0.33], [3, 0.66], [3, 1], [4, 1]].forEach((s, i) => { seed = 701; add('house' + i, 150, 200, 75, 168, c => house(c, s[0], s[1])); });
        seed = 801; add('tc', 300, 320, 150, 240, townCenter);
        for (let f = 0; f < 4; f++) add('flag' + f, 40, 60, 4, 56, c => flag(c, f));
        pages.forEach((p, i) => {
            const h = p.y + p.rowH, cv = document.createElement('canvas'); cv.width = PAGE; cv.height = Math.max(2, h);
            cv.getContext('2d').drawImage(p.cv, 0, 0);
            const tex = scene.textures.addCanvas('art' + i, cv);
            p.list.forEach(f => tex.add(f.name, 0, f.x, f.y, f.w, f.h));
            p.cv.width = p.cv.height = 1;   // free the big scratch canvas
        });
        Art.bakeMs = Math.round(performance.now() - T0); Art.pages = pages.length;
    }
    /** Set a pooled image to an art frame at world (x,y) */
    function apply(img, name, x, y, flip, depth) {
        const f = frames[name];
        img.setTexture('art' + f.page, name).setOrigin(f.ox, f.oy).setPosition(x, y).setScale(1 / RES).setFlipX(!!flip).setDepth(depth).setVisible(true);
    }
    return { build, apply, frames, RES };
})();
