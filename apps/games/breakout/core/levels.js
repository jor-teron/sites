/* Ten handmade open layouts. # is permanent; digits are hit points; . is empty.
 * Solid bricks never make a sealed chamber or a full horizontal barrier. */
'use strict';
BRK.layouts = [
  ['1111111111', '1111111111', '.11111111.', '..111111..'],
  ['1........1', '12......21', '123....321', '.12322321.', '..111111..'],
  ['..112211..', '.12233221.', '1233..3321', '.12233221.', '..112211..'],
  ['2.2.2.2.2.', '.11111111.', '..#....#..', '.22222222.', '1.1.1.1.1.'],
  ['111....111', '.222..222.', '..333333..', '.222..222.', '111....111'],
  ['.3..33..3.', '.2..22..2.', '1111111111', '..#....#..', '.22222222.', '..111111..'],
  ['1231231231', '.12312312.', '..123123..', '...1231...', '....12....', '....11....'],
  ['.#..22..#.', '2222222222', '1.1.11.1.1', '.2.2..2.2.', '..33..33..', '111....111'],
  ['3.3.3.3.3.', '.2.2.2.2.2', '1111111111', '.#......#.', '222....222', '..111111..'],
  ['333....333', '2..2..2..2', '.11.11.11.', '..#....#..', '.22222222.', '..333333..', '111....111'],
];
BRK.makeLevel = function (level, random = Math.random) {
  const C = BRK.C;
  const rows = level <= BRK.layouts.length ? BRK.layouts[level - 1] :
    Array.from({ length: 7 }, (_, y) => Array.from({ length: 10 }, (_, x) => {
      if (y < 3 && (x === 2 || x === 7) && random() < .18) return '#';
      return random() < .18 ? '.' : String(1 + Math.floor(random() * 3));
    }).join(''));
  const bricks = [];
  rows.forEach((row, y) => [...row].forEach((v, x) => {
    if (v === '.') return;
    const hp = v === '#' ? -1 : Number(v);
    bricks.push({ x: C.left + x * (C.brickWidth + C.gap),
      y: C.top + y * (C.brickHeight + C.gap), hp, max: hp });
  }));
  if (!bricks.some(b => b.hp > 0)) bricks.push({ x: C.left, y: C.top, hp: 1, max: 1 });
  return bricks;
};
