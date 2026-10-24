/*
 * Ping Pong — Hockey Stick: a long shaft with a curved blade at the bottom, seen from the side. It fits the paddle's hit
 * box (w x h): the shaft runs down the back (wall) side with a taped grip at the top, and at the bottom the blade hooks
 * toward the net (PP.faceNet) and is wrapped in white tape. On a hit the stick wobbles (the shaft and blade sway toward
 * the net and settle, ~18 frames, never leaving the box) and a small grey puff comes off the face (its own `hit`).
 */
PP.registerPaddle({
  id: "hockeystick",
  name: "Hockey Stick",
  hit: { kind: "spark", count: 4, colors: ["#f2f2f2", "#c9ced4"], speed: 1.6, life: 16, size: 2.6, glow: false, ring: { color: "rgba(235,238,242,0.75)", size: 10, life: 12 } },
  draw(ctx, x, y, w, h, col, st) {
    const wob = st.age < 18 ? Math.exp(-st.age / 5) * (0.5 - 0.5 * Math.cos(st.age * 1.4)) : 0;   // 0..1, sways and settles
    const sw = w * 0.36, bx = x + w * 0.08 + wob * w * 0.36, by = y + h * 0.8;        // shaft left edge, where the blade starts
    ctx.save();
    PP.faceNet(ctx, x, w, st.side);
    // shaft: dark composite with a coloured stripe, leaning a little on the wobble (its top stays put)
    const sx = x + w * 0.08;
    ctx.beginPath();
    ctx.moveTo(sx, y + 1); ctx.lineTo(sx + sw, y + 1);
    ctx.lineTo(bx + sw, by); ctx.lineTo(bx, by);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, 0, x + w * 0.5, 0);
    g.addColorStop(0, "#4a5870"); g.addColorStop(0.5, "#b4c0d2"); g.addColorStop(1, "#4a5870");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col.fill;                                                        // a stripe in the side's colour
    ctx.lineWidth = sw * 0.22;
    ctx.beginPath(); ctx.moveTo(sx + sw / 2, y + h * 0.26); ctx.lineTo(bx + sw / 2, by - 2); ctx.stroke();
    // grip tape at the top (wound diagonally) and a knob
    ctx.fillStyle = "#2a2a2e";
    PP.roundRect(ctx, sx - 0.3, y, sw + 0.6, h * 0.22, 1.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 0.6;
    for (let k = y + 2; k < y + h * 0.22 - 1; k += 2.4) { ctx.beginPath(); ctx.moveTo(sx, k + 1.4); ctx.lineTo(sx + sw, k); ctx.stroke(); }
    // blade: from the shaft foot, curving down and toward the net, rounded toe at the bottom
    const toeY = y + h * 0.9 - wob * 2, bot = y + h - 0.6;                            // a J: the toe curls up on the net side
    const blade = function () {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + sw, by);
      ctx.lineTo(bx + sw, bot - 5);
      ctx.quadraticCurveTo(bx + sw + 0.3, bot - 3, x + w - 3.4, bot - 3.2);
      ctx.quadraticCurveTo(x + w - 3, toeY + 0.4, x + w - 1.8, toeY);
      ctx.quadraticCurveTo(x + w - 0.6, toeY + 0.2, x + w - 0.6, toeY + 2);
      ctx.quadraticCurveTo(x + w - 0.6, bot, x + w * 0.45, bot);
      ctx.quadraticCurveTo(bx, bot, bx, bot - 3.5);
      ctx.closePath();
    };
    blade();
    ctx.fillStyle = "#f4f6f8";                                                        // white tape on the blade
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(90,100,115,0.4)";                                         // tape wraps
    ctx.lineWidth = 0.5;
    for (let k = by + 1.5; k < y + h; k += 2) { ctx.beginPath(); ctx.moveTo(x, k + 1); ctx.lineTo(x + w, k - 0.6); ctx.stroke(); }
    ctx.restore();
    blade();
    ctx.strokeStyle = "rgba(20,26,36,0.75)";                                          // outline: reads on a light court
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  },
});
