/* Web Browser WWW2c — real address after relay redirects (X-Relay-Final-Url: request, extraction, sanitising, history update) and Reader support detection + reader URLs, plus static wiring. Node only, no browser. */
'use strict';

var path = require('path');
var fs = require('fs');
var app = path.join(__dirname, '..');

var failed = 0;
function assert(cond, msg) {
  if (!cond) { failed += 1; console.error('FAIL:', msg); } else { console.log('ok:', msg); }
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else { console.log('ok:', msg); }
}
function has(text, part) { return String(text).toLowerCase().indexOf(part.toLowerCase()) >= 0; }

var C = require(path.join(app, 'www_config.js'));
var L = require(path.join(app, 'www_logic.js'));

var BASE = 'https://laptop.tail1234.ts.net/relay';
var SECRET = 'S3cr3t-Token_0123456789';
var RELAY = { url: BASE, secret: SECRET, enabled: true };
var SESS = 'AbCdEfGhIjKlMnOpQrStUv';

/* ---- config ---- */
assert(/^WWW2[c-z]/.test(C.RELEASE), 'release tag is WWW2c or later');
assert(C.FINAL_URL_TIMEOUT_MS > 0 && C.READER_PROBE_TIMEOUT_MS > 0, 'timeouts set');
assert(/^https:\/\//.test(C.READER_PROBE_URL), 'reader probe page is https');

/* ---- final-URL request ---- */
var fr = L.buildFinalUrlRequest(RELAY, 'https://bit.ly/x', SESS);
assertEq(fr.url, L.buildRelayUrl(BASE, SECRET, 'https://bit.ly/x', SESS), 'final-URL probe hits the same relay fetch URL');
assertEq(fr.init.method, 'HEAD', 'probe uses HEAD');
assertEq(fr.init.credentials, 'omit', 'probe sends no credentials');
assert(!fr.init.headers, 'no custom headers (CORS simple request, no preflight)');
assertEq(L.buildFinalUrlRequest({ url: '', secret: SECRET }, 'https://a.test/', SESS), null, 'no relay → no probe');
assertEq(L.buildFinalUrlRequest(RELAY, '', SESS), null, 'no url → no probe');
/* Optional cross-check against the Relay Server source when it is on this machine (skipped elsewhere). */
var RELAY_HANDLER = '/workspace/relay-server/modules/www/handler.py';
var relaySrc = fs.existsSync(RELAY_HANDLER) ? fs.readFileSync(RELAY_HANDLER, 'utf8') : '';
if (relaySrc) {
  assert(/"HEAD"/.test(relaySrc), 'relay v0.7.0 accepts HEAD on fetch');
  assert(/X-Relay-Final-Url/.test(relaySrc), 'relay sends X-Relay-Final-Url');
}

/* ---- final-URL extraction + sanitising ---- */
assertEq(L.finalUrlFrom('https://example.org/landing?a=1', RELAY, 'https://bit.ly/x'), 'https://example.org/landing?a=1', 'header URL used');
assertEq(L.finalUrlFrom('  https://example.org/p  ', RELAY, 'https://bit.ly/x'), 'https://example.org/p', 'trimmed');
assertEq(L.finalUrlFrom('https://bit.ly/x', RELAY, 'https://bit.ly/x'), '', 'same as requested → no change');
assertEq(L.finalUrlFrom('', RELAY, 'https://a.test/'), '', 'empty header → keep');
assertEq(L.finalUrlFrom(null, RELAY, 'https://a.test/'), '', 'missing header → keep');
assertEq(L.finalUrlFrom('javascript:alert(1)', RELAY, 'https://a.test/'), '', 'javascript: refused');
assertEq(L.finalUrlFrom('file:///etc/passwd', RELAY, 'https://a.test/'), '', 'file: refused');
assertEq(L.finalUrlFrom('/relative/path', RELAY, 'https://a.test/'), '', 'relative refused');
assertEq(L.finalUrlFrom('https://a.test/x y', RELAY, 'https://a.test/'), '', 'whitespace refused');
assertEq(L.finalUrlFrom('https://a.test/?t=' + SECRET, RELAY, 'https://a.test/'), '', 'final URL holding the secret is dropped');
assertEq(L.finalUrlFrom(L.buildRelayUrl(BASE, SECRET, 'https://real.test/page', SESS), RELAY, 'https://a.test/'), 'https://real.test/page', 'a relay URL is unwrapped to the original');
assertEq(L.finalUrlFrom('http://plain.test/', RELAY, 'https://plain.test/'), 'http://plain.test/', 'https→http redirect kept (relay serves it)');
assertEq(L.finalUrlFrom('https://ex.org/caf%C3%A9', RELAY, 'https://ex.org/cafe'), 'https://ex.org/caf%C3%A9', 'percent-encoded header kept as-is');

/* ---- outcome + hint ---- */
var o = L.finalUrlOutcome({ kind: 'http', status: 200, header: 'https://example.org/' }, RELAY, 'https://bit.ly/x');
assertEq(o.url, 'https://example.org/', 'readable header → url');
assertEq(o.hint, '', 'no hint when it worked');
o = L.finalUrlOutcome({ kind: 'cors' }, RELAY, 'https://bit.ly/x');
assertEq(o.url, '', 'CORS blocked → keep requested');
assertEq(o.hint, 'origin', 'CORS blocked → origin hint');
o = L.finalUrlOutcome({ kind: 'http', status: 200, header: null }, RELAY, 'https://bit.ly/x');
assertEq(o.hint, 'expose', 'readable 200 without the header → expose hint');
o = L.finalUrlOutcome({ kind: 'http', status: 302, header: null }, RELAY, 'https://bit.ly/x');
assertEq(o.hint, 'expose', 'readable 3xx without the header → expose hint');
o = L.finalUrlOutcome({ kind: 'http', status: 502, header: null }, RELAY, 'https://bit.ly/x');
assertEq(o.hint + o.url, '', 'relay error without header → silent');
o = L.finalUrlOutcome({ kind: 'http', status: 401, header: null }, RELAY, 'https://bit.ly/x');
assertEq(o.hint + o.url, '', '401 → silent');
o = L.finalUrlOutcome({ kind: 'offline' }, RELAY, 'https://bit.ly/x');
assertEq(o.hint + o.url, '', 'offline → silent, no hint');
o = L.finalUrlOutcome({ kind: 'timeout' }, RELAY, 'https://bit.ly/x');
assertEq(o.hint + o.url, '', 'timeout → silent, no hint');
o = L.finalUrlOutcome({ kind: 'http', status: 404, header: 'https://example.org/gone' }, RELAY, 'https://bit.ly/x');
assertEq(o.url, 'https://example.org/gone', 'upstream 404 still gives the final URL');
assertEq(L.finalUrlOutcome(null, RELAY, 'x').url, '', 'null result safe');
var hint = L.finalUrlHint('origin', 'https://hub.example.net');
assertEq(hint, "Add this Hub's origin (https://hub.example.net) to RELAY_WWW_ORIGINS to show the real address after redirects.", 'origin hint text');
assert(has(L.finalUrlHint('expose', 'https://h'), 'Access-Control-Expose-Headers'), 'expose hint names the header');
assertEq(L.finalUrlHint('', 'https://h'), '', 'no hint');
assert(!has(L.finalUrlHint('origin', 'https://h'), SECRET), 'hint never holds the secret');

/* ---- tab history update ---- */
var h = { entries: [C.HOME_URL, 'https://a.test/', 'https://bit.ly/x'], index: 2 };
var h2 = L.replaceCurrent(h, 'https://example.org/');
assertEq(h2.entries.join(' '), C.HOME_URL + ' https://a.test/ https://example.org/', 'current step replaced, not pushed');
assertEq(h2.index, 2, 'index kept');
assertEq(h.entries[2], 'https://bit.ly/x', 'replaceCurrent does not mutate');
var h3 = L.replaceCurrent({ entries: ['https://a.test/', 'https://b.test/', 'https://c.test/'], index: 1 }, 'https://x.test/');
assertEq(h3.entries.join(' '), 'https://a.test/ https://x.test/ https://c.test/', 'replacing mid-list keeps forward steps');
var h4 = L.replaceCurrent({ entries: ['https://a.test/', 'http://a.test/'], index: 1 }, 'https://a.test/');
assertEq(h4.entries.length, 1, 'redirect back to the previous step collapses the duplicate');
assertEq(h4.index, 0, 'index follows the collapse');
assertEq(L.replaceCurrent(h, '').entries[2], 'https://bit.ly/x', 'empty url → unchanged');

/* ---- visited history update ---- */
var list = [{ url: 'https://bit.ly/x', title: L.labelFor('https://bit.ly/x'), t: 5 }, { url: 'https://old.test/', title: 'Old', t: 1 }];
var l2 = L.replaceHistoryUrl(list, 'https://bit.ly/x', 'https://example.org/', 9);
assertEq(l2.length, 2, 'no extra entry for a redirect');
assertEq(l2[0].url, 'https://example.org/', 'newest entry now the final URL');
assertEq(l2[0].title, 'example.org', 'auto label relabelled');
assertEq(l2[0].t, 5, 'visit time kept');
assertEq(list[0].url, 'https://bit.ly/x', 'replaceHistoryUrl does not mutate');
var l3 = L.replaceHistoryUrl([{ url: 'https://bit.ly/x', title: 'My title', t: 5 }], 'https://bit.ly/x', 'https://example.org/', 9);
assertEq(l3[0].title, 'My title', 'a real page title is kept');
var l4 = L.replaceHistoryUrl([{ url: 'https://other.test/', title: 'O', t: 3 }], 'https://bit.ly/x', 'https://example.org/', 9);
assertEq(l4.length, 2, 'newest entry is another page → final URL added');
assertEq(l4[0].url, 'https://example.org/', 'added on top');
var l5 = L.replaceHistoryUrl([{ url: 'https://bit.ly/x', title: '', t: 5 }, { url: 'https://example.org/', title: 'E', t: 2 }], 'https://bit.ly/x', 'https://example.org/', 9);
assertEq(l5.length, 1, 'duplicate of the final URL right below is merged');
assertEq(L.replaceHistoryUrl(list, 'https://bit.ly/x', C.HOME_URL, 9).length, 2, 'home never recorded');
assertEq(L.replaceHistoryUrl(list, 'https://bit.ly/x', 'https://bit.ly/x', 9)[0].url, 'https://bit.ly/x', 'same url → unchanged');
/* Saved history goes through cleanHistory: a relay URL that slipped in is unwrapped, a secret one dropped. */
var dirty = L.replaceHistoryUrl(list, 'https://bit.ly/x', L.buildRelayUrl(BASE, SECRET, 'https://z.test/', SESS), 9);
var cleaned = L.cleanHistory(dirty, RELAY);
assertEq(cleaned[0].url, 'https://z.test/', 'cleanHistory unwraps a relay URL before saving');
assert(cleaned.every(function (e) { return e.url.indexOf(SECRET) < 0; }), 'no secret in cleaned history');

/* ---- reader URLs ---- */
var ru = L.relayReaderUrl(RELAY, 'https://news.test/a?b=1', SESS);
assertEq(ru, BASE + '/www/' + encodeURIComponent(SECRET) + '/reader?url=' + encodeURIComponent('https://news.test/a?b=1') + '&session=' + SESS, 'reader URL with session');
assertEq(L.relayReaderUrl({ url: BASE + '/', secret: SECRET }, 'https://n.test/', ''), BASE + '/www/' + encodeURIComponent(SECRET) + '/reader?url=' + encodeURIComponent('https://n.test/') + '&session=default', 'trailing slash + default session');
assertEq(L.relayReaderUrl(RELAY, C.HOME_URL, SESS), '', 'home has no reader URL');
assertEq(L.relayReaderUrl(RELAY, 'file:///x', SESS), '', 'non-web has no reader URL');
assertEq(L.relayReaderUrl({ url: '', secret: SECRET }, 'https://n.test/', SESS), '', 'no relay → no reader URL');
assertEq(L.readerProbeUrl(RELAY), BASE + '/www/' + encodeURIComponent(SECRET) + '/reader?url=' + encodeURIComponent(C.READER_PROBE_URL) + '&session=default', 'probe URL');
assertEq(L.stripRelay(ru, RELAY), 'https://news.test/a?b=1', 'stripRelay unwraps a reader URL');
assertEq(L.unwrapAnyRelayUrl(ru.replace(BASE, 'https://old.tail.ts.net/relay')), 'https://news.test/a?b=1', 'unwrapAnyRelayUrl covers reader URLs of any base');
assertEq(L.cleanHistory([{ url: ru, title: '', t: 1 }], RELAY)[0].url, 'https://news.test/a?b=1', 'reader URL never saved in history');
assert(L.readerKey(RELAY) !== L.readerKey({ url: BASE, secret: SECRET + 'x' }), 'reader cache key per relay config');
assertEq(L.readerKey({ url: '', secret: '' }), '', 'no key without a relay');

/* ---- reader support detection ---- */
assertEq(L.readerFromStatus(501), false, '501 → hidden');
assertEq(L.readerFromStatus(200), true, '200 → shown');
assertEq(L.readerFromStatus(204), true, '2xx → shown');
assertEq(L.readerFromStatus(404), false, '404 → hidden');
assertEq(L.readerFromStatus(405), false, '405 → hidden');
assertEq(L.readerFromStatus(401), false, '401 → hidden');
assertEq(L.readerFromStatus(0), null, 'network/CORS failure → unknown');
var v070 = JSON.stringify({ status: 'ok', version: '0.7.0', modules: { ssh: true, www: true, vnc: false, mcp: false, files: false } });
assertEq(L.readerFromHealth(v070), null, 'v0.7.0 health says nothing about reader → probe');
assertEq(L.readerFromHealth({ status: 'ok', modules: { www: true, reader: true } }), true, 'modules.reader true → shown');
assertEq(L.readerFromHealth({ status: 'ok', modules: { www: true, reader: false } }), false, 'modules.reader false → hidden');
assertEq(L.readerFromHealth({ status: 'ok', modules: { www: true }, features: { reader: true } }), true, 'features.reader true → shown');
assertEq(L.readerFromHealth({ status: 'ok', modules: { www: { reader: true } } }), true, 'modules.www.reader true → shown');
assertEq(L.readerFromHealth({ status: 'ok', modules: { www: false, reader: true } }), false, 'www off → hidden');
assertEq(L.readerFromHealth('not json'), null, 'bad health → unknown');
assertEq(L.readerSupported(v070, 501), false, 'v0.7.0 + 501 → hidden');
assertEq(L.readerSupported(v070, 200), true, 'health silent + 200 → shown');
assertEq(L.readerSupported({ modules: { reader: true } }, 501), true, 'health wins over the probe');
assertEq(L.readerSupported(v070, undefined), null, 'not probed yet → unknown');
assertEq(L.readerSupported(v070, 0), null, 'probe failed → unknown');
assertEq(L.showReaderButton(true, RELAY, 'https://a.test/', true), true, 'button shown when supported');
assertEq(L.showReaderButton(false, RELAY, 'https://a.test/', true), false, 'hidden when 501');
assertEq(L.showReaderButton(null, RELAY, 'https://a.test/', true), false, 'hidden when unknown');
assertEq(L.showReaderButton(true, { url: BASE, secret: SECRET, enabled: false }, 'https://a.test/', true), false, 'hidden when relay off');
assertEq(L.showReaderButton(true, { url: 'http://laptop.test:9000/relay', secret: SECRET, enabled: true }, 'https://a.test/', true), false, 'hidden when relay is mixed content');
assertEq(L.showReaderButton(true, RELAY, C.HOME_URL, true), false, 'hidden on home');
if (relaySrc) assert(/501 Not Implemented", "reader mode/.test(relaySrc), 'relay v0.7.0 reader still answers 501 (button stays hidden)');

/* ---- static wiring ---- */
var main = fs.readFileSync(path.join(app, 'www_main.js'), 'utf8');
['L.buildFinalUrlRequest(', 'L.finalUrlOutcome(', 'L.finalUrlHint(', 'L.replaceCurrent(', 'L.replaceHistoryUrl(', "headers.get('X-Relay-Final-Url')",
 'L.relayReaderUrl(', 'L.readerProbeUrl(', 'L.readerFromHealth(', 'L.readerFromStatus(', 'L.showReaderButton(', 'C.FINAL_URL_TIMEOUT_MS',
 "$('reader')", 'toggleReader', 'location.origin'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'www_main.js uses ' + k);
});
assert(/function applyFinalUrl\(tab, from, to\) \{\s*var u = clean\(to\);/.test(main), 'final URL is cleaned before use');
assert(/history = L\.replaceHistoryUrl\(history, from, u, Date\.now\(\)\);\s*saveHistory\(\);/.test(main), 'history update goes through saveHistory (cleaned)');
assert(/if \(tab\.via && !tab\.readerOn\) probeFinalUrl\(tab\);/.test(main), 'probe only after relay (non-reader) loads');
assert(/if \(!src \|\| tab\.probed === src\) return;\s*tab\.probed = src;/.test(main), 'once per navigation');
assert(/tab\.expect !== src \|\| L\.current\(tab\.hist\) !== requested/.test(main), 'stale probe answers ignored');
assert(!/console\./.test(main), 'www_main.js never logs to the console');
assert(!/innerHTML/.test(main), 'no innerHTML');
var html = fs.readFileSync(path.join(app, 'browser.html'), 'utf8');
assert(/id="reader"[^>]*hidden/.test(html), 'Reader button hidden by default');
var css = fs.readFileSync(path.join(app, 'browser.css'), 'utf8');
assert(/#reader\.on\{/.test(css) && /\.finalhint\{/.test(css), 'css for Reader + hint');
var readme = fs.readFileSync(path.join(app, 'readme.md'), 'utf8');
assert(has(readme, 'WWW2c') && has(readme, 'X-Relay-Final-Url') && has(readme, 'Access-Control-Expose-Headers') && has(readme, 'Reader'), 'readme documents WWW2c');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
