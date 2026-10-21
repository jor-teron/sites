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
    const SKIN = '#efc49a', SKIN_D = '#c9966a', SKIN_L = '#f8dcbc';
    let HAIR = '#6b4423', HAIR_D = '#3e2612', HAIR_L = '#9a6a3a';
    let FEM = false;   // R2a: female villager variant (slimmer, long braid, dress-length tunic, softer face)
    function setFem(f) { FEM = f; if (f) { HAIR = '#8a3c1c'; HAIR_D = '#4e1e0c'; HAIR_L = '#c0683a'; } else { HAIR = '#6b4423'; HAIR_D = '#3e2612'; HAIR_L = '#9a6a3a'; } }
    const PANT = ['#3c2e1e', '#4f3e2a'], BOOT = '#2a1c10', BOOT_L = '#5a4030';
    /** tapered limb segment drawn as a quad with rounded joints */
    function seg(c, x1, y1, x2, y2, w1, w2, fill, stroke) {
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        poly(c, [[x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x2 + nx * w2 / 2, y2 + ny * w2 / 2], [x2 - nx * w2 / 2, y2 - ny * w2 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2]], fill, stroke, 0.7);
        ell(c, x1, y1, w1 / 2, w1 / 2, fill); ell(c, x2, y2, w2 / 2, w2 / 2, fill);
    }
    function leg(c, hipX, footDX, lift, back) {
        const hy = -34, fx = hipX + footDX, fy = -4 - lift, kx = (hipX + fx) / 2 + 2, ky = -19 - lift * 0.6;
        const sh = PANT[back ? 0 : 1];
        seg(c, hipX, hy, kx, ky, 9.5, 7.5, sh, 'rgba(0,0,0,0.35)');          // thigh
        seg(c, kx, ky, fx, fy - 3, 7.5, 6.5, sh, 'rgba(0,0,0,0.35)');        // shin
        line(c, hipX + 2, hy + 2, kx + 1.5, ky, 1, 'rgba(255,255,255,0.12)');  // trouser crease
        // boot: shaft + foot + sole + lace band
        poly(c, [[fx - 4, fy - 9], [fx + 3.5, fy - 9], [fx + 4, fy - 2], [fx + 10, fy - 1], [fx + 10.5, fy + 1.6], [fx - 4.5, fy + 1.6]], BOOT, '#120a04', 0.8);
        line(c, fx - 4.5, fy + 1.2, fx + 10.5, fy + 1.2, 1.4, '#0e0804');
        line(c, fx - 3.6, fy - 6.5, fx + 3, fy - 6.5, 1.2, BOOT_L);
        ell(c, fx + 6, fy - 1.6, 3, 1, BOOT_L);
    }
    function hand(c, x, y, th) {
        const dx = Math.sin(th), dy = Math.cos(th);
        ell(c, x, y, 4, 3.6, SKIN); ell(c, x - 0.8, y - 0.8, 2, 1.6, SKIN_L);
        for (let i = -1; i <= 1; i++) line(c, x + dx * 2.6 - dy * i * 1.5, y + dy * 2.6 + dx * i * 1.5, x + dx * 3.4 - dy * i * 1.5, y + dy * 3.4 + dx * i * 1.5, 0.6, SKIN_D);   // knuckle creases
        ell(c, x - dy * 3, y + dx * 3, 1.6, 1.4, SKIN_D);   // thumb
    }
    function arm(c, sx, sy, th, sleeve, len, bend) {
        const ua = th - (bend || 0), ex = sx + Math.sin(ua) * len * 0.5, ey = sy + Math.cos(ua) * len * 0.5;
        const hx = ex + Math.sin(th) * len * 0.5, hy = ey + Math.cos(th) * len * 0.5;
        seg(c, sx, sy, ex, ey, 8, 7, sleeve, 'rgba(0,0,0,0.35)');               // sleeve
        line(c, sx - 1, sy + 1, ex - 1, ey, 1, 'rgba(255,255,255,0.18)');
        seg(c, ex, ey, hx, hy, 5.6, 4.6, SKIN, 'rgba(120,70,40,0.35)');          // forearm
        poly(c, [[ex - 3.8, ey - 1.5], [ex + 3.8, ey - 1.5], [ex + 3.6, ey + 2], [ex - 3.6, ey + 2]], col(0x2a56a8, 0.8));  // cuff
        hand(c, hx, hy, th);
        return [hx, hy];
    }
    function tool(c, kind, hx, hy, th) {
        if (!kind || kind === 'none' || kind === 'basket') return;
        const dx = Math.sin(th), dy = Math.cos(th), L = kind === 'hammer' ? 21 : 31;
        const bx = hx - dx * 6, by = hy - dy * 6, tx = hx + dx * L, ty = hy + dy * L;
        const px = -dy, py = dx;                 // perpendicular (forward side = +)
        // handle with grain
        line(c, bx, by, tx, ty, 3.8, '#5a3818'); line(c, bx, by, tx, ty, 2.4, '#7a4e26');
        line(c, bx + px * 0.6, by + py * 0.6, tx + px * 0.6, ty + py * 0.6, 0.7, '#a8784a');
        for (let k = 0.2; k < 0.9; k += 0.23) { const gx = bx + (tx - bx) * k, gy = by + (ty - by) * k; line(c, gx - px * 0.8, gy - py * 0.8, gx + dx * 2.5, gy + dy * 2.5, 0.5, '#4a2c10'); }
        hand(c, hx, hy, th);                     // fingers wrap over the handle
        const P = (a, b) => [tx + px * a + dx * b, ty + py * a + dy * b];
        if (kind === 'axe') {
            poly(c, [P(-3, -3), P(-3, 5), P(3, 5), P(3, -3)], '#4a4f55');                      // eye/socket
            const blade = [P(2, -2), P(10, -8), P(15, -7), P(15.5, 7), P(10, 8), P(2, 4)];
            poly(c, blade, lin(c, P(2, 0)[0], P(2, 0)[1], P(15, 0)[0], P(15, 0)[1], ['#7a8288', '#b9c0c6', '#dfe5ea']), '#3e4448', 1);
            line(c, P(14.6, -6.5)[0], P(14.6, -6.5)[1], P(15, 6.5)[0], P(15, 6.5)[1], 1.4, '#ffffff');   // honed edge
            line(c, P(5, -2)[0], P(5, -2)[1], P(11, -5)[0], P(11, -5)[1], 0.8, 'rgba(255,255,255,0.5)');
        } else if (kind === 'pick') {
            c.beginPath(); c.moveTo(...P(-15, -5)); c.quadraticCurveTo(...P(0, 4), ...P(15, -5));
            c.lineWidth = 4.4; c.strokeStyle = '#4e5458'; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = '#8a9096'; c.stroke();
            c.lineWidth = 0.9; c.strokeStyle = '#e4e8ea'; c.beginPath(); c.moveTo(...P(-12, -3.6)); c.quadraticCurveTo(...P(0, 2.4), ...P(12, -3.6)); c.stroke();
            poly(c, [P(-2.6, -2), P(2.6, -2), P(2.6, 4), P(-2.6, 4)], '#5a6064', '#2e3236', 0.7);
        } else if (kind === 'hammer') {
            const head = [P(-8, -4), P(8, -4), P(8, 5), P(-8, 5)];
            poly(c, head, lin(c, P(0, -4)[0], P(0, -4)[1], P(0, 5)[0], P(0, 5)[1], ['#a4a4a4', '#7a7a7a', '#4e4e4e']), '#2e2e2e', 1);
            line(c, P(-7, -3)[0], P(-7, -3)[1], P(7, -3)[0], P(7, -3)[1], 0.9, '#e0e0e0');
            poly(c, [P(7.5, -4.6), P(9.6, -4.6), P(9.6, 5.6), P(7.5, 5.6)], '#5a5a5a');                  // striking face
        }
    }
    function basket(c) {
        poly(c, [[-24, -47], [-6, -47], [-8, -33], [-22, -33]], lin(c, -24, 0, -6, 0, ['#9a7440', '#7a5a30', '#5a3e1e']), '#3e2a10', 0.9);
        for (let i = 0; i < 4; i++) line(c, -23.5 + i * 0.5, -44 + i * 3, -6.5 - i * 0.5, -44 + i * 3, 0.7, '#4a3418');
        for (let i = 0; i < 6; i++) line(c, -22 + i * 3, -47, -21 + i * 2.5, -33, 0.5, 'rgba(60,40,20,0.6)');
        ell(c, -15, -47, 9.5, 2.6, '#5a3e1e'); ell(c, -15, -47.4, 8, 1.8, '#3a2610');
        for (let i = 0; i < 4; i++) { ell(c, -19 + i * 2.6, -48.5 + (i % 2), 1.9, 1.9, '#b82058'); ell(c, -19.5 + i * 2.6, -49 + (i % 2), 0.6, 0.6, '#ffb0d0'); }
        c.beginPath(); c.moveTo(-23, -47); c.quadraticCurveTo(-15, -60, -7, -47); c.lineWidth = 1.4; c.strokeStyle = '#6a4a22'; c.stroke();
    }
    function head(c, hx, hy, work) {
        if (FEM) {   // long hair falling behind the shoulders + a braid
            c.beginPath(); c.moveTo(hx - 12, hy - 6); c.quadraticCurveTo(hx - 16, hy + 10, hx - 12, hy + 24); c.quadraticCurveTo(hx - 6, hy + 27, hx - 1, hy + 20);
            c.lineTo(hx - 1, hy + 4); c.closePath(); c.fillStyle = lin(c, hx - 16, hy, hx, hy + 24, [HAIR_L, HAIR, HAIR_D]); c.fill(); c.strokeStyle = '#2e1208'; c.lineWidth = 0.8; c.stroke();
            for (let i = 0; i < 5; i++) { const by = hy + 22 + i * 4.2, bx = hx - 10 + Math.sin(i * 0.9) * 0.8; ell(c, bx, by, 3 - i * 0.25, 2.6, i % 2 ? HAIR : HAIR_L); c.beginPath(); c.ellipse(bx, by, 3 - i * 0.25, 2.6, 0, 0, 2 * PI); c.strokeStyle = HAIR_D; c.lineWidth = 0.6; c.stroke(); }
            ell(c, hx - 10, hy + 43, 2.6, 1.6, '#d9b24a');   // braid tie
        }
        // neck with shadow
        poly(c, [[hx - 5, hy + 9], [hx + 3, hy + 9], [hx + 3, hy + 15], [hx - 5, hy + 15]], SKIN_D);
        // skull + jaw
        c.beginPath(); c.moveTo(hx - 10, hy - 4); c.quadraticCurveTo(hx - 11, hy - 13, hx, hy - 13); c.quadraticCurveTo(hx + 11, hy - 13, hx + 12, hy - 2);
        c.lineTo(hx + 12.5, hy + 1); c.lineTo(hx + 13.5, hy + 3.5); c.lineTo(hx + 11.5, hy + 4); c.quadraticCurveTo(hx + 11.5, hy + 9, hx + 6, hy + 11);
        c.quadraticCurveTo(hx - 2, hy + 12, hx - 7, hy + 7); c.quadraticCurveTo(hx - 11, hy + 3, hx - 10, hy - 4); c.closePath();
        c.fillStyle = lin(c, hx - 11, hy - 10, hx + 12, hy + 10, [SKIN_L, SKIN, '#d9a77a']); c.fill(); c.strokeStyle = 'rgba(120,70,40,0.6)'; c.lineWidth = 0.8; c.stroke();
        ell(c, hx - 3, hy + 6, 6, 3, 'rgba(160,100,60,0.25)');                  // jaw shade
        // ear
        ell(c, hx - 3, hy + 0.5, 2.8, 3.8, SKIN); c.beginPath(); c.ellipse(hx - 3, hy + 0.5, 1.5, 2.4, 0, 0, 2 * PI); c.strokeStyle = SKIN_D; c.lineWidth = 0.8; c.stroke();
        // eye: white, iris, pupil, glint, lid
        ell(c, hx + 6.8, hy - 1, 2.4, 1.9, '#fbf6ee'); ell(c, hx + 7.6, hy - 0.9, 1.4, 1.6, '#4a6a3a'); ell(c, hx + 7.9, hy - 0.9, 0.7, 0.8, '#120a06'); ell(c, hx + 7.3, hy - 1.6, 0.4, 0.4, '#fff');
        line(c, hx + 4.4, hy - 2.6, hx + 9.2, hy - 2.8, 0.9, '#7a4a2a');
        if (FEM) { line(c, hx + 4.6, hy - (work ? 4.8 : 5.4), hx + 9.2, hy - (work ? 5.2 : 6.2), 0.9, HAIR_D);   // thin arched brow
            [[5, -2.4, 4, -3.8], [6.8, -2.9, 6.6, -4.4], [8.6, -2.8, 9.4, -4.1]].forEach(l => line(c, hx + l[0], hy + l[1], hx + l[2], hy + l[3], 0.6, '#1a0e06')); }  // lashes
        else line(c, hx + 4, hy - (work ? 4.6 : 5.2), hx + 9.4, hy - (work ? 4.8 : 5.8), 1.5, HAIR_D);   // brow (furrowed at work)
        // nose with nostril
        c.beginPath(); c.moveTo(hx + 10, hy - 3); c.lineTo(hx + 13.5, hy + 2.8); c.lineTo(hx + 11, hy + 3.4); c.strokeStyle = '#b07a52'; c.lineWidth = 1; c.stroke();
        ell(c, hx + 11.2, hy + 2.6, 0.7, 0.5, '#8a5a3a');
        // mouth + lip
        c.beginPath(); c.moveTo(hx + 6.5, hy + 6.6); c.quadraticCurveTo(hx + 8.6, hy + (work ? 6.4 : 7.4), hx + 10.6, hy + 6.2); c.strokeStyle = FEM ? '#c04a5a' : '#8a3e30'; c.lineWidth = FEM ? 1.4 : 1.1; c.stroke();
        line(c, hx + 7.4, hy + 8.2, hx + 9.6, hy + 8, 0.7, 'rgba(160,90,70,0.6)');
        ell(c, hx + 8, hy + 3.2, 2.4, 1.4, 'rgba(230,120,110,0.32)');           // cheek
        if (!FEM) line(c, hx + 2, hy + 7, hx + 4, hy + 9.6, 0.7, 'rgba(120,70,40,0.35)'); // jawline
        else ell(c, hx + 8, hy + 3.4, 2.6, 1.5, 'rgba(240,120,130,0.3)');      // softer blush
        // hair as its own shape: crown, fringe, back, sideburn, strands
        c.beginPath(); c.moveTo(hx - 11, hy + 5); c.quadraticCurveTo(hx - 14, hy - 8, hx - 4, hy - 14.5); c.quadraticCurveTo(hx + 6, hy - 17, hx + 12, hy - 9);
        c.quadraticCurveTo(hx + 13, hy - 5.5, hx + 10.5, hy - 5.5); c.quadraticCurveTo(hx + 8, hy - 8.5, hx + 5, hy - 6.5); c.quadraticCurveTo(hx + 3, hy - 9, hx, hy - 6);
        c.quadraticCurveTo(hx - 3, hy - 6, hx - 4, hy - 3); c.lineTo(hx - 1, hy - 3); c.lineTo(hx - 1, hy + 3); c.quadraticCurveTo(hx - 5, hy + 3, hx - 6, hy + 8); c.closePath();
        c.fillStyle = lin(c, hx - 12, hy - 14, hx + 10, hy, [HAIR_L, HAIR, HAIR_D]); c.fill(); c.strokeStyle = '#2e1a0a'; c.lineWidth = 0.8; c.stroke();
        [[-8, -10, -4, -13], [-3, -12, 3, -14], [3, -12, 9, -10], [-10, -4, -9, 3], [-6, -8, -2, -11]].forEach(l => line(c, hx + l[0], hy + l[1], hx + l[2], hy + l[3], 0.7, HAIR_D));
        line(c, hx - 4, hy - 13, hx + 4, hy - 14.5, 1.1, 'rgba(255,220,170,0.35)');                       // sheen
    }
    function villager(c, kind, pose, f) {
        let ph = 0, bob = 0, lg = 0, liftB = 0, liftF = 0, backTh = 0.15, frontTh = 0.25, bend = 0.15, lean = 0, work = false;
        if (pose === 'walk') {
            ph = f / 8 * 2 * PI; const s = Math.sin(ph);
            bob = Math.abs(Math.cos(ph)) * 2.6; lg = s; liftB = Math.max(0, -Math.cos(ph)) * 3 * (s < 0 ? 1 : 0.4); liftF = Math.max(0, Math.cos(ph)) * 3 * (s > 0 ? 1 : 0.4);
            backTh = -s * 0.6; frontTh = s * 0.6; bend = 0.25; lean = 1.2;
        }
        if (pose === 'work') {
            work = true;
            const e = [0, 0.18, 0.5, 0.86, 1, 0.55][f], sw = e * e * (3 - 2 * e);    // eased swing
            if (kind === 'basket') { frontTh = 0.75 + Math.sin(f / 6 * 2 * PI) * 0.4; backTh = 0.45 + Math.cos(f / 6 * 2 * PI) * 0.3; bend = 0.35; lean = 2 + Math.sin(f / 6 * 2 * PI); }
            else { frontTh = 2.85 - sw * 2.15; backTh = frontTh - 0.3; bend = 0.1 + sw * 0.3; lean = sw * 3; }
            bob = kind !== 'basket' ? 1.6 - sw * 1.6 : 0.6;
        }
        shadow(c, 20, 7);
        if (FEM) { c.save(); c.scale(0.88, 1); }
        leg(c, -4, -lg * 9, liftB, true);
        leg(c, 5, lg * 9, liftF, false);
        c.save(); c.translate(0, -bob);
        c.save(); c.translate(lean * 0.4, 0); c.rotate(lean * 0.012);
        arm(c, -3, -58, backTh, FEM ? '#40206e' : '#1a3f80', 22, bend);
        if (kind === 'basket') basket(c);
        // tunic body with sleeves seams, hem and folds
        const HEM = FEM ? -13 : -26, HW = FEM ? 19 : 16.5;   // dress-length, flared tunic for women
        c.beginPath(); c.moveTo(-12, -63); c.quadraticCurveTo(0, -67, 12, -63); c.quadraticCurveTo(14, -52, 13, -40); c.quadraticCurveTo(HW - 0.5, -32, HW, HEM);
        c.quadraticCurveTo(8, HEM + 3, 0, HEM + 1.5); c.quadraticCurveTo(-8, HEM + 3, -HW, HEM); c.quadraticCurveTo(-15, -33, -12.5, -40); c.quadraticCurveTo(-14, -52, -12, -63); c.closePath();
        c.fillStyle = FEM ? lin(c, -14, 0, 16, 0, ['#9a6ad0', '#6a3aa8', '#40206e']) : lin(c, -14, 0, 16, 0, ['#5a8ae0', '#2f60bc', '#1a3e80']); c.fill(); c.strokeStyle = FEM ? '#2c1450' : '#142c5c'; c.lineWidth = 1; c.stroke();
        c.save(); c.clip();
        poly(c, [[6, -66], [16, -66], [18, -20], [9, -20]], 'rgba(5,20,50,0.28)');                  // side shade
        poly(c, [[-HW, HEM - 4], [HW, HEM - 4], [HW + 1, HEM + 4], [-HW - 1, HEM + 4]], 'rgba(5,20,50,0.25)');              // hem shade
        c.restore();
        [[-7, -36, -9, -26], [-1, -36, -2, -25], [5, -36, 6, -25], [10, -37, 12.5, -27], [-4, -61, -6, -49], [8, -60, 9, -48]].forEach(l => {
            c.beginPath(); c.moveTo(l[0], l[1]); c.quadraticCurveTo((l[0] + l[2]) / 2 + 1, (l[1] + l[3]) / 2, l[2], l[3]); c.lineWidth = 0.9; c.strokeStyle = 'rgba(10,30,70,0.6)'; c.stroke();
            line(c, l[0] + 1.2, l[1], l[2] + 1.2, l[3], 0.6, 'rgba(255,255,255,0.13)'); });
        line(c, -HW + 0.5, HEM - 0.5, HW, HEM - 0.5, 0.9, '#d9b24a');                                            // hem stitch
        // collar: V neck with lacing
        poly(c, [[-5, -64.5], [0, -56], [6, -64.5]], '#d8b090', '#142c5c', 0.8);
        line(c, -2, -61, 3, -61, 0.6, '#5a3a1a'); line(c, -1, -58.5, 2, -58.5, 0.6, '#5a3a1a');
        // belt with buckle and pouch
        poly(c, [[-13, -41.5], [13, -41.5], [13.6, -36.6], [-13.6, -36.6]], lin(c, 0, -41.5, 0, -36.6, ['#7a5028', '#5a3a1a', '#3a2410']), '#2a180a', 0.8);
        poly(c, [[2.5, -42], [8.5, -42], [8.5, -36], [2.5, -36]], null, '#d9b24a', 1.3); line(c, 4, -39, 7.5, -39, 0.8, '#f0d070');
        poly(c, [[-11, -37], [-4, -37], [-4.5, -30], [-10.5, -30]], '#6a4622', '#2e1c0a', 0.7); line(c, -11, -35, -4, -35, 0.7, '#3a2410');
        head(c, 2, -77, work);
        c.restore();
        const h = arm(c, 7 + lean * 0.4, -58, frontTh, FEM ? '#6a3aa8' : '#2a56a8', 22, bend);
        tool(c, kind, h[0], h[1], frontTh);
        c.restore();
        if (FEM) c.restore();
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
        ['v_', 'v_f_'].forEach(pre => { const fem = pre === 'v_f_'; kinds.forEach(k => {
            add(`${pre}${k}_idle`, 100, 130, 50, 118, c => { setFem(fem); villager(c, k, 'idle', 0); setFem(false); });
            for (let f = 0; f < 8; f++) add(`${pre}${k}_walk${f}`, 100, 130, 50, 118, c => { setFem(fem); villager(c, k, 'walk', f); setFem(false); });
            if (k !== 'none') for (let f = 0; f < 6; f++) add(`${pre}${k}_work${f}`, 100, 130, 50, 118, c => { setFem(fem); villager(c, k, 'work', f); setFem(false); });
        }); });
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
