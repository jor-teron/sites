/* Node tests for Tables TB5 (Office ribbon, Settings, Quick Access, Hub bars).
   Run: node test-tb5-ribbon.js
   No jsdom, no browser. A tiny fake DOM runs tables_ribbon.js and the real
   ../shared/office-quick.js so the disabled Undo / Redo / Print state is checked
   on the shared code itself. apps/office/shared is only read, never edited. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var R = require('./tables_ribbon.js');
var Hot = require('./tables_hot.js');
var M = require('./tables_model.js');
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a);
  var sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + '\n  got ' + sa + '\n  expected ' + sb);
  else console.log('ok', name);
}
function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? ' ' + detail : ''));
}
function read(rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

/* ---------- release and title ---------- */
var html = read('tables.html');
var htmlLive = live(html);
eq('release', R.RELEASE, 'TB5');
eq('title helper', R.title(), 'Tables TB5');
var titleMatch = /<title>([^<]*)<\/title>/.exec(htmlLive);
ok('page title has Tables and TB5', titleMatch && /Tables/.test(titleMatch[1]) && /TB5/.test(titleMatch[1]), titleMatch && titleMatch[1]);
ok('old title kept in a (before TB5) comment', html.indexOf('<!-- (before TB5) <title>Tables</title> -->') !== -1);
ok('no ?v= cache buster', html.indexOf('?v=') === -1);

/* ---------- File menu ---------- */
eq('file menu labels', R.FILE_ITEMS.map(function (x) { return x.label; }),
  ['New', 'Open .hot', 'Save', 'Save As', 'Import CSV', 'Export CSV', 'Settings']);
var menuMatch = /<div class="of-file-menu[^"]*" id="of-file-menu"[\s\S]*?\n  <\/div>/.exec(htmlLive);
ok('file menu markup', !!menuMatch);
var menuHtml = menuMatch ? menuMatch[0] : '';
var items = [];
menuHtml.replace(/<button[^>]*id="([^"]+)"[^>]*data-icon="([^"]+)"[^>]*><span>([^<]+)<\/span>/g, function (_, id, icon, label) {
  items.push({ id: id, icon: icon, label: label.trim() });
});
eq('file menu ids in order', items.map(function (x) { return x.id; }), R.FILE_ITEMS.map(function (x) { return x.id; }));
eq('file menu labels in markup', items.map(function (x) { return x.label; }), R.FILE_ITEMS.map(function (x) { return x.label; }));
eq('file menu icons in markup', items.map(function (x) { return x.icon; }), R.FILE_ITEMS.map(function (x) { return x.icon; }));
var iconsSrc = fs.readFileSync(path.join(dir, '../shared/office-icons.js'), 'utf8');
R.FILE_ITEMS.forEach(function (x) {
  ok('shared icon exists: ' + x.icon, iconsSrc.indexOf('"' + x.icon + '"') !== -1);
});
ok('no Print in the File menu', !/Print/i.test(menuHtml));

/* ---------- Home tab ---------- */
eq('one ribbon tab', R.TABS, [{ id: 'home', label: 'Home' }]);
eq('home commands', R.HOME_COMMANDS.map(function (x) { return x.label; }),
  ['Grid', 'Cards', 'New record', '+ Row', '− Row', '+ Column', 'Rename', 'Delete table']);
var panels = htmlLive.match(/class="of-panel"/g) || [];
eq('one ribbon panel', panels.length, 1);
var homeMatch = /id="of-panel-home"[\s\S]*?<\/nav>/.exec(htmlLive);
var homeIds = [];
(homeMatch ? homeMatch[0] : '').replace(/<button[^>]*id="([^"]+)"[^>]*>([^<]*)<\/button>/g, function (_, id, label) {
  homeIds.push({ id: id, label: label.trim() });
});
eq('home ids in markup', homeIds.map(function (x) { return x.id; }), R.HOME_COMMANDS.map(function (x) { return x.id; }));
eq('home labels in markup', homeIds.map(function (x) { return x.label; }), R.HOME_COMMANDS.map(function (x) { return x.label; }));
eq('hub tabs', R.hubTabs(), [{ id: 'file', label: 'File', menu: true }, { id: 'home', label: 'Home' }]);
eq('quick tabs', R.quickTabs(), [{ id: 'file', label: 'File' }, { id: 'home', label: 'Home' }]);

