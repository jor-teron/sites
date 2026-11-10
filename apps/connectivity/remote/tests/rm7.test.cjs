/* Remote RM7 — saved-connection menu placement, in-app confirms, one-row top bar. */
'use strict';

var path = require('path');
var fs = require('fs');
var app = path.join(__dirname, '..');

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else {
    console.log('ok:', msg);
  }
}

/* Drop block comments, line comments and HTML comments so legacy lines are not treated as live. */
function live(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

var C = require(path.join(app, 'rm_config.js'));
var UI = require(path.join(app, 'rm_ui.js'));

assertEq(C.RELEASE, 'RM7', 'release tag is RM7');
assertEq(C.LONG_PRESS_MS, 500, 'long-press is 500 ms');

/* -------------------------------------------------------------------------- */
/* Menu box: viewport coordinates, flip up, clamp in                          */
/* -------------------------------------------------------------------------- */

var under = UI.placeMenuBox(
  { left: 200, top: 40, right: 248, bottom: 88 },
  { w: 160, h: 150 },
  { w: 480, h: 600 }
);
assertEq(under.top, 92, 'menu opens just under the button when it fits');
assertEq(under.left, 88, 'menu lines up with the button\'s right edge');

var low = UI.placeMenuBox(
  { left: 300, top: 300, right: 348, bottom: 348 },
  { w: 160, h: 158 },
  { w: 480, h: 360 }
);
assert(low.top + 158 <= 360 - 8, 'a low row flips or clamps the menu inside the window');
assert(low.top < 348, 'the flipped menu is above the button, not below the fold');
assert(low.left >= 8 && low.left + 160 <= 472, 'the flipped menu stays inside the width');

var edge = UI.placeMenuBox(
  { left: 4, top: 20, right: 20, bottom: 40 },
  { w: 160, h: 80 },
  { w: 200, h: 400 }
);
assertEq(edge.left, 8, 'a menu wider than the space on the left is pulled in from the edge');
assert(edge.top >= 8 && edge.top + 80 <= 392, 'a left-edge menu stays inside the height');

var point = UI.placeMenuBox(
  { left: 180, top: 100, right: 180, bottom: 100 },
  { w: 160, h: 120 },
  { w: 400, h: 500 }
);
assertEq(point.top, 104, 'a right-click point opens the menu just below the finger');
assertEq(point.left, 20, 'the menu sits to the left of the finger so the lift does not hit an item');

/* -------------------------------------------------------------------------- */
/* Sources: in-app dialogs, one header row, no browser dialogs                */
/* -------------------------------------------------------------------------- */

var files = [
  'rm_ui.js', 'rm_main.js', 'rm_config.js', 'rm_sftp_view.js', 'rm_ssh_view.js', 'rm_vnc_view.js',
  'remote.html', 'rm_base.css', 'README.md'
];
var raw = {};
files.forEach(function (f) { raw[f] = fs.readFileSync(path.join(app, f), 'utf8'); });
var js = ['rm_ui.js', 'rm_main.js', 'rm_sftp_view.js', 'rm_ssh_view.js', 'rm_vnc_view.js']
  .map(function (f) { return live(raw[f]); }).join('\n');

assert(!/\bconfirm\s*\(/.test(js), 'live app code does not call confirm()');
assert(!/\balert\s*\(/.test(js), 'live app code does not call alert()');
assert(!/\bprompt\s*\(/.test(js), 'live app code does not call prompt()');
assert(js.indexOf('scrollY') < 0, 'live menu code does not add window.scrollY');
assert(js.indexOf('Delete "') >= 0, 'delete asks Delete "Name"?');
assert(js.indexOf('contextmenu') >= 0, 'a connection row handles right-click');
assert(js.indexOf('LONG_PRESS_MS') >= 0, 'the row uses the long-press delay');
assert(js.indexOf('showPopover') >= 0, 'the menu can use the top layer');
assert(js.indexOf('onEdit') >= 0, 'session screens can open the editor');

var html = live(raw['remote.html']);
assert(html.indexOf('>RM7<') >= 0, 'the visible tag says RM7');
assert(html.indexOf('>RM4<') < 0, 'the visible tag is not RM4');
assert(html.indexOf('class="back"') < 0, 'the Back link is not in the live page');
assert(raw['remote.html'].indexOf('(before RM7)') >= 0, 'the old Back link is kept in a comment');
var header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
assert(header.indexOf('id="tabs"') >= 0, 'the tabs sit in the header');
assert(header.indexOf('id="btn-add"') >= 0, 'Add stays in the header');
assert(html.indexOf('id="confirm-dlg"') >= 0, 'there is an in-app confirm card');
assert(html.indexOf('id="confirm-cancel"') >= 0 && html.indexOf('>Cancel<') >= 0, 'the card has Cancel');
assert(html.indexOf('id="sftp-edit"') >= 0, 'the file session has Edit');
assert(html.indexOf('id="ssh-btn-edit"') >= 0, 'the SSH session has Edit');
assert(html.indexOf('id="vnc-btn-edit"') >= 0, 'the VNC session has Edit');
assert(html.indexOf('popover="manual"') >= 0, 'menus are manual popovers');
assert(html.indexOf('?v=') < 0, 'the page does not cache-bust with ?v=');
assert((html.match(/id="tabs"/g) || []).length === 1, 'there is one tabs element');

var css = live(raw['rm_base.css']);
assert(css.indexOf('position: fixed') >= 0, 'menus are position:fixed');
assert(/header\.top[\s\S]*flex-wrap:\s*nowrap/.test(css), 'the header stays one row');
assert(/header\.top \.tabs[\s\S]*min-width:\s*0/.test(css), 'tabs can shrink and scroll');
assert(raw['README.md'].indexOf('# Remote (RM7)') >= 0, 'the README title is RM7');
assert(raw['README.md'].indexOf('## RM7') >= 0, 'the README has RM7 notes');
assert(raw['README.md'].indexOf('## VNC viewer') >= 0, 'legacy VNC notes are kept');
assert(raw['README.md'].indexOf('## SSH terminal') >= 0, 'legacy SSH notes are kept');

var note = fs.readFileSync(path.join(app, '..', '..', '..', 'hub', 'docs', 'README_technical_team2.txt'), 'utf8');
assert(note.indexOf('### 1.98 Remote saved-connection actions, release RM7') >= 0, 'team note 1.98 is present');

if (failed) {
  console.error(failed + ' test(s) failed');
  process.exit(1);
}
console.log('All RM7 tests passed.');
