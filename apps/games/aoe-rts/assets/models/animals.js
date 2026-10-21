/** AOE RTS - models: deer, carcasses, fish spots (code-drawn, baked once into the atlas by assets/models/art.js) */
(() => {
    const { PI, add, rnd, setSeed, col, poly, ell, line, lerp, lin, shadow, leftF, rightF, planks, stones, roofTiles } = AOE.art;
    const { seg } = AOE.models;   // from villager.js
    // ---------- deer (R2c) ----------
    const FUR = '#a8703a', FUR_D = '#7a4c22', FUR_L = '#d0a06a', BELLY = '#ecdcbc';
    /** deer facing +x, feet at y=0; pose 'walk' (f 0-3), 'graze' (f 0-1, head down), 'idle' (head up) */
    function deer(c, pose, f, ant) {
        shadow(c, 26, 7);
        const ph = pose === 'walk' ? f / 4 * 2 * PI : 0, bob = pose === 'walk' ? Math.abs(Math.sin(ph)) * 1.4 : 0;
        const legs = [[-15, 0, true], [-11, PI, false], [13, PI, true], [17, 0, false]];   // [hipX, phase, far side]
        const drawLeg = (L, far) => { if (L[2] !== far) return; const sw = pose === 'walk' ? Math.sin(ph + L[1]) : 0, hy = -30 - bob, fx = L[0] + sw * 6, lift = Math.max(0, Math.cos(ph + L[1])) * (pose === 'walk' ? 3 : 0);
            const kx = L[0] + sw * 2 + (L[0] < 0 ? -2 : 1), ky = -15 - lift * 0.5, colr = far ? FUR_D : FUR;
            seg(c, L[0], hy, kx, ky, L[0] < 0 ? 6 : 4.6, 3, colr, 'rgba(40,20,5,0.45)'); seg(c, kx, ky, fx, -2 - lift, 2.8, 2.2, colr, 'rgba(40,20,5,0.45)');
            poly(c, [[fx - 1.8, -3 - lift], [fx + 2.2, -3 - lift], [fx + 2.6, 0 - lift], [fx - 1.8, 0 - lift]], '#2a1a0c'); };
        legs.forEach(L => drawLeg(L, true));
        c.save(); c.translate(0, -bob);
        // tail + body
        poly(c, [[-22, -40], [-27, -44], [-25, -36]], FUR_D); ell(c, -24.5, -40.5, 2.2, 3, '#f4ece0');
        c.beginPath(); c.ellipse(0, -36, 23, 10.5, -0.04, 0, 2 * PI); c.fillStyle = lin(c, 0, -47, 0, -26, [FUR_L, FUR, FUR_D]); c.fill(); c.strokeStyle = 'rgba(50,25,8,0.6)'; c.lineWidth = 0.8; c.stroke();
        ell(c, 1, -29.5, 15, 3.6, BELLY); ell(c, -20, -38, 4, 6, '#f4ece0');          // belly + white rump
        for (let i = 0; i < 5; i++) ell(c, -10 + i * 5, -40 + (i % 2) * 2, 1.2, 0.9, 'rgba(255,240,210,0.55)');   // faint spots
        ell(c, -12, -34, 7, 6, 'rgba(90,50,20,0.25)');                                // haunch shade
        // neck + head
        const down = pose === 'graze', chew = down && f === 1 ? 1 : 0;
        const nb = [14, -40], ht = down ? [26, -10 + chew] : [24, -60], ang = down ? 1.15 : -0.35;
        seg(c, nb[0], nb[1], ht[0] - (down ? 2 : 3), ht[1] + (down ? -3 : 4), 10, 6.5, FUR, 'rgba(50,25,8,0.5)');
        line(c, nb[0] + 3, nb[1] + 4, ht[0] - 1, ht[1] + (down ? -2 : 6), 2, 'rgba(240,225,195,0.7)');   // throat
        c.save(); c.translate(ht[0], ht[1]); c.rotate(ang);
        c.beginPath(); c.moveTo(-5, -4); c.quadraticCurveTo(2, -6, 10, -2.5); c.lineTo(12, 0.5); c.quadraticCurveTo(6, 4.5, -5, 3.5); c.closePath();
        c.fillStyle = lin(c, -5, -5, 10, 3, [FUR_L, FUR, FUR_D]); c.fill(); c.strokeStyle = 'rgba(50,25,8,0.6)'; c.lineWidth = 0.7; c.stroke();
        ell(c, 11.4, -0.4, 1.8, 1.4, '#1e120a'); ell(c, 4, 2.6, 4, 1.2, 'rgba(250,240,220,0.7)');       // nose, muzzle
        ell(c, 1.5, -1.8, 1.4, 1.2, '#140a04'); ell(c, 1.1, -2.2, 0.4, 0.4, '#fff');                   // eye
        [[-3, -4, -0.9], [-5.5, -3, -0.5]].forEach(e => { c.save(); c.translate(e[0], e[1]); c.rotate(e[2]); ell(c, 0, -4, 2, 4.6, FUR_D); ell(c, 0, -4, 1, 3, '#e8b8a0'); c.restore(); });
        if (ant) { c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.5; [[-1, 0], [-3.5, -1]].forEach(o => { c.beginPath(); c.moveTo(o[0], -4.5); c.quadraticCurveTo(o[0] - 3, -12, o[0] - 9, -17);
            c.moveTo(o[0] - 2, -10); c.lineTo(o[0] + 2.5, -14); c.moveTo(o[0] - 5, -14); c.lineTo(o[0] - 3.5, -19.5); c.moveTo(o[0] - 7, -16); c.lineTo(o[0] - 12.5, -17.5); c.stroke(); }); }
        c.restore();
        c.restore();
        legs.forEach(L => drawLeg(L, false));
    }
    /** hunted deer lying on its side; stage 3 full, 2 half butchered, 1 mostly bones */
    function carcass(c, n) {
        shadow(c, 30, 9);
        if (n >= 2) { seg(c, 14, -6, 24, -2, 3.2, 2.4, FUR_D); seg(c, 10, -8, 20, -11, 3, 2.2, FUR_D); seg(c, -14, -6, -24, -1, 3.6, 2.4, FUR_D); seg(c, -10, -8, -22, -9, 3.4, 2.2, FUR_D); }
        const rx = n === 3 ? 22 : n === 2 ? 17 : 0;
        if (rx) { c.beginPath(); c.ellipse(0, -10, rx, 8.5, 0.05, 0, 2 * PI); c.fillStyle = lin(c, 0, -18, 0, -2, [FUR_L, FUR, FUR_D]); c.fill(); c.strokeStyle = 'rgba(50,25,8,0.6)'; c.lineWidth = 0.8; c.stroke();
            ell(c, 0, -5, rx * 0.7, 2.6, BELLY); }
        if (n <= 2) { ell(c, 4, -9, n === 2 ? 8 : 10, n === 2 ? 4 : 5, '#9a3a2a'); for (let i = 0; i < 5; i++) { const x = -6 + i * 4; c.beginPath(); c.moveTo(x, -4); c.quadraticCurveTo(x + 1, -14, x + 3, -16); c.strokeStyle = '#efe6d2'; c.lineWidth = 1.6; c.stroke(); } }
        if (n === 1) { line(c, -16, -6, 16, -6, 2.2, '#efe6d2'); ell(c, 18, -7, 2.4, 2.4, '#efe6d2'); }
        // head on the ground
        c.save(); c.translate(-25, -8); c.rotate(0.35);
        if (n >= 2) { c.beginPath(); c.moveTo(5, -3.5); c.quadraticCurveTo(-2, -5, -10, -2); c.lineTo(-11.5, 1); c.quadraticCurveTo(-5, 4, 5, 3.5); c.closePath(); c.fillStyle = FUR; c.fill(); c.strokeStyle = 'rgba(50,25,8,0.6)'; c.lineWidth = 0.7; c.stroke();
            ell(c, -11, 0, 1.6, 1.3, '#1e120a'); line(c, -2, -1.5, 0, -1.2, 0.8, '#140a04'); ell(c, 3, -5, 1.8, 4, FUR_D); }
        else { ell(c, -3, 0, 7, 3.4, '#e6dcc4'); ell(c, -4, -0.5, 1.4, 1.2, '#6a5a44'); }
        c.restore();
    }
    /** fish spot on water: expanding rings, glints, a fish fin/jump on some frames (f 0-3) */
    function fishSpot(c, f) {
        for (let k = 0; k < 3; k++) { const t = ((f / 4) + k / 3) % 1, rx = 8 + t * 30, a = 0.55 * (1 - t);
            c.beginPath(); c.ellipse(0, 0, rx, rx * 0.45, 0, 0, 2 * PI); c.strokeStyle = `rgba(225,245,255,${a.toFixed(3)})`; c.lineWidth = 1.6; c.stroke(); }
        [[-14, -4], [12, 3], [3, -8], [-6, 7]].forEach((g, i) => { if ((i + f) % 2) ell(c, g[0], g[1], 2.2, 0.8, 'rgba(255,255,255,0.8)'); });
        ell(c, 0, 0, 9, 3.2, 'rgba(20,60,110,0.35)');                                   // shoal shadow
        if (f === 1 || f === 2) { const y = f === 1 ? -9 : -13, a = f === 1 ? -0.4 : 0.3;
            c.save(); c.translate(f === 1 ? -4 : 3, y); c.rotate(a);
            c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(0, -4.5, 7, 0); c.quadraticCurveTo(0, 4, -7, 0); c.fillStyle = lin(c, 0, -4, 0, 4, ['#d8e4ec', '#8aa4b8', '#5a7488']); c.fill();
            poly(c, [[-6, 0], [-11, -3.5], [-10, 0], [-11, 3.5]], '#7a94a8'); ell(c, 4.5, -0.8, 0.8, 0.8, '#102030'); c.restore();
            for (let i = 0; i < 4; i++) ell(c, -8 + i * 5, -2 - (i % 2) * 3, 1, 1, 'rgba(235,250,255,0.9)'); }   // splash drops
        else { poly(c, [[-2, -1], [2, -6], [4, -1]], 'rgba(60,80,100,0.85)'); }            // dorsal fin
    }
    Object.assign(AOE.models, { deer, carcass, fishSpot });
})();