/* ---------- old UI is commented, not deleted ---------- */
ok('old header kept in a comment', html.indexOf('<header class="top">') !== -1 && htmlLive.indexOf('<header class="top">') === -1);
ok('old toolbar kept in a comment', html.indexOf('<div class="toolbar"') !== -1 && htmlLive.indexOf('<div class="toolbar"') === -1);
ok('theme buttons gone from live markup', htmlLive.indexOf('data-theme=') === -1);
ok('(before TB5) marker in html', html.indexOf('(before TB5)') !== -1);
ok('sheet tabs stay at the bottom', /<footer class="tabs-bar sheet-footer">/.test(htmlLive));
ok('search stays in the top row', /id="of-topbar"[\s\S]*id="search"[\s\S]*<\/header>/.test(htmlLive));
['office-ribbon.css', 'office-tools.css', 'office-settings.css', 'office-collapse.css', 'office-quick.css',
  'office-icons.js', 'office-ribbon.js', 'office-settings.js', 'office-hover.js', 'office-collapse.js',
  'office-hubbar.js', 'office-quick.js', 'office-dialog.js', 'office-native.js'].forEach(function (f) {
  ok('links ../shared/' + f, htmlLive.indexOf('../shared/' + f) !== -1);
});
ok('ribbon script before tables.js', htmlLive.indexOf('tables_ribbon.js') !== -1 && htmlLive.indexOf('tables_ribbon.js') < htmlLive.indexOf('src="tables.js"'));

/* ---------- New asks first only when something would be lost ---------- */
eq('new: clean file, no ask', R.needsNewConfirm({ unsaved: false, blank: false }), false);
eq('new: unsaved edits, ask', R.needsNewConfirm({ unsaved: true, blank: false }), true);
eq('new: unsaved but blank, no ask', R.needsNewConfirm({ unsaved: true, blank: true }), false);
eq('new: blank, no ask', R.needsNewConfirm({ unsaved: false, blank: true }), false);
eq('new: nothing given', R.needsNewConfirm(), false);
var blank = M.blankDb();
ok('New makes the HOT1 blank file', Hot.isBlank({
  settings: { theme: blank.theme },
  tables: [{ id: blank.tables[0].id, name: blank.tables[0].name, view: 'grid', columns: blank.tables[0].columns, rows: [] }]
}));

/* ---------- theme stays in the .hot file ---------- */
var db = M.blankDb();
eq('theme choice dark', R.applyThemeChoice(db, 'dark'), 'dark');
eq('db.theme set', db.theme, 'dark');
eq('theme choice junk -> auto', R.applyThemeChoice(M.blankDb(), 'purple'), 'auto');
var text = Hot.stringify({
  name: 'Theme test',
  activeId: db.activeId,
  settings: { theme: db.theme },
  tables: [{ id: db.tables[0].id, name: db.tables[0].name, view: 'grid', columns: db.tables[0].columns, rows: db.tables[0].rows }]
});
var back = Hot.parse(text);
eq('settings.theme round trip', back.settings, { theme: 'dark' });
eq('toDb keeps theme', Hot.toDb(back).db.theme, 'dark');
R.applyThemeChoice(db, 'light');
eq('light round trip', Hot.parse(Hot.stringify({ activeId: db.activeId, settings: { theme: db.theme }, tables: db.tables })).settings.theme, 'light');
ok('device settings have no theme', !('theme' in R.settingsDefaults()));
eq('device settings', R.settingsDefaults(), { ribbonCollapsed: false });

