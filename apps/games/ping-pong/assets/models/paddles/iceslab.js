/*
 * Ping Pong — Ice Slab: a frosted block of ice (pale blue gradient, frost speckles, a bright bevel, a steel-blue outline so it
 * reads on dark and light courts) with a few slow twinkles. On a hit a crack splits across the slab from the contact point
 * and fades out (~40 frames) with a glint, and ice flakes and stars fly off the face. The crack shape comes from the hit
 * counter (a fixed hash), not from any random generator; everything stays inside the hit box.
 */
PP.registerPaddle({
  id: "iceslab",
  name: "Ice Slab",
  hit: { kind: "flake", count: 5, colors: ["#ffffff", "#bfe6ff", "#7cc4ff"], speed: 3.2, life: 26, size: 5, glow: "#bfe6ff", ring: null },
  draw(ctx, x, y, w, h, col, st) {
    const fx = st.fx, t = fx ? fx.t : 0, p = PP.pulse(st.age, 40);
    PP.roundRect(ctx, x, y, w, h, 3);
    ctx.save();
    PP.glow(ctx, "rgba(190, 230, 255, 0.9)", 6 + 6 * PP.pulse(st.age, 14));
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#f2faff"); g.addColorStop(0.45, "#bfe0f6"); g.addColorStop(1, "#86bce6");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    PP.roundRect(ctx, x, y, w, h, 3);
    ctx.clip();
    for (let i = 0; i < 16; i++) {                                                    // frost: fixed speckles and short scratches
      const px = x + PP.hash(i + 301) * w, py = y + PP.hash(i + 331) * h;
      ctx.fillStyle = i % 3 ? "rgba(255,255,255,0.75)" : "rgba(120,175,225,0.35)";
      ctx.fillRect(px - 0.6, py - 0.6, 1.3, 1.3 + PP.hash(i + 361) * 3);
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";                                          // bevel highlight
    ctx.fillRect(x + 1.2, y + 3, 1.6, h - 6);
    if (p > 0) {                                                                      // the crack: 4 jagged rays from the contact point
      const face = st.side === "L" ? x + w : x, fy = y + st.y * h, dir = st.side === "L" ? -1 : 1;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? "rgba(255,255,255," + Math.min(1, p * 1.6) + ")" : "rgba(40,100,170," + Math.min(1, p * 1.4) + ")";
        ctx.lineWidth = pass ? 0.9 : 1.8;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          let cx = face, cy = fy;
          const grow = Math.min(1, st.age / 6 + 0.3);                                  // the crack grows in over the first frames
          ctx.moveTo(cx, cy);
          for (let s = 0; s < 4; s++) {
            const hs = st.n * 13 + k * 5 + s;
            cx += dir * (1.2 + PP.hash(hs) * 3) * grow;
            cy += ((k - 1.5) * 4.2 + (PP.hash(hs + 50) - 0.5) * 5) * grow * (s + 1) / 3;
            ctx.lineTo(cx, cy);
          }
        }
        ctx.stroke();
      }
      const a = PP.pulse(st.age, 18);                                                 // the glint on the contact point
      if (a > 0) {
        const s = 3 + 7 * a, fy2 = fy;
        ctx.fillStyle = "rgba(255,255,255," + a + ")";
        ctx.beginPath();
        ctx.moveTo(face, fy2 - s); ctx.lineTo(face + s * 0.2, fy2 - s * 0.2); ctx.lineTo(face + s, fy2); ctx.lineTo(face + s * 0.2, fy2 + s * 0.2);
        ctx.lineTo(face, fy2 + s); ctx.lineTo(face - s * 0.2, fy2 + s * 0.2); ctx.lineTo(face - s, fy2); ctx.lineTo(face - s * 0.2, fy2 - s * 0.2);
        ctx.closePath(); ctx.fill();
      }
    }
    for (let i = 0; i < 3; i++) {                                                     // idle twinkles
      const ph = ((t * 0.02 + i * 0.37) % 1);
      const a = Math.max(0, 1 - Math.abs(ph - 0.5) * 6);
      if (a <= 0) continue;
      const px = x + w * (0.3 + 0.4 * PP.hash(i + 401 + Math.floor(t * 0.02 + i * 0.37))), py = y + h * PP.hash(i + 421 + Math.floor(t * 0.02 + i * 0.37)), s = 1 + 2.4 * a;
      ctx.fillStyle = "rgba(255,255,255," + a + ")";
      ctx.fillRect(px - s, py - 0.4, s * 2, 0.8);
      ctx.fillRect(px - 0.4, py - s, 0.8, s * 2);
    }
    ctx.restore();
    ctx.strokeStyle = "#3d83c4";
    ctx.lineWidth = 1.4;
    PP.roundRect(ctx, x + 0.7, y + 0.7, w - 1.4, h - 1.4, 2.4);
    ctx.stroke();
  },
});
