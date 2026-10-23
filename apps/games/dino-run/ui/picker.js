/**
 * Dino Run — dino & theme picker (plain script, global DR.ui). Modelled on Swell Foop's theme picker:
 * a button opens a sheet of cards, each previewing the choice drawn live by the models' own code.
 *
 * Accessibility: the panel is a modal dialog (role=dialog, aria-modal, labelled); focus moves into it on open and
 * returns to the opener on close; Tab is trapped inside; Esc closes; cards are buttons with aria-pressed; the two
 * tabs (Dino / Theme) are a real tablist with arrow-key support. While it is open the game ignores the keyboard,
 * and none of its clicks reach the game canvas (so it never causes a jump or a start).
 * Choices are applied live and saved by DR.game.setDino / setTheme (localStorage dino-run.dino / dino-run.theme).
 */
(function () {
  let panel, btn, closeBtn, list, tabs = [], opener = null, tab = 'dino';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  const isOpen = () => !!panel && !panel.classList.contains('hidden');

  function sizeCanvas(cv, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  const SCENE_W = 300, SCENE_H = 140, SCENE_GY = 104, SCALE = 0.5;
  const clouds = [{ x: 70, y: 28, s: 0.9 }, { x: 205, y: 20, s: 0.7 }];

  /** A tiny live scene: the theme's own background/ground/obstacles with the given dino standing in it. */
  function drawScene(cv, th, model, cardW, cardH, withObstacles, scale, dinoX) {
    const c = sizeCanvas(cv, cardW, cardH);
    const W = cardW / scale, H = cardH / scale, gy = withObstacles ? SCENE_GY : H * 0.8;
    c.save();
    c.scale(scale, scale);
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    const obstacles = withObstacles ? [
      { type: 'cactus', x: 162, y: gy - 46, w: 18, h: 46, v: 0 },
      { type: 'cactus', x: 198, y: gy - 38, w: 16, h: 38, v: 1 },
      { type: 'bird', x: 236, y: gy - 66, w: 42, h: 28, flap: 0.9, v: 0 },
    ] : [];
    DR.renderScene(c, th, {
      env: { W: W, H: H, groundY: gy, dist: 160, clock: 1.3, speed: 320, clouds: clouds },
      model: model,
      d: {
        x: dinoX, y: gy - 48, w: 44, h: 48, pose: 'run', ducking: false, phase: 0.3, frame: 0, t: 0.8, airT: 0, deadT: 0,
        vy: 0, onGround: true, shield: false,
      },
      obstacles: obstacles, blink: 0, bar: null, pixelN: th.pixel ? th.pixel * 2 : 0,
    });
    c.restore();
  }

  function render() {
    list.textContent = '';
    const G = DR.game, items = tab === 'dino' ? DR.dinos : DR.themes, cur = tab === 'dino' ? G.getDino().id : G.getTheme().id;
    list.className = 'dr-list dr-list-' + tab;
    list.setAttribute('aria-labelledby', 'styleTab-' + tab);
    items.forEach((it) => {
      const card = el('button', 'dr-card' + (it.id === cur ? ' active' : ''));
      card.type = 'button';
      card.dataset.id = it.id;
      card.setAttribute('aria-pressed', it.id === cur ? 'true' : 'false');
      const cv = el('canvas', 'dr-prev');
      cv.setAttribute('aria-hidden', 'true');
      card.appendChild(cv);
      card.appendChild(el('span', 'dr-name', it.name));
      card.addEventListener('click', () => {
        if (tab === 'dino') G.setDino(it.id); else G.setTheme(it.id);
        render();
        const again = list.querySelector('[data-id="' + it.id + '"]');
        if (again) again.focus();
      });
      list.appendChild(card);
      if (tab === 'dino') drawScene(cv, G.getTheme(), it, 120, 72, false, 1, 38);
      else drawScene(cv, it, G.getDino(), SCENE_W * SCALE, SCENE_H * SCALE, true, SCALE, 40);
    });
    tabs.forEach((t) => {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle('active', on);
    });
  }

  function selectTab(name, focus) {
    tab = name;
    render();
    if (focus) tabs.find((t) => t.dataset.tab === name).focus();
  }

  function focusables() {
    return Array.prototype.filter.call(panel.querySelectorAll('button, [tabindex]'), (e) => !e.disabled && e.tabIndex >= 0 && e.offsetParent !== null);
  }

  function open() {
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : btn;
    if (DR.game) DR.game.pauseIfPlaying();
    panel.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    render();
    const t = tabs.find((x) => x.dataset.tab === tab);
    if (t) t.focus();
  }

  function close() {
    if (!isOpen()) return;
    panel.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    const back = opener || btn;
    opener = null;
    if (back && back.focus) back.focus();
  }

  function onKey(e) {
    if (!isOpen()) return;
    // The picker owns the keyboard while open: nothing reaches the game (no jump, duck, pause or restart).
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!panel.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tabs.indexOf(document.activeElement) !== -1) {
      e.preventDefault();
      selectTab(tab === 'dino' ? 'theme' : 'dino', true);
    }
  }

  function init() {
    panel = document.getElementById('stylePanel');
    btn = document.getElementById('styleBtn');
    closeBtn = document.getElementById('styleClose');
    list = document.getElementById('styleList');
    tabs = Array.prototype.slice.call(panel ? panel.querySelectorAll('[role=tab]') : []);
    if (!panel || !btn || !list || !DR.game) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    panel.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === panel) close(); });
    tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab, false)));
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
  }

  // core/logic.js calls DR.ui.init() once the game API (DR.game) exists.
  DR.ui = { init, open, close, isOpen, refresh: () => { if (isOpen()) render(); } };
})();
