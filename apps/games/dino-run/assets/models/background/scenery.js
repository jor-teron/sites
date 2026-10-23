/** Scenery — parallax silhouettes between the sky and the ground (dunes, peaks, trees, volcano, kelp...). */
DR.bg.scenery = {
  draw(ctx, e, th) {
    const f = this.styles[th.sceneryStyle];
    if (f) f.call(this, ctx, e, th.pal);
  },
  /** Smooth rolling ridge filled down to the ground. */
  ridge(ctx, e, base, amp, wl, k, color, ph) {
    const off = e.dist * k;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, e.groundY);
    for (let x = 0; x <= e.W + 6; x += 6) ctx.lineTo(x, e.groundY - base - amp * (0.5 + 0.35 * Math.sin((x + off) / wl + (ph || 0)) + 0.15 * Math.sin((x + off) / (wl * 0.37) + 1)));
    ctx.lineTo(e.W, e.groundY); ctx.closePath(); ctx.fill();
  },
  /** Jagged peaks (one random height per step cell). Returns nothing; optional path-only mode for outlines. */
  peaks(ctx, e, base, hMax, step, k, seed, pathOnly) {
    const off = e.dist * k;
    ctx.beginPath(); ctx.moveTo(-step, e.groundY);
    for (let x = -step; x <= e.W + step; x += step) {
      const i = Math.floor((x + off) / step), cx = x - (off % step);
      ctx.lineTo(cx, e.groundY - base - DRX.hash(i * 2 + seed) * hMax * 0.5);
      ctx.lineTo(cx + step / 2, e.groundY - base - hMax * (0.35 + 0.65 * DRX.hash(i * 2 + 1 + seed)));
    }
    ctx.lineTo(e.W + step * 2, e.groundY); ctx.closePath();
  },
  styles: {
    dunes(ctx, e, P) {
      this.ridge(ctx, e, 6, 34, 140, 0.03, P.far, 0.5);
      this.ridge(ctx, e, 2, 20, 90, 0.07, P.mid, 2);
    },
    mountains(ctx, e, P) {
      ctx.fillStyle = P.far; this.peaks(ctx, e, 0, 70, 90, 0.03, 3); ctx.fill();
      ctx.fillStyle = P.mid; this.peaks(ctx, e, 0, 38, 60, 0.07, 41); ctx.fill();
    },
    icepeaks(ctx, e, P) {
      ctx.fillStyle = P.far; this.peaks(ctx, e, 0, 96, 110, 0.03, 5); ctx.fill();
      ctx.save(); ctx.clip();                                    // snow caps: bright wedge across the top of each peak
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
      const off = e.dist * 0.03, step = 110;
      for (let x = -step; x <= e.W + step; x += step) {
        const i = Math.floor((x + off) / step), cx = x - (off % step), h = 96 * (0.35 + 0.65 * DRX.hash(i * 2 + 1 + 5)), px = cx + step / 2, py = e.groundY - h;
        ctx.moveTo(px - 22, py + 26); ctx.lineTo(px - 8, py + 14); ctx.lineTo(px, py + 22); ctx.lineTo(px + 9, py + 12); ctx.lineTo(px + 24, py + 28); ctx.lineTo(px, py - 6); ctx.closePath();
      }
      ctx.fill(); ctx.restore();
      ctx.fillStyle = P.mid; this.peaks(ctx, e, 0, 44, 70, 0.07, 55); ctx.fill();
    },
    mesas(ctx, e, P) {                                           // Mars: flat-topped dusty buttes
      const off = e.dist * 0.035;
      ctx.fillStyle = P.far;
      for (let i = -1; i < 8; i++) {
        const cell = 200, idx = Math.floor((off + i * cell) / cell), x = i * cell - (off % cell) + DRX.hash(idx) * 60;
        const w = 80 + DRX.hash(idx + 7) * 70, h = 30 + DRX.hash(idx + 3) * 50;
        ctx.beginPath(); ctx.moveTo(x, e.groundY); ctx.lineTo(x + 10, e.groundY - h); ctx.lineTo(x + w - 10, e.groundY - h); ctx.lineTo(x + w, e.groundY); ctx.fill();
      }
      this.ridge(ctx, e, 0, 22, 110, 0.07, P.mid, 1);
    },
    jungle(ctx, e, P) {
      this.ridge(ctx, e, 4, 46, 120, 0.03, P.far, 1);
      const off = e.dist * 0.07, cell = 120;                      // mid-layer trees
      for (let x = -cell; x < e.W + cell; x += cell) {
        const idx = Math.floor((x + off) / cell), tx = x - (off % cell) + DRX.hash(idx) * 40, h = 55 + DRX.hash(idx + 5) * 40;
        ctx.fillStyle = P.near; ctx.fillRect(tx - 3, e.groundY - h, 6, h);
        ctx.fillStyle = P.mid;
        ctx.beginPath(); ctx.arc(tx, e.groundY - h, 20, 0, DRX.PI2); ctx.arc(tx - 18, e.groundY - h + 8, 14, 0, DRX.PI2); ctx.arc(tx + 17, e.groundY - h + 9, 15, 0, DRX.PI2); ctx.fill();
      }
      ctx.strokeStyle = P.vine; ctx.lineWidth = 2;                // hanging vines
      const vo = e.dist * 0.2, vc = 90;
      for (let x = -vc; x < e.W + vc; x += vc) {
        const idx = Math.floor((x + vo) / vc), vx = x - (vo % vc) + DRX.hash(idx + 31) * 50, len = 30 + DRX.hash(idx + 41) * 80;
        ctx.beginPath(); ctx.moveTo(vx, 0);
        for (let y = 0; y <= len; y += 6) ctx.lineTo(vx + Math.sin(y * 0.1 + e.clock * 1.2 + idx) * 3, y);
        ctx.stroke();
        ctx.fillStyle = P.vine; for (let y = 14; y < len; y += 18) { DRX.ell(ctx, vx + 4 + Math.sin(y * 0.1 + e.clock * 1.2 + idx) * 3, y, 4, 2, 0.5); ctx.fill(); }
      }
    },
    volcano(ctx, e, P) {
      ctx.fillStyle = P.far; this.peaks(ctx, e, 0, 50, 100, 0.03, 9); ctx.fill();
      const per = e.W * 1.7, off = e.dist * 0.05;
      const vx = (((e.W * 0.35 - off) % per) + per) % per - e.W * 0.35, top = e.groundY - 130, hw = 150;
      const draw = (x) => {
        ctx.fillStyle = P.mid;
        ctx.beginPath(); ctx.moveTo(x - hw, e.groundY); ctx.lineTo(x - 26, top); ctx.lineTo(x + 26, top); ctx.lineTo(x + hw, e.groundY); ctx.closePath(); ctx.fill();
        const g = ctx.createRadialGradient(x, top, 2, x, top, 40); g.addColorStop(0, 'rgba(253,224,71,0.9)'); g.addColorStop(0.4, 'rgba(249,115,22,0.55)'); g.addColorStop(1, 'rgba(249,115,22,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 40, top - 40, 80, 80);
        ctx.fillStyle = '#fb923c'; DRX.ell(ctx, x, top, 26, 5); ctx.fill();
        ctx.strokeStyle = 'rgba(251,146,60,0.8)'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x - 8, top + 3); ctx.lineTo(x - 22, top + 40); ctx.lineTo(x - 18, top + 70); ctx.lineTo(x - 40, e.groundY - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 10, top + 3); ctx.lineTo(x + 20, top + 36); ctx.lineTo(x + 42, top + 80); ctx.stroke();
        ctx.fillStyle = 'rgba(40,24,28,0.5)';
        for (let i = 0; i < 4; i++) { const t = (e.clock * 0.25 + i / 4) % 1; ctx.beginPath(); ctx.arc(x + Math.sin(t * 5 + i) * 12 + t * 30, top - t * 90, 10 + t * 24, 0, DRX.PI2); ctx.globalAlpha = 0.55 * (1 - t); ctx.fill(); }
        ctx.globalAlpha = 1;
      };
      draw(vx); draw(vx + per);
      this.ridge(ctx, e, 0, 20, 100, 0.08, P.near, 3);
    },
    kelp(ctx, e, P) {
      this.ridge(ctx, e, 2, 40, 150, 0.03, P.far, 2);
      const off = e.dist * 0.08, cell = 70;
      for (let x = -cell; x < e.W + cell; x += cell) {
        const idx = Math.floor((x + off) / cell), kx = x - (off % cell) + DRX.hash(idx) * 40, h = 50 + DRX.hash(idx + 3) * 70;
        ctx.strokeStyle = idx % 2 ? P.mid : P.near; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(kx, e.groundY);
        for (let y = 0; y <= h; y += 6) ctx.lineTo(kx + Math.sin(y * 0.08 + e.clock * 1.5 + idx) * (3 + y * 0.08), e.groundY - y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    },
    hills(ctx, e, P) {                                           // candy: round gumdrop hills
      const lay = (k, rad, col, seed) => {
        const off = e.dist * k, cell = rad * 2.1;
        ctx.fillStyle = col;
        for (let x = -cell; x < e.W + cell; x += cell) {
          const idx = Math.floor((x + off) / cell), cx = x - (off % cell) + rad, r = rad * (0.7 + 0.5 * DRX.hash(idx + seed));
          ctx.beginPath(); ctx.arc(cx, e.groundY, r, Math.PI, 0); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx - r * 0.3, e.groundY - r * 0.55, 2.5, 0, DRX.PI2); ctx.arc(cx + r * 0.2, e.groundY - r * 0.4, 2.5, 0, DRX.PI2); ctx.fill(); ctx.fillStyle = col;
        }
      };
      lay(0.03, 70, P.far, 2); lay(0.07, 44, P.mid, 8);
    },
    wire(ctx, e, P) {                                            // neon wireframe mountains
      ctx.save();
      ctx.fillStyle = P.skyBottom; ctx.strokeStyle = P.gA; ctx.lineWidth = 1.6; ctx.shadowColor = P.gA; ctx.shadowBlur = 8; ctx.lineJoin = 'round';
      this.peaks(ctx, e, 0, 70, 100, 0.03, 13); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = P.gB; ctx.shadowColor = P.gB; this.peaks(ctx, e, 0, 36, 64, 0.07, 27); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
  },
};
