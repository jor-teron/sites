/*
 * Theme: Emoji Faces — faces that react. Head shape per colour: round (blue), squircle (green), rounded
 * triangle (amber), heart (red), hexagon (purple). Mood comes from the board:
 *   happy   - the block is part of a matching group     sad   - lonely block (no matching neighbour)
 *   excited - the group under the pointer / just tapped  blink - brief eye blink (random timing)
 */
(function () {
    const X = SFX;
    const PAL = ['#4aa8ff', '#5fd36a', '#ffc233', '#ff6b81', '#c28bff'];
    const MOODS = ['happy', 'sad', 'excited', 'blink'];

    function head(ctx, i, s) {
        const c = s / 2;
        switch (i) {
            case 0: X.circle(ctx, c, c, 20); break;
            case 1: X.rr(ctx, 3, 3, s - 6, s - 6, 14); break;
            case 2: X.poly(ctx, c, c + 4, 26, 3, 0, 9); break;
            case 3: X.heart(ctx, c, c - 1, 20.5); break;
            default: X.poly(ctx, c, c, 22, 6, Math.PI / 6, 7); break;
        }
    }
    function eyes(ctx, i, s, mood) {
        const c = s / 2;
        const ey = i === 2 ? c + 3 : i === 3 ? c - 4 : c - 4;
        const dx = i === 2 ? 7 : 8;
        ctx.fillStyle = '#2a1a0a';
        ctx.strokeStyle = '#2a1a0a';
        ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        [-dx, dx].forEach((o) => {
            if (mood === 'blink') { ctx.beginPath(); ctx.moveTo(c + o - 3, ey + 1); ctx.lineTo(c + o + 3, ey + 1); ctx.stroke(); }
            else if (mood === 'excited') { // wide eyes with shine
                X.circle(ctx, c + o, ey, 4); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
                X.circle(ctx, c + o, ey + 0.5, 2.2); ctx.fillStyle = '#2a1a0a'; ctx.fill();
                X.circle(ctx, c + o - 0.8, ey - 0.6, 0.8); ctx.fillStyle = '#fff'; ctx.fill();
            } else if (mood === 'sad') {
                X.ellipse(ctx, c + o, ey + 1, 2.1, 2.8, 0); ctx.fillStyle = '#2a1a0a'; ctx.fill();
                X.circle(ctx, c + o - 0.6, ey, 0.7); ctx.fillStyle = '#fff'; ctx.fill();
            } else { // happy: ^ ^ arcs
                ctx.beginPath(); ctx.arc(c + o, ey + 2, 3.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
            }
        });
        if (mood === 'sad') { // brows tilt up in the middle + tear
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(c - dx - 3, ey - 5); ctx.lineTo(c - dx + 3, ey - 7); ctx.moveTo(c + dx + 3, ey - 5); ctx.lineTo(c + dx - 3, ey - 7); ctx.stroke();
            ctx.fillStyle = '#5ec8ff';
            ctx.beginPath(); ctx.moveTo(c + dx + 1, ey + 5); ctx.quadraticCurveTo(c + dx + 4, ey + 9, c + dx + 1, ey + 11); ctx.quadraticCurveTo(c + dx - 2, ey + 9, c + dx + 1, ey + 5); ctx.fill();
        }
    }
    function mouth(ctx, i, s, mood) {
        const c = s / 2, my = i === 2 ? c + 12 : c + 8;
        ctx.strokeStyle = '#2a1a0a'; ctx.fillStyle = '#2a1a0a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        if (mood === 'sad') { ctx.beginPath(); ctx.arc(c, my + 6, 5.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        else if (mood === 'excited') { // open mouth with tongue
            ctx.beginPath(); ctx.moveTo(c - 7, my - 3); ctx.quadraticCurveTo(c, my + 11, c + 7, my - 3); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ff7a8a'; ctx.beginPath(); ctx.ellipse(c, my + 3.2, 3.6, 2.2, 0, 0, X.TAU); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(c, my - 2, 6.5, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); }
    }

    SF_THEMES.register({
        id: 'emoji',
        name: 'Emoji Faces',
        moods: MOODS,
        bg: 'linear-gradient(160deg,#3a3f5c,#262a40)',
        draw(ctx, i, s, o) {
            const col = PAL[i], c = s / 2, mood = (o && o.mood) || 'happy';
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
            head(ctx, i, s);
            ctx.fillStyle = X.radial(ctx, c - 6, c - 8, 2, c, c, 26, [[0, X.shade(col, 0.55)], [0.55, col], [1, X.shade(col, -0.35)]]);
            ctx.fill();
            ctx.restore();
            head(ctx, i, s); ctx.strokeStyle = X.shade(col, -0.5); ctx.lineWidth = 1.2; ctx.stroke();
            if (mood === 'excited') { // rosy cheeks
                ctx.fillStyle = 'rgba(255,90,110,0.35)';
                X.circle(ctx, c - 13, c + 4, 3.5); ctx.fill(); X.circle(ctx, c + 13, c + 4, 3.5); ctx.fill();
            }
            eyes(ctx, i, s, mood);
            mouth(ctx, i, s, mood);
            if (mood !== 'excited') X.highlight(ctx, c, c - 2, 20, 0.35);
        },
        fx() { /* blink handled by mood choice in core (random timing); presence keeps the loop animating */ },
    });
})();
