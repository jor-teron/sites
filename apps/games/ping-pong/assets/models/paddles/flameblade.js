/*
 * Kept for later: hidden in PPQ1a, will return when paddles grow to 10 items.
 * Hidden by `hidden: true` below: ui/picker.js lists only models without it (PP.visiblePaddles), and a saved
 * "flame" is migrated to "hockeystick" (CFG.paddles.migrate, applied in PP.setPaddle). The file still loads and still works.
 *
 * Ping Pong — Flame Blade: a burning bar. A dark-red to white-hot gradient body with flickering light lobes inside it, small
 * flame tips licking over both ends and an orange glow; embers rise off it all the time (its own `emit`), and a hit makes it
 * flare (a hot spot at the contact point, a bigger glow, ~16 frames) with a burst of sparks off the face. The flicker is
 * driven by the frame clock (fx.t), not by any random generator; the body stays inside the hit box.
 */
PP.registerPaddle({
  id: "flame",
  hidden: true,         // PPQ1a: not in the picker (see the note at the top)
  name: "Flame Blade",
  emit: { every: 3, kind: "spark", colors: ["#ffd36a", "#ff8a1f", "#ff4a10"], size: 1.9, life: 34, speed: 0.5, rise: 0.8, glow: true },
  hit: { kind: "spark", count: 8, colors: ["#fff1a8", "#ffb040", "#ff5a1a"], speed: 4.4, life: 22, size: 2.8, glow: true },
  draw(ctx, x, y, w, h, col, st) {
    const t = st.fx ? st.fx.t : 0, p = PP.pulse(st.age, 16), r = 3;
    ctx.save();
    PP.glow(ctx, "#ff7a1a", 11 + 12 * p + 2 * Math.sin(t * 0.5));
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#8a1500"); g.addColorStop(0.3, "#f0501a"); g.addColorStop(0.5, p > 0.2 ? "#ffffff" : "#ffe27a"); g.addColorStop(0.7, "#f0501a"); g.addColorStop(1, "#8a1500");
    PP.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    PP.roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    const n = Math.max(6, Math.round(h / 9));
    for (let i = 0; i < n; i++) {                                                     // flickering light lobes along the bar
      const ph = t * 0.35 + i * 1.7, ly = y + (i + 0.5) / n * h;
      ctx.fillStyle = "rgba(255,226,120," + (0.35 + 0.25 * Math.sin(ph * 1.3)) + ")";
      ctx.beginPath();
      ctx.ellipse(x + w / 2 + Math.sin(ph) * w * 0.2, ly, w * 0.28, h / n * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p > 0) {                                                                      // hit flare at the contact point
      const fy = y + st.y * h, gg = ctx.createRadialGradient(x + w / 2, fy, 0, x + w / 2, fy, h * 0.3);
      gg.addColorStop(0, "rgba(255,255,230," + p + ")"); gg.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = "#5a0d00";                                                      // dark rim: reads on a light court
    ctx.lineWidth = 1;
    PP.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r - 0.5);
    ctx.stroke();
    ctx.save();                                                                       // flame tips over both ends (visual only, beyond the box)
    ctx.fillStyle = "rgba(255,170,50,0.85)";
    for (let e = 0; e < 2; e++) {
      const base = e ? y + h - 1 : y + 1, dir = e ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const hh = (5 + 4 * p) * (0.7 + 0.3 * Math.sin(t * 0.6 + e * 2 + k * 2.4)), cx = x + w * (0.3 + 0.4 * k) + Math.sin(t * 0.4 + k) * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.22, base);
        ctx.quadraticCurveTo(cx, base + dir * hh * 0.4, cx + Math.sin(t * 0.5 + k) * 1.2, base + dir * hh);
        ctx.quadraticCurveTo(cx + w * 0.02, base + dir * hh * 0.4, cx + w * 0.22, base);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  },
});
