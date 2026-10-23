/*
 * Theme: Fruit — plum (0), lime slice (1), lemon (2), cherries (3), orange (4). Each fruit has its own silhouette.
 */
(function () {
    const X = SFX;

    function leaf(ctx, x, y, w, h, rot, col) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(w / 2, -h, w, 0);
        ctx.quadraticCurveTo(w / 2, h, 0, 0);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = X.shade(col, -0.35);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.9, 0); ctx.stroke();
        ctx.restore();
    }
    function ball(ctx, cx, cy, r, col) {
        X.circle(ctx, cx, cy, r);
        X.glossFill(ctx, col, cx, cy, r);
    }

    SF_THEMES.register({
        id: 'fruit',
        name: 'Fruit',
        bg: 'linear-gradient(160deg,#5b7f3a,#3d5a2a)',
        draw(ctx, i, s) {
            const c = s / 2;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 2;
            if (i === 0) { // plum: round, bloom, crease, stem
                ball(ctx, c, c + 2, 19, '#6d3fb8');
                ctx.restore();
                ctx.strokeStyle = 'rgba(30,0,60,0.45)';
                ctx.lineWidth = 1.3;
                ctx.beginPath(); ctx.moveTo(c, 7); ctx.quadraticCurveTo(c + 5, c + 2, c, s - 4); ctx.stroke();
                ctx.fillStyle = 'rgba(200,190,255,0.22)'; // bloom
                X.ellipse(ctx, c - 6, c - 4, 9, 6, -0.6); ctx.fill();
                ctx.strokeStyle = '#4a3320'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(c, 7); ctx.quadraticCurveTo(c + 1, 3, c + 4, 1.5); ctx.stroke();
                X.highlight(ctx, c, c + 2, 19, 0.7);
                return;
            }
            if (i === 1) { // lime slice: round, rind, segments
                X.circle(ctx, c, c, c - 2);
                ctx.fillStyle = '#4d8f1f'; ctx.fill();
                ctx.restore();
                X.circle(ctx, c, c, c - 5);
                ctx.fillStyle = '#e8f7b4'; ctx.fill();
                X.circle(ctx, c, c, c - 7.5);
                ctx.fillStyle = X.radial(ctx, c, c, 2, c, c, c - 7, [[0, '#d7f27a'], [1, '#8fd13a']]); ctx.fill();
                ctx.strokeStyle = '#eefbc7'; ctx.lineWidth = 1.4;
                for (let k = 0; k < 8; k++) {
                    const a = (k * Math.PI) / 4 + Math.PI / 8;
                    ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * 2.5, c + Math.sin(a) * 2.5); ctx.lineTo(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8)); ctx.stroke();
                }
                X.circle(ctx, c, c, 2); ctx.fillStyle = '#eefbc7'; ctx.fill();
                X.circle(ctx, c, c, c - 2); ctx.strokeStyle = 'rgba(0,50,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                return;
            }
            if (i === 2) { // lemon: pointed ends
                ctx.beginPath();
                ctx.moveTo(1, c + 2);
                ctx.quadraticCurveTo(4, 4, c, 4);
                ctx.quadraticCurveTo(s - 4, 4, s - 1, c - 3);
                ctx.quadraticCurveTo(s - 4, s - 4, c, s - 4);
                ctx.quadraticCurveTo(4, s - 4, 1, c + 2);
                ctx.closePath();
                ctx.fillStyle = X.radial(ctx, c - 6, c - 6, 2, c, c, 26, [[0, '#fff59a'], [0.5, '#f6d51c'], [1, '#b8960a']]);
                ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(160,120,0,0.28)';
                for (let k = 0; k < 14; k++) { ctx.fillRect(6 + X.hash(k + 9) * (s - 12), 8 + X.hash(k + 70) * (s - 16), 1.2, 1.2); }
                leaf(ctx, s - 6, c - 8, 9, 5, -0.5, '#3f8f2a');
                X.highlight(ctx, c, c, 20, 0.6);
                return;
            }
            if (i === 3) { // two cherries on stems
                ctx.strokeStyle = '#4a7a2a'; ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(14, 28); ctx.quadraticCurveTo(15, 12, 29, 3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(32, 30); ctx.quadraticCurveTo(30, 12, 29, 3); ctx.stroke();
                ball(ctx, 13, 31, 11, '#d41f3d');
                ball(ctx, 32, 33, 10.5, '#c0152f');
                ctx.restore();
                X.highlight(ctx, 13, 31, 11, 0.85);
                X.highlight(ctx, 32, 33, 10.5, 0.85);
                leaf(ctx, 29, 3.5, 12, 5, 0.25, '#3f9a2a');
                return;
            }
            // orange: round with pores, navel, leaf
            ball(ctx, c, c + 1, 20, '#ff8a00');
            ctx.restore();
            ctx.fillStyle = 'rgba(160,60,0,0.25)';
            for (let k = 0; k < 40; k++) {
                const a = X.hash(k) * X.TAU, rr2 = Math.sqrt(X.hash(k + 99)) * 17;
                ctx.fillRect(c + Math.cos(a) * rr2, c + 1 + Math.sin(a) * rr2, 1.1, 1.1);
            }
            X.circle(ctx, c, 5, 1.8); ctx.fillStyle = '#7a3b00'; ctx.fill();
            leaf(ctx, c + 1, 5, 12, 5.5, -0.3, '#3d9a2a');
            X.highlight(ctx, c, c + 1, 20, 0.75);
        },
        fx(ctx, i, s, t, o) {
            const p = X.pulse(t, (o.seed || 0) * 1.1 + i * 4, 4600);
            if (p < 0.18) { const a = Math.sin(p / 0.18 * Math.PI); X.twinkle(ctx, s * 0.3, s * 0.3, 1.5 + a * 3, a * 0.85); }
        },
    });
})();
