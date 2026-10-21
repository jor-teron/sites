/* Turbo Lap — pseudo-3D renderer: sky, parallax background, road segments, sprites and cars. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road, SP = TL.sprites;
  const R = TL.render = { skyOffset: 0, hillOffset: 0, treeOffset: 0 };

  // Called by the game each frame with the curve under the player and distance travelled.
  R.scroll = (curve, dz) => {
    const k = dz / CFG.segmentLength;
    R.skyOffset = (R.skyOffset + 0.0006 * curve * k) % 1;
    R.hillOffset = (R.hillOffset + 0.0012 * curve * k) % 1;
    R.treeOffset = (R.treeOffset + 0.002 * curve * k) % 1;
  };

  function ridge(u, seed, rough) {           // smooth periodic height 0..1
    return 0.5 + 0.25 * Math.sin((u * 3 + seed) * Math.PI * 2) + 0.15 * Math.sin((u * 7 + seed * 2) * Math.PI * 2)
      + rough * 0.1 * Math.sin((u * 17 + seed * 3) * Math.PI * 2);
  }

  function layer(ctx, W, H, baseY, amp, offset, seed, rough, color, snow) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    const step = Math.max(4, W / 160), pts = [];
    for (let px = 0; px <= W + step; px += step) {
      const y = baseY - amp * ridge(px / W / 2 + offset, seed, rough);
      pts.push([px, y]); ctx.lineTo(px, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      let inside = false;
      for (const [px, y] of pts) {
        const peak = baseY - amp * 0.78;
        if (y < peak) { if (!inside) { ctx.moveTo(px, peak); inside = true; } ctx.lineTo(px, y); }
        else if (inside) { ctx.lineTo(px, peak); ctx.closePath(); inside = false; }
      }
      ctx.fill();
    }
  }

  function background(ctx, W, H, playerY) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, CFG.colors.skyTop); g.addColorStop(1, CFG.colors.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = 'rgba(255,250,220,0.9)';
    const sx = U.mod(0.75 - R.skyOffset * 2, 2) / 2 * W * 2 - W * 0.25;
    ctx.beginPath(); ctx.arc(sx, H * 0.14, Math.min(W, H) * 0.05, 0, Math.PI * 2); ctx.fill();
    const lift = U.clamp(playerY / 8000, -1, 1.5) * H * 0.06;
    const horizon = H * 0.5 + lift;
    layer(ctx, W, H, horizon + 2, H * 0.22, R.skyOffset, 0.1, 1, CFG.colors.mountainsFar, true);
    layer(ctx, W, H, horizon + 2, H * 0.12, R.hillOffset, 0.37, 0.5, CFG.colors.mountainsNear, false);
    layer(ctx, W, H, horizon + 2, H * 0.05, R.treeOffset, 0.71, 2, CFG.colors.hills, false);
  }

  function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }

  function segment(ctx, W, seg, fog) {
    const a = seg.p1.screen, b = seg.p2.screen, c = seg.color;
    const x1 = a.x, y1 = a.y, w1 = a.w, x2 = b.x, y2 = b.y, w2 = b.w;
    const r1 = w1 / Math.max(6, 2 * CFG.lanes), r2 = w2 / Math.max(6, 2 * CFG.lanes);
    ctx.fillStyle = c.grass; ctx.fillRect(0, y2, W, y1 - y2);
    poly(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, c.rumble);
    poly(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, c.rumble);
    poly(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, c.road);
    if (seg.color === CFG.colors.start) {               // checkered line
      const cells = 16;
      for (let i = 0; i < cells; i++) {
        if ((i + seg.index) % 2) continue;
        const t1 = i / cells, t2 = (i + 1) / cells;
        poly(ctx, x1 - w1 + 2 * w1 * t1, y1, x1 - w1 + 2 * w1 * t2, y1, x2 - w2 + 2 * w2 * t2, y2, x2 - w2 + 2 * w2 * t1, y2, '#111');
      }
    }
    if (c.lane) {
      const l1 = w1 / 40, l2 = w2 / 40;
      const lw1 = w1 * 2 / CFG.lanes, lw2 = w2 * 2 / CFG.lanes;
      for (let k = 1; k < CFG.lanes; k++) {
        const lx1 = x1 - w1 + lw1 * k, lx2 = x2 - w2 + lw2 * k;
        poly(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, c.lane);
      }
    }
    if (fog < 1) {
      ctx.globalAlpha = 1 - fog; ctx.fillStyle = CFG.colors.fog;
      ctx.fillRect(0, y2, W, y1 - y2 + 1); ctx.globalAlpha = 1;
    }
  }

  function clipped(ctx, W, clipY, by, fn) {
    if (clipY < by) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, clipY); ctx.clip(); fn(); ctx.restore(); }
    else fn();
  }

  // view = { camZ: player progress, player, racers: AI list, t }
  R.frame = function (ctx, W, H, view) {
    const segs = road.segments, N = road.length, L = road.trackLength, segL = CFG.segmentLength;
    const pl = view.player;
    const position = U.mod(pl.p - road.playerZ, L);          // camera z
    const base = road.findSegment(position);
    const basePct = U.percentRemaining(position, segL);
    const plSeg = road.findSegment(position + road.playerZ);
    const plPct = U.percentRemaining(position + road.playerZ, segL);
    const playerY = U.lerp(plSeg.p1.world.y, plSeg.p2.world.y, plPct);
    const camX = pl.x * CFG.roadWidth;

    background(ctx, W, H, playerY);

    // bucket AI cars by segment
    const buckets = {};
    for (const c of view.racers) {
      if (c.isPlayer) continue;
      const z = U.mod(c.p, L), i = Math.floor(z / segL) % N;
      (buckets[i] = buckets[i] || []).push({ car: c, pct: (z % segL) / segL });
    }

    let maxy = H, x = 0, dx = -(base.curve * basePct);
    const dd = CFG.drawDistance;
    for (let n = 0; n < dd; n++) {
      const seg = segs[(base.index + n) % N];
      seg.looped = seg.index < base.index;
      seg.fog = 1 / Math.pow(Math.E, (n / dd) * (n / dd) * CFG.fogDensity);
      seg.clip = maxy;
      const cz = position - (seg.looped ? L : 0);
      road.project(seg.p1, camX - x, playerY + CFG.cameraHeight, cz, W, H);
      road.project(seg.p2, camX - x - dx, playerY + CFG.cameraHeight, cz, W, H);
      x += dx; dx += seg.curve;
      if (seg.p1.camera.z <= road.cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      segment(ctx, W, seg, seg.fog);
      maxy = seg.p1.screen.y;
    }

    const scaleW = W / 2;
    for (let n = dd - 1; n > 0; n--) {
      const seg = segs[(base.index + n) % N];
      const s1 = seg.p1.screen;
      if (!(seg.p1.camera.z > road.cameraDepth)) continue;
      // roadside sprites
      for (const sp of seg.sprites) {
        if (sp.type === 'banner') {
          if (s1.w > 2) clipped(ctx, W, seg.clip, s1.y, () => SP.banner(ctx, s1.x, s1.y, s1.w));
          continue;
        }
        const size = SP.SIZES[sp.type];
        const w = s1.scale * size[0] * scaleW;
        if (w < 1.5 || w > W * 3) continue;
        const sx = s1.x + s1.scale * sp.offset * CFG.roadWidth * scaleW;
        if (sx < -w || sx > W + w) continue;
        clipped(ctx, W, seg.clip, s1.y, () => {
          if (sp.type === 'tree') SP.tree(ctx, sx, s1.y, w);
          else if (sp.type === 'bush') SP.bush(ctx, sx, s1.y, w);
          else if (sp.type === 'lamp') SP.lamp(ctx, sx, s1.y, w, -Math.sign(sp.offset));
          else SP.sign(ctx, sx, s1.y, w, sp.type === 'signR' ? 1 : -1);
        });
      }
      // AI cars
      const list = buckets[seg.index];
      if (list) {
        list.sort((a, b) => b.pct - a.pct);
        for (const { car, pct } of list) {
          const sc = U.lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
          const cx = U.lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + sc * car.x * CFG.roadWidth * scaleW;
          const cy = U.lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
          const w = sc * SP.SIZES.car[0] * scaleW;
          if (w < 1.5 || !(sc > 0)) continue;
          const shake = car.bumped ? (Math.random() - 0.5) * w * 0.04 : 0;
          clipped(ctx, W, seg.clip, cy, () => SP.car(ctx, cx + shake, cy, w, car.color,
            { steer: car.steerVis || 0, braking: car.braking, detail: w > 60, plate: car.name, t: view.t }));
        }
      }
      // player
      if (seg === plSeg) {
        const sc = road.cameraDepth / road.playerZ;
        const camY = U.lerp(plSeg.p1.camera.y, plSeg.p2.camera.y, plPct);
        const by = H / 2 - sc * camY * H / 2;
        const w = SP.SIZES.car[0] * sc * scaleW;
        const sp = pl.speed / CFG.maxSpeed;
        const bounce = (Math.abs(pl.x) > 1 ? 2.5 : 0.8) * sp * Math.sin(view.t * 40) * w * 0.01;
        const shake = (pl.bumped || pl.hitFlash) ? (Math.random() - 0.5) * w * 0.03 : 0;
        SP.car(ctx, W / 2 + shake, by + bounce, w, CFG.playerColor,
          { steer: pl.steer * Math.min(1, sp * 2), braking: pl.braking, nitro: pl.nitroOn, detail: true,
            accent: CFG.playerAccent, plate: 'TURBO', t: view.t });
        R.playerScreen = { x: W / 2, y: by, w };
      }
    }
  };
})();
