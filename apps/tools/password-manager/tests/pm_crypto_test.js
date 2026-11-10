/* Node tests for Password Manager PW1 (crypto, generator, lock delays, helpers).
   Run: node apps/tools/password-manager/tests/pm_crypto_test.js
   No DOM, no jsdom, no browser. Needs Node 18+ (globalThis.crypto.subtle). */
'use strict';

var path = require('path');
var dir = path.join(__dirname, '..');
var PMCrypto = require(path.join(dir, 'pm_crypto.js'));
var PMGen = require(path.join(dir, 'pm_gen.js'));
var PMLock = require(path.join(dir, 'pm_lock.js'));
var PMUtil = require(path.join(dir, 'pm_util.js'));

var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + ' got ' + sa + ' expected ' + sb);
  else console.log('ok', name);
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? (' ' + detail) : ''));
}

async function cryptoTests() {
  ok('subtle available', !!(globalThis.crypto && crypto.subtle));

  var vault = { version: 1, settings: { autoLockMin: 5 }, entries: [{ id: 'a', type: 'login', title: 'Bank', username: 'jor', password: 's3cret' }] };
  var password = 'correct horse battery';
  var enc = await PMCrypto.encryptWithPassword(vault, password, 310000);
  ok('header v1', enc.header.v === 1);
  ok('header kdf', enc.header.kdf === 'PBKDF2-SHA256');
  ok('header iter stored', enc.header.iter === 310000);
  ok('salt b64', typeof enc.header.salt === 'string' && enc.header.salt.length > 8);
  ok('iv b64', typeof enc.header.iv === 'string' && enc.header.iv.length > 4);
  ok('ct b64', typeof enc.header.ct === 'string' && enc.header.ct.length > 8);
  ok('key non-extractable', enc.key && enc.key.extractable === false);

  var dec = await PMCrypto.decryptWithPassword(enc.header, password);
  eq('round-trip title', dec.vault.entries[0].title, 'Bank');
  eq('round-trip password', dec.vault.entries[0].password, 's3cret');
  eq('round-trip settings', dec.vault.settings.autoLockMin, 5);

  var wrongOk = false;
  try {
    await PMCrypto.decryptWithPassword(enc.header, 'wrong password');
  } catch (e) {
    wrongOk = true;
  }
  ok('wrong password fails', wrongOk);

  var tampered = {
    v: enc.header.v,
    kdf: enc.header.kdf,
    iter: enc.header.iter,
    salt: enc.header.salt,
    iv: enc.header.iv,
    ct: enc.header.ct
  };
  var raw = PMCrypto.b64dec(tampered.ct);
  raw[0] = raw[0] ^ 0xff;
  tampered.ct = PMCrypto.b64enc(raw);
  var tamperOk = false;
  try {
    await PMCrypto.decryptWithPassword(tampered, password);
  } catch (e) {
    tamperOk = true;
  }
  ok('tampered ciphertext fails', tamperOk);

  // New IV on each encrypt (same key + salt).
  var salt = PMCrypto.b64dec(enc.header.salt);
  var h2 = await PMCrypto.encryptVault(vault, enc.key, salt, 310000);
  ok('new iv each encrypt', h2.iv !== enc.header.iv);
  var dec2 = await PMCrypto.decryptVault(h2, enc.key);
  eq('second encrypt still decodes', dec2.entries[0].username, 'jor');

  // b64 helpers
  var bytes = new Uint8Array([0, 1, 2, 254, 255]);
  eq('b64 round-trip', Array.from(PMCrypto.b64dec(PMCrypto.b64enc(bytes))), [0, 1, 2, 254, 255]);
}

