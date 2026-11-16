/* Web Browser WWW2d — relay URL auto-fix, Hub-relay/localhost warnings, Test report building and secret redaction, plus static wiring. Node only, no browser. */
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

var BASE = 'https://debian.tail94ffdb.ts.net/relay';
var SECRET = 'S3cr3t-Token_0123456789';

/* ---- config ---- */
assertEq(C.RELEASE, 'WWW2d', 'release tag is WWW2d');
assert(C.HUB_RELAY_PORTS.indexOf('8787') >= 0 && C.HUB_RELAY_PORTS.indexOf('8022') >= 0 && C.HUB_RELAY_PORTS.indexOf('8023') >= 0, 'Hub relay ports listed');
assert(has(C.HUB_RELAY_WARN, "Hub's own relay (RL1/SSH)") && has(C.HUB_RELAY_WARN, 'ts.net/relay'), 'Hub-relay warning text');

/* ---- fixRelayUrl: normalisation cases ---- */
function fx(raw) { return L.fixRelayUrl(raw).url; }
[
  [BASE, BASE, 'good URL kept'],
  ['  ' + BASE + '/  ', BASE, 'spaces and trailing slash'],
  [BASE + '///', BASE, 'many trailing slashes'],
  ['\u200B' + BASE + '\uFEFF', BASE, 'zero-width space and BOM'],
  ['\u00A0' + BASE + '\u200E', BASE, 'nbsp and LRM'],
  ['https://debian.tail94ffdb.ts.net/re lay', BASE, 'inner space (pasted line break)'],
  ['https://debian.tail94ffdb.ts.net/relay\n', BASE, 'trailing newline'],
  ['debian.tail94ffdb.ts.net/relay', BASE, 'no scheme → https://'],
  ['//debian.tail94ffdb.ts.net/relay', BASE, '//host → https://'],
  ['HTTPS://Debian.Tail94ffdb.TS.NET/relay', BASE, 'scheme and host lower-cased'],
  [BASE + '/health', BASE, '/health removed'],
  [BASE + '/health?format=json', BASE, '/health?format=json removed'],
  [BASE + '/health/', BASE, '/health/ removed'],
  [BASE + '/www', BASE, '/www removed'],
  [BASE + '/www/', BASE, '/www/ removed'],
  [BASE + '/www/health', BASE, '/www/health removed'],
  [BASE + '/www/' + SECRET + '/fetch', BASE, '/www/<secret>/fetch removed'],
  [BASE + '/www/' + SECRET + '/fetch?url=https%3A%2F%2Fexample.com%2F&session=abc', BASE, '/www/<secret>/fetch?url=… removed'],
  [BASE + '/www/fetch?url=x', BASE, '/www/fetch?url= removed'],
  [BASE + '/www/' + SECRET + '/clear', BASE, '/www/<secret>/clear removed'],
  [BASE + '/relay', BASE, 'doubled /relay/relay → /relay'],
  [BASE + '/relay/relay/', BASE, 'tripled /relay → /relay'],
  [BASE + '/relay/health?format=json', BASE, 'doubled /relay + health'],
  ['https://debian.tail94ffdb.ts.net', BASE, 'bare ts.net gets /relay'],
  ['https://debian.tail94ffdb.ts.net/', BASE, 'bare ts.net/ gets /relay'],
  [BASE + '#x', BASE, '#hash removed'],
  ['https://debian.tail94ffdb.ts.net./relay', BASE, 'trailing dot on host removed'],
  ['http://192.168.1.5:9000', 'http://192.168.1.5:9000', 'LAN relay without /relay kept'],
  ['https://example.org/relayed', 'https://example.org/relayed', '/relayed is not /relay'],
  ['https://example.org/my/relay', 'https://example.org/my/relay', 'deeper path kept'],
  ['localhost:8787', 'https://localhost:8787', 'host:port without scheme'],
  ['http://127.0.0.1:8787/', 'http://127.0.0.1:8787', 'RL1 kept (warned separately)'],
  ['ftp://x/relay', '', 'ftp not usable'],
  ['mailto:a@b.c', '', 'mailto not usable'],
  ['javascript:alert(1)', '', 'javascript: not usable'],
  ['', '', 'empty'],
  ['   ', '', 'only spaces'],
  [null, '', 'null'],
  [undefined, '', 'undefined']
].forEach(function (c) { assertEq(fx(c[0]), c[1], 'fix: ' + c[2]); });

