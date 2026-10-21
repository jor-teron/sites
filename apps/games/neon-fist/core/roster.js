// Fighter-select roster: 10x10 grid of generated fighters 00-99 with cached portraits,
// live preview panel, P1/P2 picking and Fight (opens the versus view via ?f=NN&vs=NN).
(function () {
  const CH = NF.characters, $ = id => document.getElementById(id), pad = n => String(n).padStart(2, '0');
  const R = NF.roster = {
    open: false, picks: [], focus: null, chars: {}, firstMs: 0, allMs: 0, drawn: 0,
    // key: fighter number 0..99
    ch(k) { if (!this.chars[k]) this.chars[k] = typeof k === 'number' ? NF.generate(k) : CH[k]; return this.chars[k]; },
    init() {
      this.el = $('roster'); this.grid = $('rGrid');
      for (let n = 0; n < 100; n++) this.grid.appendChild(this.tile(n));
      this.pv = $('rCanvas'); this.pctx = this.pv.getContext('2d');
      $('rFight').addEventListener('click', () => this.fight());
      $('rClear').addEventListener('click', () => { this.picks = []; this.mark(); });
      $('rViewer').addEventListener('click', () => this.hide());
      $('rosterBtn').addEventListener('click', () => this.show());
      $('rPrev').addEventListener('click', () => this.step(-1));
      $('rNext').addEventListener('click', () => this.step(1));
      $('rRand').addEventListener('click', () => this.rand());
      const box = $('rNum');
      box.addEventListener('input', () => { box.value = box.value.replace(/\D/g, '').slice(0, 2); if (box.value.length === 2) this.preview(+box.value, true); });
      box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && box.value) { this.toggle(+box.value); box.blur(); } else if (e.key === 'Escape') box.blur(); });
      addEventListener('keydown', e => this.key(e), true);
      this.preview(1); this.mark();
      // first paint: render the visible portraits now, the rest in small batches
      const t0 = performance.now(), all = [...this.el.querySelectorAll('canvas.pt')];
      const batch = () => {
        for (let i = 0; i < 12 && all.length; i++) this.portrait(all.shift());
        if (!this.firstMs && this.drawn >= 22) this.firstMs = Math.round(performance.now() - t0);
        if (all.length) requestAnimationFrame(batch); else this.allMs = Math.round(performance.now() - t0);
      };
      batch();
      let last = 0; const loop = ts => { const dt = Math.min(0.1, (ts - (last || ts)) / 1000); last = ts; if (this.open) this.anim(dt); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    tile(k) {
      const c = this.ch(k), b = document.createElement('button');
      b.className = 'tile' + (typeof k === 'number' ? (k % 2 ? ' m' : ' f') : ' hand'); b.dataset.k = k;
      b.style.setProperty('--g', c.accent);
      b.innerHTML = `<canvas class="pt" width="1" height="1"></canvas><span class="no">${typeof k === 'number' ? pad(k) : '★'}</span>` +
        `<span class="nm">${c.name}</span><i class="bar"></i><b class="pk"></b>`;
      b.addEventListener('mouseenter', () => this.preview(this.key2(b)));
      b.addEventListener('focus', () => this.preview(this.key2(b)));
      b.addEventListener('click', () => this.toggle(this.key2(b)));
      return b;
    },
    key2(b) { return /^\d+$/.test(b.dataset.k) ? +b.dataset.k : b.dataset.k; },
    // Head-and-shoulders portrait, drawn once into the tile's own canvas (the cache)
    portrait(cv) {
      const k = this.key2(cv.parentNode), f = new NF.Fighter(this.ch(k)), S = 96, dpr = Math.min(2, devicePixelRatio || 1);
      for (let i = 0; i < 40; i++) f.update(1 / 60);           // settle hair/cloth physics
      cv.width = cv.height = S * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      // crop framed on the head, not the body height, so short and tall fighters frame alike (R2c1)
      const hs = f.ch.headScale, s = S / (300 * hs), top = -f.topY() * s, hx = f.J.head.x * s;
      f.draw(x, S * 0.5 - hx * 0.75, top + 5, s, 1);
      this.drawn++;
    },
    preview(k, scroll) {
      if (k === null || k === undefined) return;
      this.focus = k; const c = this.ch(k); this.pf = new NF.Fighter(c); for (let i = 0; i < 20; i++) this.pf.update(1 / 60); this.pt = 0.5; this.face = 1;
      $('rName').textContent = c.name; $('rName').style.color = c.accent;
      $('rTitle').textContent = c.title; $('rDesc').textContent = c.desc;
      $('rStats').innerHTML = Object.entries(c.stats).map(([s, v]) => `<div><span>${s}</span><i style="--v:${v / 5};--c:${c.accent}"></i></div>`).join('');
      const box = $('rNum'); if (document.activeElement !== box) box.value = typeof k === 'number' ? pad(k) : '';
      this.el.querySelectorAll('.tile.hov').forEach(t => t.classList.remove('hov'));
      const t = this.el.querySelector(`.tile[data-k="${k}"]`); if (t) { t.classList.add('hov'); if (scroll) t.scrollIntoView({ block: 'nearest' }); }
    },
    anim(dt) {
      const cv = this.pv, r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (!r.width || !this.pf) return;
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      this.pt += dt; this.pf.update(dt);
      // 2D side-view model: "turning" = face the other way every 3 s with a quick squash
      const ph = (this.pt % 6) / 6, fc = ph < 0.5 ? 1 : -1, sq = Math.min(1, Math.abs(ph - 0.5) * 40, Math.min(ph, 1 - ph) * 40);
      const x = this.pctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
      const s = (r.height * 0.86) / this.pf.idleH;
      x.save(); x.translate(r.width / 2, 0); x.scale(Math.max(0.05, sq), 1); x.translate(-r.width / 2, 0);
      this.pf.draw(x, r.width / 2, r.height * 0.95, s, fc); x.restore();
    },
    toggle(k) {
      const i = this.picks.indexOf(k);
      if (i >= 0) this.picks.splice(i, 1); else if (this.picks.length < 2) this.picks.push(k); else this.picks[1] = k;
      this.preview(k); this.mark();
    },
    mark() {
      this.el.querySelectorAll('.tile').forEach(t => {
        const i = this.picks.indexOf(this.key2(t)); t.classList.toggle('p1', i === 0); t.classList.toggle('p2', i === 1);
        t.querySelector('.pk').textContent = i < 0 ? '' : 'P' + (i + 1);
      });
      const nm = i => this.picks[i] === undefined ? '—' : (typeof this.picks[i] === 'number' ? pad(this.picks[i]) + ' ' : '') + this.ch(this.picks[i]).name;
      $('rP1').textContent = nm(0); $('rP2').textContent = nm(1);
      $('rFight').disabled = this.picks.length < 2;
    },
    url() {
      const [a, b] = this.picks; return `?f=${pad(a)}&vs=${pad(b)}`;
    },
    fight() { if (this.picks.length === 2) location.href = location.pathname + this.url(); },
    step(d) { const n = typeof this.focus === 'number' ? this.focus : (d > 0 ? -1 : 0); this.preview((n + d + 100) % 100, true); },
    rand() { let n; do n = Math.floor(Math.random() * 100); while (n === this.focus); this.preview(n, true); },
    key(e) {
      if (!this.open) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft') this.step(-1); else if (k === 'arrowright') this.step(1);
      else if (k === 'arrowup') this.step(-10); else if (k === 'arrowdown') this.step(10);
      else if (k === 'r') this.rand();
      else if (k === 'enter' && !(t && t.tagName === 'BUTTON')) this.toggle(this.focus);
      else if (k === 'escape') this.hide();
      else if (k === 'f' && this.picks.length === 2) this.fight();
      else { e.stopImmediatePropagation(); return; }                 // swallow other game keys while the roster is open
      e.preventDefault(); e.stopImmediatePropagation();
    },
    show() { this.open = true; document.body.classList.add('roster'); },
    hide() {
      this.open = false; document.body.classList.remove('roster');
      if (typeof this.focus === 'number') NF.viewer.showGen(this.focus);
    }
  };
})();
