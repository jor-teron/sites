/*
 * Game of Life — pattern library (LIFE-1). Written as text rows ('O' = alive),
 * turned into [[x,y],...] lists by parse().
 */
const LifePatterns = (() => {
  const RAW = {
    glider: ['.O.', '..O', 'OOO'],
    lwss: ['.O..O', 'O....', 'O...O', 'OOOO.'],
    pulsar: [
      '..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..',
      '.............', '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..'],
    gun: [
      '........................O...........', '......................O.O...........',
      '............OO......OO............OO', '...........O...O....OO............OO',
      'OO........O.....O...OO..............', 'OO........O...O.OO....O.O...........',
      '..........O.....O.......O...........', '...........O...O....................',
      '............OO......................'],
    rpentomino: ['.OO', 'OO.', '.O.'],
    acorn: ['.O.....', '...O...', 'OO..OOO'],
    blinker: ['OOO'],
  };
  const NAMES = { glider: 'Glider', lwss: 'LWSS (spaceship)', pulsar: 'Pulsar', gun: 'Gosper glider gun', rpentomino: 'R-pentomino', acorn: 'Acorn' };
  const parse = (rows) => { const out = []; rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'O') out.push([x, y]); }); return out; };
  const get = (id) => (RAW[id] ? parse(RAW[id]) : null);
  return { get, NAMES };
})();
