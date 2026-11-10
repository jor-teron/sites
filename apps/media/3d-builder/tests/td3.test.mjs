/* Pure-helper tests for 3D Builder TD3. No DOM, no jsdom, no browser. */
import {
  RELEASE, FORMAT_VERSION, ALL_TYPES, MAX_MODEL_BYTES,
  normalizeObject, migrateProject, parseProject, makeProject
} from '../tb_io.js';

let failed = 0, passed = 0;
function assert(cond, msg) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error('FAIL:', msg);
}

assert(RELEASE === 'TD3', 'RELEASE TD3');
assert(FORMAT_VERSION === 3, 'format v3');
assert(ALL_TYPES.indexOf('model') >= 0, 'model type listed');
assert(MAX_MODEL_BYTES === 8 * 1024 * 1024, '8 MB model cap');

const v2 = {
  format: 'h3d', version: 2,
  skyCustom: true, sky: '#112233',
  objects: [{ type: 'box', name: 'Box 1', position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#4f8cff' }],
  textures: {}
};
const mig = migrateProject(v2);
assert(mig.ok && mig.project.version === 3, 'v2 migrates to v3');
assert(mig.project.skyCustom === true && mig.project.sky === '#112233', 'sky carried forward');
assert(mig.project.models && Object.keys(mig.project.models).length === 0, 'v2 has empty models map');

const rec = normalizeObject({ type: 'model', name: 'House', modelId: 'm1', position: [1, 0, 2] });
assert(rec && rec.type === 'model' && rec.modelId === 'm1', 'normalize model');
assert(rec.position[0] === 1 && rec.position[2] === 2, 'model transform kept');

const withModel = migrateProject({
  format: 'h3d', version: 3,
  objects: [{ type: 'model', id: 'o1', name: 'House', modelId: 'm1' }],
  models: {
    m1: { dataURL: 'data:model/gltf-binary;base64,AAAA', name: 'house.glb' },
    bad: { dataURL: 'http://example.com/x.glb', name: 'nope' }
  }
});
assert(withModel.ok, 'v3 project with model parses');
assert(withModel.project.models.m1 && withModel.project.models.m1.name === 'house.glb', 'model blob kept');
assert(!withModel.project.models.bad, 'non-dataURL model dropped');

const made = makeProject([rec], { models: { m1: { dataURL: 'data:model/gltf-binary;base64,AAAA', name: 'a.glb' } } });
assert(made.version === 3 && made.models.m1, 'makeProject stores models');

const parsed = parseProject(JSON.stringify(v2));
assert(parsed.ok && parsed.project.version === 3, 'parse v2 JSON upgrades');

assert(!migrateProject({ format: 'h3d', version: 4, objects: [] }).ok, 'v4 rejected');

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('td3 tests ok: ' + passed + ' passed');
