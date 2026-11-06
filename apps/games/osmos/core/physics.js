/* ============================================================
 * File:        core/physics.js
 * Project:     Osmos OSM1a
 * Purpose:     Mass↔radius, eject thrust, bounce, absorb rules.
 * Depends on:  OSMOS_CONFIG
 * ============================================================ */
var OSMOS_PHYSICS = (function () {
  var C = OSMOS_CONFIG;
  var W = C.world.w, H = C.world.h;

  function radius(mass) { return Math.sqrt(Math.max(mass, 0.5)) * 2.15; }

  function eject(player, tx, ty) {
    if (!player || !player.alive || player.mass <= C.player.minMass + C.player.ejectMass) return null;
    var dx = tx - player.x, dy = ty - player.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    var m = C.player.ejectMass;
    player.mass -= m;
    var impulse = C.player.ejectImpulse / Math.max(player.mass, 8);
    player.vx -= dx * impulse;
    player.vy -= dy * impulse;
    return {
      id: -1, kind: 'eject', x: player.x + dx * radius(player.mass),
      y: player.y + dy * radius(player.mass),
      vx: dx * impulse * 2.4 + player.vx * 0.2,
      vy: dy * impulse * 2.4 + player.vy * 0.2,
      mass: m * 0.85, alive: true, life: 2.4
    };
  }

  function stepCell(c, dt) {
    if (!c.alive) return;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vx *= Math.pow(C.player.drag, dt * 60);
    c.vy *= Math.pow(C.player.drag, dt * 60);
    if (c.kind === 'food' || c.kind === 'big') {
      c.vx += Math.sin(c.y * 0.01 + c.id) * 1.2 * dt;
      c.vy += Math.cos(c.x * 0.01 + c.id) * 1.2 * dt;
    }
    var r = radius(c.mass);
    if (c.x < r) { c.x = r; c.vx = Math.abs(c.vx) * C.player.bounce; }
    if (c.x > W - r) { c.x = W - r; c.vx = -Math.abs(c.vx) * C.player.bounce; }
    if (c.y < r) { c.y = r; c.vy = Math.abs(c.vy) * C.player.bounce; }
    if (c.y > H - r) { c.y = H - r; c.vy = -Math.abs(c.vy) * C.player.bounce; }
    if (c.life != null) {
      c.life -= dt;
      if (c.life <= 0) c.alive = false;
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

  return { radius: radius, eject: eject, stepCell: stepCell, collide: collide };
})();
