/* DS-3: top-down map of the procedural open road (the file:// fallback and the small map).
   Draws the generated points as a simple polyline, plus events, cars and people. */
(function () {
  const D = window.DS;
  D.drawDrive = function (g, s, prefs) {
    const w = s.w, road = w.road, c = s.c, near = (x, y) => Math.abs(x - c.x) < 260 && Math.abs(y - c.y) < 260;
    const first = road.mode === 'loop' ? 0 : road.first(), last = road.mode === 'loop' ? road.n : road.last();
    const colour = { city: '#4b555d', highway: '#3f4950', ghat: '#57524a', village: '#6b6453' };
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = first; i < last; i++) {
      const p = road.point(i), q = road.point(i + 1); if (!p || !q || !near(p.x, p.y)) continue;
      g.strokeStyle = colour[p.type]; g.lineWidth = p.width; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
    g.strokeStyle = '#e4e7dc'; g.lineWidth = .2; g.setLineDash([2.5, 2.5]); g.beginPath();
    for (let i = first; i <= last; i++) { const p = road.point(i); if (p && near(p.x, p.y)) i === first || !near(road.point(i - 1).x, road.point(i - 1).y) ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y); }
    g.stroke(); g.setLineDash([]);
    for (const e of road.events) {
      if (e.x == null || !near(e.x, e.y)) continue;
      g.save(); g.translate(e.x, e.y); g.rotate(e.dir);
      if (e.kind === 'roundabout') { g.fillStyle = '#4b555d'; g.beginPath(); g.arc(0, 0, D.ROUND.outer, 0, 7); g.fill(); g.fillStyle = '#587f63'; g.beginPath(); g.arc(0, 0, D.ROUND.island, 0, 7); g.fill(); }
      else if (e.kind === 'zebra') { g.fillStyle = '#f0f0e8'; for (let y = -e.width / 2 + .5; y < e.width / 2 - .3; y += 1) g.fillRect(-1.5, y, 3, .5); }
      else if (e.kind === 'breaker') { g.fillStyle = '#f2c230'; g.fillRect(-.5, -e.width / 2, 1, e.width); }
      else if (e.kind === 'junction') { g.fillStyle = '#4b555d'; g.fillRect(-3, e.side > 0 ? -e.width / 2 - 32 : e.width / 2, 6, 32); }
      g.restore();
    }
    for (const ai of w.cars) D.drawCar(g, ai, false, '#e3b85f');
    for (const p of w.pedestrians) { g.fillStyle = '#2e5f86'; g.beginPath(); g.arc(p.x, p.y, .6, 0, 7); g.fill(); }
  };
})();
