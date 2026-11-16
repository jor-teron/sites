// Physics Lab PS1f - every scene builds and runs without NaN.
// Run: node --test apps/learn/physics-lab/tests/*.cjs
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ctx = { window: {} };
vm.createContext(ctx);
for (const file of ['../core/engine.js', '../core/scenes.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), ctx);
}
const P = ctx.window.PLPhysics, S = ctx.window.PLScenes;

test('all six scenes build and run for two seconds', () => {
  assert.strictEqual(S.list.length, 6);
  for (const scene of S.list) {
    const w = P.world(10, 6);
    scene.build(w);
    assert.ok(w.bodies.length > 0, scene.id + ' has bodies');
    for (let i = 0; i < 2 * 240; i++) w.step(1 / 240);
    for (const b of w.bodies) {
      for (const k of ['x', 'y', 'vx', 'vy', 'angle']) {
        assert.ok(Number.isFinite(b[k]), scene.id + ' ' + k + ' is finite');
      }
      assert.ok(b.y > -1, scene.id + ' body stays in the world: y=' + b.y);
    }
  }
});

test('scene ids are unique and look-up works', () => {
  const ids = S.list.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.strictEqual(S.get('bounce').id, 'bounce');
  assert.strictEqual(S.get('nope').id, 'sandbox');
});
