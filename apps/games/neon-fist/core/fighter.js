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
      this.ch = ch; this.poses = NF.poses[ch.poseSet || ch.id]; this.t = Math.random() * 5;
      this.action = 'idle'; this.actT = 0; this.hold = false; this.blink = 0; this.nextBlink = 1.5; this.acc = 0;
      // headband tails go with spiky hair, belt tails with the gi, a ponytail with tied-back hair
      this.chains = {};
      if (ch.hairStyle === 'spiky' && !NF.gear.hidesHair(ch)) { this.chains.band1 = new Chain(7, 21, { x: -2600, y: -900 }, 0.4); this.chains.band2 = new Chain(6, 21, { x: -2200, y: -500 }, 0.5); }
      if (NF.outfits.hasTails(ch)) {
        const sash = NF.outfits.slots(ch).waist === 'sash';   // sash tails hang longer than belt tails (R2c1)
        this.chains.belt1 = new Chain(sash ? 8 : 5, sash ? 20 : 18, { x: 300, y: 0 }); this.chains.belt2 = new Chain(sash ? 7 : 5, sash ? 19 : 17, { x: 120, y: 0 });
      }
      if (ch.hairStyle === 'tail' && NF.gear.gear(ch).head !== 'hood') this.chains.tail = new Chain(10, 25, { x: -2600, y: -4200 });
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
      if (c.band1) { const k = this.headPt(-54, -28); c.band1.step(k, dt, wind); c.band2.step({ x: k.x, y: k.y + 3 }, dt, wind * 0.8); }
      if (c.belt1) { const b = this.beltPt(); c.belt1.step(b, dt, wind * 0.3); c.belt2.step({ x: b.x - 3, y: b.y }, dt, wind * 0.25); }
      if (c.tail) c.tail.step(this.headPt(-38, -64), dt, wind * 1.2);
    }

    // ---------------- drawing ----------------
    draw(ctx, x, gy, scale, facing) {
      ctx.save(); ctx.translate(x, gy); ctx.scale(scale * facing, scale);
      const J = this.J, ch = this.ch;
      this.shadow(ctx);
      const lift = NF.gear.lift(ch); if (lift) ctx.translate(0, -lift);   // R2c3: heels raise the stance
      if (this.chains.band1) {
        const c = this.chains, pk = ch.band;
        Dr.ribbon(ctx, c.band2.p, 11, 7, Dr.shade(pk, 0.62), Dr.shade(pk, 0.5));
        Dr.ribbon(ctx, c.band1.p, 12, 8, Dr.shade(pk, 0.95), Dr.shade(pk, 0.7));
      }
      if (this.chains.tail) Dr.ponytail(ctx, this.chains.tail.p, ch, this.t);
      this.arm(ctx, 'B', true); this.leg(ctx, 'B', true);
      this.torso(ctx);
      this.leg(ctx, 'F', false);
      this.waist(ctx);
      this.neck(ctx);
      Dr.head(ctx, J, ch, { blink: this.blink, angry: this.pose.angry || 0, pain: this.pose.pain || 0 });
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
    leg(ctx, s, far) { NF.outfits.leg(this, ctx, s, far); }
    arm(ctx, s, far) { NF.outfits.arm(this, ctx, s, far); }
    torsoProfiles() {
      const ch = this.ch, b = this.breath || 0;
      // 3/4 turn: the chest opens toward the camera with twist (front wider, back foreshortened)
      const tw = this.pose.twist || 0, kf = 1 + 0.04 + 0.08 * tw, kb = 1 - 0.03 - 0.07 * tw;
      const fr = ch.torsoFront.map(r => [r[0], (r[1] + (r[0] > 0.5 && r[0] < 0.97 ? b * 2.4 : 0)) * (r[0] > 0.35 ? kf : 1)]);
      const bk = ch.torsoBack.map(r => [r[0], (r[1] + (r[0] > 0.6 && r[0] < 0.97 ? b * 1.2 : 0)) * (r[0] > 0.35 ? kb : 1)]);
      return { fr, bk };
    }
    torso(ctx) { NF.outfits.torso(this, ctx); }
    waist(ctx) { NF.outfits.waist(this, ctx); }
    neck(ctx) { NF.outfits.neck(this, ctx); }
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
