/*
 * Theme: Candy — jelly bean (blue), gumdrop (green), lollipop swirl (amber), wrapped sweet (red), jelly star (purple).
 */
(function () {
    const X = SFX;
    const PAL = ['#3b9cff', '#4cd964', '#ffb020', '#ff4d6d', '#b45cff'];

    function gloss(ctx, cx, cy, rx, ry, rot, a) {
        X.ellipse(ctx, cx, cy, rx, ry, rot);
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        ctx.fill();
    }
    function body(ctx, col, cx, cy, r) {
        ctx.fillStyle = X.radial(ctx, cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.2, [[0, X.shade(col, 0.5)], [0.5, col], [1, X.shade(col, -0.35)]]);
        ctx.fill();
    }

    SF_THEMES.register({
        id: 'candy',
        name: 'Candy',
        bg: 'linear-gradient(160deg,#4a2c5e,#2b1a3d)',
        draw(ctx, i, s) {
            const col = PAL[i], c = s / 2;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 2;
            if (i === 0) { // jelly bean (tilted capsule)
                ctx.translate(c, c);
                ctx.rotate(-0.6);
                X.rr(ctx, -20, -12, 40, 24, 12);
                body(ctx, col, 0, 0, 20);
                ctx.restore();
                ctx.save();
                ctx.translate(c, c);
                ctx.rotate(-0.6);
                gloss(ctx, -6, -5, 11, 3.5, 0, 0.7);
                X.rr(ctx, -20, -12, 40, 24, 12);
                ctx.strokeStyle = X.shade(col, -0.4);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
                return;
            }
            if (i === 1) { // gumdrop: dome with sugar crystals
                ctx.beginPath();
                ctx.moveTo(4, s - 4);
                ctx.bezierCurveTo(2, c - 4, 8, 3, c, 3);
                ctx.bezierCurveTo(s - 8, 3, s - 2, c - 4, s - 4, s - 4);
                ctx.closePath();
                body(ctx, col, c, c, 24);
                ctx.restore();
                for (let k = 0; k < 26; k++) {
                    const px = 6 + X.hash(k + 3) * (s - 12), py = 7 + X.hash(k + 40) * (s - 12);
                    const ex = (px - c) / 19, ey = (py - 26) / 22;
                    if (ex * ex + ey * ey < 0.85) { ctx.fillStyle = 'rgba(255,255,255,' + (0.45 + X.hash(k) * 0.4) + ')'; ctx.fillRect(px, py, 1.6, 1.6); }
                }
                gloss(ctx, c - 8, 13, 6, 3, -0.7, 0.6);
                return;
            }
            if (i === 2) { // lollipop swirl
                X.circle(ctx, c, c, c - 2);
                body(ctx, '#ffd36a', c, c, c);
                ctx.restore();
                ctx.save();
                X.circle(ctx, c, c, c - 2);
                ctx.clip();
                ctx.beginPath();
                for (let a = 0; a < 15; a += 0.15) {
                    const rr = a * 1.55;
                    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
                    a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.strokeStyle = '#ff7a00';
                ctx.lineWidth = 3.4;
                ctx.stroke();
                ctx.restore();
                X.circle(ctx, c, c, c - 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 1;
                ctx.stroke();
                gloss(ctx, c - 8, c - 11, 8, 4, -0.7, 0.55);
                return;
            }
            if (i === 3) { // wrapped sweet: twisted ends
                ctx.fillStyle = X.shade(col, -0.1);
                ctx.beginPath();
                ctx.moveTo(1, c - 9); ctx.lineTo(11, c - 3); ctx.lineTo(11, c + 3); ctx.lineTo(1, c + 9); ctx.lineTo(4, c);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(s - 1, c - 9); ctx.lineTo(s - 11, c - 3); ctx.lineTo(s - 11, c + 3); ctx.lineTo(s - 1, c + 9); ctx.lineTo(s - 4, c);
                ctx.closePath(); ctx.fill();
                X.circle(ctx, c, c, 14);
                body(ctx, col, c, c, 15);
                ctx.restore();
                ctx.save();
                X.circle(ctx, c, c, 14);
                ctx.clip();
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.lineWidth = 3;
                for (let k = -2; k < 3; k++) { ctx.beginPath(); ctx.moveTo(c - 10 + k * 7, c + 14); ctx.lineTo(c + 4 + k * 7, c - 14); ctx.stroke(); }
                ctx.restore();
                gloss(ctx, c - 5, c - 7, 5, 2.6, -0.7, 0.7);
                return;
            }
            // jelly star
            X.star(ctx, c, c + 1, c - 1, 11.5, 5, 0, 4);
            body(ctx, col, c, c, c);
            ctx.restore();
            ctx.save();
            X.star(ctx, c, c + 1, c - 1, 11.5, 5, 0, 4);
            ctx.strokeStyle = X.shade(col, -0.35);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            gloss(ctx, c - 6, c - 6, 6, 3, -0.7, 0.6);
        },
        fx(ctx, i, s, t, o) {
            const p = X.pulse(t, (o.seed || 0) * 1.3 + i * 7, 3800);
            if (p < 0.2) { const a = Math.sin(p / 0.2 * Math.PI); X.twinkle(ctx, s * 0.72, s * 0.3, 2 + a * 3, a * 0.9); }
        },
    });
})();
