/*
 * Ping Pong — Tennis Racket: an oval head with a string grid, a slim open throat and a wrapped grip, seen side-on to the
 * string bed. It fits the paddle's hit box (w x h): the head is the top ~60% (the oval fills the width), the throat
 * narrows into the shaft, the grip is the rest (pointing down). It is oriented to the court (PP.faceNet): the frame's
 * highlight is on the net side. On a hit the strings flex: the bed bows away from the ball at the contact point and
 * springs back (a damped wobble of ~16 frames, inside the frame), with a tiny pop of fuzz (its own `hit`).
 */
PP.registerPaddle({
  id: "tennisracket",
  name: "Tennis Racket",
  hit: { kind: "spark", count: 3, colors: ["#e9ff8a", "#ffffff"], speed: 2.4, life: 12, size: 1.6, glow: false, ring: { color: "rgba(235,255,170,0.8)", size: 12, life: 10 } },
  draw(ctx, x, y, w, h, col, st) {
    const hh = h * 0.6, cx = x + w / 2, rx = w / 2 - 1.1, ry = hh / 2 - 1.1, cy = y + hh / 2;
    const flex = st.age < 16 ? Math.exp(-st.age / 4) * Math.cos(st.age * 1.1) : 0;   // + bows back, - springs past
    const fy = y + Math.min(Math.max(st.y, 0.12), 0.55) * h, bow = -flex * rx * 0.55;  // toward the wall (-x) when +
    const frame = col.fill, sy = y + h * 0.7;
    ctx.save();
    PP.faceNet(ctx, x, w, st.side);
    // grip: wrapped handle with an end cap
    const gx = cx - w * 0.2, gw = w * 0.4;
    ctx.fillStyle = "#f1efe8";
    PP.roundRect(ctx, gx, sy, gw, y + h - sy, 1.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,90,90,0.45)";
    ctx.lineWidth = 0.5;
    for (let k = sy + 1.5; k < y + h - 2; k += 2.2) { ctx.beginPath(); ctx.moveTo(gx, k + 1.2); ctx.lineTo(gx + gw, k); ctx.stroke(); }
    ctx.fillStyle = "#33373d";
    ctx.fillRect(gx - 0.3, y + h - 2, gw + 0.6, 2);
    // throat: two slim arms from the head down to the shaft
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.75, cy + ry * 0.66); ctx.quadraticCurveTo(cx - 1, y + hh + 2, cx - 1, sy + 0.5);
    ctx.moveTo(cx + rx * 0.75, cy + ry * 0.66); ctx.quadraticCurveTo(cx + 1, y + hh + 2, cx + 1, sy + 0.5);
    ctx.stroke();
    ctx.fillStyle = frame;
    ctx.fillRect(cx - 1.4, y + hh + 1, 2.8, sy - y - hh);
    // strings: clipped to the head; the mains bow at the contact point on a hit
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, hh);
    ctx.strokeStyle = "rgba(240,240,225,0.85)";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {                                                    // mains (along the length)
      const sx = x + i * w / 5;
      ctx.moveTo(sx, y); ctx.quadraticCurveTo(sx + bow, fy, sx, y + hh);
    }
    for (let k = y + 2.6; k < y + hh; k += 3) { ctx.moveTo(x, k); ctx.lineTo(x + w, k); }   // crosses
    ctx.stroke();
    ctx.restore();
    // the frame (oval) with a highlight on the net side and a dark outline for light courts
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 0.6, ry + 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
});
