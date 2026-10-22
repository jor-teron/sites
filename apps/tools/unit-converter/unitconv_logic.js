/* Unit Converter logic. Settings 'unitconv-settings-v1': { theme:'system'|'light'|'dark', prec:2|4|6 }.
   State 'unitconv-state-v1': { mode:'conv'|'set', cat, units:{ [cat]:[from,to] }, value, side:'from'|'to' }. */
(function () {
  'use strict';
  const SKEY = 'unitconv-settings-v1', KEY = 'unitconv-state-v1', VERSION = '1.0', SWIPE = 75, MOVE = 10;
  const MODES = ['conv', 'set'], CATS = window.UNITS;
  const $ = (id) => document.getElementById(id);
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (_) { return {}; } };
  const P = Object.assign({ theme: 'dark', prec: 4 }, load(SKEY));
  const S = Object.assign({ mode: 'conv', cat: 'length', units: {}, value: '1', side: 'from' }, load(KEY));
  if (!CATS.some((c) => c.id === S.cat)) S.cat = 'length';
  if (!MODES.includes(S.mode)) S.mode = 'conv';
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* */ } };

  function theme() {
    const t = localStorage.getItem('sites-hub.theme');
    const dark = P.theme === 'dark' || (P.theme === 'system' && (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', dark);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);

  /* conversion */
  const cat = () => CATS.find((c) => c.id === S.cat);
  const unit = (c, id) => c.u.find((u) => u[0] === id) || c.u[0];
  function pair() {
    const c = cat(), p = S.units[c.id];
    const ok = p && c.u.some((u) => u[0] === p[0]) && c.u.some((u) => u[0] === p[1]);
    return ok ? p : (S.units[c.id] = c.def.slice());
  }
  function toBase(c, u, v) { return c.affine ? (v + u[3]) * u[2] : v * u[2]; }
  function fromBase(c, u, b) { return c.affine ? b / u[2] - u[3] : b / u[2]; }
  function convert(v, fromId, toId) { const c = cat(); return fromBase(c, unit(c, toId), toBase(c, unit(c, fromId), v)); }
  function fmt(v) {
    if (!isFinite(v)) return '';
    const p = +P.prec, a = Math.abs(v);
    if (v === 0) return '0';
    const trim = (s) => s.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
    if (a >= 1e15 || a < Math.pow(10, -p)) return trim(v.toExponential(p)).replace('e+', 'e');
    let s = trim((Math.round(v * Math.pow(10, p)) / Math.pow(10, p)).toFixed(p));
    return s === '-0' ? '0' : s;
  }
  function parse(s) {
    s = String(s).replace(/[,\s_]/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  }

  /* render */
  const chips = $('chips'), vf = $('v-from'), vt = $('v-to'), uf = $('u-from'), ut = $('u-to');
  CATS.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.cat = c.id; b.textContent = c.name; b.setAttribute('role', 'tab');
    b.onclick = () => { if (gest && gest.moved) return; S.cat = c.id; save(); fillSelects(); compute(); renderChips(); };
    chips.appendChild(b);
  });
  function renderChips() {
    chips.querySelectorAll('.chip').forEach((b) => { const on = b.dataset.cat === S.cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  }
  function fillSelects() {
    const c = cat(), p = pair();
    [uf, ut].forEach((sel, i) => { sel.innerHTML = ''; c.u.forEach((u) => { const o = document.createElement('option'); o.value = u[0]; o.textContent = u[1]; sel.appendChild(o); }); sel.value = p[i]; });
  }
  function compute() {
    const p = pair(), src = S.side === 'to' ? vt : vf, dst = S.side === 'to' ? vf : vt;
    if (document.activeElement !== src || src.value === '') src.value = S.value;
    const v = parse(S.value);
    dst.value = isNaN(v) ? '' : fmt(S.side === 'to' ? convert(v, p[1], p[0]) : convert(v, p[0], p[1]));
    const one = convert(1, p[0], p[1]), c = cat();
    $('formula').textContent = c.affine ? '' : '1 ' + p[0] + ' = ' + fmt(one) + ' ' + p[1];
    $('note').textContent = /^bigha|^katha|^lessa/.test(p[0] + ' ' + p[1]) || /bigha|katha|lessa/.test(p.join()) ? 'Bigha / katha vary by state and district.' : '';
  }
  function onType(side, el) { S.side = side; S.value = el.value; save(); compute(); }
  vf.addEventListener('input', () => onType('from', vf));
  vt.addEventListener('input', () => onType('to', vt));
  uf.onchange = () => { pair()[0] = uf.value; save(); compute(); };
  ut.onchange = () => { pair()[1] = ut.value; save(); compute(); };
  function swap() {
    const p = pair(); p.reverse();
    S.value = (S.side === 'to' ? vt : vf).value; S.side = S.side === 'to' ? 'from' : 'to';
    fillSelects(); save(); compute();
  }
  $('swap').onclick = swap;

  /* screens */
  const track = $('track'), app = $('app');
  function place(dx) { track.style.transform = 'translateX(calc(' + (-MODES.indexOf(S.mode) * 100 / MODES.length) + '% + ' + (dx || 0) + 'px))'; }
  function setMode(m) { S.mode = m; save(); place(0); render(); }
  function step(d) { setMode(MODES[(MODES.indexOf(S.mode) + d + MODES.length) % MODES.length]); }
  function render() {
    document.querySelectorAll('.dot').forEach((d) => d.classList.toggle('on', d.dataset.mode === S.mode));
    document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(P[g.dataset.key]) === b.dataset.v)));
  }
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode); });
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = g.dataset.key === 'prec' ? +b.dataset.v : b.dataset.v; saveP(); theme(); render(); compute();
  }));
  $('ver').textContent = 'v' + VERSION;

  /* swipe: never from inputs / selects / the chip scroller */
  const blocked = (el) => el.closest && el.closest('input, select, textarea, #chips');
  let gest = null;
  app.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gest = { x: e.clientX, y: e.clientY, id: e.pointerId, off: !!blocked(e.target), axis: null, moved: false };
  });
  app.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const dx = e.clientX - gest.x, dy = e.clientY - gest.y;
    if (!gest.axis && (Math.abs(dx) > MOVE || Math.abs(dy) > MOVE)) { gest.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; gest.moved = true; }
    if (gest.axis === 'x' && !gest.off) { track.classList.add('drag'); place(dx * 0.6); }
  });
  function end(e, cancel) {
    if (!gest || e.pointerId !== gest.id) return;
    const dx = e.clientX - gest.x, dy = e.clientY - gest.y, g = gest;
    setTimeout(() => { if (gest === g) gest = null; }, 0);
    track.classList.remove('drag');
    if (!cancel && !g.off && g.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
    place(0);
  }
  app.addEventListener('pointerup', (e) => end(e, false));
  app.addEventListener('pointercancel', (e) => end(e, true));

  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && t.closest && t.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key.toLowerCase() === 's' && S.mode === 'conv') swap();
  });
  addEventListener('storage', (e) => {
    if (e.key === SKEY || e.key === 'sites-hub.theme') { if (e.key === SKEY) Object.assign(P, load(SKEY)); theme(); render(); compute(); }
  });

  theme(); fillSelects(); renderChips(); compute(); place(0); render();
})();
