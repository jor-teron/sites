/*
 * Theme: Marble and Stone — swirled glass marble (0, circle), hex rune stone (1), triangular rune stone (2),
 * diamond rune stone (3), cat's-eye marble (4, tall oval). Runes are strokes carved into the stone.
 */
(function () {
    const X = SFX;
    const STONE = [null, '#6b8f71', '#a07c4a', '#8c4a4a', null];

    function stonePath(ctx, i, s) {
        const c = s / 2;
        if (i === 1) X.poly(ctx, c, c, 22, 6, Math.PI / 6, 6);
        else if (i === 2) X.poly(ctx, c, c + 3, 25, 3, 0, 7);
        else X.pts(ctx, [[c, 1], [s - 3, c], [c, s - 1], [3, c]]);
    }
    function rune(ctx, i, s) {
        const c = s / 2;
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const draw = (dx, dy, col, w) => {
            ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
            if (i === 1) { ctx.moveTo(c - 4 + dx, c - 9 + dy); ctx.lineTo(c - 4 + dx, c + 9 + dy); ctx.moveTo(c - 4 + dx, c - 3 + dy); ctx.lineTo(c + 6 + dx, c - 9 + dy); ctx.moveTo(c - 4 + dx, c + 2 + dy); ctx.lineTo(c + 6 + dx, c - 4 + dy); }       // fehu
            else if (i === 2) { ctx.moveTo(c + dx, c + 8 + dy); ctx.lineTo(c + dx, c - 4 + dy); ctx.moveTo(c - 6 + dx, c - 9 + dy); ctx.lineTo(c + dx, c - 3 + dy); ctx.lineTo(c + 6 + dx, c - 9 + dy); }                                                  // algiz
            else { ctx.moveTo(c - 5 + dx, c - 9 + dy); ctx.lineTo(c + 5 + dx, c + dy); ctx.lineTo(c - 5 + dx, c + 9 + dy); ctx.moveTo(c + 5 + dx, c - 9 + dy); ctx.lineTo(c - 5 + dx, c + dy); ctx.lineTo(c + 5 + dx, c + 9 + dy); } // gebo
            ctx.stroke();
        };
        const yo = i === 2 ? 4 : 0;
        draw(0.8, 1.2 + yo, 'rgba(255,255,255,0.35)', 2.4);
        draw(0, yo, 'rgba(20,12,0,0.75)', 2.2);
        ctx.restore();
    }
    function grain(ctx, i, s) {
        for (let k = 0; k < 60; k++) {
            ctx.fillStyle = X.hash(k + i * 50) > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
            ctx.fillRect(X.hash(k + 5 + i) * s, X.hash(k + 105 + i) * s, 1.5, 1.2);
        }
    }

    SF_THEMES.register({
        id: 'marble',
        name: 'Marble and Stone',
        bg: 'linear-gradient(160deg,#4b4540,#2e2a27)',
        draw(ctx, i, s) {
            const c = s / 2;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2.5;
            if (i === 0 || i === 4) { // glass marbles
                const col = i === 0 ? '#2f7bff' : '#f5b21a';
                if (i === 0) X.circle(ctx, c, c, 20); else X.ellipse(ctx, c, c, 15, 21, 0);
                ctx.fillStyle = X.radial(ctx, c - 6, c - 8, 2, c, c, 24, [[0, X.shade(col, 0.6)], [0.45, col], [1, X.shade(col, -0.55)]]);
                ctx.fill();
                ctx.restore();
                ctx.save();
                if (i === 0) X.circle(ctx, c, c, 20); else X.ellipse(ctx, c, c, 15, 21, 0);
                ctx.clip();
                if (i === 0) { // swirl ribbons
                    ctx.lineWidth = 4.2; ctx.lineCap = 'round';
                    ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.45)', 'rgba(0,30,100,0.35)'].forEach((cl, k) => {
                        ctx.strokeStyle = cl; ctx.beginPath();
                        ctx.moveTo(c - 18, c + 10 - k * 9); ctx.bezierCurveTo(c - 6, c - 14 - k * 3, c + 6, c + 14, c + 18, c - 8 + k * 5); ctx.stroke();
                    });
                } else { // cat's-eye slit
                    ctx.fillStyle = 'rgba(30,10,0,0.75)';
                    ctx.beginPath(); ctx.moveTo(c, c - 17); ctx.quadraticCurveTo(c + 5, c, c, c + 17); ctx.quadraticCurveTo(c - 5, c, c, c - 17); ctx.fill();
                    ctx.fillStyle = 'rgba(255,240,170,0.7)';
                    ctx.beginPath(); ctx.moveTo(c, c - 12); ctx.quadraticCurveTo(c + 2, c, c, c + 12); ctx.quadraticCurveTo(c - 2, c, c, c - 12); ctx.fill();
                }
                X.highlight(ctx, c, c, 20, 0.9);
                ctx.restore();
                if (i === 0) X.circle(ctx, c, c, 20); else X.ellipse(ctx, c, c, 15, 21, 0);
                ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
                return;
            }
            // rune stones
            stonePath(ctx, i, s);
            ctx.fillStyle = X.linear(ctx, 0, 0, s, s, [[0, X.shade(STONE[i], 0.35)], [0.5, STONE[i]], [1, X.shade(STONE[i], -0.5)]]);
            ctx.fill();
            ctx.restore();
            ctx.save();
            stonePath(ctx, i, s); ctx.clip();
            grain(ctx, i, s);
            stonePath(ctx, i, s);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
            stonePath(ctx, i, s);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
            rune(ctx, i, s);
        },
        fx(ctx, i, s, t, o) {
            if (i === 0 || i === 4) return;
            const p = X.pulse(t, (o.seed || 0) * 1.6 + i * 6, 5200); // rune faintly glows
            if (p < 0.3) {
                const a = Math.sin(p / 0.3 * Math.PI) * 0.35;
                ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = '#ffe9a0'; ctx.shadowBlur = 5;
                rune(ctx, i, s); ctx.restore();
            }
        },
    });
})();
