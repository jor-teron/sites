/* Turbo Lap — car garage (TLQ1a): the panel behind the Car buttons (title / pause / finish card) and key G. A row of paint swatches and
   the ten cars as small canvas previews drawn with the REAL model code (TL.drawCarPreview -> the same draw() the race uses, rear view,
   in the paint you have chosen). Touch, mouse and keyboard: cards are buttons in a scrollable grid; arrows / Home / End move
   (Up from the first row goes to the swatches, Down returns), Enter or Space picks, Esc / G / the close button / a tap on the dark
   scrim close; Tab cycles the current card, the current swatch and the close button.
   A swatch applies (and saves) at once and the panel stays open, so you can see the paint on every car; a car card applies, saves
   (TL.game.pickCar -> TL.storage 'car', 'carcolor') and closes. While it is open the keys belong to the panel (the game never sees
   them) and opening it pauses a running race (core/game.js openCars). Looks only: no car changes the racing. */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, CS = TL.carSet, $ = id => document.getElementById(id);
  let grid, bar, closeBtn, cards = [], dots = [];
  const RATIO = 0.625;                                   // preview height / width

  const CP = TL.carPicker = {
    init() {
      grid = $('carGrid'); bar = $('carSwatches'); closeBtn = $('carClose'); if (!grid || !bar) return;
      CFG.cars.swatches.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'swatch'; b.dataset.id = s.id; b.tabIndex = -1;
        b.setAttribute('role', 'radio'); b.setAttribute('aria-label', s.name + ' paint'); b.title = s.name;
        b.style.setProperty('--c', s.color); b.style.setProperty('--a', s.accent);
        bar.appendChild(b); dots.push(b);
      });
      CS.list.forEach(m => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tcard'; b.dataset.id = m.id; b.tabIndex = -1;
        b.setAttribute('role', 'option');
        b.innerHTML = '<canvas aria-hidden="true"></canvas><span class="tn"></span><span class="tb"></span>';
        b.querySelector('.tn').textContent = m.name; b.querySelector('.tb').textContent = m.blurb;
        grid.appendChild(b); cards.push(b);
      });
      grid.addEventListener('click', e => { const b = e.target.closest('.tcard'); if (b) { b.blur(); TL.game.pickCar(b.dataset.id); } });
      bar.addEventListener('click', e => { const b = e.target.closest('.swatch'); if (b) setPaint(b.dataset.id, false); });
      closeBtn.addEventListener('click', e => { e.currentTarget.blur(); TL.game.closeCars(); });
      $('overlay').addEventListener('click', e => { if (e.target === $('overlay') && TL.game.panel === 'cars') TL.game.closeCars(); });
      window.addEventListener('keydown', onKey, true);
    },

    // refresh the highlights and the previews (redrawn only if the size or the paint changed) and focus the current car
    open() {
      if (!grid) return;
      paintState();
      cards.forEach(drawPreview);
      grid.scrollTop = 0;
      focusCard(Math.max(0, cards.findIndex(b => b.dataset.id === CS.current)));
    },
    isOpen: () => TL.game.panel === 'cars',
    cards: () => cards, swatches: () => dots
  };

  function paintState() {
    cards.forEach(b => {
      const cur = b.dataset.id === CS.current;
      b.classList.toggle('cur', cur); b.setAttribute('aria-selected', cur ? 'true' : 'false');
    });
    dots.forEach(d => {
      const cur = d.dataset.id === CS.swatchId;
      d.classList.toggle('cur', cur); d.setAttribute('aria-checked', cur ? 'true' : 'false'); d.tabIndex = cur ? 0 : -1;
    });
  }
  function setPaint(id, keepFocus) {
    TL.game.pickCarColor(id); paintState(); cards.forEach(drawPreview);
    if (keepFocus) dots.find(d => d.dataset.id === id).focus({ preventScroll: true });
  }

  function drawPreview(b) {
    const cv = b.querySelector('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(40, Math.round(cv.getBoundingClientRect().width)), H = Math.round(W * RATIO), key = W + '@' + dpr + '@' + CS.swatchId;
    if (cv._key === key) return;
    cv._key = key;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    TL.drawCarPreview(c, CS.get(b.dataset.id), W, H, CS.color(), CS.accent());
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
    if (TL.game.panel !== 'cars') return;
    e.stopPropagation();
    const code = e.code, ae = document.activeElement, i = cards.indexOf(ae), d = dots.indexOf(ae);
    if (code === 'Escape' || code === 'KeyG') { e.preventDefault(); if (!e.repeat) TL.game.closeCars(); return; }
    if (code === 'Tab') {                                           // Tab cycles the current card, the current swatch and the close button
      e.preventDefault();
      const order = [cards.find(b => b.tabIndex === 0) || cards[0], dots.find(b => b.tabIndex === 0) || dots[0], closeBtn], at = order.indexOf(ae);
      order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length].focus({ preventScroll: true });
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (ae === closeBtn) TL.game.closeCars();
      else if (d >= 0) setPaint(dots[d].dataset.id, true);
      else if (i >= 0) TL.game.pickCar(cards[i].dataset.id);
      return;
    }
    if (d >= 0) {                                                   // on the swatch row
      const k = { ArrowLeft: -1, ArrowRight: 1 }[code];
      if (k != null) { e.preventDefault(); const t = dots[(d + k + dots.length) % dots.length]; dots.forEach(x => { x.tabIndex = x === t ? 0 : -1; }); t.focus({ preventScroll: true }); }
      else if (code === 'ArrowDown') { e.preventDefault(); focusCard(Math.max(0, cards.findIndex(b => b.tabIndex === 0))); }
      else if (code === 'Home' || code === 'End') { e.preventDefault(); const t = dots[code === 'Home' ? 0 : dots.length - 1]; dots.forEach(x => { x.tabIndex = x === t ? 0 : -1; }); t.focus({ preventScroll: true }); }
      return;
    }
    if (i < 0) return;
    const cols = columns();
    if (code === 'ArrowUp' && i < cols) { e.preventDefault(); (dots.find(x => x.tabIndex === 0) || dots[0]).focus({ preventScroll: true }); return; }
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, PageUp: -cols * 2, PageDown: cols * 2 }[code];
    if (move != null) { e.preventDefault(); focusCard(i + move); }
    else if (code === 'Home') { e.preventDefault(); focusCard(0); }
    else if (code === 'End') { e.preventDefault(); focusCard(cards.length - 1); }
  }
})();
