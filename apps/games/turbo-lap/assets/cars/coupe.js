/* Turbo Lap — car 1: Sports coupe (TLQ1a). A sleek everyday sports car: the original Turbo Lap car, moved here from core/sprites.js
   unchanged, so it is pixel-identical to before and stays the default. Rear view, canvas code, honours o = {steer, braking, nitro,
   detail, accent, plate, t}. */
window.TL = window.TL || {};
(() => {
  const SIZES = TL.sprites.SIZES, shade = TL.sprites.shade, rrect = TL.sprites.rrect;

  function car(ctx, cx, by, w, color, o) {
    o = o || {};
    const h = w * SIZES.car[1] / SIZES.car[0];
    const x = cx - w / 2, lean = (o.steer || 0) * w * 0.05;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, by - h * 0.02, w * 0.56, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    // tyres
    ctx.fillStyle = '#151515';
    rrect(ctx, x + w * 0.02, by - h * 0.32, w * 0.2, h * 0.32, w * 0.03); ctx.fill();
    rrect(ctx, x + w * 0.78, by - h * 0.32, w * 0.2, h * 0.32, w * 0.03); ctx.fill();
    if (w > 40) {                        // tread lines
      ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = Math.max(1, w * 0.008);
      const ph = ((o.t || 0) * 12) % 1;
      for (let k = 0; k < 4; k++) {
        const yy = by - h * 0.3 + ((k + ph) / 4) * h * 0.28;
        ctx.beginPath(); ctx.moveTo(x + w * 0.04, yy); ctx.lineTo(x + w * 0.2, yy);
        ctx.moveTo(x + w * 0.8, yy); ctx.lineTo(x + w * 0.96, yy); ctx.stroke();
      }
    }
    // cabin / glasshouse (leans with steering)
    const ct = by - h * 0.98, cb = by - h * 0.6;
    const cg = ctx.createLinearGradient(0, ct, 0, cb);
    cg.addColorStop(0, shade(color, -0.25)); cg.addColorStop(1, shade(color, -0.05));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, cb); ctx.lineTo(x + w * 0.24 + lean, ct); ctx.lineTo(x + w * 0.76 + lean, ct); ctx.lineTo(x + w * 0.88, cb);
    ctx.closePath(); ctx.fill();
    // rear window
    const wg = ctx.createLinearGradient(0, ct, 0, cb);
    wg.addColorStop(0, '#1b2a44'); wg.addColorStop(0.6, '#3c5c86'); wg.addColorStop(1, '#22344f');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.19, cb - h * 0.03); ctx.lineTo(x + w * 0.28 + lean, ct + h * 0.06);
    ctx.lineTo(x + w * 0.72 + lean, ct + h * 0.06); ctx.lineTo(x + w * 0.81, cb - h * 0.03);
    ctx.closePath(); ctx.fill();
    if (o.detail) {                      // glare
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3 + lean, ct + h * 0.07); ctx.lineTo(x + w * 0.42 + lean, ct + h * 0.07);
      ctx.lineTo(x + w * 0.3, cb - h * 0.04); ctx.lineTo(x + w * 0.22, cb - h * 0.04); ctx.closePath(); ctx.fill();
    }
    // body
    const bt = by - h * 0.64, bb = by - h * 0.14;
    const bg = ctx.createLinearGradient(0, bt, 0, bb);
    bg.addColorStop(0, shade(color, 0.25)); bg.addColorStop(0.45, color); bg.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = bg;
    rrect(ctx, x, bt, w, bb - bt, w * 0.07); ctx.fill();
    // accent stripes
    if (o.accent) {
      ctx.fillStyle = o.accent;
      ctx.fillRect(cx - w * 0.09, bt, w * 0.05, bb - bt - h * 0.1);
      ctx.fillRect(cx + w * 0.04, bt, w * 0.05, bb - bt - h * 0.1);
    }
    // spoiler
    ctx.fillStyle = shade(color, -0.45);
    ctx.fillRect(x + w * 0.2, bt - h * 0.1, w * 0.04, h * 0.1);
    ctx.fillRect(x + w * 0.76, bt - h * 0.1, w * 0.04, h * 0.1);
    ctx.fillStyle = shade(color, -0.2);
    rrect(ctx, x + w * 0.06, bt - h * 0.14, w * 0.88, h * 0.06, w * 0.02); ctx.fill();
    // tail lights
    const tl = o.braking ? '#ff2a2a' : '#a01010';
    if (o.braking && o.detail) { ctx.shadowColor = '#ff2020'; ctx.shadowBlur = w * 0.08; }
    ctx.fillStyle = tl;
    rrect(ctx, x + w * 0.04, bt + h * 0.08, w * 0.24, h * 0.12, w * 0.02); ctx.fill();
    rrect(ctx, x + w * 0.72, bt + h * 0.08, w * 0.24, h * 0.12, w * 0.02); ctx.fill();
    ctx.shadowBlur = 0;
    if (o.detail) {
      ctx.fillStyle = 'rgba(255,200,120,0.8)';
      ctx.fillRect(x + w * 0.06, bt + h * 0.1, w * 0.06, h * 0.04);
      ctx.fillRect(x + w * 0.88, bt + h * 0.1, w * 0.06, h * 0.04);
    }
    // plate
    ctx.fillStyle = '#f4f1de';
    rrect(ctx, cx - w * 0.12, bt + h * 0.22, w * 0.24, h * 0.11, w * 0.01); ctx.fill();
    if (o.detail && w > 80) {
      ctx.fillStyle = '#222'; ctx.font = 'bold ' + Math.round(h * 0.085) + 'px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.plate || 'TURBO', cx, bt + h * 0.277);
    }
    // bumper + diffuser
    ctx.fillStyle = '#1e1e1e';
    rrect(ctx, x + w * 0.03, bb - h * 0.08, w * 0.94, h * 0.1, w * 0.03); ctx.fill();
    // exhausts
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath(); ctx.arc(cx - w * 0.3, bb - h * 0.03, w * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w * 0.3, bb - h * 0.03, w * 0.03, 0, Math.PI * 2); ctx.fill();
    if (o.nitro) {
      const f = 0.7 + Math.random() * 0.6;
      [-0.3, 0.3].forEach(s => {
        const ex = cx + w * s, ey = bb - h * 0.03;
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey + h * 0.25 * f, w * 0.09 * f);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#7fd8ff'); g.addColorStop(0.7, 'rgba(60,120,255,0.6)'); g.addColorStop(1, 'rgba(60,120,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(ex, ey + h * 0.12 * f, w * 0.05, h * 0.18 * f, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.restore();
  }

  TL.carSet.register(TL.makeCar({
    id: 'coupe', name: 'Sports Coupe', short: 'Coupe', blurb: 'Sleek everyday sports car',
    draw: car
  }));
})();
