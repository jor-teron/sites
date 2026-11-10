/* All artwork is procedural; coordinates are metres. */
(function () {
  const D = window.DS;
  D.draw = function (canvas, s, prefs) {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1);
    if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
      canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    }
    const g = canvas.getContext('2d'), c = s.c, z = Math.max(2.2, Math.min(6, box.width / 85));
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#668773'; g.fillRect(0, 0, box.width, box.height);
    g.translate(box.width / 2 - c.x * z, box.height / 2 - c.y * z); g.scale(z, z);
    if (s.w) D.drawTown(g, s, prefs);
    else {
    g.fillStyle = '#48545c'; g.fillRect(0, 0, 240, 200);
    g.strokeStyle = '#c2cdcf'; g.lineWidth = .3; g.strokeRect(3, 3, 234, 194);
    g.setLineDash([3, 3]);
    [45, 70, 100, 170].forEach(y => { g.beginPath(); g.moveTo(15, y); g.lineTo(220, y); g.stroke(); });
    g.setLineDash([]);
    for (let x = 15; x < 230; x += 14) for (const y of [12, 188]) {
      g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(x, y - 1); g.lineTo(x - .8, y + 1); g.lineTo(x + .8, y + 1); g.fill();
    }
    }
    const gates = s.l.def.gates;
    g.strokeStyle = '#71d8fc'; g.lineWidth = .6; g.setLineDash([1, 2]); g.beginPath();
    g.moveTo(s.l.def.spawn[0], s.l.def.spawn[1]); gates.forEach(p => g.lineTo(...p)); g.stroke(); g.setLineDash([]);
    gates.forEach((p, i) => {
      g.strokeStyle = i < s.l.gate ? '#70db9e' : '#82dbff'; g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.stroke();
      g.fillStyle = '#e6f7ff'; g.font = '2.8px sans-serif'; g.fillText(String(i + 1), p[0] - 1, p[1] + 1);
    });
    if (s.l.def.finish) { const p = gates[0]; g.fillStyle = '#71d8fc33'; g.fillRect(p[0] - 6, p[1] - 4, 12, 8); }
    D.drawCar(g, c, prefs.side === 'left', '#56cbef');
  };
  D.drawCar = function (g, c, rhd, color) {
    g.save(); g.translate(c.x, c.y); g.rotate(c.heading);
    g.fillStyle = '#101c25';
    for (const x of [-1.3, 1.2]) for (const y of [-1, 1]) {
      g.save(); g.translate(x, y); if (x > 0) g.rotate((c.steer || 0) * .4); g.fillRect(-.4, -.15, .8, .3); g.restore();
    }
    g.fillStyle = color; g.fillRect(-2.1, -.9, 4.2, 1.8);
    g.fillStyle = '#173348'; g.fillRect(-.7, -.7, 1.5, 1.4);
    g.fillStyle = '#f7d7a9'; g.beginPath(); g.arc(.1, rhd ? .42 : -.42, .23, 0, 7); g.fill();
    g.fillStyle = '#fff3b3'; g.fillRect(1.9, -.75, .3, .4); g.fillRect(1.9, .35, .3, .4);
    g.fillStyle = c.acceleration < -1 ? '#ff3333' : '#973c46'; g.fillRect(-2.15, -.75, .2, .4); g.fillRect(-2.15, .35, .2, .4);
    if (c.indicator && Math.floor(c.elapsed * 2) % 2 === 0) {
      g.fillStyle = '#ffbd36'; g.fillRect(1.7, c.indicator === 'left' ? -1.1 : .85, .5, .3);
    }
    g.restore();
  };
})();
