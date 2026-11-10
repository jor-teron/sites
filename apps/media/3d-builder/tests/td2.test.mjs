/* Pure-helper tests for 3D Builder TD2. No DOM, no jsdom, no browser. */
import {
  RELEASE, FORMAT_VERSION, SHAPE_TYPES, LIGHT_TYPES, ALL_TYPES,
  normalizeObject, normalizeMaterial, normalizeTexture, normalizeLight,
  migrateProject, parseProject, makeProject, parseColorOr, nextName
} from '../tb_io.js';
import { alignItems, distributeItems, snapBoxes, boxCenter } from '../tb_align.js';

let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error('FAIL:', msg);
}
function almost(a, b, eps) { return Math.abs(a - b) < (eps == null ? 1e-9 : eps); }

assert(RELEASE === 'TD2', 'RELEASE TD2');
assert(FORMAT_VERSION === 2, 'FORMAT_VERSION 2');
assert(SHAPE_TYPES.length === 6 && LIGHT_TYPES.length === 3, 'type lists');
assert(ALL_TYPES.indexOf('group') >= 0, 'group is a type');

const v1 = {
  format: 'h3d',
  version: 1,
  objects: [
    { type: 'box', name: 'Box 1', position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#4f8cff' }
  ]
};
const mig = migrateProject(v1);
assert(mig.ok && mig.project.version === 2, 'v1 migrates to v2');
assert(mig.fromVersion === 1, 'fromVersion 1');
const o = mig.project.objects[0];
assert(o.visible === true && o.locked === false && o.parentId === null, 'v1 defaults visible/unlocked');
assert(o.material && almost(o.material.roughness, 0.55) && almost(o.material.metalness, 0.12), 'default material');
assert(o.texture === null, 'no texture on v1 object');
assert(mig.project.skyCustom === false, 'no custom sky after v1 migrate');

const badParent = migrateProject({
  format: 'h3d', version: 2,
  objects: [
    { type: 'box', id: 'a', name: 'A', parentId: 'missing' },
    { type: 'group', id: 'g', name: 'G' },
    { type: 'box', id: 'b', name: 'B', parentId: 'g' }
  ]
});
assert(badParent.ok, 'project with parent refs parses');
assert(badParent.project.objects.find(function (x) { return x.id === 'a'; }).parentId === null, 'dangling parent dropped');
assert(badParent.project.objects.find(function (x) { return x.id === 'b'; }).parentId === 'g', 'valid parent kept');

const cycle = migrateProject({
  format: 'h3d', version: 2,
  objects: [
    { type: 'group', id: 'g1', name: 'G1', parentId: 'g2' },
    { type: 'group', id: 'g2', name: 'G2', parentId: 'g1' }
  ]
});
assert(cycle.ok, 'cycle still parses');
/* at least one parent link is broken */
const g1 = cycle.project.objects.find(function (x) { return x.id === 'g1'; });
const g2 = cycle.project.objects.find(function (x) { return x.id === 'g2'; });
assert(!(g1.parentId === 'g2' && g2.parentId === 'g1'), 'cycle broken');

assert(normalizeObject({ type: 'pyramid' }) === null, 'unknown type rejected');
const light = normalizeObject({ type: 'light-spot', name: 'Spot 1' });
assert(light && light.intensity === 1.5 && light.angle === 30, 'spot defaults');
assert(light.color === '#ffffff', 'light default colour');

const shiny = normalizeMaterial({ shininess: 0.8 });
assert(almost(shiny.roughness, 0.2), 'shininess maps to roughness');
const tex = normalizeTexture({ kind: 'text', text: 'Hi', textColor: '#fff', fontSize: 200 });
assert(tex && tex.text === 'Hi' && tex.textColor === '#ffffff' && tex.fontSize === 128, 'text texture clamped');
assert(normalizeTexture({ kind: 'image', id: 'tex1' }).id === 'tex1', 'image texture id');
assert(normalizeTexture({ kind: 'image' }) === null, 'image without id dropped');

const v1text = parseProject(JSON.stringify(v1));
assert(v1text.ok && v1text.project.version === 2, 'parseProject migrates v1 JSON');

assert(!migrateProject({ format: 'h3d', version: 99, objects: [] }).ok, 'future version rejected');

/* Align: two boxes side by side, align X left (min) */
const items = [
  { id: 'a', box: { min: [0, 0, 0], max: [1, 1, 1] }, position: [0.5, 0.5, 0.5] },
  { id: 'b', box: { min: [3, 0, 0], max: [5, 2, 2] }, position: [4, 1, 1] }
];
const left = alignItems(items, 0, 'min');
assert(almost(left.a[0], 0.5), 'left align keeps leftmost');
assert(almost(left.b[0], 1), 'right box moves so min.x = 0');
const cx = alignItems(items, 0, 'center');
/* centres were 0.5 and 4, mid = 2.25; a moves by 1.75 to 2.25, b by -1.75 to 2.25 */
assert(almost(cx.a[0], 2.25) && almost(cx.b[0], 2.25), 'centre align X');
const right = alignItems(items, 0, 'max');
assert(almost(right.a[0], 4.5) && almost(right.b[0], 4), 'right align X to max 5');

const three = [
  { id: 'a', box: { min: [0, 0, 0], max: [1, 1, 1] }, position: [0.5, 0.5, 0.5] },
  { id: 'b', box: { min: [1, 0, 0], max: [2, 1, 1] }, position: [1.5, 0.5, 0.5] },
  { id: 'c', box: { min: [4, 0, 0], max: [5, 1, 1] }, position: [4.5, 0.5, 0.5] }
];
const dist = distributeItems(three, 0);
assert(almost(dist.a[0], 0.5) && almost(dist.c[0], 4.5), 'distribute ends stay');
assert(almost(dist.b[0], 2.5), 'distribute middle centred');
assert(Object.keys(distributeItems(items, 0)).length === 0, 'distribute needs 3');
assert(Object.keys(alignItems([items[0]], 0, 'min')).length === 0, 'align needs 2');

const moving = { min: [0.95, 0, 0], max: [1.95, 1, 1] };
const others = [{ min: [2, 0, 0], max: [3, 1, 1] }];
const snap = snapBoxes(moving, others, 0.2);
assert(almost(snap[0], 0.05) && snap[1] === 0 && snap[2] === 0, 'snap max of moving to min of other');
const far = snapBoxes({ min: [0, 0, 0], max: [1, 1, 1] }, others, 0.2);
assert(far[0] === 0, 'no snap when farther than threshold');

assert(parseColorOr('#fff', '#000000') === '#ffffff', 'parseColorOr short hex');
assert(parseColorOr('bad', '#123456') === '#123456', 'parseColorOr fallback');
assert(nextName('light-point', []) === 'Point light 1', 'light name');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('td2 tests ok: ' + passed + ' passed');
