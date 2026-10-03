/*
 * File Drop — filedrop_test.js   ·   run: node filedrop_test.js
 * Node tests for the pure parts (filedrop_proto.js + filedrop_config.js): links, frames,
 * names / types, formatting, assembly with resume, chunk sizing.
 */
'use strict';
globalThis.window = globalThis;
require('./filedrop_config.js');
const FD = require('./filedrop_proto.js');
const P = FD.proto, C = FD.config;
let pass = 0, fail = 0;
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) pass++; else { fail++; console.log('FAIL', msg, '\n  got ', JSON.stringify(a), '\n  want', JSON.stringify(b)); }
}

// ids
eq(P.rand(12).length, 12, 'rand length');
eq(/^[a-z2-9]+$/.test(P.rand(40)), true, 'rand alphabet');
eq(new Set(Array.from({ length: 200 }, () => P.rand(12))).size, 200, 'rand unique');
eq(/^\d{4}$/.test(P.code4()), true, 'code4');
eq(P.tid() > 0, true, 'tid > 0');

// links
const id = C.peerPrefix + 'abcdefghjk2345', tok = 'abcdefgh2345';
eq(P.makeLink('https://x.io/a/filedrop.html', id, tok), 'https://x.io/a/filedrop.html#' + id + '.' + tok, 'makeLink');
eq(P.parseLink('https://x.io/a/filedrop.html#' + id + '.' + tok, C), { id: id, token: tok }, 'parse full');
eq(P.parseLink('#' + id + '.' + tok, C), { id: id, token: tok }, 'parse hash');
eq(P.parseLink(id + '.' + tok, C), { id: id, token: tok }, 'parse bare');
eq(P.parseLink('https://x.io/#other-abc.def123', C), null, 'wrong prefix');
eq(P.parseLink('https://x.io/#' + C.codePrefix + '1234.abcdef', C), null, 'code id not a link');
eq(P.parseLink('https://x.io/#' + id, C), null, 'no token');
eq(P.parseLink('https://x.io/#' + id + '.ab', C), null, 'short token');
eq(P.parseLink('hello world', C), null, 'junk');
eq(P.parseLink('', C), null, 'empty');
eq(P.parseLink('https://x.io/#%E0%A4%A', C), null, 'bad escape');
eq(P.baseFor({ protocol: 'file:', hostname: '', href: 'file:///x/filedrop.html' }, C), C.publicBaseUrl + 'filedrop.html', 'file → public');
eq(P.baseFor({ protocol: 'http:', hostname: 'localhost', href: 'http://localhost:8000/x/filedrop.html' }, C), C.publicBaseUrl + 'filedrop.html', 'localhost → public');
eq(P.baseFor({ protocol: 'http:', hostname: '192.168.1.5', href: 'http://192.168.1.5/x/' }, C), C.publicBaseUrl + 'filedrop.html', 'LAN → public');
eq(P.baseFor({ protocol: 'https:', hostname: 'me.dev', href: 'https://me.dev/s/filedrop/index.html?a=1#zz' }, C), 'https://me.dev/s/filedrop/filedrop.html', 'own host');
['localhost', '127.0.0.1', '10.0.0.2', '172.20.1.1', '192.168.0.9', 'pc.local', ''].forEach((h) => eq(P.isLocalHost(h), true, 'local ' + h));
['example.com', '172.32.0.1', 'jor-teron.github.io'].forEach((h) => eq(P.isLocalHost(h), false, 'public ' + h));

// frames
const payload = new Uint8Array([1, 2, 3, 250]);
const fr = P.frame(0xDEADBEEF, 3 * 1024 * 1024 * 1024 + 7, payload);
eq(fr.byteLength, P.HEAD + 4, 'frame size');
const un = P.unframe(fr);
eq([un.tid, un.offset, Array.from(new Uint8Array(un.data))], [0xDEADBEEF, 3 * 1024 * 1024 * 1024 + 7, [1, 2, 3, 250]], 'unframe (offset > 4 GB ok)');
eq(P.unframe(new ArrayBuffer(5)), null, 'short frame');
const view = new Uint8Array(fr.byteLength + 6); view.set(new Uint8Array(fr), 3);
eq(P.unframe(view.subarray(3, 3 + fr.byteLength)).tid, 0xDEADBEEF, 'unframe view');
const big = new Uint8Array(100); big[10] = 9;
eq(new Uint8Array(P.unframe(P.frame(1, 0, big.subarray(10, 20))).data)[0], 9, 'frame from subarray');

// chunk sizing
eq(P.chunkSize(undefined, C), C.chunkMin - P.HEAD, 'chunk default');
eq(P.chunkSize(262144, C), C.chunkMax - P.HEAD, 'chunk capped');
eq(P.chunkSize(65536, C), 65536 - P.HEAD, 'chunk 64k');
eq(P.chunkSize(1000, C), C.chunkMin - P.HEAD, 'chunk floor');

