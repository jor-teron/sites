/*
 * Ping Pong — Cricket Bat: a willow blade with a rubber-gripped handle, seen from the side. It fits the paddle's hit box
 * (w x h): the blade is the top ~70% (rounded toe at the top, sloping shoulders where it meets the handle), the handle the
 * rest (pointing down). It is oriented to the court (PP.faceNet): the flat, pale face is toward the net, the darker
 * rounded back with its spine faces the wall. Fine grain lines run along the blade. On a hit the face flashes bright at
 * the contact point (~14 frames) and a puff of pale wood dust flies off it (its own `hit`).
 */
PP.registerPaddle({
  id: "cricketbat",
  name: "Cricket Bat",
  hit: { kind: "spark", count: 7, colors: ["#fff6dc", "#ecd29a", "#c49a5c"], speed: 2.4, life: 20, size: 1.8, glow: false, ring: { color: "rgba(255,250,225,0.9)", size: 14, life: 10 } },
  draw(ctx, x, y, w, h, col, st) {
    const p = PP.pulse(st.age, 14), bh = h * 0.7, sh = h * 0.08, toe = Math.min(w * 0.45, 5);
    ctx.save();
    PP.faceNet(ctx, x, w, st.side);
    // handle: black rubber grip with ridges, a cord-bound neck and a rounded end
    const gx = x + w * 0.3, gw = w * 0.4, gy = y + bh + sh * 0.5;
    ctx.fillStyle = "#c79a5e";                                                        // the cane neck under the shoulders
    ctx.fillRect(gx, y + bh - 1, gw, sh);
    ctx.fillStyle = "#1f2228";
    PP.roundRect(ctx, gx - 0.4, gy, gw + 0.8, y + h - gy, gw * 0.45);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    for (let k = gy + 2; k < y + h - 2; k += 2.6) ctx.fillRect(gx, k, gw, 0.9);         // grip ridges
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(gx + gw * 0.62, gy + 1, gw * 0.18, y + h - gy - 3);                  // shine on the rubber
    // blade: rounded toe at the top, shoulders sloping into the handle at the bottom
    ctx.beginPath();
    ctx.moveTo(x, y + toe);
    ctx.quadraticCurveTo(x, y, x + toe, y);
    ctx.lineTo(x + w - toe, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + toe);
    ctx.lineTo(x + w, y + bh - sh * 0.4);
    ctx.quadraticCurveTo(x + w, y + bh, gx + gw, y + bh + sh * 0.2);
    ctx.lineTo(gx, y + bh + sh * 0.2);
    ctx.quadraticCurveTo(x, y + bh, x, y + bh - sh * 0.4);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);                                // back (wall) darker -> face (net) pale
    g.addColorStop(0, "#b8854a"); g.addColorStop(0.35, "#e2bd7f"); g.addColorStop(0.5, "#cf9f60"); g.addColorStop(0.7, "#efd6a2"); g.addColorStop(1, "#f7e6bf");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(120,72,28,0.28)";                                         // grain lines along the willow
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      const gxi = x + w * (0.12 + i * 0.15);
      ctx.beginPath();
      ctx.moveTo(gxi, y + 2);
      ctx.bezierCurveTo(gxi + 0.6, y + bh * 0.3, gxi - 0.6, y + bh * 0.6, gxi + 0.3, y + bh);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";                                         // the edge of the flat face
    ctx.fillRect(x + w - 1.3, y + toe, 0.8, bh - toe - sh);
    if (p > 0) {                                                                      // hit flash at the contact point
      const fy = y + Math.min(st.y, 0.7) * h, fg = ctx.createRadialGradient(x + w, fy, 0, x + w, fy, h * 0.28);
      fg.addColorStop(0, "rgba(255,255,240," + p + ")"); fg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(x, y, w, bh + sh);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(70,40,12,0.6)";                                           // outline: reads on any court
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  },
});
