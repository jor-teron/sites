// Character viewer: inspect Kai and Nova, preview poses, flip facing, versus layout.
(function () {
  const C = NF.config, CH = NF.characters;
  const V = NF.viewer = {
    idx: 0, facing: 1, versus: false, hold: false, fighters: {}, t: 0,
    init() {
      for (const c of CH.list) this.fighters[c.id] = new NF.Fighter(c);
      this.vsOther = new NF.Fighter(CH.list[1]);
      document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => this.pose(b.dataset.pose)));
      document.querySelectorAll('[data-char]').forEach(b => b.addEventListener('click', () => this.select(+b.dataset.char)));
      const on = (id, f) => { const e = document.getElementById(id); if (e) e.addEventListener('click', f); };
      on('prevBtn', () => this.select(this.idx - 1)); on('nextBtn', () => this.select(this.idx + 1));
      on('flipBtn', () => this.flip()); on('vsBtn', () => this.toggleVersus()); on('holdBtn', () => this.toggleHold());
      addEventListener('keydown', e => this.key(e));
      this.updatePanel();
    },
    get cur() { return this.fighters[CH.list[this.idx].id]; },
    select(i) { this.idx = (i + CH.list.length) % CH.list.length; this.vsOther = new NF.Fighter(CH.list[1 - this.idx]); this.updatePanel(); },
    pose(name) { this.cur.play(name, this.hold); if (this.versus) this.vsOther.play(name, this.hold); this.updatePanel(name); },
    flip() { this.facing *= -1; },
    toggleVersus() { this.versus = !this.versus; this.updatePanel(); },
    toggleHold() { this.hold = !this.hold; this.cur.hold = this.hold; this.vsOther.hold = this.hold; this.updatePanel(); },
    key(e) {
      const k = e.key.toLowerCase(), names = NF.poses.names;
      if (k === 'arrowleft') this.select(this.idx - 1);
      else if (k === 'arrowright') this.select(this.idx + 1);
      else if (k === '1' || k === '2') this.select(+k - 1);
      else if (k === 'f') this.flip();
      else if (k === 'v') this.toggleVersus();
      else if (k === 'h') this.toggleHold();
      else if (k === 'g') NF.main.toggleFps();
      else { const m = { i: 'idle', p: 'punch', j: 'punch', k: 'kick', b: 'block', l: 'block', s: 'special', u: 'special' }[k]; if (m) this.pose(m); else return; }
      e.preventDefault();
    },
    updatePanel(active) {
      const c = CH.list[this.idx], $ = id => document.getElementById(id);
      if (!$('cName')) return;
      $('cName').textContent = c.name; $('cName').style.color = c.accent;
      $('cTitle').textContent = c.title; $('cDesc').textContent = c.desc;
      $('cStats').innerHTML = Object.entries(c.stats).map(([k, v]) => `<div><span>${k}</span><i style="--v:${v / 5};--c:${c.accent}"></i></div>`).join('');
      document.querySelectorAll('[data-char]').forEach(b => b.classList.toggle('on', +b.dataset.char === this.idx));
      document.querySelectorAll('[data-pose]').forEach(b => b.classList.toggle('on', b.dataset.pose === (active || this.cur.action)));
      $('vsBtn').classList.toggle('on', this.versus); $('holdBtn').classList.toggle('on', this.hold);
      document.body.classList.toggle('versus', this.versus);
    },
    update(dt) {
      this.t += dt; this.cur.update(dt); if (this.versus) this.vsOther.update(dt);
      const b = document.querySelector('[data-pose].on'); if (b && b.dataset.pose !== this.cur.action && !this.hold) this.updatePanel();
    },
    // Layout used for drawing and for the height-ratio measurement
    layout(W, H) {
      const gy = H * C.groundRatio, f = this.cur, s = (C.heightRatio * H) / f.idleH;
      if (!this.versus) return [{ f, x: W / 2, gy, s, facing: this.facing }];
      const o = this.vsOther, so = (C.heightRatio * H) / o.idleH;
      return [{ f, x: W * (0.5 - C.versusGap), gy, s, facing: 1 }, { f: o, x: W * (0.5 + C.versusGap), gy, s: so, facing: -1 }];
    },
    render(ctx, W, H) {
      NF.stage.draw(ctx, W, H, H * C.groundRatio, this.t);
      for (const L of this.layout(W, H)) L.f.draw(ctx, L.x, L.gy, L.s, L.facing);
      if (this.versus) NF.hud.draw(ctx, W, H, this.cur.ch, this.vsOther.ch, this.t);
    },
    // Height of the idle fighter(s) in pixels / canvas height
    measure(W, H) {
      return this.layout(W, H).map(L => ({ id: L.f.ch.id, ratio: (L.gy - (L.gy + L.f.topY() * L.s)) / H }));
    }
  };
})();
