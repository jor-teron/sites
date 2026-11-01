/**
 * Browser FPS — on-screen touch controls (PUBG-style). Keyboard + mouse always keep working; this only adds buttons.
 * Setting "Touch controls: On/Off" (start / pause screen) shows or hides them. Default On for touch devices, Off on PC.
 * ?touch=1 / ?touch=0 overrides. Settings (size, opacity, look sensitivity) saved in localStorage.
 *
 * createTouch(api) where api = { overlay, start(), pause(), playing(), look(dx, dy), setMove(x, y, sprint), setFire(b),
 *   toggleAim(), aiming(), jump(), reload(), nadeHold(), nadeRelease(), nadeCancel(), nadeHolding(), nearDoor(), useDoor(),
 *   canToggleMode(), toggleMode(), fight() } -> { enabled, update(), setEnabled(b) }
 */
const KEY = 'browser-fps-touch';
const SKEY = 'browser-fps-touch-settings';

export function createTouch(api) {
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const q = new URLSearchParams(location.search).get('touch');
  const saved = localStorage.getItem(KEY);
  let enabled = q === '1' ? true : q === '0' ? false : saved != null ? saved === '1' : isTouchDevice;
  const S = Object.assign({ size: 1, opacity: 0.6, sens: 1 }, JSON.parse(localStorage.getItem(SKEY) || '{}'));
  const saveS = () => localStorage.setItem(SKEY, JSON.stringify(S));

  // ── DOM ──
  const layer = document.createElement('div'); layer.id = 'touch-layer';
  layer.innerHTML = `
    <div id="tc-stick"><div id="tc-knob"></div></div>
    <button class="tc-btn" id="tc-sprint" data-a="sprint">RUN</button>
    <button class="tc-btn big" id="tc-fire" data-a="fire">FIRE</button>
    <button class="tc-btn" id="tc-fire2" data-a="fire">FIRE</button>
    <button class="tc-btn" id="tc-aim" data-a="aim">AIM</button>
    <button class="tc-btn" id="tc-jump" data-a="jump">JUMP</button>
    <button class="tc-btn" id="tc-reload" data-a="reload">R</button>
    <button class="tc-btn" id="tc-nade" data-a="nade">G</button>
    <button class="tc-btn" id="tc-use" data-a="use">E</button>
    <button class="tc-btn small" id="tc-mode" data-a="mode">M</button>
    <button class="tc-btn small" id="tc-pause" data-a="pause">II</button>
    <div id="tc-cancel">✕ cancel</div>`;
  document.body.appendChild(layer);
  const rotate = document.createElement('div'); rotate.id = 'tc-rotate'; rotate.textContent = '⟳ Rotate your phone to landscape';
  document.body.appendChild(rotate);
  const $ = (id) => layer.querySelector('#' + id);
  const stick = $('tc-stick'), knob = $('tc-knob'), cancelZone = $('tc-cancel');

  // Settings panel inside the start / pause overlay
  const panel = document.createElement('div'); panel.id = 'touch-settings';
  panel.innerHTML = `<button type="button" id="tc-toggle"></button>
    <span class="tc-opts">Size <input type="range" id="tc-size" min="0.7" max="1.5" step="0.05">
    Opacity <input type="range" id="tc-op" min="0.2" max="1" step="0.05">
    Look <input type="range" id="tc-sens" min="0.3" max="3" step="0.1"></span>`;
  api.overlay.insertBefore(panel, api.overlay.querySelector('p'));
  for (const ev of ['click', 'pointerdown', 'touchstart']) panel.addEventListener(ev, (e) => e.stopPropagation());
  const tgl = panel.querySelector('#tc-toggle');
  const bind = (id, k) => { const el = panel.querySelector('#' + id); el.value = S[k]; el.addEventListener('input', () => { S[k] = +el.value; saveS(); apply(); }); };
  bind('tc-size', 'size'); bind('tc-op', 'opacity'); bind('tc-sens', 'sens');
  tgl.addEventListener('click', () => setEnabled(!enabled));

  function apply() {
    document.body.classList.toggle('touch-on', enabled);
    layer.style.setProperty('--tc-size', S.size); layer.style.setProperty('--tc-op', S.opacity);
    tgl.textContent = 'Touch controls: ' + (enabled ? 'On' : 'Off');
    panel.querySelector('.tc-opts').style.display = enabled ? '' : 'none';
    checkRotate();
  }
  function setEnabled(b) { enabled = !!b; localStorage.setItem(KEY, enabled ? '1' : '0'); if (!enabled) releaseAll(); apply(); }
  function checkRotate() { rotate.classList.toggle('on', enabled && innerHeight > innerWidth); }
  addEventListener('resize', checkRotate);

  // Tap to start with touch (no pointer lock needed); mouse clicks still use pointer lock (handled in logic)
  api.overlay.addEventListener('pointerup', (e) => {
    if (!enabled || e.pointerType === 'mouse') return;
    e.preventDefault();
    const de = document.documentElement;
    if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    api.start();
  });

  // ── Pointer tracking (one record per pointerId → multi-touch safe) ──
  const ptrs = new Map();
  let move = { id: null, cx: 0, cy: 0, x: 0, y: 0 }, sprintLock = false;
  const R = () => 55 * S.size;
  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!api.playing()) return;
    layer.setPointerCapture?.(e.pointerId);
    const btn = e.target.closest('.tc-btn'), a = btn && btn.dataset.a;
    const rec = { a: a || null, lx: e.clientX, ly: e.clientY, btn };
    if (btn) btn.classList.add('down');
    if (!a) {
      if (e.clientX < innerWidth * 0.45 && move.id == null) {   // floating joystick
        move = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, y: 0 }; rec.a = 'move';
        stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on');
      } else rec.a = 'look';
    } else if (a === 'fire') api.setFire(true);
    else if (a === 'aim') api.toggleAim();
    else if (a === 'jump') api.jump();
    else if (a === 'reload') api.reload();
    else if (a === 'sprint') { sprintLock = !sprintLock; btn.classList.toggle('lock', sprintLock); pushMove(); }
    else if (a === 'nade') { if (api.nadeHold()) cancelZone.classList.add('on'); }
    else if (a === 'use') { const d = api.nearDoor(); if (d) api.useDoor(d); }
    else if (a === 'mode') api.toggleMode();
    else if (a === 'pause') { releaseAll(); api.pause(); return; }
    ptrs.set(e.pointerId, rec);
  });
  layer.addEventListener('pointermove', (e) => {
    const rec = ptrs.get(e.pointerId); if (!rec) return;
    e.preventDefault();
    const dx = e.clientX - rec.lx, dy = e.clientY - rec.ly; rec.lx = e.clientX; rec.ly = e.clientY;
    if (rec.a === 'move') {
      let x = e.clientX - move.cx, y = e.clientY - move.cy; const r = R(), d = Math.hypot(x, y);
      move.edge = d > r * 1.15;
      if (d > r) { x *= r / d; y *= r / d; }
      move.x = x / r; move.y = -y / r;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      pushMove();
    } else if (rec.a === 'look' || rec.a === 'fire' || rec.a === 'nade') {   // fire / grenade fingers can also aim
      api.look(dx * S.sens, dy * S.sens);
      if (rec.a === 'nade') { const c = cancelZone.getBoundingClientRect(); rec.over = e.clientX > c.left && e.clientX < c.right && e.clientY > c.top && e.clientY < c.bottom; cancelZone.classList.toggle('hot', rec.over); }
    }
  });
  const end = (e) => {
    const rec = ptrs.get(e.pointerId); if (!rec) return;
    ptrs.delete(e.pointerId);
    if (rec.btn) rec.btn.classList.remove('down');
    if (rec.a === 'move') { move = { id: null, cx: 0, cy: 0, x: 0, y: 0 }; knob.style.transform = ''; stick.classList.remove('on'); pushMove(); }
    else if (rec.a === 'fire') { if (![...ptrs.values()].some((r) => r.a === 'fire')) api.setFire(false); }
    else if (rec.a === 'nade') { cancelZone.classList.remove('on', 'hot'); if (rec.over || e.type === 'pointercancel') api.nadeCancel(); else api.nadeRelease(); }
  };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
  function pushMove() {
    if (sprintLock && move.id == null) api.setMove(0, 1, true);
    else api.setMove(move.x, move.y, sprintLock || (move.edge && move.y > 0.5));
  }
  function releaseAll() {
    ptrs.clear(); move = { id: null, cx: 0, cy: 0, x: 0, y: 0 }; sprintLock = false;
    knob.style.transform = ''; stick.classList.remove('on'); cancelZone.classList.remove('on', 'hot');
    layer.querySelectorAll('.tc-btn').forEach((b) => b.classList.remove('down', 'lock'));
    api.setMove(0, 0, false); api.setFire(false); api.nadeCancel();
  }
  // No scroll / zoom / long-press menus while touch controls are on
  for (const ev of ['touchmove', 'gesturestart']) document.addEventListener(ev, (e) => { if (enabled && !e.target.closest?.('#touch-settings')) e.preventDefault(); }, { passive: false });

  function update() {
    const on = enabled && api.playing();
    layer.classList.toggle('on', on);
    if (!on) { if (ptrs.size || sprintLock) releaseAll(); return; }
    $('tc-use').classList.toggle('hide', !api.nearDoor());
    $('tc-mode').classList.toggle('hide', !api.canToggleMode());
    const f = api.fight();
    for (const id of ['tc-nade']) $(id).classList.toggle('hide', !f);
    $('tc-aim').classList.toggle('lock', api.aiming());
  }
  apply();
  return { get enabled() { return enabled; }, setEnabled, update, releaseAll, settings: S };
}
