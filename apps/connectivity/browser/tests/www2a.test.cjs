/* Web Browser WWW2a — Relay Server: relay settings, buildRelayUrl, routeFor, unwrap, sandbox, health JSON parsing, status/secret messages, store, static wiring. */
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
function memoryStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    _mem: mem
  };
}

var C = require(path.join(app, 'www_config.js'));
var L = require(path.join(app, 'www_logic.js'));
var Store = require(path.join(app, 'www_store.js'));

/* Config */
assertEq(C.RELEASE, 'WWW2a', 'release tag is WWW2a');
assertEq(C.LS_RELAY, 'browser_relay', 'relay key is browser_relay');
assertEq(C.RELAY_SESSION, 'default', 'session is the fixed default for WWW2a');
assertEq(C.DEFAULT_RELAY.enabled, false, 'relay off by default');
assertEq(C.TAB_MODES.join(','), 'auto,relay,direct', 'tab modes');

/* normalizeRelayBase */
var BASE = 'https://box.tail1234.ts.net/relay';
assertEq(L.normalizeRelayBase(BASE), BASE, 'base kept');
assertEq(L.normalizeRelayBase('  ' + BASE + '///  '), BASE, 'trim spaces and trailing slashes');
assertEq(L.normalizeRelayBase(BASE + '/?x=1'), BASE, 'query dropped');
assertEq(L.normalizeRelayBase('box.ts.net/relay'), '', 'no scheme is not usable');
assertEq(L.normalizeRelayBase('ftp://x/relay'), '', 'ftp is not usable');
assertEq(L.normalizeRelayBase(''), '', 'empty');
assertEq(L.normalizeRelayBase(null), '', 'null');

/* buildRelayUrl */
assertEq(L.buildRelayUrl(BASE, 's3cret', 'https://www.google.com/search?q=a b&c=1', 'default'),
  BASE + '/www/s3cret/fetch?url=' + encodeURIComponent('https://www.google.com/search?q=a b&c=1') + '&session=default', 'relay URL path-secret form');
assertEq(L.buildRelayUrl(BASE + '//', 's', 'http://a.test/', 'default'), BASE + '/www/s/fetch?url=http%3A%2F%2Fa.test%2F&session=default', 'trailing slashes trimmed');
assertEq(L.buildRelayUrl(BASE, 'a/b c?#', 'https://a.test/', 'default'), BASE + '/www/a%2Fb%20c%3F%23/fetch?url=https%3A%2F%2Fa.test%2F&session=default', 'secret is encoded');
assertEq(L.buildRelayUrl(BASE, 's', 'https://a.test/'), BASE + '/www/s/fetch?url=https%3A%2F%2Fa.test%2F&session=default', 'missing session falls back to default');
assertEq(L.buildRelayUrl(BASE, 's', 'https://a.test/', 'tab 1&x'), BASE + '/www/s/fetch?url=https%3A%2F%2Fa.test%2F&session=tab%201%26x', 'session encoded');
assertEq(L.buildRelayUrl('', 's', 'https://a.test/'), '', 'no base');
assertEq(L.buildRelayUrl(BASE, '  ', 'https://a.test/'), '', 'no secret');
assertEq(L.buildRelayUrl(BASE, 's', ''), '', 'no url');
assertEq(L.relayHealthUrl(BASE + '/'), BASE + '/health?format=json', 'health URL');
assertEq(L.relayHealthUrl('nope'), '', 'health URL needs a base');
assertEq(L.relaySecretProbeUrl(BASE, 'a b'), BASE + '/www/a%20b/fetch', 'secret probe URL');
assertEq(L.relaySecretProbeUrl(BASE, ''), '', 'secret probe needs a secret');

/* unwrapRelayUrl: history/address bar keep the original URL */
var orig = 'https://news.example/a?b=1&c=2#top';
assertEq(L.unwrapRelayUrl(L.buildRelayUrl(BASE, 's', orig, 'default'), BASE), orig, 'unwrap gives the original URL back');
assertEq(L.unwrapRelayUrl('https://other.test/www/s/fetch?url=x', BASE), '', 'other host is not a relay URL');
assertEq(L.unwrapRelayUrl(BASE + '/www/s/fetch', BASE), '', 'no query');
assertEq(L.unwrapRelayUrl('https://news.example/', BASE), '', 'plain page is not unwrapped');

