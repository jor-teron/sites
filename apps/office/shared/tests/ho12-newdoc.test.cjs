#!/usr/bin/env node
/* HO12: new Hub Office tabs get ?new=1; suites detect it with isNewDocLaunch.
 * Run with: node --test apps/office/shared/tests/ho12-newdoc.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/shared/office-newdoc.js');
const HUB_JS = path.join(ROOT, 'apps/office/hub-office/hub_office.js');
const DOCNAME_PATH = path.join(ROOT, 'apps/office/shared/office-docname.js');

test('node --check on office-newdoc.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function loadNewDoc() {
  const ctx = {
    console: console,
    URLSearchParams: URLSearchParams,
    location: { search: '' }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'office-newdoc.js' });
  return ctx;
}

test('isNewDocLaunch is true only for new=1', () => {
  const D = loadNewDoc().OfficeNewDoc;
  assert.equal(D.isNewDocLaunch('?new=1'), true);
  assert.equal(D.isNewDocLaunch('new=1'), true);
  assert.equal(D.isNewDocLaunch('?foo=bar&new=1'), true);
  assert.equal(D.isNewDocLaunch('?NEW=1'), false);
  assert.equal(D.isNewDocLaunch('?new=true'), false);
  assert.equal(D.isNewDocLaunch('?new=0'), false);
  assert.equal(D.isNewDocLaunch('?new='), false);
  assert.equal(D.isNewDocLaunch(''), false);
  assert.equal(D.isNewDocLaunch('?'), false);
  assert.equal(D.isNewDocLaunch('?file=Budget.hos'), false);
  assert.equal(D.isNewDocLaunch('?new=12'), false);
});

test('isNewDocLaunch reads location.search when no argument is given', () => {
  const ctx = loadNewDoc();
  ctx.location.search = '?new=1';
  assert.equal(ctx.OfficeNewDoc.isNewDocLaunch(), true);
  ctx.location.search = '';
  assert.equal(ctx.OfficeNewDoc.isNewDocLaunch(), false);
  ctx.location.search = '?x=1&new=1';
  assert.equal(ctx.OfficeNewDoc.isNewDocLaunch(), true);
});

test('frameSrc adds new=1 for a new tab and not for a file open', () => {
  const D = loadNewDoc().OfficeNewDoc;
  assert.equal(D.frameSrc('../writer/'), '../writer/?new=1');
  assert.equal(D.frameSrc('../writer/', { newBlank: true }), '../writer/?new=1');
  assert.equal(D.frameSrc('../writer/', { hash: '' }), '../writer/?new=1');
  assert.equal(
    D.frameSrc('../writer/', { hash: 'drive=local&path=Documents&file=Letter.how' }),
    '../writer/#drive=local&path=Documents&file=Letter.how'
  );
  assert.equal(
    D.frameSrc('../writer/', { hash: '#drive=local&file=Letter.how', newBlank: false }),
    '../writer/#drive=local&file=Letter.how'
  );
  assert.equal(
    D.frameSrc('../writer/', { hash: 'drive=local&file=Letter.how', newBlank: true }),
    '../writer/?new=1#drive=local&file=Letter.how'
  );
});

test('frameSrc uses & when the base URL already has a query', () => {
  const D = loadNewDoc().OfficeNewDoc;
  assert.equal(D.frameSrc('../writer/?theme=dark', { newBlank: true }), '../writer/?theme=dark&new=1');
  assert.equal(
    D.frameSrc('../writer/?theme=dark', { hash: 'drive=local&file=A.how', newBlank: false }),
    '../writer/?theme=dark#drive=local&file=A.how'
  );
});

function loadHub() {
  const context = {
    window: {},
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    location: { href: 'https://hub.test/apps/office/hub-office/hub_office.html', origin: 'https://hub.test', search: '' },
    URL: URL,
    URLSearchParams: URLSearchParams,
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
    alert: () => {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), context, { filename: 'office-newdoc.js' });
  vm.runInContext(fs.readFileSync(DOCNAME_PATH, 'utf8'), context, { filename: 'office-docname.js' });
  vm.runInContext(fs.readFileSync(HUB_JS, 'utf8'), context, { filename: 'hub_office.js' });
  return context.HubOffice;
}

test('createDocTab adds ?new=1 for a new blank tab and keeps a file-open hash clean', () => {
  const HO = loadHub();
  const blank = HO.createDocTab('writer');
  assert.equal(blank.url, '../writer/?new=1');
  const named = HO.createDocTab('spreadsheet', { title: 'Budget.hos' });
  assert.equal(named.url, '../spreadsheet/?new=1');
  const opened = HO.createDocTab('writer', {
    title: 'Letter.how',
    hash: 'drive=local&path=Documents&file=Letter.how'
  });
  assert.equal(opened.url, '../writer/#drive=local&path=Documents&file=Letter.how');
  assert.ok(!opened.url.includes('new=1'));
});
