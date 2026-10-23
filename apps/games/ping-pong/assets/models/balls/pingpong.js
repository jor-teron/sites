/*
 * Ping Pong — Ping-Pong Ball: a small white ball with a soft highlight and a bounce shadow (the shadow breathes with
 * the ball's x, like a ball hopping on the table). It keeps its own white body on every theme, takes only the theme's
 * glow (if any), and has a thin dark outline so it stays visible on light courts. No trail; a white ring + specks on a hit.
 */
PP.registerBall({
  id: "pingpong",
  name: "Ping-Pong Ball",
  shadow: true,
  trail: null,
  hit: { kind: "spark", count: 5, colors: ["#ffffff", "#e8eef5"], speed: 3, life: 14, size: 2.2, glow: false, ring: { color: "rgba(255,255,255,0.9)", size: 22, life: 14 } },
  draw(ctx, x, y, r, col) {
    ctx.save();
    if (col.glow) PP.glow(ctx, col.glow, (col.glowBlur || 12) * 0.7);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.6, "#f6f6f1");
    g.addColorStop(1, "#d3d6d2");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    PP.outline(ctx, x, y, r, "rgba(20, 30, 50, 0.6)");
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";            // the soft highlight
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.4, r * 0.3, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },
});
