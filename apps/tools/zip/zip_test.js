/*
 * ZIP ZP1 — syntax check and deterministic smoke tests.
 * Run: node zip_test.js
 * Not loaded by the page. No browser and no network.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
for (const file of ['zip_core.js', 'zip_ui.js']) {
  const r = spawnSync(process.execPath, ['--check', path.join(dir, file)], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  console.log('syntax ok', file);
}

const page = ['zip.html', 'zip_ui.js', 'zip.css', 'index.html'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
assert.strictEqual(/\b(alert|confirm|prompt)\s*\(/.test(page), false, 'in-app dialogs only');
assert.strictEqual(/https?:\/\//.test(page), false, 'no remote URL in the page');

const JSZip = require('./vendor/jszip.min.js');
const Z = require('./zip_core.js');

let pass = 0;
function ok(cond, msg) {
  assert.strictEqual(!!cond, true, msg);
  pass++;
}
function eqBytes(a, b, msg) {
  assert.deepStrictEqual(Array.from(a), Array.from(b), msg);
  pass++;
}

function patchZip(bytes, fn) {
  const u = new Uint8Array(bytes);
  assert.strictEqual(u[0], 0x50);
  assert.strictEqual(u[2], 3);
  fn(u, 0, 'local');
  let eocd = -1;
  for (let i = u.length - 22; i >= 0; i--) {
    if (u[i] === 0x50 && u[i + 1] === 0x4b && u[i + 2] === 5 && u[i + 3] === 6) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'eocd');
  const cd = u[eocd + 16] | (u[eocd + 17] << 8) | (u[eocd + 18] << 16) | (u[eocd + 19] << 24);
  assert.strictEqual(u[cd + 2], 1);
  fn(u, cd, 'central');
  return u;
}

async function main() {
  ok(Z.safePath('notes/readme.txt').path === 'notes/readme.txt', 'safe nested');
  ok(Z.safePath('文件夹/笔记.txt').path === '文件夹/笔记.txt', 'safe unicode');
  ok(Z.safePath('..\\secret.txt').ok === false, 'parent backslash');
  ok(Z.safePath('foo/../../etc/passwd').reason === 'parent path', 'parent segments');
  ok(Z.safePath('/etc/passwd').reason === 'absolute path', 'absolute');
  ok(Z.safePath('C:/Windows/a.txt').reason === 'absolute path', 'drive');
  ok(Z.safePath('a\\b.txt').path === 'a/b.txt', 'backslash normalised');
  ok(Z.safePath('CON.txt').reason === 'reserved name', 'reserved');
  ok(Z.safePath('bad\0name.txt').ok === false, 'null');
  ok(Z.safePath('a/b/c/d/e/f/g/h/i.txt').reason === 'path too deep', 'depth');
  ok(Z.safePath('').ok === false, 'empty name');

  const binary = new Uint8Array([0, 1, 2, 255, 0, 128, 10]);
  const text = new TextEncoder().encode('Hello, ZIP.\nSecond line.');
  const empty = new Uint8Array(0);
  const unicodeName = 'notes/кафе.txt';
  const unicodeBody = new TextEncoder().encode('你好 café — ☃');
  const built = await Z.buildArchive([
    { name: 'bin.dat', data: binary },
    { name: 'hello.txt', data: text },
    { name: 'empty.txt', data: empty },
    { name: unicodeName, data: unicodeBody },
    { name: 'hello.txt', data: new Uint8Array([55]) }
  ], JSZip);
  ok(built.names[4] === 'hello (2).txt', 'duplicate renamed, not overwritten');
  const opened = await Z.openArchive(built.bytes, JSZip);
  eqBytes(await Z.readEntry(opened.zip, 'bin.dat'), binary, 'roundtrip binary');
  eqBytes(await Z.readEntry(opened.zip, 'hello.txt'), text, 'roundtrip text');
  eqBytes(await Z.readEntry(opened.zip, 'empty.txt'), empty, 'roundtrip empty');
  eqBytes(await Z.readEntry(opened.zip, unicodeName), unicodeBody, 'roundtrip unicode');
  eqBytes(await Z.readEntry(opened.zip, 'hello (2).txt'), new Uint8Array([55]), 'second hello kept');

  await assert.rejects(() => Z.openArchive(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), JSZip), /valid ZIP|damaged|empty/i);
  await assert.rejects(() => Z.openArchive(new Uint8Array(0), JSZip), /empty/i);
  pass += 2;

  const plain = await Z.buildArchive([{ name: 'a.txt', data: new Uint8Array([9, 8, 7]) }], JSZip);
  const encrypted = patchZip(plain.bytes, (u, off, kind) => { u[(kind === 'local' ? off + 6 : off + 8)] |= 1; });
  await assert.rejects(() => Z.openArchive(encrypted, JSZip), /encrypt/i);
  pass++;
  const weird = patchZip(plain.bytes, (u, off, kind) => {
    const at = kind === 'local' ? off + 8 : off + 10;
    u[at] = 99; u[at + 1] = 0;
  });
  await assert.rejects(() => Z.openArchive(weird, JSZip), /compression|valid ZIP|damaged/i);
  pass++;

  const storeZip = new JSZip();
  storeZip.file('a.txt', new Uint8Array([1, 2, 3, 4]), { compression: 'STORE' });
  const storeBytes = new Uint8Array(await storeZip.generateAsync({ type: 'uint8array', compression: 'STORE' }));
  const nameLen = storeBytes[26] | (storeBytes[27] << 8);
  const extraLen = storeBytes[28] | (storeBytes[29] << 8);
  storeBytes[30 + nameLen + extraLen] ^= 0xff;
  const damaged = await Z.openArchive(storeBytes, JSZip);
  await assert.rejects(() => Z.readEntry(damaged.zip, 'a.txt'), /checksum|CRC|damaged/i);
  pass++;

  const evil = new JSZip();
  evil.file('../secret.txt', 'nope');
  evil.file('/tmp/x.txt', 'nope');
  evil.file('ok.txt', 'yes');
  const evilBytes = await evil.generateAsync({ type: 'uint8array' });
  const evilOpen = await Z.openArchive(evilBytes, JSZip);
  const paths = evilOpen.view.entries.filter((e) => !e.dir).map((e) => e.path);
  ok(paths.indexOf('ok.txt') !== -1, 'safe file kept');
  ok(paths.every((p) => p.indexOf('..') === -1 && p.charAt(0) !== '/'), 'dangerous paths not listed');
  ok(evilOpen.view.skipped.some((s) => s.reason === 'parent path'), 'parent skipped');
  ok(evilOpen.view.skipped.some((s) => s.reason === 'absolute path'), 'absolute skipped');
  await assert.rejects(() => Z.readEntry(evilOpen.zip, 'secret.txt'));
  await assert.rejects(() => Z.readEntry(evilOpen.zip, '../secret.txt'));
  pass += 2;

  const small = Object.assign({}, Z.LIMITS, { maxEntryBytes: 8, maxTotalBytes: 8, maxArchiveBytes: 1000 });
  await assert.rejects(() => Z.buildArchive([{ name: 'big.bin', data: new Uint8Array(20) }], JSZip, small), /too large/i);
  pass++;

  const bombLimits = Object.assign({}, Z.LIMITS, {
    maxRatio: 4, ratioFloor: 64, maxEntryBytes: 300000, maxTotalBytes: 300000, maxArchiveBytes: 300000
  });
  const zeros = new Uint8Array(8000);
  const bombBuilt = await Z.buildArchive([{ name: 'zeros.bin', data: zeros }], JSZip, bombLimits);
  const bombOpen = await Z.openArchive(bombBuilt.bytes, JSZip, bombLimits);
  ok(bombOpen.view.entries.every((e) => e.dir), 'zip bomb not listed');
  ok(bombOpen.view.skipped.some((s) => s.reason === 'compression ratio too high'), 'ratio skipped');
  await assert.rejects(() => Z.readEntry(bombOpen.zip, 'zeros.bin', bombLimits, 0), /ratio/i);
  pass++;

  const totalLimits = Object.assign({}, Z.LIMITS, { maxTotalBytes: 10, maxEntryBytes: 100, ratioFloor: 1e9 });
  const two = await Z.buildArchive([
    { name: 'a.txt', data: new Uint8Array([1, 2, 3, 4, 5]) },
    { name: 'b.txt', data: new Uint8Array([6, 7, 8, 9, 10, 11]) }
  ], JSZip, Object.assign({}, totalLimits, { maxTotalBytes: 100 }));
  const twoOpen = await Z.openArchive(two.bytes, JSZip, totalLimits);
  const kept = twoOpen.view.entries.filter((e) => !e.dir).map((e) => e.path);
  ok(kept.indexOf('a.txt') !== -1 && kept.indexOf('b.txt') === -1, 'total cap drops the later file');
  ok(twoOpen.view.skipped.some((s) => s.reason === 'uncompressed total too large'), 'total reason');

  const emptyZip = await new JSZip().generateAsync({ type: 'uint8array' });
  const emptyOpen = await Z.openArchive(emptyZip, JSZip);
  ok(emptyOpen.view.entries.length === 0, 'empty archive');

  console.log(pass + ' passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