function genTests() {
  var pw = PMGen.generate({ length: 20, lower: true, upper: true, digit: true, symbol: true });
  eq('generate length 20', pw.length, 20);
  ok('has lower', /[a-z]/.test(pw));
  ok('has upper', /[A-Z]/.test(pw));
  ok('has digit', /\d/.test(pw));

  var looks = PMGen.generate({ length: 32, lower: true, upper: true, digit: true, symbol: false, avoid: true });
  ok('avoid look-alikes', !/[O0oIl1|S5sB8G6Z2]/.test(looks), looks);

  var short = PMGen.generate({ length: 8 });
  var long = PMGen.generate({ length: 64 });
  eq('min 8', short.length, 8);
  eq('max 64', long.length, 64);

  var clamped = PMGen.generate({ length: 3 });
  eq('clamps below 8', clamped.length, 8);
  var clampedHi = PMGen.generate({ length: 99 });
  eq('clamps above 64', clampedHi.length, 64);

  var bits = PMGen.bitsForLength(16, 62);
  ok('entropy ~95 bits', bits > 94 && bits < 96, String(bits));
  var weak = PMGen.strength('abc');
  eq('weak label', weak.cls, 'weak');
  var strong = PMGen.strengthFromOpts({ length: 20, lower: true, upper: true, digit: true, symbol: true });
  ok('long mixed is strong+', strong.cls === 'strong' || strong.cls === 'great', strong.cls + ' ' + strong.bitsLabel);
}

function lockTests() {
  eq('no delay after 0', PMLock.delayMsAfterFails(0), 0);
  eq('no delay after 4', PMLock.delayMsAfterFails(4), 0);
  eq('5s after 5 fails', PMLock.delayMsAfterFails(5), 5000);
  eq('10s after 6', PMLock.delayMsAfterFails(6), 10000);
  eq('20s after 7', PMLock.delayMsAfterFails(7), 20000);
  eq('40s after 8', PMLock.delayMsAfterFails(8), 40000);
  eq('60s cap after 9', PMLock.delayMsAfterFails(9), 60000);
  eq('60s cap after 12', PMLock.delayMsAfterFails(12), 60000);

  var rec = { fails: 0, delayUntil: 0 };
  var now = 1_000_000;
  var f1 = PMLock.applyFail(rec, now);
  eq('first fail count', f1.fails, 1);
  eq('first fail no wait', f1.delayUntil, 0);
  rec = f1;
  for (var i = 0; i < 4; i++) rec = PMLock.applyFail(rec, now);
  eq('fifth fail count', rec.fails, 5);
  eq('fifth fail sets delay', rec.delayUntil, now + 5000);
  eq('remaining 5s', PMLock.remainingDelay(rec, now), 5000);
  eq('remaining done', PMLock.remainingDelay(rec, now + 5000), 0);

  var cleared = PMLock.clearFails(rec);
  eq('cleared fails', cleared.fails, 0);
  eq('cleared delay', cleared.delayUntil, 0);
}

function utilTests() {
  eq('escape', PMUtil.escapeHtml('<x&">'), '&lt;x&amp;&quot;&gt;');
  eq('https ok', PMUtil.safeUrl('https://example.com/a'), 'https://example.com/a');
  eq('adds https', PMUtil.safeUrl('example.com'), 'https://example.com/');
  eq('rejects javascript', PMUtil.safeUrl('javascript:alert(1)'), '');
  eq('rejects data', PMUtil.safeUrl('data:text/html,hi'), '');
  eq('mask card', PMUtil.maskCard('4111 1111 1111 1234'), '•••• 1234');
  eq('type login', PMUtil.typeLabel('login'), 'Login');
  eq('type wifi', PMUtil.typeLabel('wifi'), 'Wi-Fi');
  eq('title fallback ssid', PMUtil.entryTitle({ type: 'wifi', title: '', ssid: 'HomeNet' }), 'HomeNet');
  var id = PMUtil.uid();
  ok('uid shape', /^[0-9a-f-]{36}$/.test(id), id);
}

async function main() {
  try {
    lockTests();
    utilTests();
    genTests();
    await cryptoTests();
  } catch (e) {
    fails.push('exception: ' + (e && e.stack || e));
  }
  if (fails.length) {
    console.error('\nFAILED ' + fails.length);
    fails.forEach(function (f) { console.error(' -', f); });
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

main();
