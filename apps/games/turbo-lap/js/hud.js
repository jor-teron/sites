/* Turbo Lap — heads-up display drawn on the canvas: position, lap, times, speed, nitro, minimap,
   countdown and the FPS counter (top-right). Everything scales with the window. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road;
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  function panel(ctx, x, y, w, h, s) {
    ctx.fillStyle = 'rgba(10,14,30,0.55)';
    TL.sprites.rrect(ctx, x, y, w, h, 10 * s); ctx.fill();
  }
  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(str, x + size * 0.06, y + size * 0.06);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function minimap(ctx, x, y, size, G) {
    const pts = road.map, N = pts.length, pad = size * 0.1, inner = size - pad * 2;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= N; i += 4) { const p = pts[i % N]; const px = x + pad + p.x * inner, py = y + pad + p.y * inner; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(2, size * 0.035); ctx.stroke();
    ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, size * 0.015); ctx.stroke();
    const s0 = pts[0];
    ctx.fillStyle = '#fff'; ctx.fillRect(x + pad + s0.x * inner - size * 0.03, y + pad + s0.y * inner - size * 0.03, size * 0.06, size * 0.06);
    const L = road.trackLength, segL = CFG.segmentLength;
    const dot = (r, rad) => {
      const p = pts[Math.floor(U.mod(r.p, L) / segL) % N];
      ctx.beginPath(); ctx.arc(x + pad + p.x * inner, y + pad + p.y * inner, rad, 0, Math.PI * 2);
      ctx.fillStyle = r.isPlayer ? CFG.playerAccent : r.color; ctx.fill();
      ctx.strokeStyle = r.isPlayer ? '#fff' : '#111'; ctx.lineWidth = Math.max(1, rad * 0.4); ctx.stroke();
    };
    G.ais.forEach(r => dot(r, size * 0.035));
    dot(G.player, size * 0.05);
    ctx.restore();
  }

  TL.hud = {
    draw(ctx, W, H, G) {
      const s = U.clamp(Math.min(W / 1000, H / 560), 0.5, 1.8);
      const m = 14 * s;
      // FPS counter, always on
      text(ctx, TL.view.shownFps + ' FPS', W - m, m + 14 * s, 14 * s, '#d8ffd8', 'right');
      if (G.state === 'title') return;
      const pl = G.player;

      // left panel: position / lap / times
      const pw = 210 * s, ph = 150 * s;
      panel(ctx, m, m, pw, ph, s);
      text(ctx, 'POS', m + 12 * s, m + 24 * s, 14 * s, '#9fb4ff');
      text(ctx, String(pl.finished ? pl.finalPos : pl.pos), m + 12 * s, m + 70 * s, 50 * s, '#fff');
      ctx.font = 'bold ' + Math.round(50 * s) + 'px ' + FONT;
      const pwid = ctx.measureText(String(pl.finished ? pl.finalPos : pl.pos)).width;
      text(ctx, '/' + G.racers.length, m + 14 * s + pwid, m + 70 * s, 22 * s, '#cfd8ff');
      text(ctx, 'LAP', m + 120 * s, m + 24 * s, 14 * s, '#9fb4ff');
      text(ctx, Math.max(1, Math.min(CFG.laps, pl.lap)) + '/' + CFG.laps, m + 120 * s, m + 62 * s, 34 * s, '#fff');
      const cur = G.state === 'countdown' ? 0 : (pl.finished ? pl.lapTimes[pl.lapTimes.length - 1] : G.raceTime - pl.lapStart);
      const best = pl.lapTimes.length ? Math.min(...pl.lapTimes) : null;
      const rows = [['TIME', U.fmtTime(G.state === 'countdown' ? 0 : (pl.finished ? pl.finishTime : G.raceTime))],
                    ['LAP', U.fmtTime(cur)], ['BEST', U.fmtTime(best)]];
      rows.forEach(([k, v], i) => {
        text(ctx, k, m + 12 * s, m + (96 + i * 19) * s, 13 * s, '#9fb4ff');
        text(ctx, v, m + pw - 12 * s, m + (96 + i * 19) * s, 15 * s, '#fff', 'right');
      });

      // minimap (top-right, under FPS)
      const ms = 150 * s;
      panel(ctx, W - m - ms, m + 24 * s, ms, ms, s);
      minimap(ctx, W - m - ms, m + 24 * s, ms, G);

      // speed + nitro (bottom-right)
      const kmh = Math.round(pl.speed / CFG.maxSpeed * CFG.kmhAtMax);
      const bw = 200 * s, bh = 92 * s, bx = W - m - bw, by = H - m - bh;
      panel(ctx, bx, by, bw, bh, s);
      text(ctx, String(kmh), bx + bw - 64 * s, by + 50 * s, 44 * s, pl.nitroOn ? '#7fd8ff' : '#fff', 'right');
      text(ctx, 'KM/H', bx + bw - 12 * s, by + 50 * s, 15 * s, '#9fb4ff', 'right');
      const nx = bx + 12 * s, ny = by + 64 * s, nw = bw - 24 * s, nh = 14 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; TL.sprites.rrect(ctx, nx, ny, nw, nh, nh / 2); ctx.fill();
      const ng = ctx.createLinearGradient(nx, 0, nx + nw, 0);
      ng.addColorStop(0, '#2f6fe0'); ng.addColorStop(1, '#7fd8ff');
      ctx.fillStyle = ng; TL.sprites.rrect(ctx, nx, ny, Math.max(nh, nw * pl.nitro), nh, nh / 2); ctx.fill();
      text(ctx, pl.nitroOn ? 'NITRO!' : (pl.nitro >= 0.999 ? 'NITRO READY' : 'NITRO'), nx, ny - 4 * s, 12 * s, pl.nitroOn ? '#7fd8ff' : '#cfd8ff');

      // centre messages
      if (G.state === 'countdown') {
        const n = Math.ceil(G.countdown / CFG.countdownStep);
        const f = (G.countdown / CFG.countdownStep) % 1;
        text(ctx, String(n), W / 2, H * 0.38, (90 + 50 * f) * s, ['#fff', '#2ee86b', '#ffd400', '#ff4040'][n] || '#fff', 'center', '900');
      } else if (G.goT > 0) {
        text(ctx, 'GO!', W / 2, H * 0.38, 120 * s, '#2ee86b', 'center', '900');
      } else if (G.state === 'race' && pl.lap === CFG.laps && G.raceTime - pl.lapStart < 2.2 && CFG.laps > 1) {
        text(ctx, 'FINAL LAP', W / 2, H * 0.3, 60 * s, '#ffd400', 'center', '900');
      } else if (G.state === 'finished' && G.panel !== 'finish') {
        text(ctx, 'FINISH!', W / 2, H * 0.34, 90 * s, '#fff', 'center', '900');
      }
      if (G.paused) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H); }
    }
  };
})();
