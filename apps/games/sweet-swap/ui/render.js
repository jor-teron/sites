/* Crisp DOM candies: six original gradient silhouettes, no image dependencies. */
const SweetView = (() => {
  const board = document.getElementById('board');
  const names = ['Rose round', 'Amber diamond', 'Lemon triangle', 'Mint square', 'Sky drop', 'Violet flower'];
  const cells = Array.from({ length: 64 }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cell'; b.dataset.cell = i;
    b.style.left = `${i % 8 * 12.5}%`; b.style.top = `${(i / 8 | 0) * 12.5}%`;
    b.innerHTML = '<span class="candy" aria-hidden="true"><i></i></span>';
    board.appendChild(b); return b;
  });
  function draw(values, selected = -1) {
    cells.forEach((b, i) => {
      b.classList.toggle('selected', selected === i); b.classList.remove('hint');
      b.firstChild.className = `candy colour-${values[i]}`;
      b.setAttribute('aria-label', `Row ${1 + (i / 8 | 0)} column ${i % 8 + 1}: ${names[values[i]]}`);
      b.setAttribute('aria-pressed', selected === i ? 'true' : 'false');
    });
  }
  const hint = pair => cells.forEach((b, i) => b.classList.toggle('hint', !!pair?.includes(i)));
  async function animate(items, duration = 160) {
    if (!SweetSettings.motion()) return;
    await Promise.all(items.map(({ i, frames }) => {
      const a = cells[i].firstChild.animate(frames, { duration, easing: 'ease-in-out' });
      return a.finished.catch(() => {});
    }));
  }
  function swap(a, b, reverse = false) {
    const unit = board.clientWidth / 8;
    const dx = (b % 8 - a % 8) * unit, dy = ((b / 8 | 0) - (a / 8 | 0)) * unit;
    const frames = (x, y) => {
      const f = [{ transform: 'translate(0,0)' }, { transform: `translate(${x}px,${y}px)` }];
      return reverse ? f.reverse() : f;
    };
    return animate([{ i: a, frames: frames(dx, dy) }, { i: b, frames: frames(-dx, -dy) }]);
  }
  const clear = groups => animate([...new Set(groups.flatMap(g => g.cells))].map(i =>
    ({ i, frames: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: .25 }] })), 170);
  const fall = falls => animate(falls.filter(f => f.from !== f.to).map(f =>
    ({ i: f.cell, frames: [{ transform: `translateY(${(f.from - f.to) * board.clientHeight / 8}px)` }, { transform: 'translateY(0)' }] })), 230);
  function fit() {
    const area = document.getElementById('boardWrap');
    const size = Math.floor(Math.min(area.clientWidth, area.clientHeight, 600));
    board.style.width = board.style.height = `${size}px`;
  }
  new ResizeObserver(fit).observe(document.getElementById('boardWrap')); fit();
  return { board, cells, draw, hint, swap, clear, fall };
})();
