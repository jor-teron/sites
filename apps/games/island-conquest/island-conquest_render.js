/* Island Conquest — canvas drawing. Reads state, never changes it. */
(function (IC) {
  const canvas = document.getElementById('sea');
  const ctx = canvas.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0, w: 1, h: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hud = document.getElementById('hud');
    const hint = document.getElementById('hint');
    const top = 8 + (hud && !hud.hidden ? hud.offsetHeight : 0);
    const bottom = 8 + (hint && !hint.hidden ? hint.offsetHeight : 0);
    const s = Math.min((w - 20) / IC.config.world, (h - top - bottom) / IC.config.world);
    view = {
      s: Math.max(0.05, s),
      ox: (w - IC.config.world * Math.max(0.05, s)) / 2,
      oy: top + (h - top - bottom - IC.config.world * Math.max(0.05, s)) / 2,
      w: w, h: h,
    };
  }

  function toScreen(x, y) { return { x: view.ox + x * view.s, y: view.oy + y * view.s }; }
  function toWorld(x, y) { return { x: (x - view.ox) / view.s, y: (y - view.oy) / view.s }; }
  function hitPad() { return 28 / view.s; }

  function blob(x, y, r, id) {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const wob = 1 + 0.07 * Math.sin(a * 3 + id);
      const px = x + Math.cos(a) * r * wob;
      const py = y + Math.sin(a) * r * wob * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawSea(time) {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    const C = IC.config.colors;
    g.addColorStop(0, C.seaTop);
    g.addColorStop(0.55, C.seaMid);
    g.addColorStop(1, C.seaBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.strokeStyle = C.wave;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y0 = 30 + i * (view.h / 6);
      for (let x = 0; x <= view.w; x += 14) {
        const y = y0 + Math.sin(x * 0.02 + time * 0.7 + i) * 3.5;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawIsland(isle, time) {
    const C = IC.config.colors;
    const p = toScreen(isle.x, isle.y);
    const r = Math.max(11, isle.r * view.s);
    ctx.fillStyle = C.shallow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.18, r * 1.28, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const sand = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.2, p.x, p.y, r);
    sand.addColorStop(0, C.sandHi);
    sand.addColorStop(1, C.sand);
    ctx.fillStyle = sand;
    blob(p.x, p.y, r, isle.id);
    ctx.fill();
    ctx.save();
    blob(p.x, p.y, r, isle.id);
    ctx.clip();
    const grass = ctx.createRadialGradient(p.x - r * 0.2, p.y - r * 0.3, 2, p.x, p.y, r * 0.8);
    grass.addColorStop(0, C.grassHi[isle.owner]);
    grass.addColorStop(1, C.grass[isle.owner]);
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.arc(p.x, p.y + r * 0.05, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (isle.owner !== 0) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath();
      ctx.moveTo(p.x + r * 0.16, p.y + r * 0.05);
      ctx.lineTo(p.x + r * 0.16, p.y - r * 0.62);
      ctx.stroke();
      ctx.fillStyle = C.sail[isle.owner];
      ctx.beginPath();
      ctx.moveTo(p.x + r * 0.16, p.y - r * 0.62);
      ctx.lineTo(p.x + r * 0.58, p.y - r * 0.42);
      ctx.lineTo(p.x + r * 0.16, p.y - r * 0.24);
      ctx.fill();
    }
    if (r > 16) {
      const lean = isle.id % 2 === 0 ? -1 : 1;
      ctx.strokeStyle = '#6b4423';
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(p.x - lean * r * 0.2, p.y + r * 0.12);
      ctx.quadraticCurveTo(p.x - lean * r * 0.45, p.y - r * 0.1, p.x - lean * r * 0.15, p.y - r * 0.28);
      ctx.stroke();
      ctx.strokeStyle = '#1d6a40';
      const tx = p.x - lean * r * 0.15;
      const ty = p.y - r * 0.28;
      for (let i = 0; i < 3; i++) {
        const a = -1 + i * 0.7;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * r * 0.2, ty - r * 0.08, tx + Math.cos(a) * r * 0.34, ty + Math.sin(a) * r * 0.12);
        ctx.stroke();
      }
    }
    const label = String(Math.floor(isle.troops + 1e-6));
    ctx.font = '700 ' + Math.max(11, Math.min(22, r * 0.5)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(label, p.x, p.y + r * 0.16);
    ctx.fillStyle = C.paper;
    ctx.fillText(label, p.x, p.y + r * 0.16);
    if (isle.selected) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -time * 18;
      ctx.strokeStyle = C.select;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (isle.flash > 0) {
      ctx.strokeStyle = 'rgba(255, 236, 190, ' + isle.flash + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawShip(ship) {
    const C = IC.config.colors;
    const p = toScreen(ship.x, ship.y);
    const s = Math.max(7, Math.min(13, view.s * 26));
    ctx.fillStyle = C.wake;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.35 / i;
      ctx.beginPath();
      ctx.arc(p.x - Math.cos(ship.ang) * s * i * 0.7, p.y - Math.sin(ship.ang) * s * i * 0.7, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ship.ang);
    ctx.fillStyle = C.hull[ship.owner];
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, s * 0.42);
    ctx.lineTo(-s * 0.35, 0);
    ctx.lineTo(-s * 0.7, -s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.sail[ship.owner];
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-1, -s);
    ctx.quadraticCurveTo(s * 0.7, -s * 0.45, -1, -s * 0.1);
    ctx.fill();
    ctx.restore();
  }

  function draw(session) {
    const world = session.world;
    const time = performance.now() * 0.001;
    drawSea(time);
    if (!world) return;
    for (let i = 0; i < world.islands.length; i++) drawIsland(world.islands[i], time);
    for (let i = 0; i < world.ships.length; i++) drawShip(world.ships[i]);
    if (session.drag && session.mode === 'play') {
      const from = world.byId[session.drag.fromId];
      if (from) {
        const a = toScreen(from.x, from.y);
        const b = toScreen(session.drag.x, session.drag.y);
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = IC.config.colors.select;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (session.reticle && session.reticle.on && session.mode === 'play') {
      const p = toScreen(session.reticle.x, session.reticle.y);
      ctx.strokeStyle = IC.config.colors.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x - 5, p.y);
      ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 14, p.y);
      ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y - 5);
      ctx.moveTo(p.x, p.y + 5); ctx.lineTo(p.x, p.y + 14);
      ctx.stroke();
    }
  }

  window.addEventListener('resize', resize);
  IC.render = {
    canvas: canvas, resize: resize, draw: draw,
    toWorld: toWorld, toScreen: toScreen, hitPad: hitPad,
  };
  resize();
})(window.IslandConquest);