// control
eq(P.decode(P.encode({ t: 'go', id: 'a', from: 5 })), { t: 'go', id: 'a', from: 5 }, 'encode/decode');
eq(P.decode('nope'), null, 'decode junk');
eq(P.decode('{"x":1}'), null, 'decode no t');
eq(P.decode('x'.repeat(5000)), null, 'decode too long');
eq(P.decode(new ArrayBuffer(4)), null, 'decode binary');

// names / types
eq(P.cleanName('../../etc/passwd'), '_.._etc_passwd', 'path stripped');
eq(P.cleanName('a<b>c?.txt'), 'a_b_c_.txt', 'bad chars');
eq(P.cleanName(''), 'file', 'empty name');
eq(P.cleanName('...hidden'), 'hidden', 'leading dots');
eq(P.cleanName('x'.repeat(200) + '.jpg').length, 120, 'long name');
eq(P.cleanName('x'.repeat(200) + '.jpg').slice(-4), '.jpg', 'long name keeps ext');
eq(P.cleanLabel('<b>Evil</b>\u0000'), 'bEvil/b', 'label');
eq(P.cleanLabel(''), 'device', 'label empty');
eq(P.safeMime('image/png'), 'image/png', 'png ok');
eq(P.safeMime('IMAGE/JPEG'), 'image/jpeg', 'case');
eq(P.safeMime('image/svg+xml'), 'application/octet-stream', 'svg blocked');
eq(P.safeMime('text/html'), 'application/octet-stream', 'html blocked');
eq(P.safeMime('video/mp4'), 'video/mp4', 'video');
eq(P.safeMime('application/pdf'), 'application/pdf', 'pdf');
eq(P.safeMime(''), 'application/octet-stream', 'empty mime');
eq(P.kind('image/png', 'a.png'), 'image', 'kind image');
eq(P.kind('application/octet-stream', 'notes.md'), 'text', 'kind text by ext');
eq(P.kind('application/octet-stream', 'x.bin'), 'file', 'kind file');

// formatting
eq(P.bytes(0), '0 B', 'bytes 0');
eq(P.bytes(1536), '1.5 KB', 'bytes KB');
eq(P.bytes(200 * 1048576), '200 MB', 'bytes MB');
eq(P.bytes(2 * 1073741824), '2 GB', 'bytes GB');
eq(P.eta(5.2), '6s', 'eta s');
eq(P.eta(125), '2m 05s', 'eta m');
eq(P.eta(3725), '1h 02m', 'eta h');
eq(P.eta(Infinity), '', 'eta inf');
eq(P.clock(120000), '2:00', 'clock');
eq(P.clock(-5), '0:00', 'clock neg');
eq(P.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1'), 'iPhone · Safari', 'ua iphone');
eq(P.deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537'), 'Windows · Chrome', 'ua win');
eq(P.isIOS('iPhone'), true, 'ios'); eq(P.isIOS('Android', false), false, 'not ios'); eq(P.isIOS('Mac', true), true, 'ipad as mac');

// meter
const m = P.meter(); m.add(0, 0); m.add(1000, 1000);
eq(Math.round(m.rate), 1000, 'meter rate');
m.add(1100, 1100); eq(Math.round(m.rate), 1000, 'meter ignores tiny dt');

// assembler + resume
(async () => {
  const data = new Uint8Array(1000); for (let i = 0; i < 1000; i++) data[i] = i & 255;
  const a = P.assembler(1000, 256);
  const piece = (o, n) => data.slice(o, o + n).buffer;
  eq(a.push(0, piece(0, 300)), true, 'push 1');
  eq(a.push(500, piece(500, 100)), false, 'gap ignored');
  eq(a.push(0, piece(0, 100)), false, 'dup ignored');
  eq(a.have, 300, 'have after gap');
  eq(a.parts.length, 1, 'folded at partBytes');
  eq(a.push(300, piece(300, 700)), true, 'resume from have');
  eq(a.push(1000, new ArrayBuffer(1)), false, 'overflow');
  eq(a.done(), true, 'done');
  const blob = a.blob('application/octet-stream');
  const back = new Uint8Array(await blob.arrayBuffer());
  eq(back.length === 1000 && back.every((v, i) => v === (i & 255)), true, 'bytes intact');
  const z = P.assembler(0, 256); eq(z.done(), true, 'empty file done');
  // bus
  let got = 0; FD.on('x', (v) => { got += v; }); FD.on('x', () => { throw new Error('ignored'); });
  const ce = console.error; console.error = () => {}; FD.emit('x', 2); console.error = ce;
  eq(got, 2, 'bus');
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
