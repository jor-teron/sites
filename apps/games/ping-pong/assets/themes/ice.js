/* Ping Pong — Ice Rink: white and blue rink with a frosted border, blue bats, frost sparks on every hit. */
PP.registerTheme(PP.makeTheme({
  id: "ice",
  name: "Ice Rink",
  ui: {
    bg: "#dcecf9", text: "#10324f", hud: "#1f5fae", border: "#8fb9e0", accent: "#2f7fd6",
    btnBg: "rgba(240, 248, 255, 0.9)", btnText: "#10324f", panel: "#eef6fd", panelBorder: "#8fb9e0", scrim: "rgba(16, 50, 79, 0.55)",
  },
  colors: { message: "#ffffff", shade: "rgba(12, 40, 72, 0.5)" },
  paddle: {
    L: { fill: "#1f5fae", radius: 5, edge: "#dff1ff", edgeW: 2, shine: "rgba(255,255,255,0.28)" },
    R: { fill: "#c8362f", radius: 5, edge: "#dff1ff", edgeW: 2, shine: "rgba(255,255,255,0.28)" },
  },
  ball: { fill: "#10243e", rim: "#dff1ff", rimW: 1.6 },
  trail: { len: 8, colors: ["#bfe0ff", "#7cb8f0", "#3a82d4"], alpha: 0.5, glow: null },
  hit: { kind: "flake", count: 9, colors: ["#2f7fd6", "#62b4ff", "#ffffff"], speed: 3.6, life: 30, size: 6.5, glow: "#9fd2ff" },
  drawCourt(ctx, e) {
    const g = ctx.createLinearGradient(0, 0, 0, e.H);
    g.addColorStop(0, "#f4faff"); g.addColorStop(1, "#cfe6f8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.W, e.H);
    // skate scratches (fixed positions)
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const x = PP.hash(i + 7) * e.W, y = PP.hash(i + 70) * e.H, len = 60 + PP.hash(i + 140) * 140, a = (PP.hash(i + 210) - 0.5) * 1.2;
      ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.7)" : "rgba(120,170,215,0.28)";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len / 2, y + len * 0.12 * Math.sin(a * 5), x + len * Math.cos(a), y + len * Math.sin(a)); ctx.stroke();
    }
    // blue lines, face-off circle and dot
    ctx.strokeStyle = "rgba(47, 127, 214, 0.5)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(e.W * 0.25, 0); ctx.lineTo(e.W * 0.25, e.H);
    ctx.moveTo(e.W * 0.75, 0); ctx.lineTo(e.W * 0.75, e.H);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.W / 2, e.H / 2, Math.min(e.H * 0.2, 90), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(47, 127, 214, 0.6)";
    ctx.beginPath(); ctx.arc(e.W / 2, e.H / 2, 6, 0, Math.PI * 2); ctx.fill();
    // frosted rim: a soft white band along the boards
    const edge = function (x0, y0, x1, y1, rx, ry, rw, rh) {
      const fg = ctx.createLinearGradient(x0, y0, x1, y1);
      fg.addColorStop(0, "rgba(255,255,255,0.95)"); fg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fg; ctx.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, 22, 0, 0, e.W, 22);
    edge(0, e.H, 0, e.H - 22, 0, e.H - 22, e.W, 22);
    edge(0, 0, 22, 0, 0, 0, 22, e.H);
    edge(e.W, 0, e.W - 22, 0, e.W - 22, 0, 22, e.H);
    drawNet(ctx, e, { color: "rgba(47, 127, 214, 0.55)", width: 3, dash: [10, 12] });
  },
}));