/* sanitizeRelay / relayReady */
assertEq(JSON.stringify(L.sanitizeRelay(null)), JSON.stringify({ url: '', secret: '', enabled: false }), 'sanitize null');
assertEq(L.sanitizeRelay({ url: BASE, secret: '', enabled: true }).enabled, false, 'enabled needs a secret');
assertEq(L.sanitizeRelay({ url: '', secret: 's', enabled: true }).enabled, false, 'enabled needs a URL');
assertEq(L.sanitizeRelay({ url: ' ' + BASE + ' ', secret: ' s ', enabled: true }).url, BASE, 'url trimmed');
assertEq(L.sanitizeRelay({ url: BASE, secret: 's', enabled: 'yes' }).enabled, false, 'enabled must be true');
assertEq(L.sanitizeRelay({ url: 5, secret: {}, enabled: true }).url, '', 'wrong types dropped');
var R = { url: BASE, secret: 's', enabled: true };
assert(L.relayReady(R), 'ready when filled and on');
assert(!L.relayReady({ url: BASE, secret: 's', enabled: false }), 'not ready when off');
assert(L.relayConfigured({ url: BASE, secret: 's', enabled: false }), 'configured even when off');
assert(!L.relayReady({ url: 'box/relay', secret: 's', enabled: true }), 'not ready with a bad URL');
assert(!L.relayReady(null), 'not ready when missing');
assert(L.relayMixed({ url: 'http://box.ts.net/relay' }, true), 'http relay on https Hub is mixed');
assert(!L.relayMixed({ url: 'http://localhost:9000/relay' }, true), 'localhost relay is fine');
assert(!L.relayMixed({ url: 'http://box/relay' }, false), 'http relay on http Hub is fine');

/* routeFor */
function r(url, o) { return L.routeFor(url, o); }
var OFF = { url: '', secret: '', enabled: false };
var https = true;
assertEq(r('https://en.wikipedia.org/', { relay: R, tabMode: 'auto', isHttpsHub: https }), 'direct', 'framing site goes direct even with relay');
assertEq(r('https://www.google.com/', { relay: R, tabMode: 'auto', isHttpsHub: https }), 'relay', 'blocked site goes via relay');
assertEq(r('https://www.google.com/', { relay: OFF, tabMode: 'auto', isHttpsHub: https }), 'newtab', 'blocked site without relay: card');
assertEq(r('https://www.google.com/', { relay: { url: BASE, secret: 's', enabled: false }, isHttpsHub: https }), 'newtab', 'relay switched off: card');
assertEq(r('http://example.com/', { relay: R, tabMode: 'auto', isHttpsHub: true }), 'relay', 'http page on https Hub via relay');
assertEq(r('http://example.com/', { relay: OFF, tabMode: 'auto', isHttpsHub: true }), 'newtab', 'http page on https Hub without relay: card');
assertEq(r('http://example.com/', { relay: OFF, tabMode: 'auto', isHttpsHub: false }), 'direct', 'http page on http Hub direct');
assertEq(r('https://slow.test/', { relay: R, tabMode: 'auto', isHttpsHub: https, timedOut: true }), 'relay', 'timed-out page via relay');
assertEq(r('https://slow.test/', { relay: OFF, tabMode: 'auto', isHttpsHub: https, timedOut: true }), 'newtab', 'timed-out page without relay: card');
assertEq(r('https://en.wikipedia.org/', { relay: R, tabMode: 'relay', isHttpsHub: https }), 'relay', 'tab mode relay forces relay');
assertEq(r('https://en.wikipedia.org/', { relay: OFF, tabMode: 'relay', isHttpsHub: https }), 'direct', 'tab mode relay without relay falls back to direct');
assertEq(r('https://www.google.com/', { relay: OFF, tabMode: 'relay', isHttpsHub: https }), 'newtab', 'tab mode relay without relay: blocked card');
assertEq(r('https://www.google.com/', { relay: R, tabMode: 'direct', isHttpsHub: https }), 'newtab', 'tab mode direct: blocked site shows card');
assertEq(r('https://en.wikipedia.org/', { relay: R, tabMode: 'direct', isHttpsHub: https }), 'direct', 'tab mode direct: framing site direct');
assertEq(r('https://slow.test/', { relay: R, tabMode: 'direct', isHttpsHub: https, timedOut: true }), 'newtab', 'tab mode direct: timeout shows card');
assertEq(r('https://a.test/', { relay: R, tabMode: 'auto', isHttpsHub: https, blockedList: ['a.test'] }), 'relay', 'custom blocked list');
assertEq(r('https://www.google.com/', { relay: R, tabMode: 'auto', isHttpsHub: https, blockedList: [] }), 'direct', 'empty blocked list');
assertEq(r('file:///tmp/a.html', { relay: R, tabMode: 'relay', isHttpsHub: https }), 'direct', 'non-http never goes via relay');
assertEq(r('about:blank', { relay: R, tabMode: 'relay' }), 'direct', 'about: never via relay');
assertEq(r('https://www.google.com/', { relay: { url: 'http://box.ts.net/relay', secret: 's', enabled: true }, isHttpsHub: true }), 'newtab', 'http relay on https Hub is not used');
assertEq(r('https://www.google.com/', { relay: R, tabMode: 'weird', isHttpsHub: https }), 'relay', 'unknown mode acts as auto');
assertEq(r('https://www.google.com/', {}), 'newtab', 'no options: card for blocked site');
assertEq(r(C.ENGINES.duckduckgo.url + 'x', { relay: R, isHttpsHub: https }), 'relay', 'DuckDuckGo search goes via relay');

