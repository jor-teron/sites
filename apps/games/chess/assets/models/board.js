/* Chess board model. Squares, highlights, and pieces are drawn on one canvas. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  let canvas, ctx, geom = { ox: 0, oy: 0, sq: 0, flip: false, w: 0, h: 0 };

  function screenOf(sq) {
    const file = sq & 7, rank = sq >> 3;
    return geom.flip ? { col: 7 - file, row: rank } : { col: file, row: 7 - rank };
  }
  function sqOf(col, row) {
    return geom.flip ? row * 8 + (7 - col) : (7 - row) * 8 + col;
  }
  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = Math.max(8, Math.round(Math.min(w, h) * 0.016));
    const sq = Math.floor((Math.min(w, h) - frame * 2) / 8);
    const side = sq * 8 + frame * 2;
    const left = Math.floor((w - side) / 2), top = Math.floor((h - side) / 2);
    geom = { ox: left + frame, oy: top + frame, sq: sq, flip: geom.flip, w: w, h: h, frame: frame, left: left, top: top };
  }
  function round(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawPiece(g, piece, cx, cy, sq) { Chess.pieces.draw(g, piece, cx, cy, sq); }
  function arrow(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    ctx.strokeStyle = Chess.config.colors.hint;
    ctx.fillStyle = Chess.config.colors.hint;
    ctx.lineWidth = Math.max(3, geom.sq * 0.08);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * geom.sq * 0.28, y2 - uy * geom.sq * 0.28);
    ctx.stroke();
    const hx = x2, hy = y2, b = geom.sq * 0.22;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - ux * b - uy * b * 0.45, hy - uy * b + ux * b * 0.45);
    ctx.lineTo(hx - ux * b + uy * b * 0.45, hy - uy * b - ux * b * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  function center(sq) {
    const s = screenOf(sq);
    return { x: geom.ox + (s.col + 0.5) * geom.sq, y: geom.oy + (s.row + 0.5) * geom.sq };
  }
  function draw(view) {
    if (!ctx) return;
    geom.flip = !!(view && view.flip);
    const c = Chess.config.colors;
    const w = geom.w, h = geom.h, sq = geom.sq;
    ctx.clearRect(0, 0, w, h);
    if (sq < 8) return;
    round(geom.left, geom.top, sq * 8 + geom.frame * 2, sq * 8 + geom.frame * 2, 10);
    ctx.fillStyle = c.frame;
    ctx.fill();
    const board = view.board;
    const last = view.last, targets = view.targets || [];
    for (let sqi = 0; sqi < 64; sqi++) {
      const file = sqi & 7, rank = sqi >> 3, s = screenOf(sqi);
      const x = geom.ox + s.col * sq, y = geom.oy + s.row * sq;
      const dark = ((file + rank) & 1) === 0;
      ctx.fillStyle = dark ? c.dark : c.light;
      ctx.fillRect(x, y, sq, sq);
      if (last && (sqi === last.f || sqi === last.t)) { ctx.fillStyle = c.last; ctx.fillRect(x, y, sq, sq); }
      if (sqi === view.selected) { ctx.fillStyle = c.select; ctx.fillRect(x, y, sq, sq); }
      if (sqi === view.checkSq) {
        const g = ctx.createRadialGradient(x + sq / 2, y + sq / 2, sq * 0.1, x + sq / 2, y + sq / 2, sq * 0.62);
        g.addColorStop(0, c.check); g.addColorStop(1, 'rgba(204,52,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, sq, sq);
      }
      ctx.fillStyle = dark ? '#f0d9b5' : '#6d4c36';
      ctx.font = '600 ' + Math.max(10, Math.floor(sq * 0.16)) + 'px system-ui, sans-serif';
      if (s.row === 7) {
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('abcdefgh'[file], x + sq - 2, y + sq - 1);
      }
      if (s.col === 0) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('12345678'[rank], x + 3, y + 2);
      }
    }
    for (let sqi = 0; sqi < 64; sqi++) {
      const p = board[sqi];
      if (!p || (view.drag && sqi === view.selected)) continue;
      const s = screenOf(sqi);
      drawPiece(ctx, p, geom.ox + (s.col + 0.5) * sq, geom.oy + (s.row + 0.52) * sq, sq);
    }
    targets.forEach(function (t) {
      const s = screenOf(t), cx = geom.ox + (s.col + 0.5) * sq, cy = geom.oy + (s.row + 0.5) * sq;
      ctx.beginPath();
      if (board[t]) {
        ctx.arc(cx, cy, sq * 0.46, 0, 6.3);
        ctx.lineWidth = Math.max(3, sq * 0.08);
        ctx.strokeStyle = c.dot; ctx.stroke();
      } else {
        ctx.arc(cx, cy, sq * 0.14, 0, 6.3);
        ctx.fillStyle = c.dot; ctx.fill();
      }
    });
    if (view.hint) {
      const a = center(view.hint.f), b = center(view.hint.t);
      arrow(a.x, a.y, b.x, b.y);
    }
    if (view.cursor >= 0) {
      const s = screenOf(view.cursor);
      ctx.strokeStyle = c.cursor;
      ctx.lineWidth = 2;
      ctx.strokeRect(geom.ox + s.col * sq + 2, geom.oy + s.row * sq + 2, sq - 4, sq - 4);
    }
    if (view.drag) drawPiece(ctx, view.drag.piece, view.drag.x, view.drag.y, sq * 0.96);
  }
  function hit(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((cx - rect.left - geom.ox) / geom.sq);
    const row = Math.floor((cy - rect.top - geom.oy) / geom.sq);
    if (geom.sq < 8 || col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return sqOf(col, row);
  }
  function cellCenter(sq) {
    const rect = canvas.getBoundingClientRect();
    const p = center(sq);
    return { x: rect.left + p.x, y: rect.top + p.y };
  }
  function placePromo(el, sqi) {
    const s = screenOf(sqi), down = s.row < 4;
    el.style.flexDirection = down ? 'column' : 'column-reverse';
    el.style.left = (geom.ox + s.col * geom.sq) + 'px';
    el.style.top = (geom.oy + (down ? s.row : s.row - 3) * geom.sq) + 'px';
    el.style.width = geom.sq + 'px';
    el.querySelectorAll('button').forEach(function (b) {
      b.style.width = geom.sq + 'px';
      b.style.height = geom.sq + 'px';
    });
  }
  function paintButton(cv, piece) {
    const s = geom.sq || 48, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f4efe4';
    g.fillRect(0, 0, s, s);
    drawPiece(g, piece, s / 2, s / 2 + s * 0.02, s);
  }

  Chess.render = {
    bind: function (el) { canvas = el; ctx = el.getContext('2d'); resize(); },
    resize: resize, draw: draw, hit: hit, cellCenter: cellCenter,
    placePromo: placePromo, paintButton: paintButton, screenOf: screenOf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
