/*
 * Ping Pong — Ice Ball: a crystal ball (pale-blue glassy body, facet lines, a bright glint) that sheds frost flakes as
 * it travels and a cool trail; a burst of flake-shaped frost on every hit. Own colours (blue outline keeps it visible
 * on a light court); the glow is its own too.
 */
PP.registerBall({
  id: "ice",
  name: "Ice Ball",
  trail: { len: 8, colors: ["#d9efff", "#9fd2ff", "#5aa8f0"], alpha: 0.45, glow: "#9fd2ff" },
  emit: { every: 3, kind: "flake", colors: ["#62b4ff", "#bfe3ff", "#2f7fd6"], size: 4.5, life: 28, speed: 0.9, glow: "#9fd2ff" },
  hit: { kind: "flake", count: 10, colors: ["#2f7fd6", "#62b4ff", "#bfe3ff", "#ffffff"], speed: 3.6, life: 30, size: 6.5, glow: "#9fd2ff" },
  draw(ctx, x, y, r) {
    ctx.save();
    PP.glow(ctx, "#8fd0ff", 10);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#f4fbff");
    g.addColorStop(0.55, "#a9dcff");
    g.addColorStop(1, "#4f9be0");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // facets: a hexagon inside the ball and spokes to the rim
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3, px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.5;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.3;
      ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
      ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
    }
    ctx.stroke();
    PP.outline(ctx, x, y, r, "#2a6fb8");                     // outline: visible on a light court
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";            // glint
    ctx.beginPath();
    ctx.arc(x - r * 0.38, y - r * 0.4, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  },
});