/* relaySandbox */
var SB = C.FRAME_SANDBOX;
assertEq(L.relaySandbox(SB, BASE, 'https://hub.example.net'), SB, 'other-origin relay keeps the normal sandbox');
var same = L.relaySandbox(SB, BASE, 'https://box.tail1234.ts.net');
assert(same.indexOf('allow-same-origin') < 0 && same.indexOf('allow-scripts') >= 0, 'same-origin relay drops allow-same-origin');
assert(L.relaySandbox(SB, 'https://BOX.tail1234.ts.net:443/relay', 'https://box.tail1234.ts.net').indexOf('allow-same-origin') < 0, 'origin compare ignores case and :443');
assertEq(L.originOf('http://a.test:80/x'), 'http://a.test', 'originOf drops :80');
assertEq(L.originOf('about:blank'), '', 'originOf non-http');

/* parseHealth */
var hj = L.parseHealth('{"status":"ok","version":"0.7.0","modules":{"ssh":true,"www":true,"vnc":false}}');
assertEq(hj.ok, true, 'health ok');
assertEq(hj.version, '0.7.0', 'health version');
assertEq(hj.www, true, 'health www on');
assertEq(hj.modules.vnc, false, 'health modules kept');
assertEq(L.parseHealth({ status: 'ok', version: '0.7.0', modules: { www: false } }).www, false, 'object input, www off');
assertEq(L.parseHealth('{"status":"ok","version":"0.6.0","modules":{"ssh":true}}').www, null, 'no www key: null');
assertEq(L.parseHealth('ok\nversion: 0.7.0\nmodules: ssh www'), null, 'plain text is not JSON');
assertEq(L.parseHealth('[1]'), null, 'array is not health');
assertEq(L.parseHealth('null'), null, 'null is not health');
assertEq(L.parseHealth('{"status":"bad"}').ok, false, 'status not ok');
assertEq(L.parseHealth('{"status":"ok","version":7}').version, '7', 'numeric version stringified');

/* statusMessage */
assert(has(L.statusMessage(401), 'secret is wrong'), '401 means wrong secret');
assert(has(L.statusMessage(403), 'secret is wrong'), '403 means wrong secret');
assert(has(L.statusMessage(404), '/relay'), '404 hints at the /relay URL');
assert(has(L.statusMessage(413), 'too big'), '413 too big');
assert(has(L.statusMessage(429), 'rate limit'), '429 rate limit');
assert(has(L.statusMessage(502), '5 MB'), '502 upstream or too large');
assert(has(L.statusMessage(503), 'running'), '503 relay not answering');
assert(has(L.statusMessage(0), 'offline'), '0 offline');
assert(has(L.statusMessage(500), 'error'), '500 error');
assert(has(L.statusMessage(302), 'unexpected'), 'other codes unexpected');

