/* ============================================================
 * File:        core/physics.js
 * Project:     Osmos OSM1d
 * Purpose:     Mass↔radius, eject, bounce, absorb, field forces.
 *              Wells / currents / membranes are passive fields — no AI.
 * Depends on:  OSMOS_CONFIG
 * ============================================================ */
var OSMOS_PHYSICS = (function () {
  var C = OSMOS_CONFIG;
  var W = C.world.w, H = C.world.h;

  function radius(mass) { return Math.sqrt(Math.max(mass, 0.5)) * 2.15; }

  function clampSpeed(c) {
    var max = C.player.maxSpeed;
    if (!max) return;
    var sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    if (sp > max) {
      var s = max / sp;
      c.vx *= s; c.vy *= s;
    }
  }

  /* Momentum-conserving eject: blob leaves at player_v + relSpeed*aim;
   * player recoils by -(m / remainingMass) * relSpeed * aim. No drag/braking. */
  function eject(player, tx, ty) {
    if (!player || !player.alive) return null;
    var m = Math.max(C.player.ejectMassMin, player.mass * C.player.ejectMassFrac);
    if (player.mass - m < C.player.minMass) return null;
    var dx = tx - player.x, dy = ty - player.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    var remain = player.mass - m;
    var rel = C.player.ejectRelSpeed;
    player.mass = remain;
    player.vx -= dx * rel * (m / remain);
    player.vy -= dy * rel * (m / remain);
    clampSpeed(player);
    return {
      id: -1, kind: 'eject',
      x: player.x + dx * radius(player.mass),
      y: player.y + dy * radius(player.mass),
      vx: player.vx + dx * rel,
      vy: player.vy + dy * rel,
      mass: m * 0.85, alive: true, life: 2.8
    };
  }

  function stepCell(c, dt) {
    if (!c.alive) return;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    /* OSM1d: no passive drag — velocity unchanged unless fields / eject / walls. */
    if (c.kind === 'food' || c.kind === 'big' || c.kind === 'hazard') {
      c.vx += Math.sin(c.y * 0.01 + c.id) * 1.2 * dt;
      c.vy += Math.cos(c.x * 0.01 + c.id) * 1.2 * dt;
    }
    var r = radius(c.mass);
    if (c.x < r) { c.x = r; c.vx = Math.abs(c.vx) * C.player.bounce; }
    if (c.x > W - r) { c.x = W - r; c.vx = -Math.abs(c.vx) * C.player.bounce; }
    if (c.y < r) { c.y = r; c.vy = Math.abs(c.vy) * C.player.bounce; }
    if (c.y > H - r) { c.y = H - r; c.vy = -Math.abs(c.vy) * C.player.bounce; }
    clampSpeed(c);
    if (c.life != null) {
      c.life -= dt;
      if (c.life <= 0) c.alive = false;
    }
  }

  function applyFields(cells, level, dt) {
    if (!level) return;
    var i, c, w, d, nx, ny, falloff, cur, dx, dy;
    var wells = level.wells || [];
    var currents = level.currents || [];
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c.alive || c.kind === 'eject') continue;

      for (var wi = 0; wi < wells.length; wi++) {
        w = wells[wi];
        dx = w.x - c.x; dy = w.y - c.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d >= w.r) continue;
        falloff = 1 - d / w.r;
        nx = dx / d; ny = dy / d;
        c.vx += nx * w.pull * falloff * dt;
        c.vy += ny * w.pull * falloff * dt;
        if (c.kind === 'player' && d < w.core) {
          var loss = C.wells.coreMassPerSec * dt * (1 - d / w.core);
          if (c.mass > C.wells.coreSafeMassFloor) {
            c.mass = Math.max(C.wells.coreSafeMassFloor, c.mass - loss);
          }
        }
      }

      for (var ci = 0; ci < currents.length; ci++) {
        cur = currents[ci];
        if (Math.abs(c.x - cur.x) > cur.hw || Math.abs(c.y - cur.y) > cur.hh) continue;
        c.vx += cur.vx * dt;
        c.vy += cur.vy * dt;
      }
    }

    applyMembranes(cells, level.membranes || [], dt);
  }

  function applyMembranes(cells, membranes, dt) {
    if (!membranes.length) return;
    var thick = C.membranes.thickness;
    var i, c, m, ax, ay, bx, by, px, py, t, qx, qy, dx, dy, dist, nx, ny, push;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c.alive) continue;
      for (var mi = 0; mi < membranes.length; mi++) {
        m = membranes[mi];
        ax = m.x1; ay = m.y1; bx = m.x2; by = m.y2;
        px = bx - ax; py = by - ay;
        var len2 = px * px + py * py || 1;
        t = ((c.x - ax) * px + (c.y - ay) * py) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        qx = ax + px * t; qy = ay + py * t;
        dx = c.x - qx; dy = c.y - qy;
        dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        var need = radius(c.mass) + thick * 0.5;
        if (dist >= need) continue;
        nx = dx / dist; ny = dy / dist;
        push = (need - dist);
        c.x += nx * push; c.y += ny * push;
        var vn = c.vx * nx + c.vy * ny;
        if (vn < 0) {
          c.vx -= (1 + C.membranes.bounce) * vn * nx;
          c.vy -= (1 + C.membranes.bounce) * vn * ny;
        }
      }
    }
  }

  function collide(a, b) {
    if (!a.alive || !b.alive) return;
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    var ra = radius(a.mass), rb = radius(b.mass);
    if (dist >= ra + rb * 0.92) return;

    var player = a.kind === 'player' ? a : (b.kind === 'player' ? b : null);
    var other = player === a ? b : (player === b ? a : null);
    if (!player || !other) {
      softPush(a, b, dx, dy, dist, ra, rb);
      return;
    }

    if (other.kind === 'eject') return;

    if (other.kind === 'hazard') {
      player.mass = Math.max(C.player.minMass * 0.9,
        player.mass - C.absorb.largeLoss * 0.7);
      softPush(player, other, other.x - player.x, other.y - player.y,
        Math.sqrt(Math.pow(other.x - player.x, 2) + Math.pow(other.y - player.y, 2)) || 1,
        radius(player.mass), radius(other.mass));
      return;
    }

    if (other.mass < player.mass * C.absorb.ratio) {
      player.mass += other.mass * 0.92;
      other.alive = false;
      return;
    }

    if (other.mass > player.mass / C.absorb.ratio) {
      player.mass = Math.max(C.player.minMass * 0.85, player.mass - other.mass * C.absorb.largeLoss * 0.08 - C.absorb.largeLoss);
      softPush(player, other, other.x - player.x, other.y - player.y,
        Math.sqrt(Math.pow(other.x - player.x, 2) + Math.pow(other.y - player.y, 2)) || 1,
        radius(player.mass), radius(other.mass));
      return;
    }

    softPush(player, other, other.x - player.x, other.y - player.y,
      Math.sqrt(Math.pow(other.x - player.x, 2) + Math.pow(other.y - player.y, 2)) || 1,
      radius(player.mass), radius(other.mass));
  }

  function softPush(a, b, dx, dy, dist, ra, rb) {
    var nx = dx / dist, ny = dy / dist;
    var overlap = (ra + rb) - dist;
    var push = Math.min(overlap * 0.5, 6) * C.absorb.sameReject;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
    var bounce = C.absorb.sameReject * 18;
    a.vx -= nx * bounce; a.vy -= ny * bounce;
    b.vx += nx * bounce; b.vy += ny * bounce;
  }

  return {
    radius: radius, eject: eject, stepCell: stepCell,
    collide: collide, applyFields: applyFields
  };
})();
