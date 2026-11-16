/* Web Browser WWW2b — relay sessions per device, relay-URL sanitiser (stripRelay + clean* helpers), secret redaction, Clear relay cookies request and messages, store key, static wiring. Node only, no browser. */
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
var ST = require(path.join(app, 'www_store.js'));

var BASE = 'https://laptop.tail1234.ts.net/relay';
var SECRET = 'S3cr3t-Token_0123456789';
var RELAY = { url: BASE, secret: SECRET, enabled: true };

/* ---- config ---- */
assert(/^WWW2[b-z]/.test(C.RELEASE), 'release tag is WWW2b or later');
assertEq(C.LS_RELAY_SESSION, 'browser_relay_session', 'session key');
assert(C.LS_RELAY_SESSION.indexOf(C.LS_PREFIX) === 0, 'session key has the browser_ prefix');
assert(C.RELAY_SESSION_LEN >= 16, 'session id is 16+ chars');
assertEq(C.RELAY_SESSION_TTL_MIN, 30, 'login note: 30 minutes');
assert(has(C.RELAY_LOGIN_NOTE, '30 minutes') && has(C.RELAY_LOGIN_NOTE, 'restart'), 'login note mentions 30 min and relay restart');
['secret', 'history', 'own devices', 'leaks'].forEach(function (w) { assert(has(C.RELAY_PRIVACY_NOTE, w), 'privacy note mentions ' + w); });

/* ---- session ids ---- */
var real1 = L.newSessionId();
var real2 = L.newSessionId();
assertEq(real1.length, C.RELAY_SESSION_LEN, 'crypto session id length');
assert(/^[A-Za-z0-9_-]+$/.test(real1), 'session id is URL-safe');
assertEq(encodeURIComponent(real1), real1, 'session id needs no encoding');
assert(real1 !== real2, 'two session ids differ');
assert(L.validSessionId(real1), 'new id is valid');
var seen = {};
var dup = false;
for (var i = 0; i < 200; i++) { var id = L.newSessionId(); if (seen[id]) dup = true; seen[id] = 1; }
assert(!dup, '200 ids without a repeat');
/* deterministic random source */
var zeros = L.newSessionId(function (a) { for (var k = 0; k < a.length; k++) a[k] = 0; });
assertEq(zeros, 'AAAAAAAAAAAAAAAAAAAAAA', 'all-zero bytes -> A…');
var ramp = L.newSessionId(function (a) { for (var k = 0; k < a.length; k++) a[k] = k + 60; }, 8);
assertEq(ramp, '89-_ABCD', 'byte & 63 maps onto the 64-letter alphabet (60..67)');
var high = L.newSessionId(function (a) { for (var k = 0; k < a.length; k++) a[k] = 255; }, 4);
assertEq(high, '____', 'byte 255 -> _');
var filledLen = 0;
L.newSessionId(function (a) { filledLen = a.length; });
assertEq(filledLen, C.RELAY_SESSION_LEN, 'fill gets a buffer of the id length');
assertEq(L.validSessionId('default'), false, "'default' is not a per-device id");
assertEq(L.validSessionId('short_id'), false, 'too short is invalid');
assertEq(L.validSessionId('has space in it 1234'), false, 'spaces invalid');
assertEq(L.validSessionId('a/b+c=d1234567890123'), false, 'non URL-safe invalid');
assertEq(L.validSessionId(new Array(130).join('a')), false, 'over 128 invalid');
assertEq(L.validSessionId(123), false, 'number invalid');

/* ---- buildRelayUrl with the session ---- */
var SID = 'AbCdEfGhIjKlMnOpQrStUv';
var ru = L.buildRelayUrl(BASE, SECRET, 'https://www.google.com/search?q=a b&x=1', SID);
assertEq(ru, BASE + '/www/' + SECRET + '/fetch?url=' + encodeURIComponent('https://www.google.com/search?q=a b&x=1') + '&session=' + SID, 'relay URL carries the per-device session');
assert(!has(ru, 'session=default'), 'no default session when an id is given');
assert(has(L.buildRelayUrl(BASE, SECRET, 'https://a.org/', ''), 'session=default'), 'empty session falls back to default');
assertEq(L.unwrapRelayUrl(ru, BASE), 'https://www.google.com/search?q=a b&x=1', 'unwrap still works with a session');

