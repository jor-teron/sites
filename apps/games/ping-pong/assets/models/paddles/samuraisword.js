/*
 * Ping Pong — Samurai Sword: a katana, point up, seen from the side. It fits the paddle's hit box (w x h): the steel
 * blade is the top ~70% (an angled point at the top), then a small round guard (tsuba) as wide as the box, then the wrapped
 * handle (tsuka) with its diamond pattern and an end cap. It is oriented to the court (PP.faceNet): the bright cutting
 * edge with its wavy temper line faces the net, the darker back (mune) the wall. A soft shine drifts slowly along the
 * blade (frame clock fx.t). On a hit a sharp white glint flashes at the contact point on the edge (~12 frames) and a few
 * sparks fly off (its own `hit`).
 */
PP.registerPaddle({
  id: "samuraisword",
  name: "Samurai Sword",
  hit: { kind: "spark", count: 4, colors: ["#ffffff", "#fff1b8", "#ffd27a"], speed: 4.6, life: 14, size: 1.6, glow: true, ring: null },
  draw(ctx, x, y, w, h, col, st) {
    const t = st.fx ? st.fx.t : 0, p = PP.pulse(st.age, 12), bh = h * 0.7, gy = y + bh + 2.5;
    const bx = x + w * 0.22, bw = w * 0.56, tip = Math.min(h * 0.09, 9);             // blade strip, inset in the box
    ctx.save();
    PP.faceNet(ctx, x, w, st.side);
    // handle: dark wrap with crossing cord (diamonds), a collar and an end cap
    const hx = x + w * 0.26, hw = w * 0.48, hy = gy + 2;
    ctx.fillStyle = "#14161f";
    PP.roundRect(ctx, hx, hy, hw, y + h - hy, 1.5);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "#c8bfa6";
    ctx.lineWidth = 0.9;
    for (let k = hy - hw; k < y + h; k += 3.4) {
      ctx.beginPath(); ctx.moveTo(hx, k); ctx.lineTo(hx + hw, k + hw); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx + hw, k); ctx.lineTo(hx, k + hw); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#b8923a";                                                        // collar (habaki) and end cap (kashira)
    ctx.fillRect(bx, y + bh - 2, bw, 2.5);
    ctx.fillRect(hx - 0.3, y + h - 2.2, hw + 0.6, 2.2);
    // blade: back straight, edge side meeting it in an angled point at the top
    ctx.beginPath();
    ctx.moveTo(bx, y + bh - 2);
    ctx.lineTo(bx, y + tip * 0.35);
    ctx.lineTo(bx + bw * 0.3, y + 0.3);
    ctx.quadraticCurveTo(bx + bw, y + tip * 0.4, bx + bw, y + tip);
    ctx.lineTo(bx + bw, y + bh - 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, "#6f7a86"); g.addColorStop(0.45, "#c7d0d9"); g.addColorStop(0.7, "#e9eef3"); g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";                                       // wavy temper line (hamon) near the edge
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const yy = y + tip + k / 24 * (bh - tip - 2), xx = bx + bw * (0.66 + 0.06 * Math.sin(k * 1.7));
      if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    const sy = y + ((t * 0.6) % (bh * 1.6)) - bh * 0.3, sg = ctx.createLinearGradient(0, sy - bh * 0.18, 0, sy + bh * 0.18);
    sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,255,255,0.45)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;                                                               // the soft shine drifting along the blade
    ctx.fillRect(bx, y, bw, bh);
    ctx.restore();
    ctx.strokeStyle = "rgba(30,36,46,0.7)";                                           // outline: reads on a light court
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // guard (tsuba): a small round disc as wide as the box, dark iron with a gold rim
    ctx.beginPath();
    ctx.ellipse(x + w / 2, gy, w / 2 - 0.4, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#2b2b30";
    ctx.fill();
    ctx.strokeStyle = "#c9a548";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (p > 0) {                                                                      // the glint: a sharp white four-point star on the edge
      const fy = y + Math.min(Math.max(st.y, 0.1), 0.66) * h, gx = bx + bw, s = 3 + 9 * p;
      ctx.save();
      PP.glow(ctx, "#ffffff", 6 * p);
      ctx.fillStyle = "rgba(255,255,255," + Math.min(1, p * 1.4) + ")";
      ctx.beginPath();
      ctx.moveTo(gx, fy - s); ctx.lineTo(gx + s * 0.16, fy - s * 0.16); ctx.lineTo(gx + s, fy); ctx.lineTo(gx + s * 0.16, fy + s * 0.16);
      ctx.lineTo(gx, fy + s); ctx.lineTo(gx - s * 0.16, fy + s * 0.16); ctx.lineTo(gx - s, fy); ctx.lineTo(gx - s * 0.16, fy - s * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
});
