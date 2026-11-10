/* Pure-helper tests for 3D Builder TD1. No DOM, no jsdom, no browser. */
import {
  RELEASE, FORMAT, FORMAT_VERSION, TYPES, SNAP,
  radToDeg, degToRad, snapValue, roundN,
  sitHeight, defaultRotationDeg, nextName, nextOffset,
  parseColor, normalizeObject, makeProject, validateProject, parseProject
} from '../tb_io.js';
import { createHistory, HISTORY_LIMIT } from '../tb_history.js';

let failed = 0;
let passed = 0;

function assert(cond, msg) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error('FAIL:', msg);
}

function almost(a, b, eps) {
  return Math.abs(a - b) < (eps == null ? 1e-9 : eps);
}

assert(RELEASE === 'TD1', 'RELEASE is TD1');
assert(FORMAT === 'h3d' && FORMAT_VERSION === 1, 'format version 1');
assert(TYPES.length === 6, 'six primitive types');
assert(SNAP.translate === 0.5 && SNAP.rotateDeg === 15 && SNAP.scale === 0.1, 'snap steps');

assert(almost(radToDeg(Math.PI), 180), 'radToDeg pi');
assert(almost(degToRad(180), Math.PI), 'degToRad 180');
assert(snapValue(1.24, 0.5) === 1, 'snap 1.24 -> 1');
assert(snapValue(1.26, 0.5) === 1.5, 'snap 1.26 -> 1.5');
assert(roundN(1.23456, 3) === 1.235, 'roundN 3');

assert(sitHeight('box') === 0.5 && sitHeight('sphere') === 0.5, 'sit box/sphere');
assert(sitHeight('cylinder') === 0.5 && sitHeight('cone') === 0.5, 'sit cyl/cone');
assert(sitHeight('plane') === 0 && sitHeight('torus') === 0.2, 'sit plane/torus');
assert(defaultRotationDeg('plane')[0] === -90, 'plane lies on the grid');
assert(defaultRotationDeg('box').join() === '0,0,0', 'box rotation default');

assert(nextName('box', []) === 'Box 1', 'first box name');
assert(nextName('box', ['Box 1', 'Box 2']) === 'Box 3', 'next box name');
assert(nextName('sphere', ['Sphere 1']) === 'Sphere 2', 'next sphere name');

assert(nextOffset([]).join() === '0,0', 'first slot is origin');
assert(nextOffset([[0, 0]]).join() === '1.25,0', 'second slot +X');
assert(nextOffset([[0, 0], [1.25, 0]]).join() === '2.5,0', 'third slot further +X');

assert(parseColor('#ABC') === '#aabbcc', 'short hex');
assert(parseColor('#4F8CFF') === '#4f8cff', 'long hex lowercased');
assert(parseColor('nope') === '#4f8cff', 'bad color falls back');

const rec = normalizeObject({ type: 'box', name: '  A  ', position: ['1', 2, 3] });
assert(rec && rec.type === 'box' && rec.name === 'A', 'normalize trims name');
assert(rec.position[0] === 1 && rec.position[1] === 2 && rec.position[2] === 3, 'position numbers');
assert(normalizeObject({ type: 'pyramid' }) === null, 'unknown type rejected');

const proj = makeProject([
  { type: 'box', name: 'Box 1', position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#4f8cff' }
]);
const ok = validateProject(proj);
assert(ok.ok && ok.project.objects.length === 1, 'valid project');
assert(!validateProject({ format: 'glb', version: 1, objects: [] }).ok, 'wrong format');
assert(!validateProject({ format: 'h3d', version: 2, objects: [] }).ok, 'wrong version');
assert(!validateProject({ format: 'h3d', version: 1 }).ok, 'missing objects');
const parsed = parseProject(JSON.stringify(proj));
assert(parsed.ok && parsed.project.objects[0].name === 'Box 1', 'parseProject');
assert(!parseProject('{').ok, 'bad JSON');

let state = { n: 0, sel: null };
const hist = createHistory({
  getState: function () { return { n: state.n, sel: state.sel }; },
  setState: function (s) { state.n = s.n; state.sel = s.sel; }
});
assert(!hist.canUndo() && !hist.canRedo(), 'fresh history empty');
state.n = 1;
assert(hist.push() === true, 'push change');
assert(hist.canUndo() && !hist.canRedo(), 'can undo after push');
assert(hist.push() === false, 'no-op push rejected');
state.n = 2;
hist.push();
hist.undo();
assert(state.n === 1, 'undo to 1');
hist.undo();
assert(state.n === 0, 'undo to 0');
assert(!hist.canUndo(), 'stack empty');
hist.redo();
assert(state.n === 1, 'redo to 1');
state.n = 9;
hist.push();
assert(!hist.canRedo(), 'new push clears redo');

state = { n: 0 };
const cap = createHistory({
  getState: function () { return { n: state.n }; },
  setState: function (s) { state.n = s.n; }
});
for (let i = 1; i <= HISTORY_LIMIT + 15; i++) {
  state.n = i;
  cap.push();
}
assert(cap.depth() === HISTORY_LIMIT, 'history capped at 100');
// undo all remaining
let steps = 0;
while (cap.undo()) steps += 1;
assert(steps === HISTORY_LIMIT, 'can undo 100 steps, not the discarded first 15');
assert(state.n === 15, 'oldest kept state is n=15');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('td1 tests ok: ' + passed + ' passed');
