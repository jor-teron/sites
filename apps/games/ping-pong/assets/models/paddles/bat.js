/*
 * Ping Pong — Table Tennis Bat: a red rubber blade with a wooden handle, seen from above. It fits the paddle's hit box
 * (w x h): the blade is the top ~3/4 (an upright oval), the handle the rest (pointing down). It is oriented to the court:
 * the red rubber face is the side toward the net, the bare wood back faces the wall. On a hit the blade flexes (the oval
 * squeezes and springs back inside the box, ~14 frames) and a little puff of dust flies off the face.
 */
PP.registerPaddle({
  id: "bat",
  name: "Table Tennis Bat",
  hit: { kind: "spark", count: 5, colors: ["#ffffff", "#ffd9a0"], speed: 2.8, life: 14, size: 2, glow: false, ring: { color: "rgba(255,235,200,0.85)", size: 16, life: 12 } },
  draw(ctx, x, y, w, h, col, st) {
    const bh = h * 0.74, cx = x + w / 2, left = st.side === "L";
    const flex = st.age < 16 ? Math.exp(-st.age / 5) * Math.cos(st.age * 0.95) : 0;   // + squeezes, - springs back
    const rx = Math.min(w / 2, w / 2 * (0.94 - 0.12 * flex)), ry = bh / 2, cy = y + ry;
    const netX = left ? x + w : x;                                                    // the face toward the net
    // handle: tapered wooden grip with a darker flared end
    const hw = w * 0.46, ew = w * 0.62, hy = y + bh - 3;
    const hg = ctx.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, "#8a5424"); hg.addColorStop(0.5, "#e2b072"); hg.addColorStop(1, "#8a5424");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(cx - hw / 2, hy); ctx.lineTo(cx + hw / 2, hy);
    ctx.lineTo(cx + ew / 2, y + h - 3); ctx.lineTo(cx + ew / 2 - 1, y + h); ctx.lineTo(cx - ew / 2 + 1, y + h); ctx.lineTo(cx - ew / 2, y + h - 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5e3612";
    ctx.fillRect(cx - ew / 2 + 1, y + h - 4, ew - 2, 4);
    // blade: wood body, then the rubber on the net side (clipped to the oval)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#d9a566";
    ctx.fillRect(x, y, w, bh);
    const rubber = st.side === "R" ? "#b3241f" : "#d6312c";                           // two slightly different reds
    const rg = ctx.createLinearGradient(left ? cx - rx * 0.25 : cx + rx * 0.25, 0, netX, 0);
    rg.addColorStop(0, rubber); rg.addColorStop(1, "#ee5a4c");
    ctx.fillStyle = rg;
    if (left) ctx.fillRect(cx - rx * 0.25, y, w, bh); else ctx.fillRect(x, y, cx - x + rx * 0.25, bh);
    ctx.fillStyle = "rgba(255,255,255,0.22)";                                         // sheen on the rubber
    ctx.fillRect(left ? cx + rx * 0.35 : cx - rx * 0.6, y + bh * 0.12, rx * 0.25, bh * 0.4);
    ctx.restore();
    ctx.strokeStyle = "#f4e3bf";                                                      // the white sponge rim
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 0.6, ry - 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";                                            // dark outline for the contrast on any court
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
});
