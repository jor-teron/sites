/* Turbo Lap — everything drawn in code: cars from behind, roadside scenery, start gantry.
   All draw functions take a centre-x, a bottom-y and a pixel width; heights follow from SIZES. */
window.TL = window.TL || {};
(() => {
  // world sizes (width, height) in road units; road half-width = 2000
  const SIZES = {
    car: [500, 312], tree: [900, 1500], bush: [600, 380], lamp: [120, 1800],
    signL: [300, 420], signR: [300, 420]
  };

  function shade(hex, f) {               // f<0 darker, f>0 lighter
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Car seen from behind. o = {steer, braking, nitro, detail, accent, plate, t}
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

  function tree(ctx, cx, by, w) {
    const h = w * SIZES.tree[1] / SIZES.tree[0];
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(cx - w * 0.06, by - h * 0.35, w * 0.12, h * 0.35);
    const layers = [[0.5, 0.42, '#1f6b2a'], [0.66, 0.36, '#2a8236'], [0.8, 0.28, '#35993f'], [0.92, 0.16, '#45ad4c']];
    layers.forEach(([y, r, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(cx, by - h * Math.min(1, y + 0.12));
      ctx.lineTo(cx + w * r * 1.1, by - h * (y - 0.25)); ctx.lineTo(cx - w * r * 1.1, by - h * (y - 0.25)); ctx.closePath(); ctx.fill();
    });
  }

  function bush(ctx, cx, by, w) {
    const h = w * SIZES.bush[1] / SIZES.bush[0];
    [[-0.25, 0.55, 0.3, '#2c7a2e'], [0.22, 0.5, 0.3, '#2f8a33'], [0, 0.7, 0.36, '#3b9c3c']].forEach(([dx, y, r, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.ellipse(cx + dx * w, by - h * y * 0.6, w * r, h * y * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    });
  }

  function lamp(ctx, cx, by, w, side) {       // side: which way the arm points (toward the road)
    const h = w * SIZES.lamp[1] / SIZES.lamp[0];
    ctx.fillStyle = '#5a5f66';
    ctx.fillRect(cx - w * 0.25, by - h, w * 0.5, h);
    ctx.fillRect(cx - w * 0.6, by - h * 0.06, w * 1.2, h * 0.06);
    const arm = w * 4 * side;
    ctx.strokeStyle = '#5a5f66'; ctx.lineWidth = Math.max(1, w * 0.35);
    ctx.beginPath(); ctx.moveTo(cx, by - h); ctx.quadraticCurveTo(cx + arm * 0.5, by - h * 1.04, cx + arm, by - h * 0.99); ctx.stroke();
    ctx.fillStyle = '#ffe9a0';
    ctx.fillRect(cx + arm - w * 0.8 * side - (side < 0 ? 0 : 0), by - h * 0.985, w * 1.2 * side, h * 0.025);
  }

  function sign(ctx, cx, by, w, dir) {         // chevron curve warning; dir -1 left, 1 right
    const h = w * SIZES.signL[1] / SIZES.signL[0];
    ctx.fillStyle = '#444';
    ctx.fillRect(cx - w * 0.05, by - h * 0.55, w * 0.1, h * 0.55);
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(cx - w / 2, by - h, w, h * 0.5);
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, w * 0.04);
    ctx.strokeRect(cx - w / 2, by - h, w, h * 0.5);
    ctx.fillStyle = '#111';
    for (let k = 0; k < 2; k++) {
      const ox = cx + (k - 0.5) * w * 0.38;
      ctx.beginPath();
      ctx.moveTo(ox - dir * w * 0.12, by - h * 0.92); ctx.lineTo(ox + dir * w * 0.12, by - h * 0.75);
      ctx.lineTo(ox - dir * w * 0.12, by - h * 0.58); ctx.lineTo(ox - dir * w * 0.02, by - h * 0.58);
      ctx.lineTo(ox + dir * w * 0.2, by - h * 0.75); ctx.lineTo(ox - dir * w * 0.02, by - h * 0.92); ctx.closePath(); ctx.fill();
    }
  }

  // Start / finish gantry spanning the road. x = road centre, rw = road half-width in px.
  function banner(ctx, x, by, rw) {
    const postX = rw * 1.12, top = by - rw * 0.62, bh = rw * 0.13;
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(x - postX - rw * 0.03, top, rw * 0.06, by - top);
    ctx.fillRect(x + postX - rw * 0.03, top, rw * 0.06, by - top);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - postX, top, postX * 2, bh);
    const cells = 24, cw = postX * 2 / cells;
    for (let i = 0; i < cells; i++) {
      for (let r = 0; r < 2; r++) {
        if ((i + r) % 2) continue;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - postX + i * cw, top + r * bh / 2, cw, bh / 2);
      }
    }
    if (rw > 60) {
      ctx.fillStyle = '#d01c8b';
      const tw = rw * 0.9;
      ctx.fillRect(x - tw / 2, top - bh * 0.05, tw, bh * 1.1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(bh * 0.7) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TURBO LAP', x, top + bh * 0.52);
    }
  }

  TL.sprites = { SIZES, shade, rrect, car, tree, bush, lamp, sign, banner };
})();
