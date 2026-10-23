/* Ping Pong — Table Tennis: green table with a white edge, a net, red / black bats, white ball with a bounce shadow. */
PP.registerTheme(PP.makeTheme({
  id: "tabletennis",
  name: "Table Tennis",
  ui: {
    bg: "#0b2416", text: "#eaf6ee", hud: "#ffffff", border: "#0d4a28", accent: "#7be0a0",
    btnBg: "rgba(10, 52, 28, 0.85)", btnText: "#eaf6ee", panel: "#10331f", panelBorder: "#2f7a4c", scrim: "rgba(4, 16, 9, 0.78)",
  },
  colors: { message: "#ffffff", shade: "rgba(0, 24, 10, 0.5)" },
  paddle: {
    L: { fill: "#d6312c", radius: 4, edge: "#e2b57a", edgeW: 2.2, shine: "rgba(255,255,255,0.18)" },
    R: { fill: "#1b1b1f", radius: 4, edge: "#e2b57a", edgeW: 2.2, shine: "rgba(255,255,255,0.14)" },
  },
  ball: { fill: "#ffffff", rim: "rgba(0, 0, 0, 0.22)", rimW: 1 },
  shadow: true,
  hit: { kind: "spark", count: 5, colors: ["#ffffff"], speed: 3, life: 14, size: 2.2, glow: false, ring: { color: "rgba(255,255,255,0.9)", size: 22, life: 14 } },
  drawCourt(ctx, e) {
    const g = ctx.createLinearGradient(0, 0, 0, e.H);
    g.addColorStop(0, "#1f7c45"); g.addColorStop(1, "#16603a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, e.W, e.H);
    // white edge of the table + the long centre line
    ctx.strokeStyle = "#f4f4f2";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, e.W - 8, e.H - 8);
    ctx.strokeStyle = "rgba(244, 244, 242, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, e.H / 2); ctx.lineTo(e.W - 10, e.H / 2); ctx.stroke();
    // net: shadow, mesh band, white tape, posts
    const nx = e.W / 2;
    ctx.fillStyle = "rgba(0, 20, 8, 0.28)";
    ctx.fillRect(nx + 3, 6, 6, e.H - 12);
    ctx.fillStyle = "rgba(236, 240, 238, 0.28)";
    ctx.fillRect(nx - 3, 0, 6, e.H);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 6; y < e.H; y += 8) { ctx.moveTo(nx - 3, y); ctx.lineTo(nx + 3, y + 4); ctx.moveTo(nx + 3, y); ctx.lineTo(nx - 3, y + 4); }
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(nx - 1.5, 0, 3, e.H);
    ctx.fillStyle = "#2a2f33";
    ctx.fillRect(nx - 5, 0, 10, 8);
    ctx.fillRect(nx - 5, e.H - 8, 10, 8);
  },
}));
