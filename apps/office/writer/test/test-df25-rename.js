/* DF25: full Writer rename (folder, files, global, Hub id, settings keys) and the
   compatibility pieces: draftly alias, one-time settings copy, old-path redirect.
   Run: node apps/office/writer/test/test-df25-rename.js
   No DOM, no browser, no network. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

/* (before DW5) var ROOT = path.resolve(__dirname, '../../..'); */
var ROOT = path.resolve(__dirname, '../../../..');
var fails = [];
var passed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('ok', name); }
  else fails.push(name + (detail ? ' — ' + detail : ''));
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function live(src) { return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1'); }

/* ----- folder and files ----- */
var W = 'apps/office/writer/';
['writer.html', 'writer_icon.png', 'writer_readme.md', 'index.html', 'vendor/jspdf.umd.min.js',
  'vendor/html2canvas.min.js', 'vendor/html-docx.js', 'ui/theme.css', 'modules/writer-config.js', 'modules/writer-app.js'
].forEach(function (f) { ok('exists ' + W + f, exists(W + f)); });
var mods = fs.readdirSync(path.join(ROOT, W, 'modules'));
ok('no draftly-*.js left in modules/', !mods.some(function (f) { return /draftly/i.test(f); }), mods.join(','));
ok('modules are writer-*.js', mods.length > 40 && mods.every(function (f) { return /^writer-[a-z-]+\.js$/.test(f); }));

/* ----- old address: redirect only ----- */
var OLD = 'apps/office/draftly/';
var oldFiles = fs.readdirSync(path.join(ROOT, OLD)).sort();
ok('old folder holds only the two redirect pages', oldFiles.join(',') === 'draftly.html,index.html', oldFiles.join(','));
['index.html', 'draftly.html'].forEach(function (f) {
  var t = read(OLD + f);
  ok(OLD + f + ' redirects to ../writer/writer.html with query and hash',
    t.indexOf("location.replace('../writer/writer.html' + location.search + location.hash)") !== -1);
  ok(OLD + f + ' has a noscript fallback', t.indexOf('url=../writer/writer.html') !== -1);
  ok(OLD + f + ' is not a copy of the app', t.length < 3000 && t.indexOf('<script src=') === -1);
});
ok('redirect target resolves', exists(path.posix.join(OLD, '../writer/writer.html')));
var newIndex = read(W + 'index.html');
ok('new index opens writer.html', newIndex.indexOf("location.replace('writer.html' + location.search + location.hash)") !== -1);

/* ----- page: title, every linked file exists, no cache-bust ----- */
var html = read(W + 'writer.html');
var htmlLive = html.replace(/<!--[\s\S]*?-->/g, '');
var title = htmlLive.match(/<title>([^<]*)<\/title>/);
ok('title is Writer DF25', title && title[1] === 'Writer DF25', title && title[1]);
ok('no ?v= cache-bust', htmlLive.indexOf('?v=') === -1);
var refs = [];
htmlLive.replace(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g, function (_, u) { refs.push(u); });
ok('page links many files', refs.length > 60, String(refs.length));
var missing = refs.filter(function (u) { return !/^[a-z]+:/i.test(u) && !exists(path.posix.join(W, u)); });
ok('every script / stylesheet / icon linked from writer.html exists', missing.length === 0, missing.join(', '));
ok('no live draftly path in writer.html', !/draftly/i.test(htmlLive));

/* ----- code: Writer global, no live Draftly identifier ----- */
var liveHits = [];
mods.forEach(function (f) {
  var src = live(read(W + 'modules/' + f));
  src.split('\n').forEach(function (l) {
    if (!/draftly/i.test(l)) return;
    if (/^\s*window\.Draftly = Writer;\s*$/.test(l) && f === 'writer-config.js') return;   /* the alias */
    if (/dbName: 'draftly'/.test(l) || /storageKeyMargins: 'draftly_margins'/.test(l)) return;   /* kept on purpose */
    if (f === 'writer-config.js' && (/oldKeyRe = \/\^draftly/.test(l) || /k === 'draftly_margins'/.test(l))) return;   /* the migration reads the old names */
    liveHits.push(f + ': ' + l.trim());
  });
});
ok('no live Draftly / draftly in writer modules (except alias, dbName, old margins key)', liveHits.length === 0, liveHits.slice(0, 5).join(' | '));

/* ----- settings migration (pure, fake storage) ----- */
function fakeStorage(init) {
  var m = Object.assign({}, init || {});
  return {
    _m: m,
    get length() { return Object.keys(m).length; },
    key: function (i) { return Object.keys(m)[i] || null; },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }
  };
}
function bootConfig(ls) {
  var win = { OfficePage: {} };
  if (ls) win.localStorage = ls;
  var ctx = { window: win, document: { documentElement: { style: { setProperty: function () {} } } }, OfficePage: {} };
  ctx.localStorage = ls;
  vm.createContext(ctx);
  vm.runInContext(read(W + 'modules/writer-config.js'), ctx, { filename: 'writer-config.js' });
  return ctx;
}
var ls = fakeStorage({
  draftly_settings: '{"theme":"dark","ruler":true}', draftly_theme: 'dark', draftly_margin_custom: '{"top":1}',
  'draftly-ribbon-tab': 'page', 'draftly.lastTextColour': '#ff0000', draftly_zoom: '1.25', draftly_margins: 'old',
  draftly_last_name: 'Letter', writer_ruler: '0', 'sites-hub.theme': 'dark', 'notely-theme': 'x'
});
var ctx = bootConfig(ls);
ok('global is Writer, Draftly is an alias', ctx.window.Writer && ctx.window.Draftly === ctx.window.Writer);
ok('config release is DF25', ctx.window.Writer.config.release === 'DF25');
ok('migration ran at load: writer_settings copied', ls.getItem('writer_settings') === '{"theme":"dark","ruler":true}');
ok('theme copied', ls.getItem('writer_theme') === 'dark');
ok('dash key copied', ls.getItem('writer-ribbon-tab') === 'page');
ok('dot key copied', ls.getItem('writer.lastTextColour') === '#ff0000');
ok('zoom and margins copied', ls.getItem('writer_zoom') === '1.25' && ls.getItem('writer_margin_custom') === '{"top":1}');
ok('last name copied', ls.getItem('writer_last_name') === 'Letter');
ok('existing new key is not overwritten', ls.getItem('writer_ruler') === '0');
ok('old draftly_margins is not copied', ls.getItem('writer_margins') === null);
ok('old keys are left in place', ls.getItem('draftly_settings') !== null && ls.getItem('draftly_theme') === 'dark');
ok('other apps untouched', ls.getItem('writer-theme') === null && ls.getItem('notely-theme') === 'x');
ok('flag set', ls.getItem('writer_df25_migrated') === '1');
var M = ctx.window.Writer.config.migrateKeys;
ls.setItem('draftly_page_numbers', '1');
ok('second run does nothing (-1)', M(ls) === -1 && ls.getItem('writer_page_numbers') === null);
var fresh = fakeStorage({ draftly_ruler: '1' });
ok('returns the copied count', M(fresh) === 1 && fresh.getItem('writer_ruler') === '1');
var blocked = { get length() { throw new Error('SecurityError'); }, getItem: function () { return null; }, setItem: function () { throw new Error('x'); } };
ok('blocked storage: no throw, -1', M(blocked) === -1);
ok('config loads with no localStorage at all', !!bootConfig(null).window.Writer.config);

