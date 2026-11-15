/* Web Browser WWW1 — address/search parsing, blocked hosts, mixed content, per-tab back/forward, history, bookmarks, store, static files. */
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
assertEq(C.RELEASE, 'WWW1', 'release tag is WWW1');
assertEq(C.APP_NAME, 'Web Browser', 'app name');
assertEq(C.DEFAULT_ENGINE, 'duckduckgo', 'default engine is DuckDuckGo');
assertEq(C.DEFAULT_SETTINGS.engine, 'duckduckgo', 'default settings engine is DuckDuckGo');
[C.LS_BOOKMARKS, C.LS_HISTORY, C.LS_SETTINGS, C.LS_TABS].forEach(function (k) {
  assert(k.indexOf('browser_') === 0, 'key ' + k + ' has browser_ prefix');
});
assert(C.FRAME_SANDBOX.indexOf('allow-scripts') >= 0 && C.FRAME_SANDBOX.indexOf('allow-top-navigation') < 0, 'sandbox allows scripts but not top navigation');
assertEq(C.BLOCKED_TITLE, "This site doesn't allow embedding", 'blocked card title');

/* Address parsing */
var ddg = 'https://duckduckgo.com/?q=';
assertEq(L.parseInput('', 'duckduckgo'), null, 'empty input is null');
assertEq(L.parseInput('   ', 'duckduckgo'), null, 'blank input is null');
assertEq(L.parseInput('https://example.com/a?b=1', 'duckduckgo').url, 'https://example.com/a?b=1', 'full https URL kept');
assertEq(L.parseInput('http://example.com', 'duckduckgo').kind, 'url', 'http URL is a url');
assertEq(L.parseInput('example.com', 'duckduckgo').url, 'https://example.com', 'bare domain gets https');
assertEq(L.parseInput('en.wikipedia.org/wiki/India', 'duckduckgo').url, 'https://en.wikipedia.org/wiki/India', 'domain with path');
assertEq(L.parseInput('localhost:8080/x', 'duckduckgo').url, 'http://localhost:8080/x', 'localhost gets http');
assertEq(L.parseInput('192.168.1.20:8000', 'duckduckgo').url, 'http://192.168.1.20:8000', 'private IP gets http');
assertEq(L.parseInput('8.8.8.8', 'duckduckgo').url, 'https://8.8.8.8', 'public IP gets https');
assertEq(L.parseInput('hello world', 'duckduckgo').url, ddg + 'hello%20world', 'words are searched');
assertEq(L.parseInput('hello', 'duckduckgo').kind, 'search', 'single word without dot is a search');
assertEq(L.parseInput('node.js tutorial', 'duckduckgo').kind, 'search', 'words with a dot and space are searched');
assertEq(L.parseInput('a&b=c?', 'bing').url, 'https://www.bing.com/search?q=a%26b%3Dc%3F', 'query is encoded, bing engine');
assertEq(L.parseInput('x', 'nope').url, ddg + 'x', 'unknown engine falls back to default');
assertEq(L.parseInput('javascript:alert(1)', 'duckduckgo').kind, 'search', 'javascript: is never loaded');
assertEq(L.parseInput('hub:home', 'duckduckgo').kind, 'home', 'hub:home is home');
assertEq(L.parseInput('about:home', 'duckduckgo').kind, 'home', 'about:home is home');
assertEq(L.parseInput('about:blank', 'duckduckgo').url, 'about:blank', 'about:blank kept');
assertEq(L.parseInput('file:///tmp/a.html', 'duckduckgo').url, 'file:///tmp/a.html', 'file URL kept');
assertEq(L.parseInput('https://', 'duckduckgo').kind, 'search', 'bare scheme is searched');
assertEq(L.parseInput('version 1.2', 'duckduckgo').kind, 'search', 'version string is searched');

/* Hosts and blocking */
assertEq(L.hostOf('https://User@WWW.Google.com:443/x'), 'www.google.com', 'hostOf strips user and port');
assertEq(L.hostOf('about:blank'), '', 'hostOf non-http is empty');
['https://www.google.com/search?q=1', 'https://youtube.com/', 'https://m.youtube.com/watch', 'https://github.com/jor-teron/sites',
 'https://x.com/home', 'https://www.facebook.com/', 'https://duckduckgo.com/?q=a'].forEach(function (u) {
  assert(L.isKnownBlocked(u), 'blocked: ' + u);
});
['https://en.wikipedia.org/', 'https://example.com/', 'https://notgoogle.com/', 'https://google.com.evil.example/', 'about:blank'].forEach(function (u) {
  assert(!L.isKnownBlocked(u), 'not blocked: ' + u);
});
assert(L.isKnownBlocked('https://a.test/', ['a.test']), 'custom list');
assert(L.isMixedContent('https:', 'http://example.com/'), 'http on https is mixed');
assert(!L.isMixedContent('https:', 'http://localhost:8000/'), 'localhost is not mixed');
assert(!L.isMixedContent('http:', 'http://example.com/'), 'http on http is fine');
assert(!L.isMixedContent('file:', 'http://example.com/'), 'file page is fine');
assertEq(L.labelFor('https://www.bbc.com/news'), 'bbc.com', 'label drops www');
assertEq(L.labelFor(C.HOME_URL), 'Home', 'home label');