/* healthMessage */
var okBody = '{"status":"ok","version":"0.7.0","modules":{"ssh":true,"www":true}}';
var m = L.healthMessage({ kind: 'http', status: 200, body: okBody });
assertEq(m.level, 'ok', 'healthy relay ok');
assert(has(m.text, '0.7.0') && has(m.text, 'www on'), 'shows version and www on');
assertEq(m.www, true, 'www flag passed through');
m = L.healthMessage({ kind: 'http', status: 200, body: '{"status":"ok","version":"0.7.0","modules":{"www":false}}' });
assertEq(m.level, 'warn', 'www off is a warning');
assert(has(m.text, 'RELAY_MODULES'), 'www off says how to fix');
m = L.healthMessage({ kind: 'http', status: 200, body: '{"status":"ok","version":"0.6.0","modules":{"ssh":true}}' });
assertEq(m.level, 'warn', 'no www module is a warning');
assert(has(m.text, 'v0.7.0'), 'no www asks for v0.7.0');
m = L.healthMessage({ kind: 'http', status: 200, body: '<html>hi</html>' });
assertEq(m.level, 'error', 'not JSON is an error');
assert(has(m.text, '/relay'), 'not JSON hints the URL');
m = L.healthMessage({ kind: 'http', status: 200, body: '{"status":"down","version":"0.7.0","modules":{"www":true}}' });
assertEq(m.level, 'error', 'status not ok is an error');
assert(has(L.healthMessage({ kind: 'http', status: 401, body: '' }).text, 'secret is wrong'), 'health 401 wrong secret');
assert(has(L.healthMessage({ kind: 'http', status: 403, body: '' }).text, 'secret is wrong'), 'health 403 wrong secret');
assert(has(L.healthMessage({ kind: 'http', status: 404, body: '' }).text, 'not found'), 'health 404');
assert(has(L.healthMessage({ kind: 'http', status: 429, body: '' }).text, 'rate limit'), 'health 429');
assert(has(L.healthMessage({ kind: 'http', status: 502, body: '' }).text, '502'), 'health 502');
assertEq(L.healthMessage({ kind: 'http', status: 502 }).level, 'error', 'health 502 is an error');
m = L.healthMessage({ kind: 'cors' });
assertEq(m.level, 'warn', 'CORS failure is a warning');
assert(has(m.text, "Couldn't verify (relay may not allow this Hub origin)") && has(m.text, 'still try loading a page'), 'CORS wording');
assert(has(L.healthMessage({ kind: 'offline' }).text, 'offline'), 'offline wording');
assert(has(L.healthMessage({ kind: 'timeout' }).text, 'offline'), 'timeout says offline');
assert(has(L.healthMessage({ kind: 'notset' }).text, 'not set'), 'not set wording');
assert(has(L.healthMessage({ kind: 'mixed' }).text, 'https'), 'mixed relay wording');
assertEq(L.healthMessage(null).level, 'error', 'missing result is an error');

/* secretProbeMessage */
assertEq(L.secretProbeMessage(400).level, 'ok', 'secret probe 400 = accepted (missing ?url=)');
assertEq(L.secretProbeMessage(401).level, 'error', 'secret probe 401 = wrong');
assert(has(L.secretProbeMessage(403).text, 'secret is wrong'), 'secret probe 403 = wrong');
assertEq(L.secretProbeMessage(429).level, 'warn', 'secret probe 429 = warn');
assertEq(L.secretProbeMessage(0).level, 'warn', 'secret probe network failure = warn');
assertEq(L.secretProbeMessage(500).level, 'warn', 'secret probe other = warn');

/* Store */
var mem = memoryStorage();
var st = Store.createStore(mem);
assertEq(st.relay(), null, 'no relay saved yet');
st.saveRelay({ url: BASE, secret: 's', enabled: true });
assertEq(L.sanitizeRelay(st.relay()).enabled, true, 'relay round-trip');
assert(Object.prototype.hasOwnProperty.call(mem._mem, 'browser_relay'), 'saved under browser_relay');
Object.keys(mem._mem).forEach(function (k) { assert(k.indexOf('browser_') === 0, 'stored key ' + k + ' has prefix'); });

/* Static wiring */
var html = fs.readFileSync(path.join(app, 'browser.html'), 'utf8');
assert(html.indexOf('id="viaBadge"') >= 0, 'address bar has the via-relay badge');
assert(html.indexOf('id="relayToggle"') >= 0, 'menu has the relay toggle');
var main = fs.readFileSync(path.join(app, 'www_main.js'), 'utf8');
['L.routeFor(', 'L.buildRelayUrl(', 'L.healthMessage(', 'L.secretProbeMessage(', 'L.relaySandbox(', 'L.unwrapRelayUrl(', 'S.saveRelay(',
 "mode: 'no-cors'", 'Load through relay', 'Load directly', 'Open in new tab', 'RELAY_LOAD_TIMEOUT_MS'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'www_main.js uses ' + k);
});
assert(!/innerHTML/.test(main), 'no innerHTML');
/* History and bookmarks are only ever written with app-level URLs, never the relay src. */
assert(!/addHistory\([^)]*\bsrc\b/.test(main) && !/push\([^)]*\bsrc\b/.test(main), 'relay src never goes into history');
var css = fs.readFileSync(path.join(app, 'browser.css'), 'utf8');
assert(/\.via\{/.test(css), 'css has .via badge');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