/* every key the modules read is a writer key (or kept on purpose) */
var keyHits = [];
mods.forEach(function (f) {
  live(read(W + 'modules/' + f)).replace(/'(draftly[_.\-][A-Za-z_.\-]+)'/g, function (_, k) { if (k !== 'draftly_margins') keyHits.push(f + ':' + k); });
});
ok('no module uses an old draftly_* key', keyHits.length === 0, keyHits.join(', '));

/* ----- file types: .how → writer, draftly alias ----- */
var tctx = { window: {} };
vm.createContext(tctx);
vm.runInContext(read('shared/fs/filetypes.js'), tctx);
var FT = tctx.window.FileTypes;
var how = FT.apps('Letter.how');
ok('.how opens writer', how.length === 1 && how[0].id === 'writer' && how[0].url === 'apps/office/writer/' && how[0].file === true);
var al = FT.app('draftly');
ok('app("draftly") is Writer (alias)', al && al.id === 'writer' && al.url === 'apps/office/writer/' && al.name === 'Writer');
ok('app("writer") is Writer', FT.app('writer') && FT.app('writer').url === 'apps/office/writer/');
ok('unknown id is null', FT.app('nope') === null && FT.app('constructor') === null);
ok('url resolves to the new folder', exists(how[0].url + 'index.html'));

