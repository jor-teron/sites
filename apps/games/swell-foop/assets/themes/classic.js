/*
 * Theme: Classic Blocks — the original look: one 'Block' type, a rounded rectangle in a flat colour with the
 * light #cbd5e0 outline. No gradient, shadow, gloss or animation (so an idle board never redraws).
 * Colour-blind help: each colour carries a subtle white mark (blue dot, green diamond, amber triangle,
 * red square ring, purple plus). Palette: the original blue / green / amber (+ red, purple).
 */
(function () {
    const X = SFX;
    const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7']; // original: blue-500, green-500, amber-500
    const OUTLINE = '#cbd5e0';                 // original light stroke around each block
    const MARK = 'rgba(255,255,255,0.45)';     // subtle inner mark
    const MARK_SIZE = 0.35;                    // mark size as a fraction of the block

    function mark(ctx, i, s) {
        const c = s / 2, m = s * MARK_SIZE;
        ctx.fillStyle = MARK;
        ctx.strokeStyle = MARK;
        ctx.lineWidth = 2.5;
        switch (i) {
            case 0: X.circle(ctx, c, c, m / 2); ctx.fill(); break;                              // dot
            case 1: X.pts(ctx, X.polyPts(c, c, m * 0.62, 4, 0)); ctx.fill(); break;             // diamond
            case 2: X.pts(ctx, X.polyPts(c, c + m * 0.1, m * 0.64, 3, 0)); ctx.fill(); break;   // triangle
            case 3: X.rr(ctx, c - m / 2, c - m / 2, m, m, 2); ctx.stroke(); break;              // square ring
            default: ctx.fillRect(c - m / 2, c - 1.75, m, 3.5); ctx.fillRect(c - 1.75, c - m / 2, 3.5, m); // plus
        }
    }

    SF_THEMES.register({
        id: 'classic',
        name: 'Classic Blocks',
        bg: '#2d3748',
        draw(ctx, i, s) {
            X.rr(ctx, 0, 0, s, s, 8);
            ctx.fillStyle = COLORS[i];
            ctx.fill();
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 1;
            ctx.stroke();
            mark(ctx, i, s);
        },
    });
})();
