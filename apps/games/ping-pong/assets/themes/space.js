/* Ping Pong — Space: starfield and nebula, glowing paddles, a ball with a fiery trail. */
PP.registerTheme(PP.makeTheme({
  id: "space",
  name: "Space",
  ui: {
    bg: "#03040c", text: "#dfe6ff", hud: "#ffd36a", border: "#3a3f8c", accent: "#ffb05a",
    btnBg: "rgba(10, 8, 32, 0.8)", btnText: "#dfe6ff", panel: "#0b0a24", panelBorder: "#3a3f8c", scrim: "rgba(2, 2, 12, 0.8)",
  },
  colors: { message: "#ffffff", shade: "rgba(2, 2, 16, 0.55)" },
  paddle: {
    L: { fill: "#9ad1ff", glow: "#5aa8ff", glowBlur: 14, radius: 6, edge: "rgba(255,255,255,0.7)", edgeW: 1.2 },
    R: { fill: "#ffc08a", glow: "#ff8a3a", glowBlur: 14, radius: 6, edge: "rgba(255,255,255,0.7)", edgeW: 1.2 },
  },
  ball: { fill: "#fff6cf", glow: "#ff9a2a", glowBlur: 16 },
  trail: { len: 16, colors: ["#6a0a00", "#d92b00", "#ff7a1a", "#ffd36a"], alpha: 0.75, glow: "#ff6a00" },
  hit: { kind: "spark", count: 12, colors: ["#ffd36a", "#ff7a1a", "#ff3d00"], speed: 5, life: 26, size: 3.2, glow: true },
  drawCourt(ctx, e) {
    const g = ctx.createLinearGradient(0, 0, e.W, e.H);
    g.addColorStop(0, "#02030a"); g.addColorStop(0.6, "#0a0724"); g.addColorStop(1, "#14082e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.W, e.H);
    const nebula = function (cx, cy, r, c) {
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, c); rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    nebula(e.W * 0.22, e.H * 0.3, e.H * 0.7, "rgba(90, 40, 170, 0.22)");
    nebula(e.W * 0.8, e.H * 0.75, e.H * 0.65, "rgba(30, 90, 190, 0.2)");
    for (let i = 0; i < 90; i++) {
      const x = PP.hash(i) * e.W, y = PP.hash(i + 500) * e.H;
      const tw = 0.55 + 0.45 * Math.sin(e.t * 0.05 + i * 1.7);
      ctx.fillStyle = "rgba(255, 255, 255, " + (0.25 + 0.6 * tw * PP.hash(i + 900)) + ")";
      const s = 0.6 + PP.hash(i + 1300) * 1.5;
      ctx.fillRect(x, y, s, s);
    }
    drawNet(ctx, e, { color: "rgba(200, 215, 255, 0.4)", width: 3, dash: [1, 14], cap: "round" });
  },
}));
