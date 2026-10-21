// Character viewer: inspect Kai, Nova and generated fighters 00-99, preview poses, flip facing, versus layout.
(function () {
  const C = NF.config, CH = NF.characters;
  const V = NF.viewer = {
    idx: 0, gen: null, genF: null, facing: 1, versus: false, hold: false, fighters: {}, t: 0,
    init() {
      for (const c of CH.list) this.fighters[c.id] = new NF.Fighter(c);
      this.vsOther = new NF.Fighter(CH.list[1]);
      document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => this.pose(b.dataset.pose)));
      document.querySelectorAll('[data-char]').forEach(b => b.addEventListener('click', () => this.select(+b.dataset.char)));
      const on = (id, f) => { const e = document.getElementById(id); if (e) e.addEventListener('click', f); };
      on('prevBtn', () => this.select(this.idx - 1)); on('nextBtn', () => this.select(this.idx + 1));
      on('flipBtn', () => this.flip()); on('vsBtn', () => this.toggleVersus()); on('holdBtn', () => this.toggleHold());
      on('genPrev', () => this.showGen(this.gen === null ? 99 : this.gen - 1));
      on('genNext', () => this.showGen(this.gen === null ? 0 : this.gen + 1));
      on('genRand', () => this.randomGen());
      const box = document.getElementById('genNum');
      if (box) {
        box.addEventListener('input', () => {
          box.value = box.value.replace(/\D/g, '').slice(0, 2);
          if (box.value.length === 2) this.showGen(+box.value);
        });
        box.addEventListener('keydown', e => { if (e.key === 'Enter' && box.value) { this.showGen(+box.value); box.blur(); } else if (e.key === 'Escape') box.blur(); });
        box.addEventListener('blur', () => { box.value = this.gen === null ? '' : String(this.gen).padStart(2, '0'); });
      }
      addEventListener('keydown', e => this.key(e));
      this.updatePanel();
    },
    get cur() { return this.gen !== null ? this.genF : this.fighters[CH.list[this.idx].id]; },
    select(i) { this.gen = null; this.genF = null; const box = document.getElementById('genNum'); if (box) box.value = ''; this.idx = (i + CH.list.length) % CH.list.length; this.vsOther = new NF.Fighter(CH.list[1 - this.idx]); this.updatePanel(); },
    // Generated fighter NN; the versus opponent is fighter `vs` (default: the next number)
    showGen(n, vs) {
      this.gen = ((n % 100) + 100) % 100; this.genF = new NF.Fighter(NF.generate(this.gen));
      const o = vs === undefined ? (this.gen + 1) % 100 : vs;
      this.vsOther = new NF.Fighter(typeof o === 'number' ? NF.generate(o) : o);
      if (this.hold) { this.genF.hold = true; this.vsOther.hold = true; }
      const box = document.getElementById('genNum'); if (box && document.activeElement !== box) box.value = String(this.gen).padStart(2, '0');
      this.updatePanel();
    },
    randomGen() { let n; do n = Math.floor(Math.random() * 100); while (n === this.gen); this.showGen(n); },
    pose(name) { this.cur.play(name, this.hold); if (this.versus) this.vsOther.play(name, this.hold); this.updatePanel(name); },
    flip() { this.facing *= -1; },
    toggleVersus() { this.versus = !this.versus; this.updatePanel(); },
    toggleHold() { this.hold = !this.hold; this.cur.hold = this.hold; this.vsOther.hold = this.hold; this.updatePanel(); },
    key(e) {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;   // typing in the number box
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase(), names = NF.poses.names;
      if (k === 'arrowleft') this.gen !== null ? this.showGen(this.gen - 1) : this.select(this.idx - 1);
      else if (k === 'arrowright') this.gen !== null ? this.showGen(this.gen + 1) : this.select(this.idx + 1);
      else if (k === 'r') this.randomGen();
      else if (k === '1' || k === '2') this.select(+k - 1);
      else if (k === 'f') this.flip();
      else if (k === 'v') this.toggleVersus();
      else if (k === 'h') this.toggleHold();
      else if (k === 'g') NF.main.toggleFps();
      else { const m = { i: 'idle', p: 'punch', j: 'punch', k: 'kick', b: 'block', l: 'block', s: 'special', u: 'special' }[k]; if (m) this.pose(m); else return; }
      e.preventDefault();
    },
    updatePanel(active) {
      const c = this.cur.ch, $ = id => document.getElementById(id);
      if (!$('cName')) return;
      $('cName').textContent = c.name; $('cName').style.color = c.accent;
      $('cTitle').textContent = c.title; $('cDesc').textContent = c.desc;
      $('cStats').innerHTML = Object.entries(c.stats).map(([k, v]) => `<div><span>${k}</span><i style="--v:${v / 5};--c:${c.accent}"></i></div>`).join('');
      document.querySelectorAll('[data-char]').forEach(b => b.classList.toggle('on', this.gen === null && +b.dataset.char === this.idx));
      const gr = document.querySelector('.gen'); if (gr) gr.classList.toggle('on', this.gen !== null);
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
      // Versus: one shared scale set by the taller fighter (Kai at 70%), so Nova stands naturally shorter.
      const o = this.vsOther, tall = Math.max(f.idleH, o.idleH), sv = (C.heightRatio * H) / tall;
      return [{ f, x: W * (0.5 - C.versusGap), gy, s: sv, facing: 1 }, { f: o, x: W * (0.5 + C.versusGap), gy, s: sv, facing: -1 }];
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
