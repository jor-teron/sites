/* Video Trimmer VT2 — CSS layout sanity (no browser). */
'use strict';

var fs = require('fs');
var path = require('path');

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

var base = fs.readFileSync(path.join(__dirname, '..', 'vt_base.css'), 'utf8');
var range = fs.readFileSync(path.join(__dirname, '..', 'vt_range.css'), 'utf8');
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert(/100dvh/.test(base), 'vt_base has 100dvh');
assert(/100dvw/.test(base), 'vt_base has 100dvw');
assert(/100vh/.test(base), 'vt_base has 100vh fallback');
assert(/100vw/.test(base), 'vt_base has 100vw fallback');
assert(/overflow:\s*hidden/.test(base), 'vt_base overflow hidden');
assert(/safe-area-inset/.test(base), 'vt_base safe-area insets');
assert(/object-fit:\s*contain/.test(base), 'video object-fit contain');
assert(/min-height:\s*0/.test(base), 'min-height 0 for flex shrink');
assert(/min-width:\s*900px/.test(base) && /orientation:\s*landscape/.test(base),
  'wide landscape side-panel media query');
assert(/max-height:\s*420px/.test(base), 'short landscape compact query');
assert(/--controls-w/.test(base), 'controls width var');
assert(/class="app"/.test(html), 'html uses .app shell');
assert(/class="editor-stage/.test(html), 'html editor-stage');
assert(/class="controls-panel"/.test(html), 'html controls-panel');
assert(/class="video-area"/.test(html), 'html video-area');
assert(/min-height:\s*48px/.test(range), 'time-chip 48px target');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All VT2 CSS sanity checks passed');