/* Per-tab back/forward */
var h = L.tabHistory();
assertEq(L.current(h), C.HOME_URL, 'new tab starts at home');
assert(!L.canBack(h) && !L.canForward(h), 'new tab cannot go back or forward');
h = L.push(h, 'https://a.test/');
h = L.push(h, 'https://b.test/');
assertEq(L.current(h), 'https://b.test/', 'push moves to newest');
h = L.push(h, 'https://b.test/');
assertEq(h.entries.length, 3, 'pushing the same URL does not duplicate');
h = L.back(h);
assertEq(L.current(h), 'https://a.test/', 'back');
assert(L.canForward(h), 'can go forward after back');
h = L.forward(h);
assertEq(L.current(h), 'https://b.test/', 'forward');
h = L.back(L.back(h));
assertEq(L.current(h), C.HOME_URL, 'back to home');
var same = L.back(h);
assertEq(same.index, 0, 'back at the start stays');
h = L.push(L.forward(h), 'https://c.test/');
assertEq(h.entries.join(','), C.HOME_URL + ',https://a.test/,https://c.test/', 'push after back drops forward entries');
assert(!L.canForward(h), 'no forward after push');
var big = L.tabHistory();
for (var i = 0; i < 70; i++) big = L.push(big, 'https://p' + i + '.test/');
assertEq(big.entries.length, C.TAB_HISTORY_MAX, 'tab history is capped');
assertEq(L.current(big), 'https://p69.test/', 'cap keeps newest');
var orig = L.tabHistory('https://x.test/');
L.push(orig, 'https://y.test/');
assertEq(orig.entries.length, 1, 'push does not mutate');
assertEq(L.sanitizeTabHistory(null).entries[0], C.HOME_URL, 'sanitize null');
assertEq(L.sanitizeTabHistory({ entries: ['a', 'b'], index: 9 }).index, 1, 'sanitize clamps index');
assertEq(L.sanitizeTabHistory({ entries: [1, null], index: 0 }).entries[0], C.HOME_URL, 'sanitize drops bad entries');

/* History */
var hist = [];
hist = L.addHistory(hist, C.HOME_URL, 'Home', 1);
assertEq(hist.length, 0, 'home is not recorded');
hist = L.addHistory(hist, 'https://a.test/', 'A page', 1);
hist = L.addHistory(hist, 'https://b.test/x', '', 2);
assertEq(hist[0].url, 'https://b.test/x', 'newest first');
assertEq(hist[0].title, 'b.test', 'missing title uses host');
hist = L.addHistory(hist, 'https://b.test/x', 'B title', 3);
assertEq(hist.length, 2, 'repeat of newest refreshes it');
assertEq(hist[0].title, 'B title', 'repeat updates title');
assertEq(hist[0].t, 3, 'repeat updates time');
hist = L.addHistory(hist, 'https://a.test/', 'A page', 4);
assertEq(hist.length, 3, 'revisit of an older URL adds a new entry');
assertEq(L.searchHistory(hist, 'a page').length, 2, 'search matches title words');
assertEq(L.searchHistory(hist, 'B.TEST').length, 1, 'search is case-insensitive on URL');
assertEq(L.searchHistory(hist, '').length, 3, 'empty search returns all');
assertEq(L.searchHistory(hist, 'zzz').length, 0, 'no match');
hist = L.removeHistory(hist, 'https://a.test/', 1);
assertEq(hist.length, 2, 'remove one entry by url and time');
var capped = [];
for (var j = 0; j < 10; j++) capped = L.addHistory(capped, 'https://h' + j + '.test/', '', j, 5);
assertEq(capped.length, 5, 'history cap');
assertEq(capped[0].url, 'https://h9.test/', 'cap keeps newest');

/* Bookmarks */
var bm = [];
bm = L.addBookmark(bm, 'https://a.test/', 'A');
bm = L.addBookmark(bm, 'https://b.test/', '');
assertEq(bm.length, 2, 'two bookmarks');
assertEq(bm[1].title, 'b.test', 'empty title uses host');
assert(L.hasBookmark(bm, 'https://a.test/'), 'hasBookmark');
bm = L.addBookmark(bm, 'https://a.test/', 'A2');
assertEq(bm.length, 2, 'adding again does not duplicate');
assertEq(bm[0].title, 'A2', 'adding again retitles');
assertEq(L.addBookmark(bm, C.HOME_URL, 'Home').length, 2, 'home cannot be bookmarked');
bm = L.toggleBookmark(bm, 'https://a.test/', 'A');
assert(!L.hasBookmark(bm, 'https://a.test/'), 'toggle removes');
bm = L.toggleBookmark(bm, 'https://a.test/', 'A');
assert(L.hasBookmark(bm, 'https://a.test/'), 'toggle adds');
assertEq(L.removeBookmark(bm, 'https://b.test/').length, 1, 'remove');

