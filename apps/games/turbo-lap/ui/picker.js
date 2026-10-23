/* Turbo Lap — circuit picker: a scrollable grid of the 100 circuits (00..99) with the best time on each.
   Works with touch, mouse and keyboard (arrows move, Enter / Space picks, Esc or C closes, Home / End jump).
   Opened from the title and finish screens through TL.game.openPicker(). Picking a circuit saves it
   (TL.storage 'circuit') and returns to the title screen on that circuit. */
window.TL = window.TL || {};
(() => {
  const U = TL.util, $ = id => document.getElementById(id);
  let grid, cells = [];

  const P = TL.picker = {
    init() {
      grid = $('pickGrid'); if (!grid) return;
      for (let n = 0; n < TL.circuits.count; n++) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pcell'; b.dataset.n = n; b.setAttribute('role', 'gridcell');
        b.innerHTML = '<b>' + TL.circuits.pad2(n) + '</b><span class="pt"></span>';
        b.tabIndex = -1;
        grid.appendChild(b); cells.push(b);
      }
      grid.addEventListener('click', e => { const b = e.target.closest('.pcell'); if (b) { b.blur(); TL.game.pickCircuit(+b.dataset.n); } });
      grid.addEventListener('keydown', onKey);
      $('pickClose').addEventListener('click', e => { e.currentTarget.blur(); TL.game.closePicker(); });
    },

    // refresh best times and the highlighted circuit, then focus the current cell
    open() {
      if (!grid) return;
      const cur = TL.game.circuit;
      cells.forEach((b, n) => {
        const best = TL.storage.bestTotal(TL.circuits.pad2(n));
        b.querySelector('.pt').textContent = best != null ? U.fmtTime(best) : '—';
        b.classList.toggle('has', best != null);
        b.classList.toggle('cur', n === cur);
        b.setAttribute('aria-label', TL.circuits.label(n) + (best != null ? ', best ' + U.fmtTime(best) : ', no time yet'));
        b.tabIndex = n === cur ? 0 : -1;
      });
      grid.scrollTop = 0;
      focusCell(cur);
    },
    isOpen: () => TL.game.panel === 'picker'
  };

  function focusCell(n) {
    n = Math.max(0, Math.min(cells.length - 1, n));
    cells.forEach((b, i) => { b.tabIndex = i === n ? 0 : -1; });
    cells[n].focus({ preventScroll: true });
    cells[n].scrollIntoView({ block: 'nearest' });
  }
  function columns() {
    const top = cells[0].offsetTop; let c = 0;
    while (c < cells.length && cells[c].offsetTop === top) c++;
    return Math.max(1, c);
  }
  function onKey(e) {
    const i = cells.indexOf(document.activeElement); if (i < 0) return;
    const cols = columns();
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, PageUp: -cols * 4, PageDown: cols * 4, Home: -999, End: 999 }[e.code];
    if (move != null) { e.preventDefault(); focusCell(e.code === 'Home' ? 0 : e.code === 'End' ? cells.length - 1 : i + move); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); setTimeout(() => TL.game.pickCircuit(i), 0); }   // after the Enter 'start' key has been seen
    else if (e.code === 'Escape') { e.preventDefault(); TL.game.closePicker(); }
  }
  // Esc / C anywhere while the picker is open (focus may be on the close button)
  window.addEventListener('keydown', e => {
    if (!grid || TL.game.panel !== 'picker' || e.target === grid || grid.contains(e.target)) return;
    if (e.code === 'Escape') TL.game.closePicker();
  });
})();
