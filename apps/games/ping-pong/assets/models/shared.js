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

  /** Turn on a glow of `blur` court units in `color` (call inside ctx.save() / ctx.restore()). */
  PP.glow = function (ctx, color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * PP.unit(ctx);
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
