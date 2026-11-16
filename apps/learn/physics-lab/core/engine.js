/*
 * Physics Lab PS1a (Learn > Science) - tiny 2D physics core, no DOM.
 * Units: metres, seconds, kilograms; y points up, the floor is y = 0.
 * PS1a has circles and static segments only: gravity, a floor and a ball
 * that lands and stays. Bounce, boxes, friction and dragging come later.
 * Classic script: window.PLPhysics. No modules, no vendor code, no build step.
 */
(function (root) {
  'use strict';

  var P = {};
  root.PLPhysics = P;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  P.circle = function (o) {
    o = o || {};
    var r = o.r != null ? o.r : 0.3;
    var m = o.mass != null ? o.mass : 1;
    return {
      kind: 'circle', id: o.id || '', label: o.label || '',
      x: o.x || 0, y: o.y || 0, vx: o.vx || 0, vy: o.vy || 0,
      angle: o.angle || 0, av: o.av || 0,
      r: r, w: r * 2, h: r * 2,
      mass: m, invMass: m > 0 ? 1 / m : 0,
      restitution: o.restitution != null ? o.restitution : 0,
      friction: o.friction != null ? o.friction : 0.4,
      color: o.color || '#5fb8ad',
      fixed: !!o.fixed,
      trail: []
    };
  };

  function World(w, h) {
    this.w = w || 10;
    this.h = h || 6;
    this.gravity = 9.81;
    this.bodies = [];
    this.segments = [];
    this.time = 0;
  }
  P.World = World;
  P.world = function (w, h) { return new World(w, h); };

  World.prototype.addSegment = function (ax, ay, bx, by, friction) {
    var s = { ax: ax, ay: ay, bx: bx, by: by, friction: friction == null ? 0.8 : friction };
    this.segments.push(s);
    return s;
  };

  World.prototype.addBody = function (b) { this.bodies.push(b); return b; };

  World.prototype.clear = function () {
    this.bodies.length = 0;
    this.segments.length = 0;
    this.time = 0;
  };

  World.prototype.step = function (dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    var n = clamp(Math.ceil(dt / (1 / 240)), 1, 12);
    var h = dt / n;
    for (var i = 0; i < n; i++) this.substep(h);
    this.time += dt;
  };

  World.prototype.substep = function (h) {
    var g = this.gravity, bodies = this.bodies, i;
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.fixed) continue;
      b.vy -= g * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.av * h;
    }
    for (i = 0; i < bodies.length; i++) this.solveSegments(bodies[i]);
  };

  function nearestOnSegment(px, py, s) {
    var dx = s.bx - s.ax, dy = s.by - s.ay;
    var L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? clamp(((px - s.ax) * dx + (py - s.ay) * dy) / L2, 0, 1) : 0;
    return { x: s.ax + dx * t, y: s.ay + dy * t, t: t };
  }

  World.prototype.solveSegments = function (b) {
    if (b.fixed || b.kind !== 'circle') return;
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      var q = nearestOnSegment(b.x, b.y, s);
      var dx = b.x - q.x, dy = b.y - q.y;
      var d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) continue;
      var d = Math.sqrt(d2);
      var nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; }
      else {
        var len = Math.sqrt((s.bx - s.ax) * (s.bx - s.ax) + (s.by - s.ay) * (s.by - s.ay)) || 1;
        nx = -(s.by - s.ay) / len; ny = (s.bx - s.ax) / len;
        if ((b.x - q.x) * nx + (b.y - q.y) * ny < 0) { nx = -nx; ny = -ny; }
      }
      // separate and remove the inward speed (PS1a: no bounce yet)
      b.x += nx * (b.r - d);
      b.y += ny * (b.r - d);
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= nx * vn; b.vy -= ny * vn; }
    }
  };

})(typeof window !== 'undefined' ? window : this);
