/* Board art is generated SVG. No external image/font dependency. SNL-2a. */
const Render = (() => {
  const $ = (id) => document.getElementById(id),
    NS = 'http://www.w3.org/2000/svg';
  const tokens = new Map();
  let svgEl;
  function svg(tag, attrs, parent = svgEl) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  }
  const point = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  function drawBoard(state) {
    cancelMotion();
    const board = $('board');
    board.querySelectorAll('.cell,.token').forEach((n) => n.remove());
    svgEl = $('board-svg');
    svgEl.replaceChildren();
    tokens.clear();
    const defs = svg('defs', {});
    const shadow = svg(
      'filter',
      { id: 'art-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' },
      defs,
    );
    svg('feDropShadow', { dx: 0.035, dy: 0.055, stdDeviation: 0.025, 'flood-opacity': 0.4 }, shadow);
    for (let row = 9; row >= 0; row--)
      for (let col = 0; col < 10; col++) {
        const c = Board.cellAt(row, col),
          cell = document.createElement('div');
        cell.className = `cell${(row + col) % 2 ? ' alt' : ''}${c === 0 ? ' start' : c === 99 ? ' finish' : ''}`;
        cell.textContent = c + 1;
        cell.dataset.cell = c;
        board.append(cell);
      }
    drawLadders(state.board.ladders);
    drawSnakes(state.board.snakes, defs);
    for (const player of state.players) {
      const el = document.createElement('div');
      el.className = `token ${player.color}`;
      el.innerHTML = '<span class="pawn-ball"></span><span class="pawn-base"></span>';
      el.dataset.player = player.id;
      board.append(el);
      tokens.set(player.id, el);
    }
    layout(state.players, state.players[state.turn].id);
    const jumps = [...state.board.ladders, ...state.board.snakes]
      .map((j) => `${j.from + 1} to ${j.to + 1}`)
      .join('; ');
    board.setAttribute('aria-label', `Board 1 to 100. Connectors: ${jumps}`);
  }
  function drawLadders(ladders) {
    for (const { from, to } of ladders) {
      const a = Board.center(from),
        b = Board.center(to);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy),
        nx = -dy / len,
        ny = dx / len;
      const group = svg('g', { filter: 'url(#art-shadow)' });
      function wood(x1, y1, x2, y2) {
        const attrs = { x1, y1, x2, y2 };
        svg('line', { ...attrs, class: 'ladder-edge' }, group);
        svg('line', { ...attrs, class: 'ladder-wood' }, group);
        svg(
          'line',
          { x1: x1 - 0.025, y1: y1 - 0.025, x2: x2 - 0.025, y2: y2 - 0.025, class: 'ladder-shine' },
          group,
        );
      }
      const n = Math.round(len * 2.4);
      for (let i = 1; i < n; i++) {
        const x = a.x + (dx * i) / n,
          y = a.y + (dy * i) / n;
        wood(x - nx * 0.16, y - ny * 0.16, x + nx * 0.16, y + ny * 0.16);
      }
      for (const side of [-1, 1])
        wood(a.x + nx * 0.19 * side, a.y + ny * 0.19 * side, b.x + nx * 0.19 * side, b.y + ny * 0.19 * side);
      // Pegs sit on the joined rails, never floating beyond the ends.
      for (const t of [0.08, 0.92])
        for (const side of [-1, 1])
          svg(
            'circle',
            {
              cx: a.x + dx * t + nx * 0.19 * side,
              cy: a.y + dy * t + ny * 0.19 * side,
              r: 0.024,
              fill: '#5d3f29',
            },
            group,
          );
    }
  }
  function drawSnakes(snakes, defs) {
    const colors = [
      ['#459b63', '#a6d678'],
      ['#d16a49', '#ffc87b'],
      ['#477db2', '#a7d6df'],
      ['#9557a2', '#e9b0d4'],
    ];
    snakes.forEach(({ from, to }, index) => {
      const [base, light] = colors[index % colors.length];
      const id = `skin-${index}`;
      const grad = svg('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '50%' }, defs);
      for (const [offset, color] of [
        ['0%', light],
        ['36%', base],
        ['70%', base],
        ['100%', '#284d38'],
      ])
        svg('stop', { offset, 'stop-color': color }, grad);
      const sides = [[], []],
        sections = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120,
          p = Board.connectorPoint(from, to, t);
        const q = Board.connectorPoint(from, to, Math.min(1, t + 0.002));
        const prev = Board.connectorPoint(from, to, Math.max(0, t - 0.002));
        const dx = q.x - prev.x,
          dy = q.y - prev.y,
          len = Math.hypot(dx, dy),
          w = 0.16 * (1 - t) + 0.012;
        const left = { x: p.x - (dy / len) * w, y: p.y + (dx / len) * w };
        const right = { x: p.x + (dy / len) * w, y: p.y - (dx / len) * w };
        sides[0].push(left);
        sides[1].push(right);
        sections.push({ p, left, right });
      }
      const group = svg('g', { filter: 'url(#art-shadow)' });
      svg(
        'path',
        {
          d: `M${sides[0].map(point).join(' L')} L${sides[1].reverse().map(point).join(' L')} Z`,
          fill: `url(#${id})`,
          class: 'snake-body',
        },
        group,
      );
      // Curved bands and paired scales follow the changing thickness of the body.
      for (let i = 7; i < 115; i += 7) {
        const { left, right, p } = sections[i];
        svg(
          'path',
          {
            d: `M${point(left)} Q${point({ x: p.x + 0.03, y: p.y - 0.06 })} ${point(right)}`,
            fill: 'none',
            stroke: light,
            'stroke-opacity': 0.7,
            'stroke-width': 0.035,
          },
          group,
        );
        svg('ellipse', { cx: p.x, cy: p.y, rx: 0.035, ry: 0.018, fill: '#fff', opacity: 0.35 }, group);
      }
      const a = Board.center(from),
        b = Board.connectorPoint(from, to, 0.01);
      const angle = (Math.atan2(a.y - b.y, a.x - b.x) * 180) / Math.PI;
      const head = svg('g', { transform: `translate(${a.x} ${a.y}) rotate(${angle})` }, group);
      svg(
        'path',
        {
          d: 'M.21,0 L.39,0 M.39,0 L.49,-.07 M.39,0 L.49,.07',
          stroke: '#b72d39',
          'stroke-width': 0.035,
          'stroke-linecap': 'round',
          fill: 'none',
        },
        head,
      );
      svg('ellipse', { cx: 0, cy: 0, rx: 0.25, ry: 0.2, fill: base, class: 'snake-head-art' }, head);
      svg('ellipse', { cx: -0.06, cy: -0.07, rx: 0.13, ry: 0.055, fill: light, opacity: 0.7 }, head);
      for (const side of [-1, 1]) {
        svg('circle', { cx: 0.08, cy: side * 0.125, r: 0.067, fill: '#fff6dc' }, head);
        svg('ellipse', { cx: 0.103, cy: side * 0.125, rx: 0.024, ry: 0.039, fill: '#172b28' }, head);
        svg('circle', { cx: 0.11, cy: side * 0.125 - 0.014, r: 0.012, fill: '#fff' }, head);
      }
      svg(
        'path',
        { d: 'M.18,-.045 Q.23,0 .18,.045', fill: 'none', stroke: '#244632', 'stroke-width': 0.019 },
        head,
      );
    });
  }
  function layout(players, activeId) {
    for (const player of players) {
      const el = tokens.get(player.id);
      if (!el) continue;
      const group = players.filter((p) => p.onBoard && p.pos === player.pos);
      const off = group.length > 1 ? CONFIG.TOKEN_LAYOUT[group.indexOf(player)] : [0, 0];
      const p = Board.center(player.pos);
      el.classList.toggle('active', player.id === activeId);
      el.hidden = !player.onBoard;
      el.style.left = `${(p.x + off[0]) * 10}%`;
      el.style.top = `${(p.y + off[1]) * 10}%`;
      el.setAttribute('aria-label', `${player.name}: square ${player.pos + 1}`);
    }
  }
  let motionEpoch = 0;
  const animations = new Set();
  function cancelMotion() {
    motionEpoch++;
    // Resolve waiters as well as removing visuals, so cancelling cannot strand a roll.
    for (const cancel of [...animations]) cancel();
  }
  function animateToken(player, pointAt, duration, hopping = false) {
    const el = tokens.get(player.id);
    if (!el) return Promise.resolve();
    el.hidden = false;
    const epoch = motionEpoch;
    const ms = SNLSettings.reduced() ? 0 : duration;
    return new Promise((resolve) => {
      let frame = 0,
        start = null;
      const finish = () => {
        cancelAnimationFrame(frame);
        animations.delete(finish);
        resolve();
      };
      animations.add(finish);
      function tick(now) {
        if (epoch !== motionEpoch) {
          finish();
          return;
        }
        start ??= now;
        const t = ms ? Math.min(1, (now - start) / ms) : 1;
        const eased = t * t * (3 - 2 * t),
          p = pointAt(eased);
        el.style.left = `${p.x * 10}%`;
        el.style.top = `${(p.y - (hopping ? Math.sin(t * Math.PI) * 0.32 : 0)) * 10}%`;
        const scale = hopping ? 1 + Math.sin(t * Math.PI) * 0.1 : 1;
        el.style.transform = `translate(-50%,-50%) scale(${scale})`;
        if (t < 1) frame = requestAnimationFrame(tick);
        else {
          el.style.transform = '';
          finish();
        }
      }
      if (ms) frame = requestAnimationFrame(tick);
      else tick(performance.now());
    });
  }
  function hop(player, from, to) {
    const a = Board.center(from),
      b = Board.center(to);
    return animateToken(
      player,
      (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
      CONFIG.HOP_MS,
      true,
    );
  }
  function ride(player, from, to, kind) {
    return animateToken(
      player,
      (t) => Board.connectorPoint(from, to, t, kind),
      kind === 'snake' ? 1050 : 1200,
    );
  }
  function confetti() {
    if (SNLSettings.reduced()) return;
    const epoch = motionEpoch,
      root = document.createElement('div');
    root.className = 'confetti';
    root.setAttribute('aria-hidden', 'true');
    document.body.append(root);
    for (let i = 0; i < 64; i++) {
      const piece = document.createElement('i');
      piece.style.cssText = `left:${Math.random() * 100}%;--delay:${Math.random() * 0.4}s;--drift:${Math.random() * 160 - 80}px;background:${['#e55b50', '#e8bc50', '#62bfa0', '#a18bdd'][i % 4]}`;
      root.append(piece);
    }
    const cleanup = () => {
      root.remove();
      animations.delete(cleanup);
    };
    animations.add(cleanup);
    setTimeout(cleanup, 2800);
  }
  return { drawBoard, layout, hop, ride, cancelMotion, confetti };
})();