/* ---------- fake DOM ---------- */
function FakeEl(tag, id) {
  this.tagName = String(tag || 'div').toUpperCase();
  this.id = id || '';
  this.children = [];
  this.parentNode = null;
  this.hidden = false;
  this.disabled = false;
  this.attrs = {};
  this.dataset = {};
  this.style = { setProperty: function () {} };
  this.listeners = {};
  this.innerHTML = '';
  this.textContent = '';
  var cls = {};
  this.classList = {
    add: function () { for (var i = 0; i < arguments.length; i++) cls[arguments[i]] = 1; },
    remove: function () { for (var i = 0; i < arguments.length; i++) delete cls[arguments[i]]; },
    toggle: function (c, v) { if (v === undefined) v = !cls[c]; if (v) cls[c] = 1; else delete cls[c]; return v; },
    contains: function (c) { return !!cls[c]; }
  };
}
FakeEl.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
FakeEl.prototype.getAttribute = function (k) { return this.attrs[k] == null ? null : this.attrs[k]; };
FakeEl.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
FakeEl.prototype.removeEventListener = function () {};
FakeEl.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeEl.prototype.insertBefore = function (c, ref) {
  if (c.parentNode) { var a = c.parentNode.children; a.splice(a.indexOf(c), 1); }
  c.parentNode = this;
  var i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
  return c;
};
Object.defineProperty(FakeEl.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(FakeEl.prototype, 'nextSibling', { get: function () {
  if (!this.parentNode) return null;
  var a = this.parentNode.children; return a[a.indexOf(this) + 1] || null;
} });
FakeEl.prototype.querySelector = function () { return null; };
FakeEl.prototype.querySelectorAll = function () { return []; };
FakeEl.prototype.contains = function (n) { return n === this; };
FakeEl.prototype.click = function () { (this.listeners.click || []).forEach(function (fn) { fn({ preventDefault: function () {} }); }); };
FakeEl.prototype.focus = function () {};

function makeEnv() {
  var els = {};
  ['of-topbar', 'of-file-btn', 'of-tabs', 'of-file-menu', 'of-ribbon', 'settingsBtn', 'settingsMenuBtn', 'btn-new', 'grid-wrap', 'cards-wrap'].forEach(function (id) {
    els[id] = new FakeEl(id === 'of-topbar' ? 'header' : 'div', id);
  });
  els['of-topbar'].appendChild(els['of-file-btn']);
  els['of-file-menu'].hidden = true;
  var store = {};
  var winListeners = {};
  var doc = {
    readyState: 'complete',
    body: new FakeEl('body'),
    getElementById: function (id) { return els[id] || null; },
    createElement: function (t) { return new FakeEl(t); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  var win = {
    document: doc,
    navigator: { platform: 'Linux' },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); }
    },
    addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console,
    Promise: Promise,
    JSON: JSON,
    Object: Object,
    String: String,
    Number: Number
  };
  win.window = win;
  win.parent = win;      // standalone: not in a frame
  win.self = win;
  win.location = { origin: 'http://localhost' };
  return { win: win, doc: doc, els: els, store: store, winListeners: winListeners };
}

var env = makeEnv();
var ctx = vm.createContext(env.win);
var settingsOpts = null;
var quickOpts = null;
/* Stub shared modules whose real behaviour needs layout; OfficeQuick is the real file (below). */
ctx.OfficeSettings = {
  create: function (o) {
    settingsOpts = o;
    var S = { o: o, s: {}, opened: 0, syncs: 0 };
    var d = o.defaults; for (var k in d) S.s[k] = d[k];
    S.save = function () { env.win.localStorage.setItem(o.key, JSON.stringify(S.s)); };
    S.set = function (k, v) { S.s[k] = v; S.save(); if (o.onChange) o.onChange(k, v); S.syncForm(); };
    S.syncForm = function () { S.syncs++; };
    S.open = function () { S.opened++; };
    S.reset = function () { S.s = {}; for (var k2 in d) S.s[k2] = d[k2]; S.save(); if (o.onReset) o.onReset(); S.syncForm(); };
    S.save();
    ctx.__S = S;
    return S;
  }
};
var selected = [];
ctx.OfficeRibbon = {
  create: function (o) {
    var rb = { tabs: o.tabs, current: o.tabs[0].id };
    rb.select = function (id) { rb.current = id; selected.push(id); };
    rb.setFile = function (v) { o.fileMenu.hidden = !v; };
    return rb;
  }
};
vm.runInContext(fs.readFileSync(path.join(dir, '../shared/office-quick.js'), 'utf8'), ctx, { filename: 'office-quick.js' });
var realRegister = ctx.OfficeQuick.register;
ctx.OfficeQuick.register = function (o) { quickOpts = o; return realRegister(o); };
vm.runInContext(read('tables_ribbon.js'), ctx, { filename: 'tables_ribbon.js' });

var themeCalls = [];
var newCalls = 0;
var saves = 0;
var fileTheme = 'dark';
ctx.TablesRibbon.init({
  save: function () { saves++; return Promise.resolve(true); },
  canSave: function () { return true; },
  newFile: function () { newCalls++; return Promise.resolve(true); },
  setTheme: function (v) { themeCalls.push(v); fileTheme = v; },
  getTheme: function () { return fileTheme; },
  fileName: function () { return 'Jobs'; },
  isUnsaved: function () { return false; },
  status: function () {}
});

ok('settings created', !!settingsOpts);
eq('settings key', settingsOpts.key, 'tables_settings');
var rows = [];
settingsOpts.sections.forEach(function (sec) { sec.rows.forEach(function (r) { rows.push(r.type === 'about' ? 'about:' + r.text : r.key); }); });
eq('settings rows', rows, ['theme', 'ribbonCollapsed', 'about:Tables TB5']);
eq('theme options', settingsOpts.sections[0].rows[0].options, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]);
eq('settings shows the file theme', ctx.__S.s.theme, 'dark');
ctx.__S.set('theme', 'light');
eq('Settings theme writes the file theme', themeCalls, ['light']);
var stored = JSON.parse(env.store.tables_settings);
ok('theme is not stored in tables_settings', !('theme' in stored), env.store.tables_settings);
eq('tables_settings holds ribbonCollapsed only', Object.keys(stored), ['ribbonCollapsed']);
ctx.__S.reset();
eq('reset keeps the file theme', ctx.__S.s.theme, 'light');
eq('reset did not change the file theme', themeCalls, ['light']);
ctx.TablesRibbon.syncTheme('auto');
eq('syncTheme follows an opened file', ctx.__S.s.theme, 'auto');