/* ----- Hub: catalog, index, hidden alias row, profile ----- */
function csvRows(t) { return t.split(/\r?\n/).filter(function (l) { l = l.trim(); return l && l[0] !== '#'; }); }
var csvW = csvRows(read('apps/office/office-apps.csv')).filter(function (l) { return /^Writer\s*,/.test(l); });
ok('office-apps.csv: one Writer row at writer/', csvW.length === 1 && csvW[0].split(',')[1].trim() === 'writer/');
var cctx = { window: {} }; vm.createContext(cctx); vm.runInContext(read('hub/core/hub_catalog.js'), cctx);
ok('hub_catalog.js Office text equals office-apps.csv', cctx.window.SITES_CSV.Office === read('apps/office/office-apps.csv'));
var ictx = { window: {} }; vm.createContext(ictx); vm.runInContext(read('hub/core/hub_appindex.js'), ictx);
var IDX = ictx.window.HUB_APP_INDEX;
ok('index id writer', IDX.writer && IDX.writer[1] === 'apps/office/writer/' && IDX.writer[3] === 'apps/office/writer/writer_icon.png');
ok('index icon exists', exists(IDX.writer[3]));
ok('index has no draftly id (would list Writer twice)', !IDX.draftly);
var actx = { window: {} }; vm.createContext(actx); vm.runInContext(read('hub/core/hub_apps.js'), actx);
var rows = csvRows(actx.window.HUB_APPS_CSV).map(function (l) { return l.split(',').map(function (c) { return c.trim(); }); });
var head = rows[0];
var col = function (n) { return head.indexOf(n); };
var alias = rows.filter(function (r) { return r[col('ENTRY_URL')] === 'apps/office/draftly/'; });
ok('hub_apps.js has one hidden draftly alias row', alias.length === 1 && alias[0][col('HIDDEN')] === '1' && alias[0][col('NAME')] === 'Writer');
ok('alias row icon exists', alias.length === 1 && exists(alias[0][col('ICON_URL')]));
/* hub.js appIdFor: folder name, slugged */
var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
ok('alias row gets id draftly (folder name)', slug('apps/office/draftly'.split('/').pop()) === 'draftly');
var taken = rows.slice(1).map(function (r) { return slug(r[col('ENTRY_URL')].replace(/\/+$/, '').split('/').pop().replace(/\.[a-z0-9]+$/i, '')); });
ok('id draftly is unique among hub_apps.js rows and not an index id', taken.filter(function (i) { return i === 'draftly'; }).length === 1 && !IDX.draftly);
ok('alias path still opens (redirect page)', exists('apps/office/draftly/index.html'));
var prof = read('hub/core/hub_profile.js');
ok('profile lists office/writer with writer_settings', prof.indexOf("['office', 'writer', ['writer_settings',") !== -1);
ok('profile keeps office/draftly for older profile files', prof.indexOf("['office', 'draftly', ['draftly_settings',") !== -1);

/* ----- other apps ----- */
/* (before MV1) var inv = live(read('apps/office/invoice-maker/invoice-maker.js')); */
var inv = live(read('apps/tools/invoice-maker/invoice-maker.js'));
var m = inv.match(/var JSPDF_SRC = '([^']+)'/);
/* (before MV1) ok('Invoice Maker loads jsPDF from ../writer/vendor/', m && m[1] === '../writer/vendor/jspdf.umd.min.js'); */
ok('Invoice Maker loads jsPDF from ../../office/writer/vendor/', m && m[1] === '../../office/writer/vendor/jspdf.umd.min.js');
/* (before MV1) ok('Invoice Maker jsPDF file exists', m && exists(path.posix.join('apps/office/invoice-maker/', m[1]))); */
ok('Invoice Maker jsPDF file exists', m && exists(path.posix.join('apps/tools/invoice-maker/', m[1])));

if (fails.length) {
  console.error('FAILED:\n' + fails.join('\n'));
  process.exit(1);
}
console.log('df25 rename checks passed (' + passed + ')');
