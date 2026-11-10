(function () {
  const D = window.DS;
  D.drawTown = function (g, s, prefs) {
    const w = s.w, o = prefs.side === 'left' ? -3.5 : 3.5;
    g.fillStyle = '#77947e'; g.fillRect(0, 0, 260, 240);
    // Pavements, tarmac and dashed centre lines.
    for (const n of [60, 180]) {
      g.fillStyle = '#b7bab5'; g.fillRect(0, n - 9, 260, 18); g.fillRect(n - 9, 0, 18, 240);
      g.fillStyle = '#454f58'; g.fillRect(0, n - 7, 260, 14); g.fillRect(n - 7, 0, 14, 240);
    }
    g.strokeStyle = '#e4e7dc'; g.lineWidth = .2; g.setLineDash([2.5, 2.5]);
    for (const n of [60, 180]) {
      g.beginPath(); g.moveTo(0, n); g.lineTo(260, n); g.stroke();
      g.beginPath(); g.moveTo(n, 0); g.lineTo(n, 240); g.stroke();
    }
    g.setLineDash([]);
    for (const x of [60, 180]) for (const y of [60, 180]) { g.fillStyle = '#454f58'; g.fillRect(x - 7, y - 7, 14, 14); }
    g.fillStyle = '#454f58'; g.beginPath(); g.arc(180, 180, 23, 0, 7); g.fill();
    g.fillStyle = '#c8c9bb'; g.beginPath(); g.arc(180, 180, 12, 0, 7); g.fill();
    g.fillStyle = '#587f63'; g.beginPath(); g.arc(180, 180, 10, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = '3px sans-serif'; g.fillText(prefs.side === 'left' ? '↻' : '↺', 178, 181);
    // Buildings are outside the driveable roads.
    for (const [x, y, name, color] of [[82,90,'SCHOOL','#c69172'],[125,103,'PARK','#45765e'],[15,95,'SHOPS','#718eb4'],[205,90,'CLINIC','#a589a9']]) {
      g.fillStyle = '#34493d44'; g.fillRect(x + 1, y + 1, 22, 15);
      g.fillStyle = color; g.fillRect(x, y, 22, 15); g.fillStyle = '#fff'; g.font = '2.2px sans-serif'; g.fillText(name, x + 2, y + 8);
    }
    // Crossing stripes and stop lines are on the approaching side of each lane.
    g.fillStyle = '#e9ecdf'; for (let y = 53; y < 67; y += 2) g.fillRect(113, y, 6, 1);
    g.fillRect(141.5, 60 + o - 3, .5, 6);
    g.fillRect(60 - o - 3, 51.5, 6, .5);
    g.fillStyle = '#222c32'; g.fillRect(144, o < 0 ? 47 : 69, 2.7, 8);
    const color = D.signalAt(w.time);
    ['red','amber','green'].forEach((c, i) => { g.fillStyle = c === color ? { red:'#ff5149', amber:'#ffc64a', green:'#61e99b' }[c] : '#4b5054'; g.beginPath(); g.arc(145.35, (o < 0 ? 48.5 : 70.5) + i * 2.3, .85, 0, 7); g.fill(); });
    function sign(x, y, text, shape) {
      g.fillStyle = '#222'; g.fillRect(x - .12, y, .24, 4);
      g.fillStyle = shape === 'stop' ? '#c83e42' : 'white'; g.strokeStyle = '#c83e42'; g.lineWidth = .45; g.beginPath();
      if (shape === 'yield') { g.moveTo(x - 2, y - 2); g.lineTo(x + 2, y - 2); g.lineTo(x, y + 1.7); g.closePath(); }
      else { const n = shape === 'stop' ? 8 : 24; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; g.lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); } }
      g.fill(); g.stroke(); g.fillStyle = shape === 'stop' ? 'white' : '#222'; g.font = shape === 'stop' ? '1.2px sans-serif' : '2px sans-serif'; g.textAlign = 'center'; g.fillText(text, x, y + .6); g.textAlign = 'left';
    }
    sign(92, 48, '30'); sign(60 - o + (o < 0 ? 6 : -6), 47, 'STOP', 'stop'); sign(154, o < 0 ? 170 : 190, '', 'yield');
    // Parking areas include space to manoeuvre off the through road.
    g.fillStyle = '#5c6870'; g.fillRect(86, 39, 39, 14); g.fillRect(190, 156, 25, 27);
    g.strokeStyle = '#e4eced'; g.lineWidth = .25; g.strokeRect(98, 43.5, 12, 3); g.strokeRect(200, 163.5, 3, 7);
    g.fillStyle = '#ccefff'; g.font = '2.5px sans-serif'; g.fillText('P', 103, 42); g.fillText('P', 201, 161);
    for (const ai of w.cars) D.drawCar(g, Object.assign({ elapsed: w.time }, ai), prefs.side === 'left', ['#e3b85f','#df798b','#e3e5da','#a8abd9'][ai.id]);
    for (const p of w.pedestrians) {
      g.fillStyle = '#183443'; g.beginPath(); g.arc(p.x, p.y, .45, 0, 7); g.fill();
      g.strokeStyle = '#ffe0ae'; g.lineWidth = .25; g.beginPath(); g.moveTo(p.x - .6, p.y); g.lineTo(p.x + .6, p.y); g.stroke();
    }
  };
})();
