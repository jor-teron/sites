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

  // Car seen from behind (TLQ1a: the ten models live in assets/cars/). o = {steer, braking, nitro, detail, accent, plate, t, model}
  // The model is o.model (an opponent's) or the car the player picked; the SIZES.car box and the options are the same for all.
  function car(ctx, cx, by, w, color, o) {
    o = o || {};
    const m = (o.model && TL.carSet.byId[o.model]) || TL.carSet.model();
    m.draw(ctx, cx, by, w, color, o);
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
