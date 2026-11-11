/* DF24: the visible name is Writer. Storage keys, the Hub id and the folder stay draftly.
   Run: node apps/office/draftly/test-df24-name.js
   No DOM, no browser, no network. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '../../..');
var fails = [];

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? ' — ' + detail : ''));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

var html = read('apps/office/draftly/draftly.html');
var htmlLive = live(html);
var title = htmlLive.match(/<title>([^<]*)<\/title>/);
ok('page title is Writer', title && title[1] === 'Writer', title && title[1]);
ok('old title kept', html.indexOf('<!-- (before DF24) <title>Draftly</title> -->') !== -1);
ok('header label is Writer', /<span class="brand-name">Writer<\/span>/.test(htmlLive));
ok('header title is Writer', /<div class="brand" title="Writer">/.test(htmlLive));
ok('live header does not say Draftly', htmlLive.indexOf('Draftly') === -1);

var index = read('apps/office/draftly/index.html');
var indexLive = live(index);
var indexTitle = indexLive.match(/<title>([^<]*)<\/title>/);
ok('index title is Writer', indexTitle && indexTitle[1] === 'Writer', indexTitle && indexTitle[1]);
ok('noscript link says Open Writer', indexLive.indexOf('>Open Writer</a>') !== -1);
ok('old Open Draftly link kept', index.indexOf('(before DF24)') !== -1 && index.indexOf('Open Draftly') !== -1);

var settings = read('apps/office/draftly/modules/draftly-settings.js');
var settingsLive = live(settings);
ok('about text is Writer', settingsLive.indexOf("text: 'Writer ' + cfg.version") !== -1);
ok('about still uses the same version', settingsLive.indexOf('cfg.version') !== -1);
ok('old about text kept', settings.indexOf("(before DF24)") !== -1 && settings.indexOf("text: 'Draftly ' + cfg.version") !== -1);
ok('settings key unchanged', settings.indexOf("KEY: 'draftly_settings'") !== -1);

var pdf = read('apps/office/draftly/modules/draftly-pdfgen.js');
var pdfLive = live(pdf);
ok('pdf title is Writer document', pdfLive.indexOf("'Writer document'") !== -1);
ok('pdf creator is Writer (Hub)', pdfLive.indexOf("'Writer (Hub)'") !== -1);
ok('old pdf properties kept', pdf.indexOf("'Draftly document'") !== -1 && pdf.indexOf('(before DF24)') !== -1);

var hub = read('apps/office/draftly/modules/draftly-hub.js');
var hubLive = live(hub);
ok('hub title-bar name is Writer', hubLive.indexOf("app: 'Writer'") !== -1);
ok('hub message type unchanged', hubLive.indexOf("type: 'hub-app'") !== -1);
ok('old hub name kept', hub.indexOf("app: 'Draftly'") !== -1 && hub.indexOf('(before DF24)') !== -1);

var quick = read('apps/office/draftly/modules/draftly-quick.js');
ok('quick access name is Writer', live(quick).indexOf("app: 'Writer'") !== -1);

var cfg = read('apps/office/draftly/modules/draftly-config.js');
[
  "dbName: 'draftly'",
  "dbVersion: 1",
  "storeName: 'documents'",
  "storageKeyLastName: 'draftly_last_name'",
  "storageKeyBackup: 'draftly-backup'",
  "storageKeyTheme: 'draftly_theme'",
  "storageKeyNonPrint: 'draftly_nonprinting'",
  "storageKeyMargins: 'draftly_margins'",
  "storageKeyOrientation: 'draftly_orientation'",
  "storageKeyPaperSize: 'draftly_paper_size'",
  "storageKeyMarginPreset: 'draftly_margin_preset'",
  "storageKeyMarginCustom: 'draftly_margin_custom'",
  "storageKeyPageNumbers: 'draftly_page_numbers'",
  "storageKeyPageNumberPos: 'draftly_page_number_pos'",
  "version: '0.8'"
].forEach(function (bit) {
  ok('config still has ' + bit, cfg.indexOf(bit) !== -1);
});
ok('Draftly identifier unchanged', cfg.indexOf('var Draftly = window.Draftly || {};') !== -1);

var csv = read('apps/office/office-apps.csv');
var dataRows = csv.split(/\r?\n/).filter(function (line) {
  var t = line.trim();
  return t && t.charAt(0) !== '#';
});
var writer = dataRows.filter(function (line) { return /^Writer\s*,/.test(line); });
ok('csv has one Writer row', writer.length === 1, String(writer.length));
ok('csv path stays draftly/', writer.length === 1 && writer[0].split(',')[1].trim() === 'draftly/');
ok('csv has no live Draftly row', !dataRows.some(function (line) { return /^Draftly\s*,/.test(line); }));
ok('old csv row kept as a comment', csv.indexOf('# (before DF24) Draftly,') !== -1);

var catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(read('hub/core/hub_catalog.js'), catCtx);
var officeCsv = catCtx.window.SITES_CSV && catCtx.window.SITES_CSV.Office;
ok('catalog has Office csv', typeof officeCsv === 'string');
if (typeof officeCsv === 'string') {
  var catRows = officeCsv.split(/\r?\n/).filter(function (line) {
    var t = line.trim();
    return t && t.charAt(0) !== '#';
  });
  var catWriter = catRows.filter(function (line) { return /^Writer\s*,/.test(line); });
  ok('catalog tile name is Writer', catWriter.length === 1);
  ok('catalog path stays draftly/', catWriter.length === 1 && catWriter[0].split(',')[1].trim() === 'draftly/');
  ok('catalog has no live Draftly row', !catRows.some(function (line) { return /^Draftly\s*,/.test(line); }));
}

var idxCtx = { window: {} };
vm.createContext(idxCtx);
vm.runInContext(read('hub/core/hub_appindex.js'), idxCtx);
var row = idxCtx.window.HUB_APP_INDEX && idxCtx.window.HUB_APP_INDEX.draftly;
ok('hub id stays draftly', Array.isArray(row));
if (Array.isArray(row)) {
  ok('index category stays Office', row[0] === 'Office');
  ok('index path stays apps/office/draftly/', row[1] === 'apps/office/draftly/');
  ok('index display name is Writer', row[2] === 'Writer', row[2]);
  ok('index icon path unchanged', row[3] === 'apps/office/draftly/draftly_icon.png');
}
ok('index has no writer id', !idxCtx.window.HUB_APP_INDEX || !idxCtx.window.HUB_APP_INDEX.writer);

var profile = read('hub/core/hub_profile.js');
ok('profile id stays draftly', profile.indexOf("['office', 'draftly',") !== -1);
ok('profile key draftly_settings stays', profile.indexOf("'draftly_settings'") !== -1);

var apps = read('hub/core/hub_apps.js');
ok('legacy list shows Writer', apps.indexOf('Office,   Writer,') !== -1);
ok('legacy list keeps the old Draftly row', apps.indexOf('(before DF24)') !== -1 && apps.indexOf('Draftly,') !== -1);
ok('legacy entry url stays draftly/', apps.indexOf('apps/office/draftly/') !== -1);

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('df24 name checks passed');
