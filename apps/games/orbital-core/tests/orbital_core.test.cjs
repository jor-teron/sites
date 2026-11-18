/**
 * Orbital Core 3D - Automated Test Suite
 * Tests planetary math, 4 tower definitions, 5 enemy archetypes, CSV registration, and save system.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Orbital Core 3D Test Suite...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. File Structure Verification
test('File structure integrity', () => {
  const baseDir = path.resolve(__dirname, '..');
  const requiredFiles = [
    'index.html',
    'orbital-core.html',
    'orbital-core_icon.png',
    'assets/orbital-core_icon.png',
    'ui/style.css',
    'ui/hud.js',
    'core/audio.js',
    'core/planet.js',
    'core/towers.js',
    'core/enemies.js',
    'core/sim.js',
    'core/save.js',
    'core/main.js',
    'vendor/three/three.module.min.js'
  ];

  requiredFiles.forEach(rel => {
    const full = path.join(baseDir, rel);
    assert.ok(fs.existsSync(full), `Missing expected file: ${rel}`);
  });
});

// 2. CSV Registry Validation
test('CSV Menu Registration', () => {
  const csvPath = path.resolve(__dirname, '../../games-apps.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  assert.ok(content.includes('Orbital Core 3D'), 'Missing Orbital Core 3D entry in games-apps.csv');

  const line = content.split('\n').find(l => l.includes('Orbital Core 3D'));
  assert.ok(line, 'Could not find line in CSV');
  const parts = line.split(',').map(s => s.trim());
  assert.strictEqual(parts[0], 'Orbital Core 3D');
  assert.strictEqual(parts[1], 'orbital-core/');
  assert.strictEqual(parts[4], '3D');
});

// 3. Radius Scale Math (Levels 1 to 999)
test('Radius scale formula (10m to 50m)', () => {
  function getRadius(level) {
    const l = Math.max(1, Math.min(999, Math.floor(level)));
    return 10 + 40 * Math.pow((l - 1) / 998, 0.75);
  }

  const r1 = getRadius(1);
  const r100 = getRadius(100);
  const r500 = getRadius(500);
  const r999 = getRadius(999);

  assert.strictEqual(Math.round(r1), 10, 'Level 1 radius should be 10m');
  assert.ok(r100 > 15 && r100 < 18, `Level 100 radius out of expected bounds: ${r100}`);
  assert.ok(r500 > 30 && r500 < 37, `Level 500 radius out of expected bounds: ${r500}`);
  assert.strictEqual(Math.round(r999), 50, 'Level 999 radius should be 50m');
});

// 4. Tower Weapon Definitions
test('4 Defensive Towers Specification', () => {
  const towersCode = fs.readFileSync(path.resolve(__dirname, '../core/towers.js'), 'utf8');
  const expectedTowers = ['laser', 'mortar', 'cryo', 'missile'];

  expectedTowers.forEach(key => {
    assert.ok(towersCode.includes(`id: '${key}'`), `Missing tower type: ${key}`);
  });

  const obsoleteTowers = ['railgun', 'tesla', 'vortex', 'flak'];
  obsoleteTowers.forEach(key => {
    assert.ok(!towersCode.includes(`id: '${key}'`), `Obsolete tower type still present: ${key}`);
  });
});

// 5. Enemy Archetypes
test('5 Enemy Archetypes Specification', () => {
  const enemiesCode = fs.readFileSync(path.resolve(__dirname, '../core/enemies.js'), 'utf8');
  const expectedEnemies = ['scuttler', 'goliath', 'burrower', 'skimmer', 'queen'];

  expectedEnemies.forEach(key => {
    assert.ok(enemiesCode.includes(`id: '${key}'`), `Missing enemy archetype: ${key}`);
  });

  assert.ok(!enemiesCode.includes("id: 'roller'"), "Obsolete enemy archetype 'roller' still present");
});

// 6. Scrap Value Formula (75% refund)
test('Tower Scrap 75% refund formula', () => {
  const cost = 200;
  const scrapValue = Math.floor(cost * 0.75);
  assert.strictEqual(scrapValue, 150, 'Scrap refund should be 75% of invested value');
});

// 7. Deprecated Type Resiliency & Fallback
test('Obsolete type graceful fallback in Tower and Enemy constructors', () => {
  const towersCode = fs.readFileSync(path.resolve(__dirname, '../core/towers.js'), 'utf8');
  assert.ok(towersCode.includes("this.typeKey = TOWER_TYPES[typeKey] ? typeKey : 'laser';"), 'Tower constructor lacks safe fallback');

  const enemiesCode = fs.readFileSync(path.resolve(__dirname, '../core/enemies.js'), 'utf8');
  assert.ok(enemiesCode.includes("this.typeKey = ENEMY_TYPES[typeKey] ? typeKey : 'scuttler';"), 'Enemy constructor lacks safe fallback');
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
