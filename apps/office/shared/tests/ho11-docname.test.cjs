#!/usr/bin/env node
/* HO11: office-docname.js posts a name-only message and formats tab labels.
 * Run with: node --test apps/office/shared/tests/ho11-docname.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/shared/office-docname.js');

test('node --check on office-docname.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function boot(opts) {
  opts = opts || {};
  const messages = [];
  const parent = opts.sameParent ? null : {
    postMessage: function (data, origin) { messages.push({ data: data, origin: origin }); }
  };
  const ctx = {
    console: console,
    location: { origin: opts.origin != null ? opts.origin : 'https://hub.test' },
    messages: messages
  };
  ctx.window = ctx;
  ctx.parent = opts.sameParent ? ctx : parent;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'office-docname.js' });
  return ctx;
}

test('sanitize trims, strips controls, and uses the basename', () => {
  const D = boot({ sameParent: true }).OfficeDocName;
  assert.equal(D.sanitize('  Budget.hos  '), 'Budget.hos');
  assert.equal(D.sanitize('Documents/Budget.hos'), 'Budget.hos');
  assert.equal(D.sanitize('C:\\Docs\\Budget.hos'), 'Budget.hos');
  assert.equal(D.sanitize('foo\nbar\t.txt'), 'foo bar .txt');
  assert.equal(D.sanitize(''), '');
  assert.equal(D.sanitize('   '), '');
  assert.equal(D.sanitize('.'), '');
  assert.equal(D.sanitize('..'), '');
  assert.equal(D.sanitize(null), '');
  assert.equal(D.sanitize(undefined), '');
  const long = 'A'.repeat(D.MAX_NAME + 20);
  assert.equal(D.sanitize(long).length, D.MAX_NAME);
});

test('displayLabel keeps short names and caps long ones at 40 with an ellipsis', () => {
  const D = boot({ sameParent: true }).OfficeDocName;
  assert.equal(D.displayLabel('Budget.hos'), 'Budget.hos');
  assert.equal(D.MAX_LABEL, 40);
  const long = 'Quarterly-financial-report-final-draft.hos';
  assert.ok(long.length > 40);
  const shown = D.displayLabel(long);
  assert.equal(shown.length, 40);
  assert.equal(shown.slice(-1), '\u2026');
  assert.equal(shown, long.slice(0, 39) + '\u2026');
  assert.equal(D.displayLabel('  '), '');
});

test('placeholder is Untitled N, starting at 1', () => {
  const D = boot({ sameParent: true }).OfficeDocName;
  assert.equal(D.placeholder(1), 'Untitled 1');
  assert.equal(D.placeholder(2), 'Untitled 2');
  assert.equal(D.placeholder(12), 'Untitled 12');
  assert.equal(D.placeholder(0), 'Untitled 1');
  assert.equal(D.placeholder(-3), 'Untitled 1');
  assert.equal(D.placeholder('nope'), 'Untitled 1');
  assert.equal(D.placeholder(), 'Untitled 1');
});

test('parse accepts v:1 name messages and rejects the rest', () => {
  const D = boot({ sameParent: true }).OfficeDocName;
  assert.equal(D.parse({ hubOfficeDocName: { v: 1, name: 'Budget.hos' } }), 'Budget.hos');
  assert.equal(D.parse({ hubOfficeDocName: { v: 1, name: '  Docs/Budget.hos  ' } }), 'Budget.hos');
  assert.equal(D.parse({ hubOfficeDocName: { v: 1, name: '   ' } }), null);
  assert.equal(D.parse({ hubOfficeDocName: { v: 2, name: 'Budget.hos' } }), null);
  assert.equal(D.parse({ hubOfficeDocName: { name: 'Budget.hos' } }), null);
  assert.equal(D.parse({ type: 'hub-app', title: 'Budget.hos' }), null);
  assert.equal(D.parse({ type: 'hub-hello' }), null);
  assert.equal(D.parse(null), null);
  assert.equal(D.parse('Budget.hos'), null);
});

test('set() posts a sanitized name to the same-origin parent', () => {
  const ctx = boot();
  ctx.OfficeDocName.set('  Documents/Budget.hos  ');
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].origin, 'https://hub.test');
  const payload = JSON.parse(JSON.stringify(ctx.messages[0].data));
  /* (before HO12b) assert.deepEqual(payload, { hubOfficeDocName: { v: 1, name: 'Budget.hos' } });
  assert.equal(ctx.OfficeDocName.parse(payload), 'Budget.hos'); */
  /* HO12b: the name is sent without its file extension. */
  assert.deepEqual(payload, { hubOfficeDocName: { v: 1, name: 'Budget' } });
  assert.equal(ctx.OfficeDocName.parse(payload), 'Budget');
});

test('set() is a no-op outside a frame, and for an empty name', () => {
  const standalone = boot({ sameParent: true });
  standalone.OfficeDocName.set('Budget.hos');
  assert.equal(standalone.messages.length, 0);

  const ctx = boot();
  ctx.OfficeDocName.set('   ');
  ctx.OfficeDocName.set('');
  ctx.OfficeDocName.set(null);
  assert.equal(ctx.messages.length, 0);
});

test('set() does not send hub-hello or touch in-hub', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  assert.ok(!/classList\.add\(\s*['\"]in-hub['\"]/.test(src), 'does not add body.in-hub');
  assert.ok(!/type:\s*['\"]hub-hello['\"]/.test(src), 'does not post hub-hello');
  assert.ok(!/type:\s*['\"]hub-app['\"]/.test(src), 'does not post hub-app');
  const ctx = boot();
  ctx.OfficeDocName.set('Sheet');
  assert.equal(ctx.messages.length, 1);
  const payload = JSON.parse(JSON.stringify(ctx.messages[0].data));
  assert.equal(payload.type, undefined);
  assert.equal(payload.hubTitleBar, undefined);
  assert.ok(payload.hubOfficeDocName);
});
