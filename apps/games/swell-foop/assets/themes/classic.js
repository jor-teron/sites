/*
 * Theme: Classic Balls — glossy spheres in the original blue / green / amber (+ red, purple).
 * This is where the original block drawing lives (the rounded-square block with a light outline;
 * its drawRoundedRect and palette are kept below). Colour-blind safe: every colour has its own
 * silhouette: circle, rounded square (the original block), rounded triangle, hexagon, star.
 */
(function () {
    const X = SFX;
    const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7']; // original: blue-500, green-500, amber-500
    const OUTLINE = '#cbd5e0';   // original light stroke around each ball
    const OUTLINE_W = 1;

    /** Original block path (rounded rectangle). */
    function drawRoundedRect(ctx, x, y, width, height, radius) { X.rr(ctx, x, y, width, height, radius); }

    function shapePath(ctx, i, s) {
        const c = s / 2, R = s / 2 - 1.5;
        switch (i) {
            case 0: X.circle(ctx, c, c, R); break;
            case 1: drawRoundedRect(ctx, 2, 2, s - 4, s - 4, 8); break;      // the original block silhouette
            case 2: X.poly(ctx, c, c + 3, R + 3, 3, 0, 7); break;
            case 3: X.poly(ctx, c, c, R + 1, 6, Math.PI / 6, 5); break;
            default: X.star(ctx, c, c + 1, R + 2, R * 0.56, 5, 0, 3); break;
        }
    }

    SF_THEMES.register({
        id: 'classic',
        name: 'Classic Balls',
        bg: '#2d3748',
        draw(ctx, i, s) {
            const c = s / 2, col = COLORS[i];
            // soft drop shadow
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            shapePath(ctx, i, s);
            X.glossFill(ctx, col, c, c, s / 2);
            ctx.restore();
            shapePath(ctx, i, s);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = OUTLINE_W;
            ctx.stroke();
            // gloss: bright blob + rim light
            ctx.save();
            shapePath(ctx, i, s);
            ctx.clip();
            X.highlight(ctx, c, c, s / 2, 0.8);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        },
        fx(ctx, i, s, t, o) {
            const p = X.pulse(t, (o.seed || 0) + i * 3, 4200);
            if (p < 0.22) X.twinkle(ctx, s * 0.3, s * 0.28, 3 + Math.sin(p / 0.22 * Math.PI) * 3, Math.sin(p / 0.22 * Math.PI) * 0.9);
        },
    });
})();
