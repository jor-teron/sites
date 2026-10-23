/*
 * Ping Pong — theme base (plain script).
 *   PP.makeTheme(spec) turns a theme spec into a theme object (see core/registry.js for the contract).
 * Theme code only draws the COURT (background, lines, net) and the EFFECTS (ball trail, bounce shadow, hit
 * particles) and provides COLOURS; paddles and ball are drawn by the models in assets/models/ through
 * PP.drawPaddle / PP.drawBall, with the colours the theme gives them.
 *
 * Spec keys:
 *   id, name
 *   ui           CSS custom properties for the page chrome (bg, text, hud, border, accent, btnBg, btnText,
 *                panel, panelBorder, scrim); missing keys keep the stylesheet defaults (the Classic look)
 *   colors       { message, shade }  win / pause text on the court and the dimming behind it
 *   paddle       { L: {...}, R: {...} } colours for the paddle model (see core/registry.js, assets/models/paddles/)
 *   ball         colours for the ball model (see assets/models/balls/)
 *   trail        { len, colors: [old … new], alpha, glow, shape }  ball trail (drawn under the ball); null = none
 *                (shape "flame": flickering tapered flame). A ball model can override trail / hit / shadow (core/registry.js)
 *   shadow       true: bounce shadow under the ball (Table Tennis)
 *   emit (ball models only)  { every, kind, colors, size, life, speed, glow, rise }  a particle every `every` frames
 *   hit          { kind: "spark" | "ring" | "flake" | "star", count, colors, speed, life, size, glow, ring }  null = none
 *   drawCourt(ctx, e)   court background + lines + net   (required)
 */
(function () {
  PP.makeTheme = function (spec) {
    const th = Object.assign({ ui: {}, colors: {}, trail: null, shadow: false, hit: null }, spec);
    th.colors = Object.assign({ message: CFG.colors.message, shade: CFG.colors.shade }, spec.colors);
    th.paddleColors = function (side) { return this.paddle[side === "R" ? "R" : "L"]; };
    th.ballColors = function () { return this.ball; };
    th.drawUnder = spec.drawUnder || function (ctx, e, b) {
      const f = PP.ballFx(this, e.model);           // the ball's own trail / shadow, else this theme's
      if (f.trail) PP.drawTrail(ctx, e, b, f.trail);
      if (f.shadow) PP.drawBounceShadow(ctx, e, b);
    };
    th.drawOver = spec.drawOver || function (ctx, e) { PP.drawParticles(ctx, e); };
    return th;
  };

  /** Ball trail: faded discs along the recent path, colour from old to new. */
  PP.drawTrail = function (ctx, e, b, tr) {
    const pts = e.fx.trail, n = pts.length;
    if (!n) return;
    ctx.save();
    if (tr.glow) PP.glow(ctx, tr.glow, 10);
    for (let i = 0; i < n; i++) {
      const a = (i + 1) / (n + 1);
      const col = tr.colors[Math.min(tr.colors.length - 1, Math.floor(a * tr.colors.length))];
      ctx.fillStyle = PP.alpha(col, (tr.alpha || 0.6) * a);
      let x = pts[i].x, y = pts[i].y, rad = b.r * (0.3 + 0.7 * a);
      if (tr.shape === "flame") {                   // flicker + sideways wobble that grows toward the tail
        const q = pts[Math.min(n - 1, i + 1)], dx = q.x - x, dy = q.y - y, d = Math.hypot(dx, dy) || 1;
        const w = Math.sin(e.fx.t * 0.45 + i * 1.9) * (1 - a) * b.r * 0.7;
        x += -dy / d * w; y += dx / d * w;
        rad *= 0.85 + 0.3 * Math.sin(e.fx.t * 0.6 + i * 2.3);
      }
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /** Soft shadow under the ball; its distance "breathes" with the ball's x, like a ball bouncing on the table. */
  PP.drawBounceShadow = function (ctx, e, b) {
    const lift = Math.abs(Math.sin(b.x * 0.034));          // 0 = on the table, 1 = top of the bounce
    const dy = b.r * (0.5 + 2.2 * lift);
    ctx.save();
    ctx.fillStyle = "rgba(0, 20, 8, " + (0.34 - 0.16 * lift) + ")";
    ctx.beginPath();
    ctx.ellipse(b.x + dy * 0.35, b.y + dy, b.r * (1.05 - 0.2 * lift), b.r * (0.5 - 0.1 * lift), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /** Spawn a hit effect from a theme's `hit` spec at (x, y), fanned around the direction (nx, ny). */
  PP.spawnHit = function (h, fx, x, y, kind, nx, ny) {
    const big = kind === "score" ? 1.6 : 1;
    const base = Math.atan2(ny, nx);
    if (h.ring) {
      fx.parts.push({ x: x, y: y, vx: 0, vy: 0, life: h.ring.life, max: h.ring.life, kind: "ring", color: h.ring.color, size: h.ring.size * big, glow: false });
    }
    const n = Math.round(h.count * big);
    for (let i = 0; i < n; i++) {
      const ang = base + (fx.rand() - 0.5) * 2.2;
      const sp = h.speed * (0.45 + 0.75 * fx.rand());
      const life = Math.round(h.life * (0.7 + 0.5 * fx.rand()));
      fx.parts.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: life, max: life, kind: h.kind,
        color: h.colors[i % h.colors.length], size: h.size * (0.6 + 0.6 * fx.rand()), glow: h.glow,
      });
    }
    while (fx.parts.length > 90) fx.parts.shift();
  };

  /** One continuous-emission particle (a ball model's `emit` spec) at (x, y): frost, embers... */
  PP.spawnEmit = function (em, fx, x, y) {
    const ang = fx.rand() * Math.PI * 2, sp = em.speed * (0.3 + 0.7 * fx.rand());
    const life = Math.round(em.life * (0.7 + 0.5 * fx.rand()));
    fx.parts.push({
      x: x + (fx.rand() - 0.5) * 6, y: y + (fx.rand() - 0.5) * 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (em.rise || 0),
      life: life, max: life, kind: em.kind, color: em.colors[Math.floor(fx.rand() * em.colors.length)],
      size: em.size * (0.6 + 0.6 * fx.rand()), glow: em.glow,
    });
    while (fx.parts.length > 90) fx.parts.shift();
  };

  /** Draw the live particles (called from a theme's drawOver). */
  PP.drawParticles = function (ctx, e) {
    const ps = e.fx.parts;
    if (!ps.length) return;
    ctx.save();
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], a = p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.3);
      if (p.glow) PP.glow(ctx, p.glow === true ? p.color : p.glow, 8);
      if (p.kind === "ring") {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - a) + 4, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === "flake") {
        const s = p.size * (0.5 + 0.5 * a), rot = p.x * 0.05;
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.6; ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const ang = rot + k * Math.PI / 3;
          ctx.moveTo(p.x - Math.cos(ang) * s, p.y - Math.sin(ang) * s);
          ctx.lineTo(p.x + Math.cos(ang) * s, p.y + Math.sin(ang) * s);
        }
        ctx.stroke();
      } else if (p.kind === "star") {                // a four-point glint
        const s = p.size * (0.4 + 0.8 * a);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s * 0.22, p.y - s * 0.22); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x + s * 0.22, p.y + s * 0.22);
        ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s * 0.22, p.y + s * 0.22); ctx.lineTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.22, p.y - s * 0.22);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };

  /** Deterministic 0..1 from an integer (for fixed stars / scratches that must not move). */
  PP.hash = function (i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
})();
