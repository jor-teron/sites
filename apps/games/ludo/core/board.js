/*
 * Ludo — board geometry (LUDO-1a). Pure data: where each square is on the 15 x 15 grid.
 * TRACK[i] = [x, y] of track square i (0 = red start, clockwise, 52 squares).
 * HOME[color][k] = home column square k (0..4); CENTRE = the 3 x 3 finish (top-left square); FINISH[color] = where home tokens sit. YARD[color][k] = token spot k in the yard.
 * cellOf(color, progress, k) maps a token (progress -1 yard, 0..50 track, 51..55 home column, 56 home) to [x, y].
 */
const LDBoard = (() => {
  const C = LD_CONFIG;
  // walk the outer ring of the cross clockwise from red's start square (1, 6)
  const TRACK = [];
  const run = (x, y, dx, dy, n) => { for (let i = 0; i < n; i++) TRACK.push([x + dx * i, y + dy * i]); };
  run(1, 6, 1, 0, 5);  run(6, 5, 0, -1, 6); run(7, 0, 1, 0, 1);   // red arm → top arm up, top middle
  run(8, 0, 0, 1, 6);  run(9, 6, 1, 0, 6);  run(14, 7, 0, 1, 1);  // top arm down → right arm, right middle
  run(14, 8, -1, 0, 6); run(8, 9, 0, 1, 6); run(7, 14, -1, 0, 1); // right arm back → bottom arm down, bottom middle
  run(6, 14, 0, -1, 6); run(5, 8, -1, 0, 6); run(0, 7, 0, -1, 1); // bottom arm up → left arm, left middle
  run(0, 6, 1, 0, 1);                                             // back to (0, 6), just before red's start
  // the walk starts at (1,6) and ends at (0,6): 52 squares
  const HOME = {
    red: [1, 2, 3, 4, 5].map((x) => [x, 7]),
    green: [1, 2, 3, 4, 5].map((y) => [7, y]),
    yellow: [13, 12, 11, 10, 9].map((x) => [x, 7]),
    blue: [13, 12, 11, 10, 9].map((y) => [7, y]),
  };
  const CENTRE = [6, 6];
  const YARD_ORIGIN = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
  const YARD = {};
  for (const c of C.colors) { const [ox, oy] = YARD_ORIGIN[c]; YARD[c] = [[1.75, 1.75], [3.25, 1.75], [1.75, 3.25], [3.25, 3.25]].map(([a, b]) => [ox + a + 0.5, oy + b + 0.5]); }
  // finished tokens sit in their colour's triangle of the centre square
  const FINISH = { red: [6.85, 7.5], green: [7.5, 6.85], yellow: [8.15, 7.5], blue: [7.5, 8.15] };
  const lastTrack = C.trackLen - 2;                       // 50: last track step before the home column
  const abs = (color, p) => (p >= 0 && p <= lastTrack ? (C.start[color] + p) % C.trackLen : -1);
  const SAFE = new Set(C.stars.concat(C.colors.map((c) => C.start[c])));
  /** Centre point of a token's square in grid units (x + 0.5 = middle of column x). */
  function cellOf(color, p, k) {
    if (p < 0) return YARD[color][k];
    if (p <= lastTrack) { const [x, y] = TRACK[abs(color, p)]; return [x + 0.5, y + 0.5]; }
    if (p < C.goal) { const [x, y] = HOME[color][p - lastTrack - 1]; return [x + 0.5, y + 0.5]; }
    return FINISH[color];
  }
  return { TRACK, HOME, CENTRE, FINISH, YARD, YARD_ORIGIN, SAFE, lastTrack, abs, cellOf, isSafe: (i) => SAFE.has(i) };
})();