env.els['settingsMenuBtn'].click();
eq('File > Settings opens the pop-up', ctx.__S.opened, 1);
env.els['btn-new'].click();
eq('File > New calls newFile', newCalls, 1);

/* Quick Access: real shared office-quick.js */
ok('quick registered', !!quickOpts);
ok('no undo handed to OfficeQuick', quickOpts.undo === undefined && quickOpts.redo === undefined);
ok('no print handed to OfficeQuick', quickOpts.print === undefined);
eq('quick app name', quickOpts.app, 'Tables');
var qb = ctx.OfficeQuick.buttons;
ok('Undo greyed out', qb.undo && qb.undo.disabled === true);
ok('Redo greyed out', qb.redo && qb.redo.disabled === true);
ok('Print greyed out', qb.print && qb.print.disabled === true);
ok('Save enabled', qb.save && qb.save.disabled === false);
eq('run undo does nothing', ctx.OfficeQuick.run('undo'), false);
eq('run print does nothing', ctx.OfficeQuick.run('print'), false);
eq('run save works', ctx.OfficeQuick.run('save'), true);
eq('save reached tables.js', saves, 1);
ok('quick bar sits in the top row', qb.save.parentNode && qb.save.parentNode.parentNode === env.els['of-topbar']);
eq('quick tabs from tables', quickOpts.tabs(), [{ id: 'file', label: 'File' }, { id: 'home', label: 'Home' }]);
quickOpts.onTab('file');
eq('quick File tab opens the File menu', env.els['of-file-menu'].hidden, false);
quickOpts.onTab('home');
eq('quick Home tab closes File and selects Home', [env.els['of-file-menu'].hidden, selected[selected.length - 1]], [true, 'home']);

/* wait for the Quick Access save above to settle (saving flag) */
setTimeout(function () {
/* Ctrl/Cmd+S goes through OfficeQuick (its window keydown listener) */
function key(k, extra) {
  var ev = { key: k, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false,
    preventDefault: function () { this.defaultPrevented = true; } };
  for (var x in (extra || {})) ev[x] = extra[x];
  (env.winListeners.keydown || []).forEach(function (fn) { fn(ev); });
  return ev;
}
var evS = key('s');
eq('Ctrl+S saves through OfficeQuick', saves, 2);
ok('Ctrl+S never opens the browser Save page', evS.defaultPrevented);
var evZ = key('z');
ok('Ctrl+Z left to the browser (no undo in Tables)', !evZ.defaultPrevented);
key('s', { shiftKey: true });
eq('Ctrl+Shift+S is not OfficeQuick (Save As stays in tables.js)', saves, 2);
var tablesSrcLive = live(read('tables.js'));
ok('tables.js leaves plain Ctrl+S to OfficeQuick', /OfficeQuick && OfficeQuick\.register && !e\.shiftKey\) return;/.test(tablesSrcLive));
ok('tables.js keeps Ctrl+Shift+S Save As', tablesSrcLive.indexOf('saveAs: !!e.shiftKey') !== -1);

/* ---------- no alert / confirm / prompt ---------- */
['tables.js', 'tables_ribbon.js', 'tables_hot.js'].forEach(function (f) {
  var src = live(read(f));
  var bad = src.match(/(^|[^.\w$])(alert|confirm|prompt)\s*\(/g) || [];
  var win = src.match(/window\.(alert|confirm|prompt)\s*\(/g) || [];
  ok('no alert/confirm/prompt in ' + f, !bad.length && !win.length, JSON.stringify(bad.concat(win)));
});
ok('New asks with OfficeDialog', /OfficeDialog\.confirm\(\{\s*title: 'Start a new file\?'/.test(tablesSrcLive));
ok('theme buttons wiring commented', tablesSrcLive.indexOf(".theme button") === -1 && read('tables.js').indexOf('(before TB5)') !== -1);
ok('tables.js hands the API to TablesRibbon', tablesSrcLive.indexOf('TablesRibbon.init(') !== -1);

if (fails.length) {
  console.error('\nFAILED ' + fails.length + ':\n' + fails.join('\n'));
  process.exit(1);
}
console.log('\ntb5 ribbon checks passed');
}, 20);
