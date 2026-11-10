/* Web MCP MCP2.1 — masked PIN helper and Grok connector URL. */
'use strict';

var path = require('path');
var app = path.join(__dirname, '..');
var C = require(path.join(app, 'wm_config.js'));
var Mask = require(path.join(app, 'wm_mask.js'));

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

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

assertEq(C.RELEASE, 'MCP2.1', 'release tag is MCP2.1');
assertEq(C.PIN_MASK_ENDS, 2, 'mask leaves 2 characters at each end');
assertEq(C.PIN_MASK_CHAR, '\u2022', 'mask character is a bullet');
assertEq(C.PIN_REMASK_MS, 30000, 'PIN remasks after 30 seconds');
assertEq(C.COPY_FEEDBACK_MS, 1500, 'Copied feedback lasts 1.5 seconds');
assertEq(C.GROK_MCP_PATH, '/mcp/', 'Grok path is /mcp/');
assertEq(C.PIN_MIN_LEN, 6, 'short-PIN cutoff is PIN_MIN_LEN');

/* -------------------------------------------------------------------------- */
/* maskPin                                                                    */
/* -------------------------------------------------------------------------- */

var bullet = C.PIN_MASK_CHAR;

assertEq(Mask.maskPin(''), '', 'empty PIN stays empty');
assertEq(Mask.maskPin(null), '', 'null PIN stays empty');
assertEq(Mask.maskPin(undefined), '', 'undefined PIN stays empty');
assertEq(Mask.maskPin('abc'), bullet + bullet + bullet, '3-character PIN is fully masked');
assertEq(Mask.maskPin('abcdef'), bullet + bullet + bullet + bullet + bullet + bullet, '6-character PIN is fully masked');
assertEq(Mask.maskPin('abcdefg'), 'ab' + bullet + bullet + bullet + 'fg', '7-character PIN shows first 2 and last 2');
assertEq(Mask.maskPin('abCDefyz'), 'ab' + bullet + bullet + bullet + bullet + 'yz', '8-character PIN shows first 2 and last 2');
assertEq(Mask.maskPin('abcdefghij'), 'ab' + bullet + bullet + bullet + bullet + bullet + bullet + 'ij', '10-character PIN shows first 2 and last 2');

/* -------------------------------------------------------------------------- */
/* maskPinInText                                                              */
/* -------------------------------------------------------------------------- */

assertEq(Mask.maskPinInText('hello', ''), 'hello', 'empty PIN leaves text alone');
assertEq(Mask.maskPinInText('hello', null), 'hello', 'null PIN leaves text alone');
assertEq(Mask.maskPinInText('', 'abCDefyz'), '', 'empty text stays empty');
assertEq(
  Mask.maskPinInText('use PIN abCDefyz now', 'abCDefyz'),
  'use PIN ' + Mask.maskPin('abCDefyz') + ' now',
  'replaces one PIN occurrence'
);
assertEq(
  Mask.maskPinInText('abCDefyz and abCDefyz', 'abCDefyz'),
  Mask.maskPin('abCDefyz') + ' and ' + Mask.maskPin('abCDefyz'),
  'replaces every PIN occurrence'
);
assertEq(Mask.maskPinInText('no secret here', 'abCDefyz'), 'no secret here', 'leaves text without the PIN alone');
assertEq(
  Mask.maskPinInText('https://host/mcp/abcdef', 'abcdef'),
  'https://host/mcp/' + Mask.maskPin('abcdef'),
  'masks a short PIN inside a URL'
);

/* -------------------------------------------------------------------------- */
/* grokUrl / grokUrlMasked                                                    */
/* -------------------------------------------------------------------------- */

assertEq(
  Mask.grokUrl('wss://debian.tail94ffdb.ts.net/ws', 'abCDefyz'),
  'https://debian.tail94ffdb.ts.net/mcp/abCDefyz',
  'default Funnel relay becomes https /mcp/<PIN>'
);
assertEq(
  Mask.grokUrl(C.DEFAULT_RELAY_URL, 'abCDefyz'),
  'https://debian.tail94ffdb.ts.net/mcp/abCDefyz',
  'DEFAULT_RELAY_URL becomes the Grok URL'
);
assertEq(
  Mask.grokUrl('ws://127.0.0.1:8788/ws', 'abCDefyz'),
  'http://127.0.0.1:8788/mcp/abCDefyz',
  'local ws relay becomes http /mcp/<PIN>'
);
assertEq(
  Mask.grokUrl('https://debian.tail94ffdb.ts.net/mcp', 'abCDefyz'),
  'https://debian.tail94ffdb.ts.net/mcp/abCDefyz',
  'https relay origin still uses /mcp/<PIN>'
);
assertEq(Mask.grokUrl('', 'abCDefyz'), '', 'empty relay URL yields no Grok URL');
assertEq(Mask.grokUrl('not a url', 'abCDefyz'), '', 'invalid relay URL yields no Grok URL');
assertEq(
  Mask.grokUrlMasked('wss://debian.tail94ffdb.ts.net/ws', 'abCDefyz'),
  'https://debian.tail94ffdb.ts.net/mcp/' + Mask.maskPin('abCDefyz'),
  'masked Grok URL hides the PIN'
);
assertEq(
  Mask.grokUrlMasked('wss://debian.tail94ffdb.ts.net/ws', 'abcdef'),
  'https://debian.tail94ffdb.ts.net/mcp/' + Mask.maskPin('abcdef'),
  'masked Grok URL fully hides a 6-character PIN'
);

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All tests passed');
