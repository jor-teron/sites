/*
 * Theme: Space Planets — Earth-like world with a moon (0), tilted-ring planet (1), wide-ringed gas giant (2),
 * red giant sun with rays (3), crescent moon-world (4). Twinkling stars as a sparkle overlay.
 */
(function () {
    const X = SFX;

    function sphere(ctx, cx, cy, r, c1, c2, c3) {
        X.circle(ctx, cx, cy, r);
        ctx.fillStyle = X.radial(ctx, cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15, [[0, c1], [0.55, c2], [1, c3]]);
        ctx.fill();
    }
    function shadowSide(ctx, cx, cy, r) { // night side
        ctx.save();
        X.circle(ctx, cx, cy, r); ctx.clip();
        ctx.fillStyle = X.radial(ctx, cx - r * 0.5, cy - r * 0.5, r * 0.6, cx - r * 0.5, cy - r * 0.5, r * 1.7, [[0, 'rgba(0,0,20,0)'], [1, 'rgba(0,0,20,0.6)']]);
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
    }
    function ring(ctx, cx, cy, rx, ry, rot, front, w, col) {
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
        ctx.restore();
    }

    SF_THEMES.register({
        id: 'space',
        name: 'Space Planets',
        bg: 'radial-gradient(ellipse at 30% 20%,#2a2f6b 0%,#0d1033 55%,#05061a 100%)',
        board(ctx, w, h) { // static starfield
            for (let k = 0; k < 70; k++) {
                ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + X.hash(k + 1) * 0.5) + ')';
                const sz = X.hash(k + 200) > 0.9 ? 1.6 : 0.9;
                ctx.fillRect(X.hash(k + 7) * w, X.hash(k + 91) * h, sz, sz);
            }
        },
        draw(ctx, i, s) {
            const c = s / 2;
            if (i === 0) { // blue world + moon
                ctx.save();
                ctx.shadowColor = 'rgba(80,160,255,0.55)'; ctx.shadowBlur = 6;
                sphere(ctx, 21, 25, 17, '#9fd4ff', '#2f7de1', '#0b2a6b');
                ctx.restore();
                ctx.save(); X.circle(ctx, 21, 25, 17); ctx.clip();
                ctx.fillStyle = '#4fbf6a';
                ctx.beginPath(); ctx.ellipse(15, 22, 6, 4.5, -0.5, 0, X.TAU); ctx.fill();
                ctx.beginPath(); ctx.ellipse(27, 31, 5, 3.5, 0.6, 0, X.TAU); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.beginPath(); ctx.ellipse(21, 16, 8, 1.8, 0, 0, X.TAU); ctx.fill();
                ctx.restore();
                shadowSide(ctx, 21, 25, 17);
                sphere(ctx, 37, 9, 6, '#f2f2f2', '#b9b9c4', '#6a6a7a');
                X.circle(ctx, 35.5, 8, 1.3); ctx.fillStyle = 'rgba(80,80,100,0.5)'; ctx.fill();
                return;
            }
            if (i === 1) { // green planet, tilted ring
                ring(ctx, c, c, 22, 6.5, -0.5, false, 3, 'rgba(210,255,220,0.8)');
                ctx.save(); ctx.shadowColor = 'rgba(80,255,150,0.45)'; ctx.shadowBlur = 6;
                sphere(ctx, c, c, 14, '#c7ffd6', '#2fc46a', '#0a4a2a');
                ctx.restore();
                ctx.save(); X.circle(ctx, c, c, 14); ctx.clip();
                ctx.strokeStyle = 'rgba(0,70,30,0.35)'; ctx.lineWidth = 2;
                for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(c - 15, c + k * 6); ctx.quadraticCurveTo(c, c + k * 6 + 3, c + 15, c + k * 6); ctx.stroke(); }
                ctx.restore();
                shadowSide(ctx, c, c, 14);
                ring(ctx, c, c, 22, 6.5, -0.5, true, 3, 'rgba(210,255,220,0.95)');
                return;
            }
            if (i === 2) { // Saturn-like
                ring(ctx, c, c, 23, 7, 0, false, 4.5, 'rgba(255,225,160,0.65)');
                ctx.save(); ctx.shadowColor = 'rgba(255,190,80,0.45)'; ctx.shadowBlur = 6;
                sphere(ctx, c, c, 14, '#ffe6a8', '#e0982a', '#6b3d06');
                ctx.restore();
                ctx.save(); X.circle(ctx, c, c, 14); ctx.clip();
                ctx.strokeStyle = 'rgba(120,60,0,0.35)'; ctx.lineWidth = 2.4;
                for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(c - 15, c + k * 5); ctx.lineTo(c + 15, c + k * 5); ctx.stroke(); }
                ctx.restore();
                shadowSide(ctx, c, c, 14);
                ring(ctx, c, c, 23, 7, 0, true, 4.5, 'rgba(255,235,185,0.95)');
                ring(ctx, c, c, 18, 5.2, 0, true, 1.3, 'rgba(120,70,10,0.5)');
                return;
            }
            if (i === 3) { // red giant sun with rays
                ctx.save();
                ctx.translate(c, c);
                ctx.shadowColor = 'rgba(255,90,40,0.8)'; ctx.shadowBlur = 7;
                X.star(ctx, 0, 0, 22, 13, 12, 0, 1.5);
                ctx.fillStyle = '#ff6a3a'; ctx.fill();
                ctx.restore();
                sphere(ctx, c, c, 13, '#ffd9a0', '#ff5a2a', '#9d1408');
                ctx.fillStyle = 'rgba(120,10,0,0.3)';
                [[-4, -3, 3], [5, 3, 2.4], [-2, 7, 1.8], [6, -6, 1.5]].forEach((p) => { X.circle(ctx, c + p[0], c + p[1], p[2]); ctx.fill(); });
                return;
            }
            // crescent world: purple, with big bite shadow
            ctx.save(); ctx.shadowColor = 'rgba(190,120,255,0.55)'; ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.arc(c, c, 19, 0, X.TAU); ctx.fillStyle = '#9a5de8'; ctx.fill();
            ctx.restore();
            ctx.save();
            X.circle(ctx, c, c, 19); ctx.clip();
            ctx.fillStyle = X.radial(ctx, c - 8, c - 8, 2, c, c, 24, [[0, '#e1c4ff'], [0.6, '#8a46de'], [1, '#2c0f5e']]);
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#0d1033';
            ctx.beginPath(); ctx.arc(c + 11, c + 5, 15, 0, X.TAU); ctx.fill();
            ctx.restore();
            X.circle(ctx, c, c, 19); ctx.strokeStyle = 'rgba(220,190,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
            X.circle(ctx, c + 14, c - 10, 1.3); ctx.fillStyle = '#fff'; ctx.fill();
            X.circle(ctx, c + 17, c + 12, 1); ctx.fill();
        },
        fx(ctx, i, s, t, o) {
            const p = X.pulse(t, (o.seed || 0) * 2.1 + i * 9, 2800);
            if (p < 0.4) { const a = Math.sin(p / 0.4 * Math.PI); X.twinkle(ctx, s * (i % 2 ? 0.2 : 0.82), s * 0.18, 1.5 + a * 2.5, a); }
        },
    });
})();
