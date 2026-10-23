/* Turbo Lap — theme picker (TLQ1b): the panel behind the themes button. "Auto (by circuit)" plus the ten themes, each as a
   small canvas preview drawn with the REAL theme code (TL.drawThemePreview: the theme's own background, road colours,
   roadside objects and ambient effect). Works with touch, mouse and keyboard: cards are buttons in a scrollable grid;
   arrows / Home / End move, Enter or Space picks, Esc / V / the close button / a tap on the dark scrim close; Tab stays inside.
   Picking applies and saves the look (TL.game.pickTheme -> TL.storage 'theme') and closes the panel. While it is open the keys
   belong to the panel (the game never sees them) and opening it pauses a running race (core/game.js openThemes).
   Opened by #themeBtn (floating, on the road) and by the Theme buttons on the title / pause / finish cards, or key V. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, $ = id => document.getElementById(id);
  let grid, closeBtn, cards = [];
  const RATIO = 0.625;                                   // preview height / width

  const TP = TL.themePicker = {
    init() {
      grid = $('themeGrid'); closeBtn = $('themeClose'); if (!grid) return;
      const entries = [{ id: CFG.themes.auto, name: 'Auto (by circuit)', blurb: 'Changes with the circuit' }]
        .concat(TL.themes.list.map(t => ({ id: t.id, name: t.name, blurb: t.blurb })));
      entries.forEach(en => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tcard'; b.dataset.id = en.id; b.tabIndex = -1;
        b.setAttribute('role', 'option');
        b.innerHTML = '<canvas aria-hidden="true"></canvas><span class="tn"></span><span class="tb"></span>';
        b.querySelector('.tn').textContent = en.name; b.querySelector('.tb').textContent = en.blurb;
        grid.appendChild(b); cards.push(b);
      });
      grid.addEventListener('click', e => { const b = e.target.closest('.tcard'); if (b) { b.blur(); TL.game.pickTheme(b.dataset.id); } });
      closeBtn.addEventListener('click', e => { e.currentTarget.blur(); TL.game.closeThemes(); });
      $('overlay').addEventListener('click', e => { if (e.target === $('overlay') && TL.game.panel === 'themes') TL.game.closeThemes(); });
      window.addEventListener('keydown', onKey, true);
    },

    // refresh the highlighted card (+ which theme Auto gives right now), draw the previews (again only if the size changed), focus
    open() {
      if (!grid) return;
      const G = TL.game, mode = TL.themes.mode, now = TL.themes.forCircuit(G.circuit);
      cards.forEach(b => {
        const id = b.dataset.id, cur = id === mode;
        b.classList.toggle('cur', cur); b.setAttribute('aria-selected', cur ? 'true' : 'false');
        b.classList.toggle('now', mode === CFG.themes.auto && id === CFG.themes.auto);
        if (id === CFG.themes.auto) b.querySelector('.tb').textContent = mode === CFG.themes.auto ? 'Now: ' + now.name : 'Changes with the circuit';
        b.tabIndex = cur ? 0 : -1;
        drawPreview(b);
      });
      grid.scrollTop = 0;
      const i = Math.max(0, cards.findIndex(b => b.dataset.id === mode));
      focusCard(i);
    },
    isOpen: () => TL.game.panel === 'themes',
    cards: () => cards
  };

  function drawPreview(b) {
    const cv = b.querySelector('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(40, Math.round(cv.getBoundingClientRect().width)), H = Math.round(W * RATIO), key = W + '@' + dpr;
    if (cv._key === key) return;
    cv._key = key;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (b.dataset.id === CFG.themes.auto) {                         // Auto: four themes side by side in slices
      const ids = [0, 1, 3, 9].map(i => CFG.themes.cycle[i]), sw = W / ids.length;
      ids.forEach((id, i) => {
        c.save(); c.beginPath(); c.rect(Math.floor(i * sw), 0, Math.ceil(sw), H); c.clip();
        TL.drawThemePreview(c, TL.themes.get(id), W, H); c.restore();
      });
      c.font = 'bold ' + Math.round(H * 0.16) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = H * 0.04; c.strokeStyle = 'rgba(10,14,40,0.85)'; c.fillStyle = '#fff';
      c.strokeText('AUTO', W / 2, H * 0.24); c.fillText('AUTO', W / 2, H * 0.24);
    } else TL.drawThemePreview(c, TL.themes.get(b.dataset.id), W, H);
  }

  function focusCard(n) {
    n = Math.max(0, Math.min(cards.length - 1, n));
    cards.forEach((b, i) => { b.tabIndex = i === n ? 0 : -1; });
    cards[n].focus({ preventScroll: true });
    cards[n].scrollIntoView({ block: 'nearest' });
  }
  function columns() {
    const top = cards[0].offsetTop; let c = 0;
    while (c < cards.length && cards[c].offsetTop === top) c++;
    return Math.max(1, c);
  }

  // capture phase: while the panel is open every key is the panel's; the game and the paused race never see it
  function onKey(e) {
    if (TL.game.panel !== 'themes') return;
    e.stopPropagation();
    const code = e.code, ae = document.activeElement, i = cards.indexOf(ae);
    if (code === 'Escape' || code === 'KeyV') { e.preventDefault(); if (!e.repeat) TL.game.closeThemes(); return; }
    if (code === 'Tab') {                                           // Tab cycles the cards' roving stop and the close button
      e.preventDefault();
      const order = [cards.find(b => b.tabIndex === 0) || cards[0], closeBtn], at = order.indexOf(ae);
      order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length].focus({ preventScroll: true });
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (ae === closeBtn) TL.game.closeThemes(); else if (i >= 0) TL.game.pickTheme(cards[i].dataset.id);
      return;
    }
    if (i < 0) return;
    const cols = columns();
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, PageUp: -cols * 2, PageDown: cols * 2 }[code];
    if (move != null) { e.preventDefault(); focusCard(i + move); }
    else if (code === 'Home') { e.preventDefault(); focusCard(0); }
    else if (code === 'End') { e.preventDefault(); focusCard(cards.length - 1); }
  }
})();
