/*
 * Ping Pong — assets/models/shared.js: small canvas helpers for the models and themes (plain script, PP.*).
 * Loaded after core/registry.js and before every other file in assets/.
 */
(function () {
  /** "#rrggbb" + alpha -> "rgba(...)"; other colour strings are returned as they are. */
  PP.alpha = function (hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  };

  /** Court units -> device px factor of the current transform (shadowBlur is NOT scaled by the transform). */
  PP.unit = function (ctx) {
    const t = ctx.getTransform ? ctx.getTransform() : null;
    return t ? t.a : 1;
  };

  /** Thin outline just inside radius r: at least ~1.3 device px wide, so a small ball stays readable on a small screen. */
  PP.outline = function (ctx, x, y, r, color) {
    const lw = Math.max(0.9, 1.3 / PP.unit(ctx));
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r - lw / 2), 0, Math.PI * 2);
    ctx.stroke();
  };

  /** Hit animation curve: 1 right after a hit, easing to 0 at `len` frames (0 when age >= len). */
  PP.pulse = function (age, len) {
    if (!(age < len)) return 0;
    const k = 1 - age / len;
    return k * k;
  };

  /** Turn on a glow of `blur` court units in `color` (call inside ctx.save() / ctx.restore()). */
  PP.glow = function (ctx, color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * PP.unit(ctx);
  };

  /** Face a model to the court: after this, draw it as the LEFT paddle (net side = x + w); the right one is mirrored
   *  about the box centre, so it stays in the same w-wide box. Call inside ctx.save() / ctx.restore(). */
  PP.faceNet = function (ctx, x, w, side) {
    if (side === "R") { ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); }
  };

  /** Rounded-rectangle path (radius r), without relying on ctx.roundRect. */
  PP.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };
})();
