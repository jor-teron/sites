/*
 * Theme: Ocean — bubble (0), spiral snail shell (1), starfish (2), scallop shell (3), pearl in an oyster (4).
 * Bubbles drift up as the animated overlay.
 */
(function () {
    const X = SFX;

    SF_THEMES.register({
        id: 'ocean',
        name: 'Ocean',
        bg: 'linear-gradient(180deg,#0e7490 0%,#0c4a6e 55%,#082f49 100%)',
        draw(ctx, i, s) {
            const c = s / 2;
            ctx.save();
            ctx.shadowColor = 'rgba(0,30,60,0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
            if (i === 0) { // bubble: transparent sphere with rim light
                X.circle(ctx, c, c, 19);
                ctx.fillStyle = X.radial(ctx, c + 4, c + 5, 2, c, c, 20, [[0, 'rgba(120,200,255,0.15)'], [0.75, 'rgba(120,200,255,0.25)'], [1, 'rgba(200,240,255,0.7)']]);
                ctx.fill();
                ctx.restore();
                X.circle(ctx, c, c, 19);
                ctx.strokeStyle = 'rgba(210,245,255,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
                X.ellipse(ctx, c - 7, c - 8, 6, 3.4, -0.7);
                ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
                X.circle(ctx, c + 8, c + 9, 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
                X.circle(ctx, c + 3, c + 13, 1.2); ctx.fill();
                return;
            }
            if (i === 1) { // snail shell with spiral
                ctx.beginPath();
                ctx.moveTo(3, s - 6);
                ctx.quadraticCurveTo(2, 8, c + 3, 4);
                ctx.quadraticCurveTo(s - 2, 8, s - 5, s - 8);
                ctx.quadraticCurveTo(s - 8, s - 3, c, s - 4);
                ctx.quadraticCurveTo(8, s - 3, 3, s - 6);
                ctx.closePath();
                ctx.fillStyle = X.radial(ctx, c - 6, c - 8, 2, c, c, 26, [[0, '#d8f5c0'], [0.5, '#6fcf6a'], [1, '#2a7a3a']]);
                ctx.fill();
                ctx.restore();
                ctx.strokeStyle = 'rgba(10,70,30,0.7)'; ctx.lineWidth = 1.6;
                ctx.beginPath();
                for (let a = 0; a < 12.5; a += 0.12) {
                    const rr = 1 + a * 1.35;
                    const x = c + 3 + Math.cos(a + 0.5) * rr, y = c - 2 + Math.sin(a + 0.5) * rr * 0.92;
                    a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
                X.highlight(ctx, c, c, 18, 0.55);
                return;
            }
            if (i === 2) { // starfish with dots
                X.star(ctx, c, c + 1, 23, 10.5, 5, 0, 5);
                ctx.fillStyle = X.radial(ctx, c - 5, c - 6, 2, c, c, 24, [[0, '#ffd08a'], [0.55, '#f59b3a'], [1, '#b8561a']]);
                ctx.fill();
                ctx.restore();
                X.star(ctx, c, c + 1, 23, 10.5, 5, 0, 5);
                ctx.strokeStyle = 'rgba(120,50,10,0.6)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#ffe8c0';
                X.starPts(c, c + 1, 17, 6, 5, 0).forEach((p, k) => { if (k % 2 === 0) { X.circle(ctx, c + (p[0] - c) * 0.6, c + 1 + (p[1] - c - 1) * 0.6, 1.4); ctx.fill(); X.circle(ctx, c + (p[0] - c) * 0.85, c + 1 + (p[1] - c - 1) * 0.85, 1); ctx.fill(); } });
                X.circle(ctx, c, c + 1, 2.4); ctx.fillStyle = '#ffeed0'; ctx.fill();
                return;
            }
            if (i === 3) { // scallop shell: fan with ridges
                ctx.beginPath();
                ctx.moveTo(c - 6, s - 3); ctx.lineTo(c + 6, s - 3); ctx.lineTo(c + 9, s - 6);
                ctx.bezierCurveTo(s + 1, c + 5, s - 2, 3, c, 3);
                ctx.bezierCurveTo(2, 3, -1, c + 5, c - 9, s - 6);
                ctx.closePath();
                ctx.fillStyle = X.radial(ctx, c, s - 5, 2, c, c, 26, [[0, '#ffd6c8'], [0.6, '#ff8f78'], [1, '#c04a3a']]);
                ctx.fill();
                ctx.restore();
                ctx.strokeStyle = 'rgba(120,30,20,0.55)'; ctx.lineWidth = 1.2;
                for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(c + k * 1.4, s - 5); ctx.quadraticCurveTo(c + k * 4.2, c + 2, c + k * 4.6, 6 + Math.abs(k) * 1.4); ctx.stroke(); }
                X.rr(ctx, c - 6, s - 6, 12, 4, 2); ctx.fillStyle = '#e6a590'; ctx.fill();
                return;
            }
            // pearl in an open oyster
            ctx.beginPath(); ctx.ellipse(c, c + 8, 21, 12, 0, 0, Math.PI); ctx.lineTo(2, c + 8);
            ctx.closePath();
            ctx.fillStyle = X.linear(ctx, 0, c, s, s, [[0, '#7a5a9a'], [1, '#3d2a5a']]); ctx.fill();
            ctx.restore();
            ctx.beginPath(); ctx.ellipse(c, c + 8, 17, 8, 0, 0, Math.PI); ctx.closePath();
            ctx.fillStyle = X.linear(ctx, 0, c + 8, 0, s, [[0, '#f6e6ff'], [1, '#c9a0ee']]); ctx.fill();
            ctx.beginPath(); ctx.ellipse(c, c + 8, 21, 12, 0, Math.PI, X.TAU); ctx.closePath();
            ctx.fillStyle = X.linear(ctx, 0, 2, s, c, [[0, '#9a74c6'], [1, '#52367a']]); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(c + k * 2, c + 8); ctx.quadraticCurveTo(c + k * 7, c - 4, c + k * 9, c - 2 + Math.abs(k) * 2); ctx.stroke(); }
            X.circle(ctx, c, c + 3, 8.5);
            ctx.fillStyle = X.radial(ctx, c - 3, c, 1, c, c + 3, 10, [[0, '#ffffff'], [0.6, '#eadcf8'], [1, '#a98ccc']]); ctx.fill();
            X.circle(ctx, c - 3, c, 2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        },
        fx(ctx, i, s, t, o) { // little bubble drifting up
            const p = X.pulse(t, (o.seed || 0) * 1.4 + i * 11, 3600);
            const x = s * (0.25 + 0.5 * X.hash(Math.floor((t + (o.seed || 0) * 997) / 3600) + i)) + Math.sin(p * 9) * 1.5;
            const y = s * (1 - p * 0.9);
            ctx.save();
            ctx.globalAlpha = Math.sin(p * Math.PI) * 0.75;
            X.circle(ctx, x, y, 1.2 + (i % 3) * 0.5);
            ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.restore();
        },
    });
})();