var f1 = L.fixRelayUrl(BASE + '/www/' + SECRET + '/fetch?url=x');
assert(f1.changed === true, 'changed flag on a fix');
assert(f1.notes.length > 0, 'notes list the fixes');
assert(f1.notes.join(' ').indexOf(SECRET) < 0, 'notes never hold the secret');
assertEq(L.fixRelayUrl(BASE).changed, false, 'unchanged flag for a good URL');
assertEq(L.fixRelayUrl(BASE + '/').changed, false, 'trailing slash only: not reported as changed');
assert(L.fixRelayUrl('debian.tail94ffdb.ts.net/relay').notes.indexOf('added https://') >= 0, 'note: added https://');
assert(L.fixRelayUrl(BASE + '/relay').notes.indexOf('removed a doubled /relay') >= 0, 'note: doubled /relay');
assert(L.fixRelayUrl('\u200B' + BASE).notes.indexOf('removed invisible characters') >= 0, 'note: invisible characters');
assertEq(L.fixRelayUrl('ftp://x').notes.length, 0, 'no notes when unusable');
/* the fixed URL is a valid relay base for the existing helpers */
assertEq(L.relayHealthUrl(fx(BASE + '/health?format=json')), BASE + '/health?format=json', 'health URL from a fixed health URL not doubled');
assertEq(L.relayHealthUrl(fx(BASE + '/relay/')), BASE + '/health?format=json', 'health URL from a doubled /relay');
/* idempotent */
['debian.tail94ffdb.ts.net/relay/health', BASE + '/www/x/fetch', 'https://debian.tail94ffdb.ts.net'].forEach(function (u) {
  var once = fx(u);
  assertEq(fx(once), once, 'idempotent: ' + u);
});

/* ---- Hub relay / localhost detection ---- */
[
  ['http://127.0.0.1:8787', true], ['https://127.0.0.1:8787', true], ['http://localhost:8787', true], ['http://localhost:9000/relay', true],
  ['http://127.0.0.2:9000', true], ['http://[::1]:9000', true], ['http://0.0.0.0:9000', true], ['http://hub.localhost/relay', true],
  ['https://laptop.ts.net:8022/relay', true], ['https://laptop.ts.net:8023', true], ['https://debian.lan:8787/relay', true],
  [BASE, false], ['https://debian.tail94ffdb.ts.net:443/relay', false], ['http://192.168.1.5:9000', false], ['https://x.ts.net:18787/relay', false],
  ['', false], ['notaurl', false]
].forEach(function (c) { assertEq(L.isHubRelayUrl(c[0]), c[1], 'isHubRelayUrl ' + c[0]); });
assertEq(L.portOf('https://a.b:8787/x'), '8787', 'portOf with port');
assertEq(L.portOf('https://a.b/x'), '', 'portOf default');
assertEq(L.portOf('http://[::1]:8022/'), '8022', 'portOf IPv6');

var w = L.relayUrlWarnings('http://127.0.0.1:8787', 'https:');
assert(w.some(function (x) { return x.kind === 'hubrelay' && x.level === 'error' && x.text === C.HUB_RELAY_WARN; }), 'RL1 URL warned as Hub relay');
assertEq(L.relayUrlWarnings('http://127.0.0.1:8787', 'https:').filter(function (x) { return x.kind === 'mixed'; }).length, 0, 'localhost http is not mixed content');
w = L.relayUrlWarnings('http://debian.lan:9000/relay', 'https:');
assert(w.some(function (x) { return x.kind === 'mixed' && x.level === 'error'; }), 'http relay on https Hub warned');
assertEq(L.relayUrlWarnings('http://debian.lan:9000/relay', 'http:').length, 0, 'http relay on http Hub fine');
w = L.relayUrlWarnings(BASE, 'file:');
assert(w.length === 1 && w[0].kind === 'file' && w[0].level === 'info' && has(w[0].text, 'should still work'), 'file:// Hub note');
assertEq(L.relayUrlWarnings(BASE, 'https:').length, 0, 'good URL on https Hub: no warnings');
assertEq(L.relayUrlWarnings('', 'https:').length, 0, 'empty URL: no warnings');
w = L.relayUrlWarnings('https://localhost:8022', 'file:');
assert(w.length === 2 && w[0].kind === 'hubrelay' && w[1].kind === 'file', 'both Hub relay and file notes');

/* ---- error description + offline text ---- */
var te = new TypeError('Failed to fetch');
assertEq(L.describeError(te), 'TypeError: Failed to fetch', 'TypeError described');
var ab = new Error('timeout'); ab.name = 'AbortError';
assertEq(L.describeError(ab), 'AbortError: timeout', 'AbortError timeout');
var ab2 = new Error('The user aborted a request.'); ab2.name = 'AbortError';
assertEq(L.describeError(ab2), 'AbortError: timeout', 'AbortError abort message → timeout');
assertEq(L.describeError(null), 'unknown error', 'null error');
assertEq(L.describeError('boom'), 'Error: boom', 'string error');

