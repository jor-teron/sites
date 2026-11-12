/* SL10: Slides start-up crash — doFit guard and notes restore after SLEdit.init.
   Run: node apps/office/slides/test-sl10-startup.js
   No DOM, no browser, no network. Parses source and runs the real doFit in a
   tiny vm (stage / fit / slideEl stubs only). */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var fails = [];
var passed = 0;

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('ok', name); }
  else fails.push(name + (detail ? ' — ' + detail : ''));
}
function read(rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

var app = read('slides_app.js');
var edit = read('slides_edit.js');
var html = read('slides.html');
var appLive = live(app);
var htmlLive = live(html);

/* ---------- release id ---------- */
ok('VERSION is SL10', /var VERSION = 'SL10'/.test(appLive));
ok('old VERSION kept as (before SL10) comment',
  app.indexOf("/* (before SL10) var VERSION = 'SL9'; */") !== -1);
var title = htmlLive.match(/<title>([^<]*)<\/title>/);
ok('page title is Slides SL10', title && title[1] === 'Slides SL10', title && title[1]);
ok('old title kept as (before SL10) comment',
  html.indexOf('<!-- (before SL10) <title>Slides SL9</title> -->') !== -1);
ok('About version is SL10', /<span id="ver">SL10<\/span>/.test(htmlLive));
ok('About mentions the start-up fix', /SL10: the editor starts even when the notes pane/.test(htmlLive));

/* ---------- source order: setNotesOpen after SLEdit.init ---------- */
var initPos = appLive.indexOf('SLEdit.init(');
var notesPos = appLive.indexOf('setNotesOpen(notesWanted())');
var notesHits = appLive.match(/setNotesOpen\(notesWanted\(\)\)/g) || [];
ok('one live setNotesOpen(notesWanted())', notesHits.length === 1, String(notesHits.length));
ok('SLEdit.init is present', initPos >= 0);
ok('setNotesOpen(notesWanted()) runs after SLEdit.init',
  notesPos > initPos && initPos >= 0,
  'init@' + initPos + ' notes@' + notesPos);
ok('early call kept as (before SL10) comment',
  app.indexOf('/* (before SL10) setNotesOpen(notesWanted()); */') !== -1);

/* ---------- doFit guard: extract the real function and run it ---------- */
function extractDoFit(src) {
  var start = src.indexOf('function doFit() {');
  if (start < 0) return '';
  var brace = src.indexOf('{', start);
  var depth = 0;
  for (var j = brace; j < src.length; j++) {
    var ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  return '';
}
var doFitSrc = extractDoFit(edit);
ok('extracted doFit from slides_edit.js', /function doFit\(\)/.test(doFitSrc) && doFitSrc.indexOf('getBoundingClientRect') !== -1);
ok('doFit has the unready guard', /if\s*\(\s*!stage\s*\|\|\s*!fit\s*\|\|\s*!slideEl\s*\)\s*return;/.test(doFitSrc));
ok('old getBoundingClientRect line kept as (before SL10) comment',
  edit.indexOf("/* (before SL10) var r = stage.getBoundingClientRect(), pos = $('pos'); */") !== -1);

function runDoFit(env) {
  var ctx = {
    stage: env.stage,
    fit: env.fit,
    slideEl: env.slideEl,
    picbar: env.picbar || null,
    tbbar: null,
    shpbar: null,
    tblbar: null,
    arrbar: null,
    scale: 1,
    W: 960,
    H: 540,
    Math: Math,
    $: env.$ || function (id) { throw new Error('$("' + id + '") should not run while unready'); }
  };
  vm.runInNewContext(doFitSrc + '\ndoFit();', ctx);
  return ctx;
}

function noThrow(name, env) {
  var err = null;
  try { runDoFit(env); } catch (e) { err = e; }
  ok(name, !err, err && (err.message || String(err)));
}

var dummyFit = { style: {} };
var dummySlide = { style: { transform: '', setProperty: function () {} } };

noThrow('doFit returns early when stage is missing', { stage: undefined, fit: dummyFit, slideEl: dummySlide });
noThrow('doFit returns early when fit is missing', {
  stage: { getBoundingClientRect: function () { throw new Error('stage should not be read'); } },
  fit: undefined,
  slideEl: dummySlide
});
noThrow('doFit returns early when slideEl is missing', {
  stage: { getBoundingClientRect: function () { throw new Error('stage should not be read'); } },
  fit: dummyFit,
  slideEl: undefined
});

var sized = false;
var readyStage = { getBoundingClientRect: function () { sized = true; return { width: 800, height: 450 }; } };
var readyFit = { style: {} };
var props = {};
var readySlide = { style: { transform: '', setProperty: function (k, v) { props[k] = v; } } };
var errReady = null;
try {
  runDoFit({
    stage: readyStage,
    fit: readyFit,
    slideEl: readySlide,
    $: function () { return null; }
  });
} catch (e) { errReady = e; }
ok('doFit does not throw when the canvas is ready', !errReady, errReady && (errReady.message || String(errReady)));
ok('doFit reads the stage once it is ready', sized === true);
ok('doFit sets the slide scale transform', /^scale\(/.test(readySlide.style.transform), readySlide.style.transform);
ok('doFit sizes the fit box', readyFit.style.width === '800px' && readyFit.style.height === '450px',
  readyFit.style.width + 'x' + readyFit.style.height);

if (fails.length) {
  console.log('\nFAILED ' + fails.length + ' of ' + (passed + fails.length));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\npassed ' + passed);
