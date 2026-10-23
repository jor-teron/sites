/*
 * Theme: Gems — faceted stones: sapphire (rhombus), emerald (step-cut octagon), amber (round brilliant),
 * ruby (trillion / triangle), amethyst (hexagon). Facets are shaded polygons, with a travelling sparkle.
 */
(function () {
    const X = SFX;
    const PAL = ['#2563eb', '#10b981', '#f59e0b', '#e11d48', '#9333ea'];

    function outline(i, s) {
        const c = s / 2, R = s / 2 - 1.5;
        switch (i) {
            case 0: return [[c, 1], [s - 2, c], [c, s - 1], [2, c]];                                     // rhombus
            case 1: { const x0 = 8, x1 = s - 8, k = 9; return [[x0 + k, 1], [x1 - k, 1], [x1, 1 + k], [x1, s - 1 - k], [x1 - k, s - 1], [x0 + k, s - 1], [x0, s - 1 - k], [x0, 1 + k]]; } // tall emerald-cut octagon
            case 2: return X.polyPts(c, c, R, 12, 0);                                                      // round brilliant
            case 3: return X.polyPts(c, c + 3, R + 3, 3, 0);                                               // trillion
            default: return X.polyPts(c, c, R + 1, 6, Math.PI / 6);                                        // hexagon
        }
    }
    function facet(ctx, poly, fill) { X.pts(ctx, poly); ctx.fillStyle = fill; ctx.fill(); }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    SF_THEMES.register({
        id: 'gems',
        name: 'Gems',
        bg: 'linear-gradient(160deg,#1f2937,#111827)',
        draw(ctx, i, s) {
            const col = PAL[i], c = s / 2;
            const out = outline(i, s);
            // glow
            ctx.save();
            ctx.shadowColor = X.rgba(col, 0.6);
            ctx.shadowBlur = 6;
            X.pts(ctx, out);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.restore();
            ctx.save();
            X.pts(ctx, out);
            ctx.clip();
            // body gradient
            X.pts(ctx, out);
            ctx.fillStyle = X.linear(ctx, 0, 0, s, s, [[0, X.shade(col, 0.45)], [0.5, col], [1, X.shade(col, -0.5)]]);
            ctx.fill();
            // facets: fan from table (inner polygon) to the rim, alternating light / dark
            const inner = out.map((p) => mix(p, [c, c], 0.55));
            const n = out.length;
            for (let k = 0; k < n; k++) {
                const k2 = (k + 1) % n;
                const lit = Math.cos(((k + 0.5) / n) * X.TAU - 2.2);
                facet(ctx, [out[k], out[k2], inner[k2], inner[k]],
                    lit > 0 ? 'rgba(255,255,255,' + (0.1 + lit * 0.32) + ')' : 'rgba(0,0,40,' + (0.08 - lit * 0.3) + ')');
            }
            // table
            facet(ctx, inner, X.rgba(col, 0.55));
            X.pts(ctx, inner);
            ctx.fillStyle = X.linear(ctx, 0, 0, s, s, [[0, 'rgba(255,255,255,0.55)'], [0.55, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.25)']]);
            ctx.fill();
            ctx.restore();
            // crisp edge
            X.pts(ctx, out);
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 1;
            ctx.stroke();
            for (let k = 0; k < n; k++) { // facet edges
                ctx.beginPath();
                ctx.moveTo(out[k][0], out[k][1]);
                ctx.lineTo(inner[k][0], inner[k][1]);
                ctx.strokeStyle = 'rgba(255,255,255,0.28)';
                ctx.stroke();
            }
        },
        fx(ctx, i, s, t, o) {
            const p = X.pulse(t, (o.seed || 0) * 1.7 + i * 5, 3300);
            if (p < 0.3) {
                const a = Math.sin(p / 0.3 * Math.PI);
                X.twinkle(ctx, s * (0.28 + p * 1.2), s * 0.3, 2 + a * 5, a);
            }
        },
    });
})();
