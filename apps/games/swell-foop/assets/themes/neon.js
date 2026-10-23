/*
 * Theme: Neon Glow — near-black board; each colour is a glowing outline shape: circle (cyan), square (green),
 * triangle (amber), diamond (red-pink), star (violet). Glow breathes slowly (animated overlay).
 */
(function () {
    const X = SFX;
    const PAL = ['#22d3ee', '#4ade80', '#fbbf24', '#fb4f7a', '#c084fc'];

    function path(ctx, i, s) {
        const c = s / 2, R = s / 2 - 5;
        switch (i) {
            case 0: X.circle(ctx, c, c, R + 1); break;
            case 1: X.rr(ctx, 6, 6, s - 12, s - 12, 4); break;
            case 2: X.poly(ctx, c, c + 3, R + 3, 3, 0, 3); break;
            case 3: X.pts(ctx, [[c, 4], [s - 5, c], [c, s - 4], [5, c]]); break;
            default: X.star(ctx, c, c + 1, R + 3, R * 0.5, 5, 0, 1.5); break;
        }
    }

    SF_THEMES.register({
        id: 'neon',
        name: 'Neon Glow',
        bg: '#06070f',
        board(ctx, w, h) {
            ctx.strokeStyle = 'rgba(80,100,200,0.13)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 50) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
            for (let y = 0; y <= h; y += 50) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
            ctx.stroke();
        },
        draw(ctx, i, s) {
            const col = PAL[i];
            ctx.save();
            path(ctx, i, s);
            ctx.fillStyle = X.rgba(col, 0.12);
            ctx.fill();
            ctx.lineJoin = 'round';
            ctx.shadowColor = col;
            ctx.shadowBlur = 9;
            ctx.strokeStyle = X.rgba(col, 0.9);
            ctx.lineWidth = 3;
            path(ctx, i, s); ctx.stroke();
            ctx.shadowBlur = 3;
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = '#fff';
            path(ctx, i, s); ctx.stroke();
            ctx.restore();
            // inner tube accent
            ctx.save();
            ctx.translate(s / 2, s / 2); ctx.scale(0.55, 0.55); ctx.translate(-s / 2, -s / 2);
            path(ctx, i, s);
            ctx.strokeStyle = X.rgba(col, 0.35);
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
        },
        fx(ctx, i, s, t, o) {
            const ph = (t / 1200 + (o.seed || 0) * 0.37 + i * 0.8) % (X.TAU);
            const a = 0.12 + 0.12 * (1 + Math.sin(ph)) / 2;
            ctx.save(); // cheap pulse: wide translucent stroke (no blur, so it stays fast every frame)
            ctx.lineJoin = 'round';
            ctx.strokeStyle = X.rgba(PAL[i], a * 1.4);
            ctx.lineWidth = 5.5;
            path(ctx, i, s); ctx.stroke();
            ctx.restore();
        },
    });
})();
