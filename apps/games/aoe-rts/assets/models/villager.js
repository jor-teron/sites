/** AOE RTS - models: male and female villagers, tools, carried loads (code-drawn, baked once into the atlas by assets/models/art.js) */
(() => {
    const { PI, add, rnd, setSeed, col, poly, ell, line, lerp, lin, shadow, leftF, rightF, planks, stones, roofTiles } = AOE.art;
    const SKIN = '#efc49a', SKIN_D = '#c9966a', SKIN_L = '#f8dcbc';
    let HAIR = '#6b4423', HAIR_D = '#3e2612', HAIR_L = '#9a6a3a';
    let FEM = false;   // R2a: female villager variant (slimmer, long braid, dress-length tunic, softer face)
    let PAL = ['#5a8ae0', '#2f60bc', '#1a3e80', '#142c5c'];   // ARQ1c team cloth: light, mid, dark, outline (TEAM[..].pal)
    function setTeam(p) { PAL = p; }
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
        if (kind === 'sword') {   // ARQ1b Militia: short iron sword with a brass crossguard
            const dx = Math.sin(th), dy = Math.cos(th), g = [hx + dx * 3, hy + dy * 3], e = [hx + dx * 36, hy + dy * 36];
            line(c, hx - dx * 5, hy - dy * 5, g[0], g[1], 3.4, '#4a2c10'); line(c, g[0] + dy * 6, g[1] - dx * 6, g[0] - dy * 6, g[1] + dx * 6, 2.6, '#c9a040');
            line(c, g[0], g[1], e[0], e[1], 4.4, '#4e5458'); line(c, g[0], g[1], e[0], e[1], 2.4, '#dfe5ea'); hand(c, hx, hy, th); return;
        }
        const dx = Math.sin(th), dy = Math.cos(th), L = kind === 'hammer' ? 21 : kind === 'spear' ? 46 : kind === 'net' ? 36 : 31;
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
        } else if (kind === 'spear') {   // leaf-shaped flint head with a lashing
            poly(c, [P(-1.6, -1), P(1.6, -1), P(1.6, 3), P(-1.6, 3)], '#6a4a26');
            line(c, P(-2, 0)[0], P(-2, 0)[1], P(2, 2)[0], P(2, 2)[1], 1, '#c8b080'); line(c, P(-2, 2)[0], P(-2, 2)[1], P(2, 0)[0], P(2, 0)[1], 1, '#c8b080');
            const head = [P(0, 1), P(3.4, 5), P(0, 15), P(-3.4, 5)];
            poly(c, head, lin(c, P(-3, 6)[0], P(-3, 6)[1], P(3, 6)[0], P(3, 6)[1], ['#8a8e90', '#c4c8ca', '#5e6264']), '#33373a', 0.8);
            line(c, P(0, 2)[0], P(0, 2)[1], P(0, 13)[0], P(0, 13)[1], 0.6, 'rgba(255,255,255,0.6)');
        } else if (kind === 'net') {     // hoop + mesh bag on the pole
            const C = P(0, 8);
            c.save(); c.translate(C[0], C[1]); c.rotate(Math.atan2(dy, dx));
            c.beginPath(); c.moveTo(-2, -7); c.quadraticCurveTo(12, -9, 15, 0); c.quadraticCurveTo(12, 9, -2, 7); c.closePath(); c.fillStyle = 'rgba(220,210,180,0.18)'; c.fill();
            c.strokeStyle = 'rgba(230,220,190,0.75)'; c.lineWidth = 0.55;
            for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(-2 + i * 3.2, -7.5 + i * 0.3); c.lineTo(-2 + i * 3.2, 7.5 - i * 0.3); c.stroke(); }
            for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(-2, j * 3); c.quadraticCurveTo(8, j * 3.3, 14, j * 1.5); c.stroke(); }
            c.beginPath(); c.ellipse(-2, 0, 2.4, 8, 0, 0, 2 * PI); c.lineWidth = 1.6; c.strokeStyle = '#7a5428'; c.stroke();
            c.restore();
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
        arm(c, -3, -58, backTh, PAL[2], 22, bend);
        if (kind === 'basket') basket(c);
        // tunic body with sleeves seams, hem and folds
        const HEM = FEM ? -13 : -26, HW = FEM ? 19 : 16.5;   // dress-length, flared tunic for women
        c.beginPath(); c.moveTo(-12, -63); c.quadraticCurveTo(0, -67, 12, -63); c.quadraticCurveTo(14, -52, 13, -40); c.quadraticCurveTo(HW - 0.5, -32, HW, HEM);
        c.quadraticCurveTo(8, HEM + 3, 0, HEM + 1.5); c.quadraticCurveTo(-8, HEM + 3, -HW, HEM); c.quadraticCurveTo(-15, -33, -12.5, -40); c.quadraticCurveTo(-14, -52, -12, -63); c.closePath();
        c.fillStyle = lin(c, -14, 0, 16, 0, PAL.slice(0, 3)); c.fill(); c.strokeStyle = PAL[3]; c.lineWidth = 1; c.stroke();
        c.save(); c.clip();
        poly(c, [[6, -66], [16, -66], [18, -20], [9, -20]], 'rgba(5,20,50,0.28)');                  // side shade
        poly(c, [[-HW, HEM - 4], [HW, HEM - 4], [HW + 1, HEM + 4], [-HW - 1, HEM + 4]], 'rgba(5,20,50,0.25)');              // hem shade
        c.restore();
        [[-7, -36, -9, -26], [-1, -36, -2, -25], [5, -36, 6, -25], [10, -37, 12.5, -27], [-4, -61, -6, -49], [8, -60, 9, -48]].forEach(l => {
            c.beginPath(); c.moveTo(l[0], l[1]); c.quadraticCurveTo((l[0] + l[2]) / 2 + 1, (l[1] + l[3]) / 2, l[2], l[3]); c.lineWidth = 0.9; c.strokeStyle = 'rgba(10,30,70,0.6)'; c.stroke();
            line(c, l[0] + 1.2, l[1], l[2] + 1.2, l[3], 0.6, 'rgba(255,255,255,0.13)'); });
        line(c, -HW + 0.5, HEM - 0.5, HW, HEM - 0.5, 0.9, '#d9b24a');                                            // hem stitch
        // collar: V neck with lacing
        poly(c, [[-5, -64.5], [0, -56], [6, -64.5]], '#d8b090', PAL[3], 0.8);
        line(c, -2, -61, 3, -61, 0.6, '#5a3a1a'); line(c, -1, -58.5, 2, -58.5, 0.6, '#5a3a1a');
        // belt with buckle and pouch
        poly(c, [[-13, -41.5], [13, -41.5], [13.6, -36.6], [-13.6, -36.6]], lin(c, 0, -41.5, 0, -36.6, ['#7a5028', '#5a3a1a', '#3a2410']), '#2a180a', 0.8);
        poly(c, [[2.5, -42], [8.5, -42], [8.5, -36], [2.5, -36]], null, '#d9b24a', 1.3); line(c, 4, -39, 7.5, -39, 0.8, '#f0d070');
        poly(c, [[-11, -37], [-4, -37], [-4.5, -30], [-10.5, -30]], '#6a4622', '#2e1c0a', 0.7); line(c, -11, -35, -4, -35, 0.7, '#3a2410');
        head(c, 2, -77, work);
        if (kind === 'sword') {   // ARQ1c Militia: team cap + round team shield (iron rim and boss)
            c.beginPath(); c.ellipse(3, -84, 11.5, 8, 0, PI, 2 * PI); c.closePath(); c.fillStyle = PAL[1]; c.fill(); c.strokeStyle = PAL[3]; c.lineWidth = 1; c.stroke(); line(c, -9, -84, 15, -84, 2, '#6a6a70');
            ell(c, -11, -46, 11, 13, PAL[1]); c.lineWidth = 2.2; c.strokeStyle = '#5a5a62'; c.stroke(); line(c, -11, -58, -11, -34, 2.4, PAL[0]); ell(c, -11, -46, 2.6, 2.6, '#b8b8c0'); }
        c.restore();
        const h = arm(c, 7 + lean * 0.4, -58, frontTh, PAL[1], 22, bend);
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
    Object.assign(AOE.models, { villager, setFem, setTeam, carry, seg });   // seg: shared tapered-limb helper (deer legs)
})();