var off = L.healthMessage({ kind: 'offline', healthUrl: BASE + '/health?format=json' });
assertEq(off.level, 'error', 'offline is an error');
assert(has(off.text, 'never reached the relay from this device'), 'offline: never reached');
assert(has(off.text, BASE + '/health?format=json'), 'offline: names the health URL');
assert(has(off.text, 'network, Tailscale, DNS or an ad blocker'), 'offline: likely causes');
assert(has(off.text, 'send me the details'), 'offline: send details');
assert(has(off.text, 'offline'), 'offline wording kept (WWW2a)');
assert(has(L.healthMessage({ kind: 'offline' }).text, '/health?format=json'), 'offline without URL still says what to open');

/* ---- step texts ---- */
assertEq(L.stepResultText({ status: 200, ms: 123.4 }), 'HTTP 200 in 123 ms', 'status step');
assertEq(L.stepResultText({ error: 'TypeError: Failed to fetch', ms: 5 }), 'failed: TypeError: Failed to fetch in 5 ms', 'error step');
assert(has(L.stepResultText({ opaque: true, ms: 40 }), 'reached the relay'), 'opaque step');
assertEq(L.stepResultText({ skipped: 'not needed' }), 'skipped (not needed)', 'skipped step');
assertEq(L.stepResultText(null), 'not run', 'missing step');

/* ---- report building + redaction ---- */
var env = { userAgent: 'Mozilla/5.0 (Linux; Android 14) TestUA', origin: 'https://hub.example', protocol: 'https:', onLine: true, secureContext: true, time: 'Mon Nov 16 2026' };
var rep = L.buildTestReport({
  rawUrl: BASE + '/www/' + SECRET + '/fetch?url=x',
  url: BASE,
  notes: ['removed /www…'],
  warnings: [],
  healthUrl: BASE + '/health?format=json',
  health: { error: 'TypeError: Failed to fetch', ms: 41 },
  noCors: { error: 'TypeError: Failed to fetch', ms: 37 },
  secret: { skipped: 'relay not reached with CORS' },
  summary: 'Relay offline (secret ' + SECRET + ')',
  env: env
}, SECRET);
assertEq(rep.steps.length, 4, 'four steps');
assert(rep.steps[0].label.indexOf('a.') === 0 && rep.steps[0].text === BASE + '/health?format=json', 'step a: health URL');
assert(has(rep.steps[1].text, 'TypeError: Failed to fetch') && has(rep.steps[1].text, '41 ms'), 'step b: error + time');
assert(has(rep.steps[2].text, 'Failed to fetch') && has(rep.steps[2].text, '37 ms'), 'step c: no-cors result');
assert(has(rep.steps[3].text, 'skipped'), 'step d: secret skipped');
['userAgent: Mozilla/5.0 (Linux; Android 14) TestUA', 'location.origin: https://hub.example', 'navigator.onLine: true', 'isSecureContext: true', 'location.protocol: https:',
 'Relay URL used: ' + BASE, 'WWW2d', 'Auto-fixes: removed /www…', 'Result: Relay offline', 'Secret: set (hidden)'].forEach(function (k) {
  assert(rep.text.indexOf(k) >= 0, 'report has ' + k);
});
assert(rep.text.indexOf(SECRET) < 0, 'report text never holds the secret');
assert(rep.text.indexOf(encodeURIComponent(SECRET)) < 0, 'nor the encoded secret');
assert(rep.steps.every(function (s) { return s.text.indexOf(SECRET) < 0; }), 'steps never hold the secret');
assert(rep.text.indexOf('/www/•••/fetch') >= 0, 'typed /www/<secret>/ redacted');

var ODD = 'a b/c+d?e';
var rep2 = L.buildTestReport({ rawUrl: BASE, url: BASE, healthUrl: BASE + '/health?format=json', health: { status: 200, ms: 80 },
  secret: { status: 400, ms: 60 }, summary: 'ok ' + encodeURIComponent(ODD), env: env }, ODD);
assert(rep2.text.indexOf(ODD) < 0 && rep2.text.indexOf(encodeURIComponent(ODD)) < 0, 'encoded secret redacted too');
assert(has(rep2.steps[3].text, 'HTTP 400') && has(rep2.steps[3].text, 'Secret accepted'), 'step d: 400 = accepted');
assert(has(rep2.steps[2].text, 'not needed'), 'step c skipped when the CORS GET worked');
var rep3 = L.buildTestReport({ rawUrl: 'http://127.0.0.1:8787', url: 'http://127.0.0.1:8787', warnings: L.relayUrlWarnings('http://127.0.0.1:8787', 'https:'),
  healthUrl: 'http://127.0.0.1:8787/health?format=json', health: { error: 'TypeError: Failed to fetch', ms: 3 }, env: env }, '');
