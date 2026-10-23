/*
 * Theme: Pixel Retro — 8-bit chunky sprites on a 12x12 pixel grid (hand-made pixel maps, no image files):
 * orb (0), brick (1), pyramid (2), heart (3), diamond-gem (4). Palette per sprite: letters below.
 */
(function () {
    const X = SFX;
    // 12x12 maps. '.' empty, 'k' dark outline, 'a' base, 'b' light, 'c' shadow, 'w' white
    const MAPS = [
        [ // orb (blue)
            '....kkkk....', '..kkbbbbkk..', '.kbbwbbaabk.', '.kbwbaaaaak.', 'kbbbaaaaaack', 'kbbaaaaaaack',
            'kbaaaaaaaack', 'kbaaaaaaacck', '.kaaaaaaacck', '.kcaaaaaccck', '..kkcccckk..', '....kkkk....'],
        [ // brick (green)
            'kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbwwbbbbbbak', 'kbwbaaaaaaak', 'kbbaaaaaaaak', 'kbaaaaaaaaak',
            'kbaaaaaaaaak', 'kbaaaaaaaack', 'kbaaaaaaacck', 'kbaaaaaacccK', 'kkcccccccccK', 'kkkkkkkkkkkk'],
        [ // pyramid (amber)
            '.....kk.....', '....kbbk....', '....kbak....', '...kbbaak...', '...kbwaack..', '..kbbaaaack.',
            '..kbaaaaack.', '.kbbaaaaaack', '.kbaaaaaacck', 'kbbaaaaaacck', 'kbaaaaacccck', 'kkkkkkkkkkkk'],
        [ // heart (red)
            '.kkkk..kkkk.', 'kbbbbkkbbbbk', 'kbwwbbbbaabk', 'kbwbbaaaaaak', 'kbbaaaaaaaak', 'kbaaaaaaaack',
            '.kaaaaaaacck', '..kaaaaaack.', '...kaaaacck.', '....kaacck..', '.....kcck...', '......kk....'],
        [ // diamond (purple)
            '.....kk.....', '....kbbk....', '...kbwbak...', '..kbbwbaak..', '.kbbbbaaaak.', 'kbbbbbaaaaak',
            '.kbbaaaaaack', '..kbaaaaack.', '...kbaaack..', '....kaack...', '.....kck....', '......k.....'],
    ];
    const PAL = [
        { k: '#0b1b4a', a: '#2f6fe0', b: '#7fb0ff', c: '#1c3f94', w: '#ffffff' },
        { k: '#06330f', a: '#2fb04a', b: '#8ef0a0', c: '#1c7a2f', w: '#ffffff' },
        { k: '#4a2b00', a: '#f0a010', b: '#ffe070', c: '#b06800', w: '#ffffff' },
        { k: '#4a0614', a: '#e02a3c', b: '#ff8a96', c: '#9a1020', w: '#ffffff' },
        { k: '#2a0f4a', a: '#8a40e0', b: '#cf9cff', c: '#55208f', w: '#ffffff' },
    ];

    SF_THEMES.register({
        id: 'pixel',
        name: 'Pixel Retro',
        bg: '#0f1226',
        board(ctx, w, h) { // checkered 8-bit floor
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            for (let y = 0; y < h; y += 25) for (let x = (y / 25) % 2 ? 25 : 0; x < w; x += 50) ctx.fillRect(x, y, 25, 25);
        },
        draw(ctx, i, s) {
            const map = MAPS[i], pal = PAL[i], px = Math.floor(s / 12 * 100) / 100, off = (s - px * 12) / 2;
            for (let y = 0; y < 12; y++) {
                for (let x = 0; x < 12; x++) {
                    const ch = map[y][x];
                    if (ch === '.') continue;
                    ctx.fillStyle = pal[ch.toLowerCase()];
                    ctx.fillRect(Math.round((off + x * px) * 2) / 2, Math.round((off + y * px) * 2) / 2, px + 0.35, px + 0.35);
                }
            }
        },
        fx(ctx, i, s, t, o) { // blink-style 8-bit glint: a single white pixel pair
            const p = X.pulse(t, (o.seed || 0) * 1.9 + i * 3, 3000);
            if (p < 0.12) {
                const u = s / 12;
                ctx.fillStyle = '#fff';
                ctx.fillRect(u * 3, u * 2, u, u);
                ctx.fillRect(u * 2, u * 3, u * 0.9, u * 0.9);
            }
        },
    });
})();