/* ---- stripRelay ---- */
assertEq(L.stripRelay(ru, RELAY), 'https://www.google.com/search?q=a b&x=1', 'relay URL -> original');
assertEq(L.stripRelay('https://en.m.wikipedia.org/wiki/Cat', RELAY), 'https://en.m.wikipedia.org/wiki/Cat', 'normal URL unchanged');
assertEq(L.stripRelay(C.HOME_URL, RELAY), C.HOME_URL, 'home unchanged');
assertEq(L.stripRelay('', RELAY), '', 'empty -> empty');
assertEq(L.stripRelay(null, RELAY), '', 'null -> empty');
assertEq(L.stripRelay('https://a.org/', null), 'https://a.org/', 'no relay: unchanged');
var nested = L.buildRelayUrl(BASE, SECRET, ru, SID);
assertEq(L.stripRelay(nested, RELAY), 'https://www.google.com/search?q=a b&x=1', 'nested relay URL -> original');
var oldBase = L.buildRelayUrl('https://old-box.tail1234.ts.net/relay', SECRET, 'https://news.ycombinator.com/', 'x');
assertEq(L.stripRelay(oldBase, RELAY), 'https://news.ycombinator.com/', 'relay URL of an older base -> original');
var otherSecret = L.buildRelayUrl('https://other.example/relay', 'zzzzzzzzzzzzzzzz', 'https://archive.org/', 'x');
assertEq(L.stripRelay(otherSecret, RELAY), 'https://archive.org/', 'any relay fetch URL is unwrapped');
var headerForm = BASE + '/www/fetch?url=' + encodeURIComponent('https://example.com/') + '&relay_token=' + SECRET;
assertEq(L.stripRelay(headerForm, RELAY), 'https://example.com/', 'token-in-query form -> original');
assertEq(L.stripRelay('https://example.com/?leak=' + SECRET, RELAY), '', 'URL holding the secret is dropped');
assertEq(L.stripRelay('https://example.com/?leak=' + encodeURIComponent('a b' + SECRET), { url: BASE, secret: 'a b' + SECRET }), '', 'encoded secret is dropped');
assertEq(L.stripRelay(BASE + '/www/' + SECRET + '/clear?session=x', RELAY), '', 'relay clear URL (holds the secret) is dropped');
assertEq(L.stripRelay(L.buildRelayUrl(BASE, SECRET, 'https://evil.example/?t=' + SECRET, SID), RELAY), '', 'unwrapped URL still holding the secret is dropped');
assertEq(L.stripRelay('https://example.com/abc', { url: BASE, secret: 'abc' }), 'https://example.com/abc', 'short secrets are not scanned (no false drops)');
assertEq(L.unwrapAnyRelayUrl('https://site.org/www/page'), '', 'not a relay URL');
assert(L.containsSecret('x' + SECRET + 'y', SECRET) && !L.containsSecret('nothing', SECRET), 'containsSecret');

/* ---- redactSecret ---- */
assertEq(L.redactSecret('bad ' + SECRET + ' and ' + encodeURIComponent('p w') , 'p w'), 'bad ' + SECRET + ' and •••', 'encoded secret redacted');
assertEq(L.redactSecret('GET ' + BASE + '/www/' + SECRET + '/fetch', SECRET).indexOf(SECRET), -1, 'secret redacted from text');
assertEq(L.redactSecret('plain', ''), 'plain', 'no secret: unchanged');

