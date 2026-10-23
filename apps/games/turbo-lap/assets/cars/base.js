/* Turbo Lap — car art toolkit (TLQ1a). Every car is a rear view drawn in canvas code (no images, sharp at any size) inside the same
   box the original car used: width w, height w * SIZES.car[1] / SIZES.car[0], centred on cx, standing on by. Plain script, loaded
   after core/sprites.js and before the car files (assets/cars/*.js), which call TL.carSet.register(TL.makeCar({...})).

   Spec:  id, name, short (button label), blurb,
          draw(ctx, cx, by, w, color, o)   o = {steer, braking, nitro, detail, accent, plate, t, model}
   Contract every model keeps from the first car:
     - the body paint is `color`; `o.accent` (when given) is the livery colour
     - o.steer (-1..1) leans the cabin / roof / wing the way the car steers
     - o.braking lights the tail lights red (with a glow when o.detail), otherwise they glow dim
     - o.nitro draws the exhaust flames, using exactly ONE Math.random() per car like before (so seeded runs line up)
     - o.detail turns on glints, tread lines and the plate text (small far-away cars skip them); o.t scrolls the tread
   Models read nothing from the game and never change speed, handling or collision size: only the look. */
window.TL = window.TL || {};
(() => {
  const SP = TL.sprites, SZ = SP.SIZES.car, TAU = Math.PI * 2, shade = SP.shade, rrect = SP.rrect;
  const A = TL.carArt = { TAU, shade, rrect };

  /** Geometry for one car: X(f) / Y(f) turn box fractions (fx across from the left, fy up from the ground) into pixels. */
  A.kit = (c, cx, by, w, o) => {
    const h = w * SZ[1] / SZ[0], x = cx - w / 2;
    return { c, cx, by, w, h, x, o, lean: (o.steer || 0) * w * 0.05, X: f => x + w * f, Y: f => by - h * f };
  };
  A.shadow = (K, rx) => { const c = K.c; c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(K.cx, K.by - K.h * 0.02, K.w * (rx || 0.56), K.h * 0.08, 0, 0, TAU); c.fill(); };
  /** Rounded rectangle from box fractions: left fx0, top fy, width fw, height fh (fractions of w and h), corner radius rf of w. */
  A.rr = (K, fx, fy, fw, fh, rf) => rrect(K.c, K.X(fx), K.Y(fy), K.w * fw, K.h * fh, K.w * (rf == null ? 0.02 : rf));
  /** Closed polygon from [fx, fy] pairs, filled with `fill`. */
  A.poly = (K, pts, fill) => {
    const c = K.c; c.fillStyle = fill; c.beginPath();
    pts.forEach((p, i) => i ? c.lineTo(K.X(p[0]), K.Y(p[1])) : c.moveTo(K.X(p[0]), K.Y(p[1])));
    c.closePath(); c.fill();
  };
  /** Vertical gradient between two heights; stops: [offset, colour] pairs. */
  A.vgrad = (K, fyTop, fyBot, stops) => {
    const g = K.c.createLinearGradient(0, K.Y(fyTop), 0, K.Y(fyBot));
    stops.forEach(s => g.addColorStop(s[0], s[1])); return g;
  };
  /** Body paint gradient (light top, paint, dark underside). */
  A.paint = (K, color, fyTop, fyBot) => A.vgrad(K, fyTop, fyBot, [[0, shade(color, 0.25)], [0.45, color], [1, shade(color, -0.35)]]);
  /** Glass gradient (the original rear window). */
  A.glass = (K, fyTop, fyBot) => A.vgrad(K, fyTop, fyBot, [[0, '#1b2a44'], [0.6, '#3c5c86'], [1, '#22344f']]);

  /** A tyre block fx0..fx1, fy0 (top) .. fy1 (bottom, default 0): dark rubber and, when the car is big enough, scrolling tread lines. */
  A.tyre = (K, fx0, fx1, fyTop, fyBot, rf, knobby) => {
    const c = K.c, o = K.o, w = K.w, h = K.h, b = fyBot || 0;
    c.fillStyle = '#151515';
    rrect(c, K.X(fx0), K.Y(fyTop), w * (fx1 - fx0), h * (fyTop - b), w * (rf == null ? 0.03 : rf)); c.fill();
    if (w > 40) {
      c.strokeStyle = knobby ? '#3a3a3a' : '#2c2c2c'; c.lineWidth = Math.max(1, w * (knobby ? 0.014 : 0.008));
      const ph = ((o.t || 0) * 12) % 1, n = knobby ? 5 : 4, top = fyTop - 0.02, span = (fyTop - b) - 0.04;
      c.beginPath();
      for (let k = 0; k < n; k++) {
        const yy = K.Y(top - ((k + ph) / n) * span);
        c.moveTo(K.X(fx0 + 0.02), yy); c.lineTo(K.X(fx1 - 0.02), yy);
      }
      c.stroke();
    }
  };

  /** Tail light colour: bright when braking, dim otherwise (the original pair). Call glowOn()/glowOff() around a group of lights. */
  A.tailColor = K => K.o.braking ? '#ff2a2a' : '#a01010';
  A.glowOn = (K, col) => { if (K.o.braking && K.o.detail) { K.c.shadowColor = col || '#ff2020'; K.c.shadowBlur = K.w * 0.08; } };
  A.glowOff = K => { K.c.shadowBlur = 0; };
  /** Round lamp at (fx, fy) with radius rf (fraction of w). */
  A.lamp = (K, fx, fy, rf, fill) => { const c = K.c; c.fillStyle = fill; c.beginPath(); c.arc(K.X(fx), K.Y(fy), K.w * rf, 0, TAU); c.fill(); };

  /** Number plate (cream, with the plate text at detail) at fx0, top fy, size fw x fh; the text height is a fraction of the plate. */
  A.plate = (K, fx, fy, fw, fh, text) => {
    const c = K.c, o = K.o;
    c.fillStyle = '#f4f1de'; A.rr(K, fx, fy, fw, fh, 0.01); c.fill();
    if (o.detail && K.w > 80) {
      c.fillStyle = '#222'; c.font = 'bold ' + Math.round(K.h * fh * 0.78) + 'px monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text || o.plate || 'TURBO', K.X(fx + fw / 2), K.Y(fy - fh * 0.52));
    }
  };
  /** Exhaust pipes: round tips at [fx, fy] with radius rf. */
  A.pipes = (K, pts, rf, fill) => { pts.forEach(p => A.lamp(K, p[0], p[1], rf, fill || '#8a8a8a')); };

  /** Nitro flames out of the pipes at [fx, fy]: the original radial flame; exactly one Math.random per car. size scales the flame. */
  A.flames = (K, pts, size) => {
    if (!K.o.nitro) return;
    const c = K.c, w = K.w, h = K.h, f = 0.7 + Math.random() * 0.6, s = size || 1;
    pts.forEach(p => {
      const ex = K.X(p[0]), ey = K.Y(p[1]);
      const g = c.createRadialGradient(ex, ey, 0, ex, ey + h * 0.25 * f * s, w * 0.09 * f * s);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#7fd8ff'); g.addColorStop(0.7, 'rgba(60,120,255,0.6)'); g.addColorStop(1, 'rgba(60,120,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(ex, ey + h * 0.12 * f * s, w * 0.05 * s, h * 0.18 * f * s, 0, 0, TAU); c.fill();
    });
  };

  /** Soft glow dot (light bar ends, thrusters): cheap radial gradient. */
  A.glow = (K, fx, fy, rf, rgb, a) => {
    const c = K.c, x = K.X(fx), y = K.Y(fy), r = K.w * rf, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  };

  /**
   * Build a car model from a spec; the registry sorts models by CFG.cars.order. The wrapper keeps the canvas state clean
   * (save / restore) and falls back to a plain colour and an empty options object like the original did.
   */
  TL.makeCar = spec => {
    const m = Object.assign({}, spec), draw = spec.draw;
    m.draw = (c, cx, by, w, color, o) => { c.save(); draw(c, cx, by, w, color, o || {}); c.restore(); };
    m.short = m.short || m.name;
    return m;
  };

  /** A small rear-view portrait of a model (for the picker): a dusk-grey road and wall, the car centred, in a colour + accent. */
  TL.drawCarPreview = (c, model, W, H, color, accent) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#39466f'); g.addColorStop(0.62, '#7e8db8'); g.addColorStop(0.62, '#4e5260'); g.addColorStop(1, '#2f323d');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, W * 0.012);
    c.setLineDash([W * 0.05, W * 0.05]); c.beginPath(); c.moveTo(W / 2, H * 0.64); c.lineTo(W / 2, H * 0.7); c.stroke(); c.setLineDash([]);
    const w = W * 0.7;
    model.draw(c, W / 2, H * 0.93, w, color, { detail: true, accent, plate: 'TURBO', t: 0, preview: true });
  };
})();
