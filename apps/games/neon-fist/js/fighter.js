// A fighter: pose state, idle animation, spring-physics cloth/hair and full body assembly.
(function () {
  const C = NF.config, S = NF.skeleton, Dr = NF.draw, D = Math.PI / 180;
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  // Verlet rope used for hair, headband tails and belt tails.
  class Chain {
    constructor(n, len, bias, decay) { this.n = n; this.len = len; this.bias = bias; this.decay = decay ?? 2; this.p = null; }
    reset(a) {
      this.p = [];
      for (let i = 0; i < this.n; i++) {
        const x = a.x + this.bias.x * 0.02 * i * this.len, y = a.y + Math.max(0, this.bias.y * 0.02 + 0.6) * i * this.len;
        this.p.push({ x, y, px: x, py: y });
      }
    }
    step(a, dt, wind) {
      if (!this.p) this.reset(a);
      const p = this.p; p[0].x = a.x; p[0].y = a.y; p[0].px = a.x; p[0].py = a.y;
      for (let i = 1; i < this.n; i++) {
        const q = p[i], k = Math.pow(1 - i / this.n, this.decay);
        const ax = this.bias.x * k + wind, ay = C.gravity + this.bias.y * k;
        const vx = (q.x - q.px) * C.damping, vy = (q.y - q.py) * C.damping;
        q.px = q.x; q.py = q.y; q.x += vx + ax * dt * dt; q.y += vy + ay * dt * dt;
      }
      for (let it = 0; it < 4; it++) for (let i = 1; i < this.n; i++) {
        const a0 = p[i - 1], b = p[i]; let dx = b.x - a0.x, dy = b.y - a0.y; const d = Math.hypot(dx, dy) || 1;
        const diff = (d - this.len) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a0.x += dx * diff * 0.5; a0.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
    }
  }

  class Fighter {
    constructor(ch) {
      this.ch = ch; this.poses = NF.poses[ch.id]; this.t = Math.random() * 5;
      this.action = 'idle'; this.actT = 0; this.hold = false; this.blink = 0; this.nextBlink = 1.5; this.acc = 0;
      this.chains = ch.id === 'kai'
        ? { band1: new Chain(7, 21, { x: -2600, y: -900 }, 0.4), band2: new Chain(6, 21, { x: -2200, y: -500 }, 0.5),
            belt1: new Chain(5, 18, { x: 300, y: 0 }), belt2: new Chain(5, 17, { x: 120, y: 0 }) }
        : { tail: new Chain(10, 25, { x: -2600, y: -4200 }) };
      this.pose = this.computePose(); this.J = S.solve(this.pose, ch.bones);
      this.idleH = -(S.solve(this.poses.idle, ch.bones).head.y) + 66 * ch.headScale;
    }
    play(name, hold) { this.action = name; this.actT = 0; this.hold = !!hold; }
    weight() {
      if (this.action === 'idle') return 0;
      const hold = this.action === 'special' ? C.specialHold : C.poseHold, t = this.actT;
      if (t < C.poseIn) return smooth(t / C.poseIn);
      if (this.hold || t < C.poseIn + hold) return 1;
      const w = 1 - smooth((t - C.poseIn - hold) / C.poseOut);
      if (w <= 0) this.action = 'idle';
      return Math.max(0, w);
    }
    computePose() {
      const t = this.t, w = this.weight(), idle = this.poses.idle;
      const b = Math.sin(t * C.breathRate * 2 * Math.PI), bo = Math.sin(t * C.bounceRate * 2 * Math.PI);
      const sway = Math.sin(t * 0.55 * 2 * Math.PI) * C.swayDeg, g1 = Math.sin(t * 0.9 + 1), g2 = Math.sin(t * 0.7 + 2.5);
      this.breath = b;
      const layer = { torso: b * 1.2 + sway, neck: -b * 0.6 - sway * 0.6, head: -sway * 0.3,
        knF: -3 - bo * 3.5, knB: -2 - bo * 2.5, hpF: 1.4 + bo * 1.6, hpB: -0.6 - bo * 1.0,
        shF: g1 * C.guardShiftDeg + b * 1.2, elF: -g1 * C.guardShiftDeg * 0.8, shB: g2 * C.guardShiftDeg * 0.8 + b, elB: g2 * 2,
        hx: Math.sin(t * 0.5) * 5 };
      const base = w > 0 ? S.blend(idle, this.poses[this.action] || idle, w) : S.blend(idle, idle, 0);
      return S.add(base, layer, 1 - 0.8 * w);
    }
    update(dt) {
      this.t += dt; this.actT += dt;
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blinkT = C.blinkTime; this.nextBlink = C.blinkEvery[0] + Math.random() * (C.blinkEvery[1] - C.blinkEvery[0]); }
      if (this.blinkT > 0) { this.blinkT -= dt; this.blink = Math.sin(Math.max(0, this.blinkT) / C.blinkTime * Math.PI); } else this.blink = 0;
      this.pose = this.computePose(); this.J = S.solve(this.pose, this.ch.bones);
      this.acc += Math.min(dt, 0.1);
      const wind = -Math.sin(this.t * 1.3) * C.wind * (0.6 + 0.4 * Math.sin(this.t * 0.7));
      while (this.acc >= C.physicsStep) { this.acc -= C.physicsStep; this.stepChains(C.physicsStep, wind); }
    }
    headPt(lx, ly) {
      const J = this.J, a = J.ang.head * D, s = this.ch.headScale;
      return { x: J.head.x + (lx * Math.cos(a) - ly * Math.sin(a)) * s, y: J.head.y + (lx * Math.sin(a) + ly * Math.cos(a)) * s };
    }
    beltPt() { const T = Dr.torsoMap(this.J, this.ch.bones); return T(0.03, 50); }
    stepChains(dt, wind) {
      const c = this.chains;
      if (this.ch.id === 'kai') {
        const k = this.headPt(-54, -28); c.band1.step(k, dt, wind); c.band2.step({ x: k.x, y: k.y + 3 }, dt, wind * 0.8);
        const b = this.beltPt(); c.belt1.step(b, dt, wind * 0.3); c.belt2.step({ x: b.x - 3, y: b.y }, dt, wind * 0.25);
      } else c.tail.step(this.headPt(-38, -64), dt, wind * 1.2);
    }

    // ---------------- drawing ----------------
    draw(ctx, x, gy, scale, facing) {
      ctx.save(); ctx.translate(x, gy); ctx.scale(scale * facing, scale);
      const J = this.J, ch = this.ch;
      this.shadow(ctx);
      if (ch.id === 'kai') {
        const c = this.chains, pk = ch.band;
        Dr.ribbon(ctx, c.band2.p, 11, 7, Dr.shade(pk, 0.62), Dr.shade(pk, 0.5));
        Dr.ribbon(ctx, c.band1.p, 12, 8, Dr.shade(pk, 0.95), Dr.shade(pk, 0.7));
      } else {
        Dr.ribbon(ctx, this.chains.tail.p, 34, 6, Dr.shade(ch.hair, 1.15), ch.hairTip, { strands: true, bulge: 0.35, pow: 1.3 });
      }
      this.arm(ctx, 'B', true); this.leg(ctx, 'B', true);
      this.torso(ctx);
      this.leg(ctx, 'F', false);
      this.waist(ctx);
      this.neck(ctx);
      Dr.head(ctx, J, ch, { blink: this.blink });
      this.arm(ctx, 'F', false);
      this.fx(ctx);
      ctx.restore();
    }
    shadow(ctx) {
      const J = this.J, cx = (J.ankleF.x + J.ankleB.x) / 2, air = Math.max(0, -Math.min(J.footLow.F, J.footLow.B));
      const k = Math.max(0.35, 1 - air / 400), rx = (Math.abs(J.ankleF.x - J.ankleB.x) / 2 + 110) * k;
      const g = ctx.createRadialGradient(cx, 0, 0, cx, 0, rx);
      g.addColorStop(0, 'rgba(0,0,0,' + 0.6 * k + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.scale(1, 0.12); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, 0, rx, 0, 7); ctx.fill(); ctx.restore();
    }
    leg(ctx, s, far) {
      const J = this.J, ch = this.ch, B = ch.bones, A = J.ang, o = { far, rim: ch.rim };
      const shin = Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.shin);
      const thigh = Dr.limb(J.hip, A['th' + s], B.thigh, ch.thigh, { u0: -0.05, u1: 1.08 });
      if (ch.id === 'kai') {
        Dr.paint(ctx, shin, ch.skin, Object.assign({ spec: 0.12 }, o));
        Dr.foot(ctx, J['ankle' + s], A['ft' + s], ch, { far });
        const ps = Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.pantsShin, { u1: 0.86 });
        Dr.paint(ctx, ps, ch.pants, Object.assign({ folds: [[0.35, 14, 3, 0.7], [0.65, 10, 2.5, 0.8], [1, 6, 4, 0.9]] }, o));
        Dr.paint(ctx, thigh, ch.pants, Object.assign({ folds: [[0.25, 22, 3.5, 0.75], [0.5, 18, 3, 0.6], [0.75, 14, 3, 0.85]] }, o));
      } else {
        Dr.paint(ctx, Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.boot), ch.bootCol, Object.assign({ spec: 0.22 }, o));
        Dr.foot(ctx, J['ankle' + s], A['ft' + s], ch, { far });
        const bt = Dr.limb(J['knee' + s], A['sh' + s], B.shin, ch.boot, { u0: 0.08, u1: 0.16, inf: 2 });
        Dr.paint(ctx, bt, ch.armourHi, { far, outline: true });
        Dr.paint(ctx, thigh, ch.suit, Object.assign({ spec: 0.18 }, o));
        Dr.paint(ctx, Dr.limb(J.hip, A['th' + s], B.thigh, ch.thigh, { u0: 0.2, u1: 0.62, fa: 1, fb: -0.15, inf: 3 }), ch.armour, { far, spec: 0.15 });
        const k = J['knee' + s], d = Dr.dirDown(A['th' + s]);
        ctx.fillStyle = Dr.shade(ch.armour, far ? C.farLimb : 1); ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(k.x + Dr.nrmDown(A['th' + s]).x * 16, k.y + Dr.nrmDown(A['th' + s]).y * 16, 17, 22, Math.atan2(d.y, d.x), 0, 7); ctx.fill(); ctx.stroke();
        Dr.glowDot(ctx, { x: k.x + Dr.nrmDown(A['th' + s]).x * 22, y: k.y + Dr.nrmDown(A['th' + s]).y * 22 }, 9, ch.glow, far ? 0.5 : 1);
      }
    }
    arm(ctx, s, far) {
      const J = this.J, ch = this.ch, B = ch.bones, A = J.ang, o = { far, rim: ch.rim };
      const fa = Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm), ua = Dr.limb(J.shoulder, A['ua' + s], B.uarm, ch.uarm);
      const hType = this.pose['hand' + s] || 'fist';
      if (ch.id === 'kai') {
        Dr.paint(ctx, fa, ch.skin, Object.assign({ spec: 0.12 }, o));
        Dr.paint(ctx, Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: 0.7, u1: 1, inf: 1.5 }), ch.wrap, { far, folds: [[0.2, 2, 1.2, 0.9], [0.5, 2, 1.2, 0.9], [0.8, 2, 1.2, 0.9]], foldA: 0.25 });
        Dr.hand(ctx, J['wrist' + s], A['hd' + s], hType, ch, { far });
        Dr.paint(ctx, ua, ch.skin, Object.assign({ spec: 0.16, folds: [[0.32, 10, 1.6, 0.6]], foldA: 0.18 }, o));
      } else {
        Dr.paint(ctx, fa, ch.suit, o);
        Dr.paint(ctx, Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: 0.28, u1: 0.98, inf: 3 }), ch.armour, { far, spec: 0.2 });
        const g = Dr.limb(J['elbow' + s], A['fa' + s], B.farm, ch.farm, { u0: 0.35, u1: 0.92, inf: 3 });
        ctx.strokeStyle = Dr.alpha(ch.glow, far ? 0.4 : 0.9); ctx.lineWidth = 3; Dr.smoothPath(ctx, g.front, false); ctx.stroke();
        Dr.hand(ctx, J['wrist' + s], A['hd' + s], hType, ch, { far });
        Dr.paint(ctx, ua, ch.suit, Object.assign({ spec: 0.15 }, o));
        const pd = Dr.limb(J.shoulder, A['ua' + s], B.uarm, ch.uarm, { u0: -0.1, u1: 0.3, inf: 4 });
        Dr.paint(ctx, pd, ch.armour, { far, spec: 0.25 });
        ctx.strokeStyle = Dr.alpha(ch.glow, far ? 0.35 : 0.8); ctx.lineWidth = 2.5; Dr.smoothPath(ctx, pd.back.slice(-3).concat(pd.front.slice(-1)), false); ctx.stroke();
      }
    }
    torsoProfiles() {
      const ch = this.ch, b = this.breath || 0;
      const fr = ch.torsoFront.map(r => [r[0], r[1] + (r[0] > 0.5 && r[0] < 0.97 ? b * 2.4 : 0)]);
      const bk = ch.torsoBack.map(r => [r[0], r[1] + (r[0] > 0.6 && r[0] < 0.97 ? b * 1.2 : 0)]);
      return { fr, bk };
    }
    torso(ctx) {
      const J = this.J, ch = this.ch, T = Dr.torsoMap(J, ch.bones), { fr, bk } = this.torsoProfiles();
      const fv = u => Dr.profAt(fr.map(r => [r[0], r[1], r[1]]), u)[0];
      if (ch.id === 'kai') {
        Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { inf: 3 }), ch.gi, { rim: ch.rim, folds: [[0.3, -14, 3, 0.7], [0.55, -10, 2.5, 0.6]], foldA: 0.45, light: 1.6 });
        // open V of the gi: chest skin
        const us = [1, 0.95, 0.88, 0.8, 0.7, 0.6];
        const outer = us.map(u => T(u, fv(u) + 1));
        const inner = [T(0.64, fv(0.64) - 6), T(0.76, fv(0.76) - 20), T(0.88, fv(0.88) - 22), T(0.98, fv(0.98) - 14)];
        const pts = outer.concat(inner);
        Dr.smoothPath(ctx, pts, true);
        const m = T(0.8, fv(0.8)), mi = T(0.8, fv(0.8) - 30), g = ctx.createLinearGradient(m.x, m.y, mi.x, mi.y);
        g.addColorStop(0, Dr.shade(ch.skin, 1.3)); g.addColorStop(1, Dr.shade(ch.skin, 0.7));
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.outline; ctx.stroke();
        ctx.strokeStyle = 'rgba(70,30,15,0.3)'; ctx.lineWidth = 2; Dr.smoothPath(ctx, [T(0.66, fv(0.66) - 2), T(0.7, fv(0.7) - 9)], false); ctx.stroke(); // pec line
        ctx.lineCap = 'round'; ctx.strokeStyle = C.outline; ctx.lineWidth = 9; Dr.smoothPath(ctx, inner, false); ctx.stroke();
        ctx.strokeStyle = ch.giTrim; ctx.lineWidth = 6.5; ctx.stroke();
      } else {
        Dr.paint(ctx, Dr.torsoShape(T, fr, bk), ch.suit, { rim: ch.rim, spec: 0.14 });
        // chest armour plate
        const us = [0.6, 0.68, 0.78, 0.86, 0.93];
        const plate = us.map(u => T(u, fv(u) + 3)).concat([T(0.95, fv(0.95) * 0.1), T(0.78, -6), T(0.6, fv(0.6) * 0.05)]);
        Dr.smoothPath(ctx, plate, true);
        const a = T(0.8, 60), b = T(0.8, -20), g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, ch.armourHi); g.addColorStop(1, Dr.shade(ch.armour, 0.6));
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.outline; ctx.stroke();
        ctx.strokeStyle = Dr.alpha(ch.glow, 0.85); ctx.lineWidth = 2.5; Dr.smoothPath(ctx, us.map(u => T(u, fv(u) - 6)), false); ctx.stroke();
        // segmented abdomen plates
        for (const [u0, u1] of [[0.48, 0.56], [0.38, 0.46], [0.28, 0.36]]) {
          const q = [T(u0, fv(u0) + 2), T(u1, fv(u1) + 2), T(u1, fv(u1) - 18), T(u0, fv(u0) - 18)];
          ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
          ctx.fillStyle = Dr.shade(ch.armour, 1.15); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 1.8; ctx.stroke();
        }
        // back spine plate
        const bv = u => Dr.profAt(bk.map(r => [r[0], r[1], r[1]]), u)[0];
        const bp = [0.55, 0.66, 0.78, 0.9].map(u => T(u, -bv(u) - 3)).concat([T(0.9, -bv(0.9) * 0.45), T(0.55, -bv(0.55) * 0.5)]);
        Dr.smoothPath(ctx, bp, true); ctx.fillStyle = Dr.shade(ch.armour, 0.9); ctx.fill(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    waist(ctx) {
      const J = this.J, ch = this.ch, T = Dr.torsoMap(J, ch.bones), { fr, bk } = this.torsoProfiles();
      if (ch.id === 'kai') {
        const flapF = [[-0.3, 34], [-0.15, 42], [0.0, 43], [0.08, 42]], flapB = [[-0.3, 30], [-0.15, 44], [0.0, 49], [0.08, 47]];
        Dr.paint(ctx, Dr.torsoShape(T, flapF, flapB), ch.gi, { rim: ch.rim, folds: [[0.4, 10, 2.5, 0.8]], foldA: 0.45, light: 1.6 });
        const tr = Dr.torsoShape(T, flapF, flapB);
        ctx.strokeStyle = ch.giTrim; ctx.lineWidth = 5; Dr.smoothPath(ctx, tr.front, false); ctx.stroke();
        Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.03, u1: 0.1, inf: 6 }), ch.belt, { light: 2.2 });
        const c = this.chains;
        Dr.ribbon(ctx, c.belt2.p, 10, 9, '#2a2830', '#0b0a0d');
        Dr.ribbon(ctx, c.belt1.p, 11, 10, '#3a3742', '#121116');
        const k = this.beltPt(); ctx.fillStyle = '#1d1b20'; ctx.strokeStyle = C.outline; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(k.x, k.y, 10, 9, 0, 0, 7); ctx.fill(); ctx.stroke();
      } else {
        Dr.paint(ctx, Dr.torsoShape(T, fr, bk, { u0: -0.03, u1: 0.12, inf: 4 }), ch.armour, { spec: 0.2 });
        Dr.glowDot(ctx, T(0.05, 46), 14, ch.glow);
      }
    }
    neck(ctx) {
      const J = this.J, ch = this.ch, a = -J.ang.neck, len = Math.hypot(J.head.x - J.neckBase.x, J.head.y - J.neckBase.y) + 14;
      const nk = Dr.limb(J.head, a, len, ch.neck);
      Dr.paint(ctx, nk, ch.skin, { rim: ch.rim, light: 1.05, folds: [[0.15, 6, 8, 0.9]], foldA: 0.25 });
      if (ch.id === 'nova') Dr.paint(ctx, Dr.limb(J.head, a, len, ch.neck, { u0: 0.6, u1: 1, inf: 3 }), ch.armour, { spec: 0.2 });
    }
    fx(ctx) {
      const J = this.J, ch = this.ch, p = this.pose;
      if (p.orb > 0.05) {
        const w = J.wristF, c = { x: w.x + 70, y: w.y - 6 }, r = 46 * p.orb;
        Dr.glowDot(ctx, c, r * 2.2, ch.glow, p.orb);
        ctx.strokeStyle = 'rgba(220,250,255,' + 0.9 * p.orb + ')'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) {
          const a0 = this.t * 7 + i * 1.05; ctx.beginPath(); ctx.moveTo(c.x, c.y);
          for (let k = 1; k <= 4; k++) { const rr = r * 1.4 * k / 4, aa = a0 + Math.sin(this.t * 31 + i * 3 + k) * 0.5; ctx.lineTo(c.x + Math.cos(aa) * rr, c.y + Math.sin(aa) * rr); }
          ctx.stroke();
        }
        Dr.glowDot(ctx, c, r * 0.7, '#ffffff', p.orb);
      }
      if (p.streak > 0.05) {
        const a = J.ankleF;
        for (let i = 0; i < 5; i++) {
          const y = a.y - 40 + i * 20, l = 160 + (i % 2) * 90;
          const g = ctx.createLinearGradient(a.x, y, a.x - l, y);
          g.addColorStop(0, 'rgba(255,200,120,' + 0.8 * p.streak + ')'); g.addColorStop(0.4, 'rgba(255,60,70,' + 0.5 * p.streak + ')'); g.addColorStop(1, 'rgba(255,40,80,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 7 - Math.abs(i - 2) * 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.x - 10, y); ctx.lineTo(a.x - l, y + 10); ctx.stroke();
        }
        Dr.glowDot(ctx, { x: a.x + 30, y: a.y - 10 }, 70, '#ff5a3a', p.streak * 0.8);
      }
    }
    topY() { return this.J.head.y - 66 * this.ch.headScale; }
  }
  NF.Fighter = Fighter;
})();