/* Settings */
var s = L.mergeSettings(null);
assertEq(s.engine, 'duckduckgo', 'defaults');
assertEq(s.bookmarksBar, true, 'bar on by default');
assertEq(s.autoOpenBlocked, false, 'auto-open off by default');
assertEq(L.mergeSettings({ engine: 'nope' }).engine, 'duckduckgo', 'unknown engine reset');
assertEq(L.mergeSettings({ engine: 'bing', bookmarksBar: 'x' }).bookmarksBar, true, 'wrong type ignored');
assertEq(L.mergeSettings({ engine: 'bing' }).engine, 'bing', 'saved engine kept');

/* Store */
var mem = memoryStorage();
var st = Store.createStore(mem);
assertEq(st.bookmarks().length, C.SEED_BOOKMARKS.length, 'seed bookmarks before first save');
st.saveBookmarks([]);
assertEq(st.bookmarks().length, 0, 'empty saved list stays empty (no reseed)');
st.saveHistory([{ url: 'https://a.test/', title: 'A', t: 1 }, null, { nope: 1 }]);
assertEq(st.history().length, 1, 'bad history rows dropped');
st.saveSettings({ engine: 'bing' });
assertEq(st.settings().engine, 'bing', 'settings round-trip');
st.saveTabs({ active: 0, tabs: [{ hist: L.tabHistory() }] });
assertEq(st.tabs().tabs.length, 1, 'tabs round-trip');
Object.keys(mem._mem).forEach(function (k) { assert(k.indexOf('browser_') === 0, 'stored key ' + k + ' has prefix'); });
var threw = false;
try { st.saveBookmarks.call(null, []); } catch (_) { threw = true; }
assert(!threw, 'save works unbound');
mem._mem[C.LS_HISTORY] = '{broken';
assertEq(st.history().length, 1, 'broken JSON falls back to the memory copy');
var blocked = Store.createStore({ getItem: function () { throw new Error('blocked'); }, setItem: function () { throw new Error('blocked'); } });
blocked.saveHistory([{ url: 'https://m.test/', t: 1 }]);
assertEq(blocked.history().length, 1, 'blocked storage keeps a memory copy');
assertEq(Store.createStore(null).bookmarks().length, C.SEED_BOOKMARKS.length, 'no storage still works');
C.SEED_BOOKMARKS.forEach(function (b) { assert(!L.isKnownBlocked(b.url), 'seed bookmark frames: ' + b.url); });

/* Static files */
var html = fs.readFileSync(path.join(app, 'browser.html'), 'utf8');
['www_config.js', 'www_logic.js', 'www_store.js', 'www_main.js', 'browser.css'].forEach(function (f) {
  assert(html.indexOf(f) >= 0, 'browser.html loads ' + f);
  assert(fs.existsSync(path.join(app, f)), f + ' exists');
});
assert(!/type="module"/.test(html), 'classic scripts only');
assert(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no CDN or remote URLs in browser.html');
['back', 'fwd', 'reload', 'stop', 'home', 'addr', 'star', 'ext', 'newTab', 'tabs', 'bmbar', 'menuBtn'].forEach(function (id) {
  assert(html.indexOf('id="' + id + '"') >= 0, 'has #' + id);
});
var idx = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
assert(/location\.replace\('browser\.html'/.test(idx), 'index.html redirects to browser.html');
var png = fs.readFileSync(path.join(app, 'browser_icon.png'));
assertEq(png.readUInt32BE(16), 128, 'icon is 128 wide');
assertEq(png.readUInt32BE(20), 128, 'icon is 128 high');
var main = fs.readFileSync(path.join(app, 'www_main.js'), 'utf8');
assert(!/\bconfirm\(/.test(main.replace(/confirmIn\(|\/\*[\s\S]*?\*\//g, '')), 'no window.confirm (blocked in a Hub window)');
assert(!/innerHTML/.test(main), 'no innerHTML');
['ctrl', "k === 'l'", "k === 't'", "k === 'w'", 'ArrowLeft', 'ArrowRight'].forEach(function (k) {
  assert(main.indexOf(k) >= 0, 'shortcut code has ' + k);
});
var csv = fs.readFileSync(path.join(app, '..', 'connectivity-apps.csv'), 'utf8');
var row = csv.split('\n').filter(function (l) { return /^Web Browser,/.test(l); })[0] || '';
var cols = row.split(',');
assertEq(cols.length, 6, 'CSV row has 6 columns (no commas in description)');
assertEq((cols[1] || '').trim(), 'browser/', 'CSV path');
assert((cols[5] || '').trim().length > 0 && (cols[5] || '').trim().length <= 90, 'CSV description under 90 chars');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