/* ---- clean helpers ---- */
var hist = [
  { url: ru, title: 'Google', t: 3 },
  { url: 'https://example.com/?k=' + SECRET, title: 'leak', t: 2 },
  { url: 'https://a.org/', title: 'title ' + SECRET, t: 1 },
  { url: 5 }, null
];
var ch = L.cleanHistory(hist, RELAY);
assertEq(ch.length, 2, 'history: secret entry and junk dropped');
assertEq(ch[0].url, 'https://www.google.com/search?q=a b&x=1', 'history: relay URL unwrapped');
assertEq(ch[0].t, 3, 'history: time kept');
assertEq(ch[1].title, 'a.org', 'history: title holding the secret replaced');
assert(JSON.stringify(ch).indexOf(SECRET) < 0, 'history JSON has no secret');
var plainHist = L.addHistory([], 'https://a.org/', '', 9);
assertEq(JSON.stringify(L.cleanHistory(plainHist, RELAY)), JSON.stringify(plainHist), 'clean history is unchanged (no needless rewrite)');
var bms = [{ url: ru, title: 'G' }, { url: 'https://www.google.com/search?q=a b&x=1', title: 'dup' }, { url: 'https://x.org/' + SECRET, title: 'leak' }].concat(C.SEED_BOOKMARKS);
var cb = L.cleanBookmarks(bms, RELAY);
assertEq(cb.length, 1 + C.SEED_BOOKMARKS.length, 'bookmarks: unwrapped duplicate and leak dropped');
assertEq(cb[0].url, 'https://www.google.com/search?q=a b&x=1', 'bookmarks: relay URL unwrapped');
assertEq(JSON.stringify(L.cleanBookmarks(C.SEED_BOOKMARKS, RELAY)), JSON.stringify(C.SEED_BOOKMARKS), 'seed bookmarks unchanged');
var th = L.cleanTabHistory({ entries: [C.HOME_URL, ru, 'https://e.com/' + SECRET, 'https://b.org/'], index: 3 }, RELAY);
assertEq(JSON.stringify(th.entries), JSON.stringify([C.HOME_URL, 'https://www.google.com/search?q=a b&x=1', 'https://b.org/']), 'tab history cleaned');
assertEq(th.index, 2, 'tab index follows its page');
var th2 = L.cleanTabHistory({ entries: [C.HOME_URL, ru, 'https://e.com/' + SECRET], index: 2 }, RELAY);
assertEq(th2.index, 1, 'index on a dropped entry moves back');
assertEq(JSON.stringify(L.cleanTabHistory({ entries: ['https://e.com/' + SECRET], index: 0 }, RELAY)), JSON.stringify(L.tabHistory()), 'all dropped -> home');
var ts = L.cleanTabsState({ active: 1, tabs: [{ hist: { entries: [ru], index: 0 }, title: SECRET, mode: 'relay' }, { hist: null, title: 'x', mode: 'auto' }] }, RELAY);
assertEq(ts.active, 1, 'tabs: active kept');
assertEq(ts.tabs[0].hist.entries[0], 'https://www.google.com/search?q=a b&x=1', 'tabs: relay URL unwrapped');
assertEq(ts.tabs[0].title, '', 'tabs: secret title dropped');
assertEq(ts.tabs[0].mode, 'relay', 'tabs: mode kept');
assertEq(ts.tabs[1].hist.entries[0], C.HOME_URL, 'tabs: bad history -> home');
assert(JSON.stringify(ts).indexOf(SECRET) < 0 && JSON.stringify(ts).indexOf('/www/') < 0, 'tabs JSON has no secret or relay path');

/* ---- clear request ---- */
var req = L.buildClearRequest(RELAY, SID);
assertEq(req.url, BASE + '/www/' + SECRET + '/clear?session=' + SID, 'clear URL: path secret + ?session=');
assertEq(req.init.method, 'POST', 'clear is POST');
assert(!req.init.headers && req.init.body == null, 'no custom headers or body (CORS simple request, no preflight)');
assertEq(req.init.credentials, 'omit', 'no browser cookies sent');
assertEq(L.buildClearRequest({ url: BASE + '/', secret: ' a/b c ' }, 'S').url, BASE + '/www/a%2Fb%20c/clear?session=S', 'secret encoded, base normalised');
assertEq(L.buildClearRequest({ url: BASE, secret: SECRET }, '').url.slice(-15), 'session=default', 'no session -> default');
assertEq(L.buildClearRequest({ url: '', secret: SECRET }, SID), null, 'not configured -> null');
assertEq(L.buildClearRequest(null, SID), null, 'null relay -> null');
assert(L.buildClearRequest({ url: BASE, secret: SECRET, enabled: false }, SID) !== null, 'works while the relay is switched off');

