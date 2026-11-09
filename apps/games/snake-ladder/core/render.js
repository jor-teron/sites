/* render.js — all DOM writes for the board live here. */

const Render = (() => {

  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  let boardEl, svgEl;
  let cellEls = [];
  let tokenEls = [];

  const S = () => CONFIG.SIZE;

  /* centre of a cell in SVG viewBox units (0..S) */
  function center(cell) {
    const { row, col } = Board.coords(cell);
    return { x: col + 0.5, y: (S() - 1 - row) + 0.5 };
  }

  function svg(el, attrs) {
    const node = document.createElementNS(NS, el);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* ---------- board ---------- */
  function drawBoard(state) {
    boardEl = $('board');
    svgEl = $('board-svg');

    boardEl.querySelectorAll('.cell, .token').forEach(n => n.remove());
    svgEl.innerHTML = '';
    cellEls = [];
    tokenEls = [];

    // DOM order is top-left first, so iterate rows from the top down
    for (let row = S() - 1; row >= 0; row--) {
      for (let col = 0; col < S(); col++) {
        const cell = Board.cellAt(row, col);
        const el = document.createElement('div');
        el.className = 'cell' + ((row + col) % 2 ? ' alt' : '');
        el.dataset.cell = cell;

        if (cell === CONFIG.START_CELL)      { el.textContent = 'START';  el.classList.add('start'); }
        else if (cell === CONFIG.FINISH_CELL) { el.textContent = 'FINISH'; el.classList.add('finish'); }
        else                                  { el.textContent = cell; }

        boardEl.appendChild(el);
        cellEls[cell] = el;
      }
    }

    // tint the cells a player can land on and be moved from
    for (const l of state.board.ladders) cellEls[l.from].classList.add('ladder-foot');
    for (const s of state.board.snakes)  cellEls[s.from].classList.add('snake-head');

    drawLadders(state.board.ladders);
    drawSnakes(state.board.snakes);
    drawTokens(state.players);
  }

  /* ---------- ladders ----------
     Two rails, rungs, and the four side stiles that stick out at each end.
     Rails are drawn to the very ends, even when an end is at the top of the
     board and therefore has no stile. */
  function drawLadders(ladders) {
    const RAIL   = 0.13;   // half distance between the two rails, in cells
    const INSET  = 0.16;   // keep clear of the cell centre dots
    const EXTEND = 0.10;   // how far the stiles poke past the cell centre

    for (const { from, to } of ladders) {
      const a = center(from), b = center(to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;          // along the ladder
      const nx = -uy,     ny = ux;                 // across it

      const ax = a.x + ux * INSET, ay = a.y + uy * INSET;
      const bx = b.x - ux * INSET, by = b.y - uy * INSET;

      // stiles: short side bars at each end, like the feet of a real ladder
      const stiles = [
        { x: a.x - ux * EXTEND, y: a.y - uy * EXTEND },
        { x: b.x + ux * EXTEND, y: b.y + uy * EXTEND },
      ];
      for (const p of stiles) {
        svgEl.appendChild(svg('line', {
          x1: p.x + nx * (RAIL + 0.02), y1: p.y + ny * (RAIL + 0.02),
          x2: p.x - nx * (RAIL + 0.02), y2: p.y - ny * (RAIL + 0.02),
          class: 'ladder-stile',
        }));
      }

      // rails
      for (const side of [1, -1]) {
        svgEl.appendChild(svg('line', {
          x1: ax + nx * RAIL * side, y1: ay + ny * RAIL * side,
          x2: bx + nx * RAIL * side, y2: by + ny * RAIL * side,
          class: 'ladder-rail',
        }));
      }

      // rungs run rail to rail, a little beyond, so they read as crossings
      const rungs = Math.max(2, Math.round(len * 1.5));
      for (let i = 1; i < rungs; i++) {
        const t = i / rungs;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        svgEl.appendChild(svg('line', {
          x1: px + nx * (RAIL + 0.015), y1: py + ny * (RAIL + 0.015),
          x2: px - nx * (RAIL + 0.015), y2: py - ny * (RAIL + 0.015),
          class: 'ladder-rung',
        }));
      }
    }
  }

  /* ---------- snakes ----------
     Tapered body (thick at the head, thin at the tail) plus an eye on each
     side of the head. The path is unchanged from before, only drawn thicker
     and with round caps. */
  function drawSnakes(snakes) {
    const INSET = 0.18;
    const AMP   = 0.22;
    const W_HEAD = 0.052;  // half-width at the head, in cells
    const W_TAIL = 0.008;  // half-width at the tail

    for (const { from, to } of snakes) {
      const a = center(from), b = center(to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const nx = -uy,     ny = ux;

      const ax = a.x + ux * INSET, ay = a.y + uy * INSET;
      const bx = b.x - ux * INSET, by = b.y - uy * INSET;

      // wavy body: the sway fades to zero at both ends so it meets the dots
      const waves = Math.max(1, Math.round(len / 1.6));
      const steps = waves * 2;
      let d = `M ${ax.toFixed(3)} ${ay.toFixed(3)}`;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const sway = Math.sin(t * Math.PI * waves) * AMP * Math.sin(t * Math.PI);
        const px = ax + (bx - ax) * t + nx * sway;
        const py = ay + (by - ay) * t + ny * sway;
        d += ` L ${px.toFixed(3)} ${py.toFixed(3)}`;
      }

      const path = svg('path', { d, class: 'snake-line' });
      svgEl.appendChild(path);

      // taper: a flat stroke can't vary its width, so mask the thick body
      // with a gradient that runs head -> tail. Gradient coordinates are
      // objectBoundingBox by default, which follows the path direction.
      const id = `fade-${from}-${to}`;
      const defs = svg('defs', {});
      const grad = svg('linearGradient', {
        id, x1: 0, y1: 0, x2: 1, y2: 0,
        gradientUnits: 'objectBoundingBox',
      });
      grad.appendChild(svg('stop', { offset: 0,   'stop-color': '#fff', 'stop-opacity': 1 }));
      grad.appendChild(svg('stop', { offset: 0.6, 'stop-color': '#fff', 'stop-opacity': 0.75 }));
      grad.appendChild(svg('stop', { offset: 1,   'stop-color': '#fff', 'stop-opacity': 0.35 }));
      defs.appendChild(grad);

      const mask = svg('mask', { id: `m-${id}` });
      const shape = svg('path', { d, class: 'snake-taper' });
      mask.appendChild(shape);
      defs.appendChild(mask);
      svgEl.insertBefore(defs, svgEl.firstChild);
      path.setAttribute('mask', `url(#m-${id})`);

      // head: a slightly bigger blob on the start cell
      svgEl.appendChild(svg('circle', {
        cx: a.x, cy: a.y, r: W_HEAD * 1.9, class: 'snake-head',
      }));
      // eyes, just behind the head and offset to either side
      for (const side of [1, -1]) {
        svgEl.appendChild(svg('circle', {
          cx: a.x + ux * 0.06 + nx * 0.035 * side,
          cy: a.y + uy * 0.06 + ny * 0.035 * side,
          r: 0.028, class: 'snake-eye',
        }));
      }
      // tail tip
      svgEl.appendChild(svg('circle', {
        cx: b.x, cy: b.y, r: W_TAIL * 2.4, class: 'snake-tail',
      }));
    }
  }

  /* ---------- tokens ---------- */
  function drawTokens(players) {
    for (const p of players) {
      const el = document.createElement('div');
      el.className = `token ${p.color}`;
      el.dataset.player = p.id;
      boardEl.appendChild(el);
      tokenEls[p.id] = el;
    }
    layout(players, null);
  }

  /* position every token; tokens sharing a cell fan out into the corners */
  function layout(players, activeId) {
    const n = S();

    const groups = new Map();
    for (const p of players) {
      if (!p.onBoard) continue;
      if (!groups.has(p.pos)) groups.set(p.pos, []);
      groups.get(p.pos).push(p);
    }

    for (const p of players) {
      const el = tokenEls[p.id];
      if (!el) continue;

      el.classList.toggle('active', p.id === activeId);

      if (!p.onBoard) { el.style.display = 'none'; continue; }
      el.style.display = '';

      const { row, col } = Board.coords(p.pos);
      const idx = groups.get(p.pos).indexOf(p);
      const off = CONFIG.TOKEN_LAYOUT[idx % CONFIG.TOKEN_LAYOUT.length];

      const cx = col + 0.5 + off[0];
      const cy = (n - 1 - row) + 0.5 + off[1];

      el.style.left = `${(cx / n) * 100}%`;
      el.style.top  = `${(cy / n) * 100}%`;
    }
  }

  return { drawBoard, layout };
})();
