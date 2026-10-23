// Demolisher DM1a: levels 01-100 (00 is the fixed Demo world, checked in the browser test) are deterministic and pass validation.
// Run: node apps/games/demolisher/test/levels.test.cjs
const crypto = require('crypto');
const SEED = require('../demolisher_seed.js');
const LV = require('../demolisher_levels.js');
const sig = (lv) => crypto.createHash('sha1').update(Buffer.from(lv.tiles)).update(JSON.stringify([lv.top, lv.spawn, lv.targets, lv.enemies, lv.ammo])).digest('hex');
let fails = 0; const rows = [];
const bad = (m) => { fails++; console.log('FAIL', m); };
for (let n = 1; n <= SEED.MAX_LEVEL; n++) {
  const a = LV.generateLevel(n), b = LV.generateLevel(n);
  if (sig(a) !== sig(b)) bad('level ' + n + ' differs between two runs');
  if (a.errors.length) bad('level ' + n + ' invalid: ' + a.errors.slice(0, 3).join('; '));
  const again = LV.validateLevel(a); if (again.length) bad('level ' + n + ' revalidate: ' + again[0]);
  rows.push(`${n}:T${a.targets.length}/E${a.enemies.length}/R${a.ammo.rocket}/P${a.pits.length}/a${a.attempt}`);
}
const sigs = new Set(); for (let n = 1; n <= SEED.MAX_LEVEL; n++) sigs.add(sig(LV.generateLevel(n)));
if (sigs.size !== SEED.MAX_LEVEL) bad('levels are not all different');
for (const v of [0, 101, -1, 1.5, NaN]) { try { LV.generateLevel(v); bad('generateLevel(' + v + ') should throw'); } catch (e) { /* expected */ } }
if (SEED.isLevelNumber(101) || SEED.isLevelNumber(-1) || !SEED.isLevelNumber(0) || !SEED.isLevelNumber(100)) bad('isLevelNumber');
if (SEED.pad2(7) !== '07' || SEED.pad2(100) !== '100') bad('pad2');
console.log(rows.join(' '));
console.log(fails ? fails + ' FAILURES' : 'ALL OK');
process.exit(fails ? 1 : 0);
