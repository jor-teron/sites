/**
 * AOE RTS - R1b art: every map item is drawn ONCE with Canvas 2D at 2x resolution into texture atlas
 * pages, then shown as plain Phaser images (crisp when zoomed, cheap per frame).
 * Sizes are in world px at zoom 1 (tile = 128x64): villager ~110 tall, trees ~150-185, piles/bush ~100+,
 * house ~160, Town Center ~280 (+ flag).
 * R2c: spear + fishing-net tool poses, deer (walk / graze / idle, antlered variant), carcass stages, fish ripples.
 * Refactor: drawing helpers + atlas here; the drawings live in assets/models/{villager,animals,nature,buildings}.js
 */
const Art = AOE.art = (() => {
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
    let seed = 1; const setSeed = n => { seed = n; }; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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
    // ---------- build all ----------
    function build(scene) {
        const { villager, setFem, setTeam, banner, carry, pine, leafy, stump, bush, pile, house, townCenter, deer, carcass, fishSpot, flag, barracks } = AOE.models;
        const T0 = performance.now();
        const kinds = ['none', 'axe', 'pick', 'hammer', 'basket', 'spear', 'net', 'sword'];
        // ARQ1c: one baked set per team in play (cloth, caps, shields, flags, banners in team colour; skin / tools / wood keep theirs)
        const teams = MODE === 'aivai' ? ['ai1', 'ai2'] : MODE === 'play' ? ['p', 'ai1', 'ai2'] : ['p'];
        teams.forEach(id => { const tm = TEAM[id], pal = tm.pal;
            for (let f = 0; f < 4; f++) add('flag' + tm.sfx + f, 40, 60, 4, 56, c => flag(c, f, pal));
            add('banner' + tm.sfx, 20, 28, 10, 0, c => banner(c, pal));
        ['v_', 'v_f_'].forEach(sx => { const fem = sx === 'v_f_', pre = sx + tm.sfx; kinds.forEach(k => { if (fem && k === 'sword') return;
            const draw = (pose, f) => c => { setTeam(fem && tm.fpal || pal); setFem(fem); villager(c, k, pose, f); setFem(false); };
            add(`${pre}${k}_idle`, 100, 130, 50, 118, draw('idle', 0));
            for (let f = 0; f < 8; f++) add(`${pre}${k}_walk${f}`, 100, 130, 50, 118, draw('walk', f));
            if (k !== 'none') for (let f = 0; f < 6; f++) add(`${pre}${k}_work${f}`, 100, 130, 50, 118, draw('work', f));
        }); }); });
        ['wood', 'food', 'gold', 'stone'].forEach(t => add('carry_' + t, 36, 34, 18, 20, c => carry(c, t)));
        for (let v = 0; v < 3; v++) {
            setSeed(101 + v); add(`pine${v}`, 120, 200, 60, 185, c => pine(c, v, 1)); setSeed(101 + v); add(`pine${v}_cut`, 120, 200, 60, 185, c => pine(c, v, 0.82));
            setSeed(201 + v); add(`leafy${v}`, 120, 200, 60, 185, c => leafy(c, v, 1)); setSeed(201 + v); add(`leafy${v}_cut`, 120, 200, 60, 185, c => leafy(c, v, 0.82));
        }
        setSeed(301); add('stump', 80, 40, 30, 22, stump);
        for (let n = 0; n <= 4; n++) { setSeed(401); add('berry' + n, 136, 112, 68, 96, c => bush(c, n * 4)); }
        ['gold', 'stone'].forEach(k => { for (let n = 1; n <= 6; n++) { setSeed(k === 'gold' ? 501 : 601); add(`${k}${n}`, 140, 112, 70, 94, c => pile(c, k, n)); } });
        [[1, 0.33], [1, 0.66], [1, 1], [2, 0.33], [2, 0.66], [2, 1], [3, 0.33], [3, 0.66], [3, 1], [4, 1]].forEach((s, i) => { setSeed(701); add('house' + i, 150, 200, 75, 168, c => house(c, s[0], s[1])); });
        setSeed(901); add('barracks', 160, 200, 80, 150, barracks);
        setSeed(801); add('tc', 300, 320, 150, 240, townCenter);
        ['deer_', 'deer_a_'].forEach(pre => { const a = pre === 'deer_a_';
            add(pre + 'idle', 80, 90, 36, 82, c => deer(c, 'idle', 0, a));
            for (let f = 0; f < 4; f++) add(pre + 'walk' + f, 80, 90, 36, 82, c => deer(c, 'walk', f, a));
            for (let f = 0; f < 2; f++) add(pre + 'graze' + f, 80, 90, 36, 82, c => deer(c, 'graze', f, a)); });
        for (let n = 1; n <= 3; n++) add('carcass' + n, 84, 44, 42, 30, c => carcass(c, n));
        for (let f = 0; f < 4; f++) add('fish' + f, 84, 50, 42, 26, c => fishSpot(c, f));
        for (let v = 0; v < 4; v++) { setSeed(901 + v); add('rock' + v, 140, 110, 70, 80, c => AOE.models.rockOutcrop(c, v)); }   // R2b
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
    return { build, apply, frames, RES, PI, add, rnd, setSeed, col, poly, ell, line, lerp, lin, shadow, leftF, rightF, planks, stones, roofTiles };
})();
