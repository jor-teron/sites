/* Ping Pong — Neon: dark navy court with a faint grid, glowing cyan and magenta paddles, glowing ball with a light trail. */
PP.registerTheme(PP.makeTheme({
  id: "neon",
  name: "Neon",
  ui: {
    bg: "#04060f", text: "#cfeaff", hud: "#22e6ff", border: "#1ab8cc", accent: "#22e6ff",
    btnBg: "rgba(6, 12, 34, 0.8)", btnText: "#cfeaff", panel: "#0a1030", panelBorder: "#1ab8cc", scrim: "rgba(2, 4, 14, 0.78)",
  },
  colors: { message: "#ffffff", shade: "rgba(2, 4, 20, 0.55)" },
  paddle: {
    L: { fill: "#22e6ff", glow: "#22e6ff", glowBlur: 16, radius: 5, edge: "rgba(255,255,255,0.8)", edgeW: 1.2 },
    R: { fill: "#ff3df2", glow: "#ff3df2", glowBlur: 16, radius: 5, edge: "rgba(255,255,255,0.8)", edgeW: 1.2 },
  },
  ball: { fill: "#ffffff", glow: "#22e6ff", glowBlur: 18 },
  trail: { len: 12, colors: ["#7a2cff", "#ff3df2", "#22e6ff"], alpha: 0.7, glow: "#22e6ff" },
  hit: { kind: "spark", count: 9, colors: ["#22e6ff", "#ff3df2"], speed: 4.6, life: 22, size: 3.2, glow: true },
  drawCourt(ctx, e) {
    const g = ctx.createLinearGradient(0, 0, 0, e.H);
    g.addColorStop(0, "#050818"); g.addColorStop(1, "#0b1236");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.W, e.H);
    ctx.strokeStyle = "rgba(34, 230, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < e.W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, e.H); }
    for (let y = 40; y < e.H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(e.W, y); }
    ctx.stroke();
    ctx.save();
    PP.glow(ctx, "#22e6ff", 10);
    ctx.strokeStyle = "rgba(34, 230, 255, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 1.5); ctx.lineTo(e.W, 1.5);
    ctx.moveTo(0, e.H - 1.5); ctx.lineTo(e.W, e.H - 1.5);
    ctx.stroke();
    ctx.restore();
    drawNet(ctx, e, { color: "#ff3df2", width: 3, dash: [10, 12], glow: "#ff3df2", glowBlur: 10 });
  },
}));
