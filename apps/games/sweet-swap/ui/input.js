/* Pointer capture supports touch swipes, mouse drags and tap-tap.
 * Click handles mouse + native keyboard buttons; suppress only the click after a drag. */
function bindSweetInput(view, choose, move, active) {
  const board = view.board;
  let down = null, ignoreClick = false;
  const cellAt = e => Number(e.target.closest('[data-cell]')?.dataset.cell ?? -1);
  board.addEventListener('pointerdown', e => {
    if (!active() || !e.isPrimary || e.button !== 0) return;
    const cell = cellAt(e); if (cell < 0) return;
    ignoreClick = false; down = { cell, x: e.clientX, y: e.clientY, id: e.pointerId };
    view.cells[cell].setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < board.clientWidth / 8 * .3) return;
    ignoreClick = true;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const to = d.cell + (horizontal ? Math.sign(dx) : Math.sign(dy) * 8);
    if (SweetRules.adjacent(d.cell, to)) move(d.cell, to);
  });
  board.addEventListener('pointercancel', () => { down = null; ignoreClick = false; });
  board.addEventListener('lostpointercapture', () => { down = null; });
  board.addEventListener('click', e => {
    if (ignoreClick) { ignoreClick = false; return; }
    const i = cellAt(e); if (active() && i >= 0) choose(i);
  });
  board.addEventListener('keydown', e => {
    const i = cellAt(e), delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key];
    if (i < 0 || !delta) return;
    e.preventDefault(); const to = i + delta;
    if (SweetRules.adjacent(i, to)) view.cells[to].focus();
  });
}