assert(has(rep3.text, "Warning: That looks like the Hub's own relay"), 'report carries the Hub-relay warning');
assert(has(rep3.text, 'Secret: not set'), 'report says when no secret is set');
var rep4 = L.buildTestReport({ env: {} }, SECRET);
assert(has(rep4.steps[0].text, 'none') && has(rep4.text, 'Relay URL used: (not usable)'), 'empty report is still readable');
assertEq(L.redactAll('x/www/' + SECRET + '/fetch y', 'other'), 'x/www/•••/fetch y', 'redactAll: unknown secret in /www/ path');
assertEq(L.redactAll(BASE + '/www/fetch?url=1', ''), BASE + '/www/fetch?url=1', 'redactAll: /www/fetch kept');
assertEq(L.redactAll('key ' + SECRET, SECRET), 'key •••', 'redactAll: plain secret');

/* ---- static wiring ---- */
var main = fs.readFileSync(path.join(app, 'www_main.js'), 'utf8');
['L.fixRelayUrl(', 'L.relayUrlWarnings(', 'L.buildTestReport(', 'L.describeError(', 'L.redactAll(', "'Copy details'", "'Open health page'",
 'navigator.userAgent', 'navigator.onLine', 'isSecureContext', 'location.origin', "'Using: '", 'clipboard.writeText', "healthA.target = '_blank'",
 "healthA.rel = 'noopener noreferrer'", "mode: 'no-cors'", 'healthUrl: hurl'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'www_main.js uses ' + k);
});
assert(/relay\.url = f\.url \|\| urlIn\.value\.trim\(\);/.test(main), 'save stores the auto-fixed URL');
assert(/function loadRelay\(\)[\s\S]{0,200}L\.fixRelayUrl\(r\.url\)/.test(main), 'older saved URLs are fixed on load');
assert(/function testRelay\(done\) \{\s*var raw = relay\.url;\s*var fix = L\.fixRelayUrl\(relay\.url\);/.test(main), 'Test fixes the URL first');
assert(!/console\./.test(main), 'www_main.js never logs to the console');
assert(!/innerHTML/.test(main), 'no innerHTML');
var css = fs.readFileSync(path.join(app, 'browser.css'), 'utf8');
assert(/\.relaysteps\{/.test(css) && /a\.healthlink\{/.test(css) && /\.relayusing\{/.test(css), 'css for steps, health link and Using line');
var readme = fs.readFileSync(path.join(app, 'readme.md'), 'utf8');
assert(has(readme, 'WWW2d') && has(readme, 'Copy details') && has(readme, 'Open health page') && has(readme, 'fixRelayUrl'), 'readme documents WWW2d');

/* ---- Local Network Access (Chrome blocks a relay host that resolves to a Tailscale 100.x / private address) ---- */
assert(C.LNA_PERMISSIONS.join() === 'local-network-access,local-network,loopback-network', 'LNA permission names, newest first');
assertEq(L.lnaState({ 'local-network-access': 'denied', 'local-network': 'unsupported' }), 'denied', 'lnaState: denied');
assertEq(L.lnaState({ 'local-network-access': 'unsupported', 'local-network': 'prompt', 'loopback-network': 'granted' }), 'prompt', 'lnaState: prompt');
assertEq(L.lnaState({ a: 'prompt', b: 'denied' }), 'denied', 'lnaState: denied wins over prompt');
assertEq(L.lnaState({ 'local-network-access': 'granted', 'local-network': 'unsupported' }), '', 'lnaState: granted is not a block');
assertEq(L.lnaState({}), '', 'lnaState: no Permissions API');
assertEq(L.lnaState(null), '', 'lnaState: null');
var lnaD = L.healthMessage({ kind: 'lna', state: 'denied' });
assertEq(lnaD.level, 'error', 'lna message is an error');
assert(has(lnaD.text, 'Your browser blocked the relay') && has(lnaD.text, 'local/Tailscale address') && has(lnaD.text, "Allow 'Local network access'") &&
  has(lnaD.text, 'Site settings') && has(lnaD.text, 'turn Tailscale off') && has(lnaD.text, 'tap Test again'), 'lna message: cause and how to allow it');
assert(!has(lnaD.text, 'may ask'), 'denied: no prompt note');
assert(has(L.healthMessage({ kind: 'lna', state: 'prompt' }).text, 'may ask'), 'prompt: says the browser may ask');
assert(!has(lnaD.text, 'Relay offline'), 'lna is not reported as offline');
var lnaC = L.clearMessage({ kind: 'lna', state: 'denied' });
assert(lnaC.level === 'error' && has(lnaC.text, 'not cleared') && has(lnaC.text, 'Local network access'), 'clearMessage: lna');
assert(has(L.clearMessage({ kind: 'lna', state: 'prompt' }).text, 'may ask'), 'clearMessage: lna prompt');
assertEq(L.lnaText('denied'), C.LNA_TEXT, 'lnaText denied = LNA_TEXT');
var repL = L.buildTestReport({ rawUrl: BASE, url: BASE, healthUrl: BASE + '/health?format=json',
  health: { error: 'TypeError: Failed to fetch', ms: 12 }, noCors: { error: 'TypeError: Failed to fetch', ms: 9 },
  lna: { states: { 'local-network-access': 'denied', 'local-network': 'unsupported', 'loopback-network': 'unsupported' }, state: 'denied', blocked: true },
  summary: lnaD.text, env: {} }, SECRET);
assertEq(repL.steps.length, 5, 'report has step e when LNA was asked');
assert(repL.steps[4].label.indexOf('e.') === 0 && has(repL.steps[4].text, 'local-network-access=denied') && has(repL.steps[4].text, 'local-network=unsupported') &&
  has(repL.steps[4].text, 'blocked the relay'), 'step e: permission states and the block');
assert(has(repL.text, 'local-network-access=denied') && has(repL.text, 'Result: Your browser blocked the relay'), 'Copy details: permission states and result');
var repG = L.buildTestReport({ rawUrl: BASE, url: BASE, lna: { states: { 'local-network-access': 'prompt' }, state: 'prompt', blocked: false }, env: {} }, SECRET);
assert(has(repG.steps[4].text, 'not the cause'), 'step e: prompt but relay reached is not the cause');
assert(has(L.lnaStatesText({ states: {}, state: '' }), 'no Permissions API'), 'step e: no Permissions API');

/* ---- no-scheme / unusable URL: a URL error, never "Relay not set" ---- */
var bad = L.healthMessage({ kind: 'badurl' });
assert(bad.level === 'error' && has(bad.text, 'must start with https://') && !has(bad.text, 'not set'), 'badurl message');
assert(has(L.clearMessage({ kind: 'badurl' }).text, 'must start with https://'), 'clearMessage: badurl');
assertEq(L.fixRelayUrl('debian.tail94ffdb.ts.net/relay').url, BASE, 'no scheme: https:// added');
assertEq(L.fixRelayUrl('debian.tail94ffdb.ts.net').url, BASE, 'no scheme, bare ts.net: https:// and /relay added');
assertEq(L.fixRelayUrl('ftp://debian.tail94ffdb.ts.net/relay').url, '', 'ftp:// stays unusable (badurl)');
assert(L.relayConfigured({ url: L.fixRelayUrl('debian.tail94ffdb.ts.net/relay').url, secret: SECRET }), 'fixed no-scheme URL counts as configured');

/* ---- LNA wiring in www_main.js ---- */
['navigator.permissions', 'perms.query({ name: name })', "settle('unsupported')", 'C.LNA_PERMISSIONS.map(', "kind: 'lna', state: q.state",
 "L.healthMessage({ kind: 'badurl' })", "L.clearMessage({ kind: 'badurl' })", 'relayFailCard(tab, url)', 'showLnaCard(tab, q.state)', 't.lna.blocked = true'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'www_main.js uses ' + k);
});
assert(/function testRelay\(done\)[\s\S]{0,1600}kind: 'badurl'[\s\S]{0,300}kind: 'notset'/.test(main), 'Test checks a bad URL before "not set"');
assert(/function clearRelayCookies\(done\)[\s\S]{0,1400}queryLna\(\)/.test(main), 'Clear relay cookies checks LNA');
assert(/function probeFinalUrl\(tab\)[\s\S]{0,1800}queryLna\(\)[\s\S]{0,200}finalOffKey = key/.test(main), 'final-URL probe stops quietly on an LNA block');
assert(main.indexOf('C.RELAY_TIMEOUT_TITLE, C.RELAY_TIMEOUT_TEXT, true);\n') > 0 && (main.match(/relayFailCard\(tab, url\)/g) || []).length === 3, 'both relay timeouts go through relayFailCard');
assert(has(readme, 'Local network access') && has(readme, 'Tailscale'), 'readme: Tailscale / local network access note');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
