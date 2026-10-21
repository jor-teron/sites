/* Chess piece model. Draws one outlined piece glyph at a centre point for a square size. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  const GLYPH = { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔', '-1': '♟', '-2': '♞', '-3': '♝', '-4': '♜', '-5': '♛', '-6': '♚' };
  function drawPiece(g, piece, cx, cy, sq) {
    const white = piece > 0;
    const ch = GLYPH[piece];
    if (!ch) return;
    g.save();
    g.font = Math.floor(sq * 0.82) + 'px "DejaVu Sans", "Noto Sans Symbols2", "Noto Sans Symbols", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(1, sq * 0.045);
    g.lineJoin = 'round';
    g.strokeStyle = white ? '#2a241c' : '#f4efe8';
    g.strokeText(ch, cx, cy);
    g.fillStyle = white ? '#fbf7ef' : '#1a1612';
    g.fillText(ch, cx, cy);
    g.restore();
  }
  Chess.pieces = { draw: drawPiece, GLYPH: GLYPH };
})(typeof globalThis !== 'undefined' ? globalThis : this);
