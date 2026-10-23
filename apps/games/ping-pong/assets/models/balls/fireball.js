/*
 * Ping Pong — Fireball: a flame core (white-hot centre, orange body, red edge) with a flickering flame trail and
 * embers that rise off it; a burst of orange sparks on every hit. Own colours on every theme (the glow is its own too).
 */
PP.registerBall({
  id: "fire",
  name: "Fireball",
  trail: { len: 14, shape: "flame", colors: ["#5a0a00", "#d92b00", "#ff7a1a", "#ffd36a"], alpha: 0.8, glow: "#ff6a00" },
  emit: { every: 2, kind: "spark", colors: ["#ffd36a", "#ff7a1a", "#ff3d00"], size: 2.2, life: 22, speed: 1.1, rise: 0.5, glow: true },
  hit: { kind: "spark", count: 12, colors: ["#ffd36a", "#ff7a1a", "#ff3d00"], speed: 5.2, life: 26, size: 3.2, glow: true },
  draw(ctx, x, y, r, col, fx) {
    const fl = 1 + 0.06 * Math.sin((fx ? fx.t : 0) * 0.7);   // small flicker of the glow only; the body keeps radius r
    ctx.save();
    PP.glow(ctx, "#ff7a1a", 16 * fl);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#ffe27a");
    g.addColorStop(0.75, "#ff8a1f");
    g.addColorStop(1, "#d52a00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
});