/* ---- clear messages ---- */
var ORIGIN = 'https://jor-teron.github.io';
function cm(r) { return L.clearMessage(r, ORIGIN); }
assertEq(cm({ kind: 'http', status: 200, body: '{"cleared": true, "session": "x"}' }).level, 'ok', '200 cleared -> ok');
assert(has(cm({ kind: 'http', status: 200, body: '{"cleared": true}' }).text, 'cleared'), 'cleared text');
var nothing = cm({ kind: 'http', status: 200, body: { cleared: false } });
assertEq(nothing.level, 'ok', 'cleared false -> ok');
assert(has(nothing.text, 'nothing to clear') && has(nothing.text, '30 minutes'), 'nothing-to-clear text');
assertEq(cm({ kind: 'http', status: 200, body: 'hello' }).level, 'warn', 'non-JSON 200 -> warn');
assert(has(cm({ kind: 'http', status: 401, body: 'wrong relay token' }).text, 'secret is wrong'), '401 -> wrong secret');
assert(has(cm({ kind: 'http', status: 404 }).text, '/relay'), '404 -> URL hint');
assert(has(cm({ kind: 'http', status: 405 }).text, 'v0.7.0'), '405 -> version hint');
assert(has(cm({ kind: 'http', status: 429 }).text, 'rate limit'), '429 -> rate limit');
assert(has(cm({ kind: 'http', status: 503 }).text, 'not answering'), '503 -> not answering');
var corsM = cm({ kind: 'cors' });
assertEq(corsM.level, 'warn', 'cors -> warn');
assert(has(corsM.text, 'CORS') && has(corsM.text, 'RELAY_WWW_ORIGINS') && has(corsM.text, ORIGIN) && has(corsM.text, 'New session'), 'cors text names origin, RELAY_WWW_ORIGINS and New session');
assert(has(cm({ kind: 'offline' }).text, 'New session') && cm({ kind: 'offline' }).level === 'error', 'offline -> error + New session hint');
assert(has(cm({ kind: 'timeout' }).text, 'offline'), 'timeout -> offline');
assert(has(cm({ kind: 'notset' }).text, 'not set'), 'notset');
assert(has(cm({ kind: 'mixed' }).text, 'https'), 'mixed');
assertEq(cm(null).level, 'error', 'null -> error');
[{ kind: 'http', status: 401 }, { kind: 'cors' }, { kind: 'offline' }, { kind: 'http', status: 200, body: '{"cleared":true}' }].forEach(function (r, n) {
  assert(L.clearMessage(r, ORIGIN).text.indexOf(SECRET) < 0, 'clear message ' + n + ' has no secret');
});

/* ---- store ---- */
var mem = memoryStorage();
var st = ST.createStore(mem);
assertEq(st.relaySession(), '', 'no session saved yet');
st.saveRelaySession(SID);
assertEq(st.relaySession(), SID, 'session round-trip');
assert(Object.prototype.hasOwnProperty.call(mem._mem, 'browser_relay_session'), 'saved under browser_relay_session');
mem.setItem('browser_relay_session', '{"x":1}');
assertEq(st.relaySession(), '', 'non-string saved session -> empty');
st.saveRelay(RELAY);
assertEq(JSON.stringify(L.sanitizeRelay(st.relay())), JSON.stringify(RELAY), 'browser_relay shape unchanged by WWW2b');

/* ---- static wiring ---- */
var main = fs.readFileSync(path.join(app, 'www_main.js'), 'utf8');
['L.newSessionId(', 'L.validSessionId(', 'S.saveRelaySession(', 'L.buildClearRequest(', 'L.clearMessage(', 'L.redactSecret(',
 'L.cleanHistory(', 'L.cleanBookmarks(', 'L.cleanTabsState(', 'L.cleanTabHistory(', 'L.stripRelay(', 'Clear relay cookies', 'New session',
 'C.RELAY_LOGIN_NOTE', 'C.RELAY_PRIVACY_NOTE', 'C.LS_RELAY_SESSION', "mode: 'no-cors'", 'location.origin'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'www_main.js uses ' + k);
});
assert(main.indexOf('L.buildRelayUrl(relay.url, relay.secret, url, relaySession)') >= 0, 'relay frames use the per-device session');
assert(main.indexOf('C.RELAY_SESSION)') < 0, 'fixed default session no longer used for frames');
assert(!/console\./.test(main), 'www_main.js never logs to the console');
assert(!/console\./.test(fs.readFileSync(path.join(app, 'www_logic.js'), 'utf8')), 'www_logic.js never logs to the console');
/* Every save goes through the cleaners. */
var saveHist = main.match(/S\.saveHistory\(/g) || [];
assertEq(saveHist.length, 2, 'S.saveHistory only in saveHistory() and the start-up clean');
assert(/function saveHistory\(\) \{\s*history = L\.cleanHistory\(history, relay\);\s*S\.saveHistory\(history\);/.test(main), 'saveHistory() cleans first');
assert(/bookmarks = L\.cleanBookmarks\(list, relay\);\s*S\.saveBookmarks\(bookmarks\);/.test(main), 'setBookmarks cleans first');
assert(/S\.saveTabs\(L\.cleanTabsState\(/.test(main), 'saveTabs cleans first');
assert(/\$\('addr'\)\.value = u === C\.HOME_URL \? '' : clean\(u\)/.test(main), 'address bar shows cleaned URL');
assert(!/innerHTML/.test(main), 'no innerHTML');
var css = fs.readFileSync(path.join(app, 'browser.css'), 'utf8');
assert(/\.relaywarn\{/.test(css), 'css has .relaywarn');
var readme = fs.readFileSync(path.join(app, 'readme.md'), 'utf8');
assert(has(readme, 'WWW2b') && has(readme, 'stripRelay') && has(readme, 'browser_relay_session'), 'readme documents WWW2b');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
