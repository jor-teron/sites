/*
 * Swell Foop — shared drawing helpers for the code-drawn themes (assets/themes/*.js).
 * No images anywhere: shapes, gradients and glow are drawn on canvas.
 */
const SFX = (() => {
    const TAU = Math.PI * 2;
    // Base hue per colour index (blue, green, amber, red, purple); themes may use their own palettes.
    const BASE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

    function hex(c) {
        const n = parseInt(c.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    /** Mixes colour c toward white (amt>0) or black (amt<0); returns css rgb(). */
    function shade(c, amt) {
        const [r, g, b] = hex(c);
        const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
        return `rgb(${Math.round(r + (t - r) * a)},${Math.round(g + (t - g) * a)},${Math.round(b + (t - b) * a)})`;
    }
    function rgba(c, a) {
        const [r, g, b] = hex(c);
        return `rgba(${r},${g},${b},${a})`;
    }
    /** Small deterministic pseudo-random in [0,1) from an integer. */
    function hash(n) {
        let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    // ---- path builders (they only build the path; caller fills / strokes) ----
    function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); }
    function ellipse(ctx, cx, cy, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); }
    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    function polyPts(cx, cy, r, n, rot) {
        const pts = [];
        for (let k = 0; k < n; k++) {
            const a = (rot || 0) - Math.PI / 2 + (k * TAU) / n;
            pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return pts;
    }
    /** Polygon through pts with rounded corners (radius rad). */
    function roundPoly(ctx, pts, rad) {
        const n = pts.length;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
            const p0 = pts[(k + n - 1) % n], p1 = pts[k], p2 = pts[(k + 1) % n];
            const a = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
            if (k === 0) ctx.moveTo(a[0], a[1]);
            ctx.arcTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, rad);
        }
        ctx.closePath();
    }
    function poly(ctx, cx, cy, r, n, rot, rad) { roundPoly(ctx, polyPts(cx, cy, r, n, rot), rad || 0.001); }
    function starPts(cx, cy, ro, ri, n, rot) {
        const pts = [];
        for (let k = 0; k < n * 2; k++) {
            const a = (rot || 0) - Math.PI / 2 + (k * Math.PI) / n;
            const r = k % 2 ? ri : ro;
            pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return pts;
    }
    function star(ctx, cx, cy, ro, ri, n, rot, rad) { roundPoly(ctx, starPts(cx, cy, ro, ri, n, rot), rad || 0.001); }
    function heart(ctx, cx, cy, r) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.95);
        ctx.bezierCurveTo(cx - r * 1.5, cy + r * 0.1, cx - r * 0.95, cy - r * 1.0, cx, cy - r * 0.35);
        ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.0, cx + r * 1.5, cy + r * 0.1, cx, cy + r * 0.95);
        ctx.closePath();
    }
    function pts(ctx, arr) {
        ctx.beginPath();
        arr.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
    }

    // ---- gradients / fills ----
    function radial(ctx, x0, y0, r0, x1, y1, r1, stops) {
        const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        stops.forEach((st) => g.addColorStop(st[0], st[1]));
        return g;
    }
    function linear(ctx, x0, y0, x1, y1, stops) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        stops.forEach((st) => g.addColorStop(st[0], st[1]));
        return g;
    }
    /** Glossy sphere body (call after a path is set): lit from top-left. */
    function glossFill(ctx, c, cx, cy, r) {
        ctx.fillStyle = radial(ctx, cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1,
            [[0, shade(c, 0.55)], [0.35, c], [1, shade(c, -0.5)]]);
        ctx.fill();
    }
    /** Soft white highlight blob (top-left) clipped by the current path's bounding area. */
    function highlight(ctx, cx, cy, r, a) {
        ctx.save();
        ctx.fillStyle = radial(ctx, cx - r * 0.4, cy - r * 0.5, 0, cx - r * 0.4, cy - r * 0.5, r * 0.6,
            [[0, 'rgba(255,255,255,' + (a || 0.85) + ')'], [1, 'rgba(255,255,255,0)']]);
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.38, cy - r * 0.5, r * 0.42, r * 0.28, -0.6, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
    /** Four-point twinkle star at x,y; size sz, alpha a. */
    function twinkle(ctx, x, y, sz, a, c) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = c || '#fff';
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.quadraticCurveTo(x, y, x + sz, y);
        ctx.quadraticCurveTo(x, y, x, y + sz);
        ctx.quadraticCurveTo(x, y, x - sz, y);
        ctx.quadraticCurveTo(x, y, x, y - sz);
        ctx.fill();
        ctx.restore();
    }
    /** Periodic sparkle phase 0..1 for block (seeded by o.seed + colour index). */
    function pulse(t, seed, period) {
        const p = ((t + seed * 997) % period) / period;
        return p;
    }
    return { TAU, BASE, shade, rgba, hash, circle, ellipse, rr, poly, roundPoly, polyPts, star, starPts, heart, pts,
        radial, linear, glossFill, highlight, twinkle, pulse };
})();
