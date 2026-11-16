/*
 * Physics Lab PS1c (Learn > Science) - 2D rigid-body core, no DOM.
 * Units: metres, seconds, kilograms; y points up, the floor is y = 0.
 * PS1c adds friction and rotated boxes on top of PS1b's bounce: circles and
 * boxes can rest, slide and roll on floor and ramp segments, and they collide
 * with each other (circle-circle, circle-box, box-box).
 * Classic script: window.PLPhysics. No modules, no vendor code, no build step.
 */
(function (root) {
  'use strict';

  var P = {};
  root.PLPhysics = P;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

  // ---- bodies -------------------------------------------------------------
  P.circle = function (o) {
    o = o || {};
    var r = o.r != null ? o.r : 0.3;
    var m = o.mass != null ? o.mass : 1;
    var inertia = 0.5 * m * r * r;
    return {
      kind: 'circle', id: o.id || '', label: o.label || '',
      x: o.x || 0, y: o.y || 0, vx: o.vx || 0, vy: o.vy || 0,
      angle: o.angle || 0, av: o.av || 0,
      r: r, w: r * 2, h: r * 2,
      mass: m, invMass: m > 0 ? 1 / m : 0,
      inertia: inertia, invI: inertia > 0 ? 1 / inertia : 0,
      restitution: o.restitution != null ? o.restitution : 0.5,
      friction: o.friction != null ? o.friction : 0.4,
      color: o.color || '#5fb8ad',
      fixed: !!o.fixed,
      trail: []
    };
  };

  P.box = function (o) {
    o = o || {};
    var w = o.w != null ? o.w : 0.6;
    var h = o.h != null ? o.h : 0.4;
    var m = o.mass != null ? o.mass : 1;
    var inertia = m * (w * w + h * h) / 12;
    return {
      kind: 'box', id: o.id || '', label: o.label || '',
      x: o.x || 0, y: o.y || 0, vx: o.vx || 0, vy: o.vy || 0,
      angle: o.angle || 0, av: o.av || 0,
      r: Math.sqrt(w * w + h * h) / 2, w: w, h: h,
      mass: m, invMass: m > 0 ? 1 / m : 0,
      inertia: inertia, invI: inertia > 0 ? 1 / inertia : 0,
      restitution: o.restitution != null ? o.restitution : 0.4,
      friction: o.friction != null ? o.friction : 0.5,
      color: o.color || '#e0a458',
      fixed: !!o.fixed,
      trail: []
    };
  };

  function pointVel(b, rx, ry) {
    return { x: b.vx - b.av * ry, y: b.vy + b.av * rx };
  }

  function applyImpulse(b, jx, jy, rx, ry) {
    b.vx += jx * b.invMass;
    b.vy += jy * b.invMass;
    b.av += b.invI * cross(rx, ry, jx, jy);
  }

  // ---- world --------------------------------------------------------------
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

  World.prototype.remove = function (b) {
    var i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
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
    var g = this.gravity, bodies = this.bodies, i, j;
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.fixed) continue;
      b.vy -= g * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.angle += b.av * h;
    }
    for (var it = 0; it < 2; it++) {
      for (i = 0; i < bodies.length; i++) this.solveSegments(bodies[i]);
      for (i = 0; i < bodies.length; i++) {
        for (j = i + 1; j < bodies.length; j++) this.solvePair(bodies[i], bodies[j]);
      }
    }
  };

  World.prototype.energy = function (b) {
    var ke = 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.inertia * b.av * b.av;
    var pe = b.mass * this.gravity * b.y;
    return { ke: ke, pe: pe, total: ke + pe };
  };

  // ---- static segments ----------------------------------------------------
  function nearestOnSegment(px, py, s) {
    var dx = s.bx - s.ax, dy = s.by - s.ay;
    var L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? clamp(((px - s.ax) * dx + (py - s.ay) * dy) / L2, 0, 1) : 0;
    var len = Math.sqrt(L2) || 1;
    return {
      x: s.ax + dx * t, y: s.ay + dy * t, t: t,
      nx: -dy / len, ny: dx / len
    };
  }

  function resolveStatic(b, nx, ny, pen, px, py) {
    var rx = px - b.x, ry = py - b.y;
    var v = pointVel(b, rx, ry);
    var vn = v.x * nx + v.y * ny;
    if (vn < 0) {
      var e = Math.abs(vn) < 0.25 ? 0 : b.restitution;
      var rn = cross(rx, ry, nx, ny);
      var den = b.invMass + b.invI * rn * rn;
      if (den > 0) {
        var j = -(1 + e) * vn / den;
        applyImpulse(b, nx * j, ny * j, rx, ry);
        // Coulomb friction along the surface; it also spins a ball
        var tx = -ny, ty = nx;
        v = pointVel(b, rx, ry);
        var vt = v.x * tx + v.y * ty;
        var rt = cross(rx, ry, tx, ty);
        var denT = b.invMass + b.invI * rt * rt;
        var jt = denT > 0 ? -vt / denT : 0;
        var lim = b.friction * Math.abs(j);
        jt = clamp(jt, -lim, lim);
        applyImpulse(b, tx * jt, ty * jt, rx, ry);
      }
    }
    if (!b.fixed) {
      b.x += nx * pen * 0.6;
      b.y += ny * pen * 0.6;
    }
  }

  P.boxCorners = function (b) {
    var c = Math.cos(b.angle), s = Math.sin(b.angle);
    var hw = b.w / 2, hh = b.h / 2;
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    var out = [];
    for (var i = 0; i < 4; i++) {
      var lx = pts[i][0], ly = pts[i][1];
      out.push({ x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c });
    }
    return out;
  };

  World.prototype.solveSegments = function (b) {
    if (b.fixed) return;
    for (var i = 0; i < this.segments.length; i++) {
      var s = this.segments[i];
      if (b.kind === 'circle') this.circleSegment(b, s);
      else this.boxSegment(b, s);
    }
  };

  World.prototype.circleSegment = function (b, s) {
    var q = nearestOnSegment(b.x, b.y, s);
    var dx = b.x - q.x, dy = b.y - q.y;
    var d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) return;
    var d = Math.sqrt(d2);
    var nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    else {
      nx = q.nx; ny = q.ny;
      if ((b.x - q.x) * nx + (b.y - q.y) * ny < 0) { nx = -nx; ny = -ny; }
    }
    resolveStatic(b, nx, ny, b.r - d, b.x - nx * b.r, b.y - ny * b.r);
  };

  World.prototype.boxSegment = function (b, s) {
    var q0 = nearestOnSegment(b.x, b.y, s);
    var side = (b.x - s.ax) * q0.nx + (b.y - s.ay) * q0.ny;
    var nx = side < 0 ? -q0.nx : q0.nx;
    var ny = side < 0 ? -q0.ny : q0.ny;
    var corners = P.boxCorners(b), best = null;
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      var q = nearestOnSegment(c.x, c.y, s);
      if (q.t <= 0 || q.t >= 1) continue;
      var sd = (c.x - s.ax) * nx + (c.y - s.ay) * ny;
      if (sd < 0 && (!best || -sd > best.pen)) best = { pen: -sd, x: c.x, y: c.y };
    }
    if (best) resolveStatic(b, nx, ny, best.pen, best.x, best.y);
  };

  // ---- body pairs ---------------------------------------------------------
  World.prototype.solvePair = function (a, b) {
    if (a.fixed && b.fixed) return;
    if (a.kind === 'circle' && b.kind === 'circle') this.pairCircles(a, b);
    else if (a.kind === 'circle' && b.kind === 'box') this.pairCircleBox(a, b);
    else if (a.kind === 'box' && b.kind === 'circle') this.pairCircleBox(b, a);
    else this.pairBoxes(a, b);
  };

  function resolvePair(a, b, nx, ny, px, py, pen) {
    var rax = px - a.x, ray = py - a.y, rbx = px - b.x, rby = py - b.y;
    var va = pointVel(a, rax, ray), vb = pointVel(b, rbx, rby);
    var rvx = vb.x - va.x, rvy = vb.y - va.y;
    var vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var e = Math.min(a.restitution, b.restitution);
      if (Math.abs(vn) < 0.25) e = 0;
      var rnA = cross(rax, ray, nx, ny), rnB = cross(rbx, rby, nx, ny);
      var den = a.invMass + b.invMass + a.invI * rnA * rnA + b.invI * rnB * rnB;
      if (den > 0) {
        var j = -(1 + e) * vn / den;
        applyImpulse(a, -nx * j, -ny * j, rax, ray);
        applyImpulse(b, nx * j, ny * j, rbx, rby);
        var tx = -ny, ty = nx;
        va = pointVel(a, rax, ray); vb = pointVel(b, rbx, rby);
        rvx = vb.x - va.x; rvy = vb.y - va.y;
        var vt = rvx * tx + rvy * ty;
        var rtA = cross(rax, ray, tx, ty), rtB = cross(rbx, rby, tx, ty);
        var denT = a.invMass + b.invMass + a.invI * rtA * rtA + b.invI * rtB * rtB;
        var jt = denT > 0 ? -vt / denT : 0;
        var lim = Math.sqrt(a.friction * b.friction) * Math.abs(j);
        jt = clamp(jt, -lim, lim);
        applyImpulse(a, -tx * jt, -ty * jt, rax, ray);
        applyImpulse(b, tx * jt, ty * jt, rbx, rby);
      }
    }
    var total = a.invMass + b.invMass;
    if (total > 0) {
      var ca = a.invMass / total, cb = b.invMass / total;
      a.x -= nx * pen * ca * 0.6;
      a.y -= ny * pen * ca * 0.6;
      b.x += nx * pen * cb * 0.6;
      b.y += ny * pen * cb * 0.6;
    }
  }

  World.prototype.pairCircles = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var rad = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return;
    var d = Math.sqrt(d2);
    var nx = d2 > 1e-12 ? dx / d : 1, ny = d2 > 1e-12 ? dy / d : 0;
    resolvePair(a, b, nx, ny, a.x + nx * a.r, a.y + ny * a.r, rad - d);
  };

  // normal points from the box to the circle
  function circleBoxContact(c, box) {
    var co = Math.cos(box.angle), si = Math.sin(box.angle);
    var dx = c.x - box.x, dy = c.y - box.y;
    var lx = dx * co + dy * si;
    var ly = -dx * si + dy * co;
    var hw = box.w / 2, hh = box.h / 2;
    var inside = Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    var qx, qy, nlx, nly, pen;
    if (inside) {
      var dl = hw - Math.abs(lx), db = hh - Math.abs(ly);
      if (dl < db) { nlx = lx < 0 ? -1 : 1; nly = 0; pen = c.r + dl; qx = nlx * hw; qy = ly; }
      else { nlx = 0; nly = ly < 0 ? -1 : 1; pen = c.r + db; qx = lx; qy = nly * hh; }
    } else {
      qx = clamp(lx, -hw, hw);
      qy = clamp(ly, -hh, hh);
      var vx = lx - qx, vy = ly - qy;
      var d = Math.sqrt(vx * vx + vy * vy);
      if (d >= c.r) return null;
      nlx = vx / (d || 1); nly = vy / (d || 1);
      pen = c.r - d;
    }
    return {
      nx: nlx * co - nly * si,
      ny: nlx * si + nly * co,
      x: box.x + qx * co - qy * si,
      y: box.y + qx * si + qy * co,
      pen: pen
    };
  }

  World.prototype.pairCircleBox = function (a, b) {
    var k = circleBoxContact(a, b);
    if (!k) return;
    resolvePair(a, b, -k.nx, -k.ny, k.x, k.y, k.pen);
  };

  function boxAxes(b) {
    var c = Math.cos(b.angle), s = Math.sin(b.angle);
    return [{ x: c, y: s }, { x: -s, y: c }];
  }

  function projectRadius(b, ax, ay) {
    var c = Math.cos(b.angle), s = Math.sin(b.angle);
    return (b.w / 2) * Math.abs(c * ax + s * ay) + (b.h / 2) * Math.abs(-s * ax + c * ay);
  }

  World.prototype.pairBoxes = function (a, b) {
    var axes = boxAxes(a).concat(boxAxes(b));
    var dx = b.x - a.x, dy = b.y - a.y;
    var best = null;
    for (var i = 0; i < axes.length; i++) {
      var ax = axes[i].x, ay = axes[i].y;
      var dist = dx * ax + dy * ay;
      var overlap = projectRadius(a, ax, ay) + projectRadius(b, ax, ay) - Math.abs(dist);
      if (overlap <= 0) return;
      if (!best || overlap < best.pen) {
        var sign = dist < 0 ? -1 : 1;
        best = { pen: overlap, nx: ax * sign, ny: ay * sign };
      }
    }
    var corners = P.boxCorners(a), contact = corners[0], max = -Infinity;
    for (i = 0; i < corners.length; i++) {
      var d = (corners[i].x - a.x) * best.nx + (corners[i].y - a.y) * best.ny;
      if (d > max) { max = d; contact = corners[i]; }
    }
    resolvePair(a, b, best.nx, best.ny, contact.x, contact.y, best.pen);
  };
})(typeof window !== 'undefined' ? window : this);
