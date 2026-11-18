#!/usr/bin/env node
/* HOP1: Presentation file names — export .hop, import .hop.
   PN4: .hslides is no longer accepted (before PN4: import .hop and .hslides).
   Run: node --test apps/office/slides/test-hop1.cjs
   No DOM, no browser, no network. Loads slides_file.js in a vm (same pattern as test-sl10-startup.js). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSLFile() {
  const src = fs.readFileSync(path.join(__dirname, 'slides_file.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.SLFile;
}

test('fileName writes a .hop export name', () => {
  const SLFile = loadSLFile();
  assert.equal(SLFile.fileName('My talk'), 'My talk.hop');
  assert.equal(SLFile.fileName('My talk.hop'), 'My talk.hop');
  /* (before PN4) assert.equal(SLFile.fileName('My talk.hslides'), 'My talk.hop'); */
  assert.equal(SLFile.fileName('My talk.hslides'), 'My talk.hslides.hop');
  assert.equal(SLFile.fileName('Q?.hop'), 'Q.hop');
  assert.ok(SLFile.fileName('Deck').endsWith('.hop'));
  assert.equal(SLFile.fileName(''), 'presentation.hop');
});

test('.hop is accepted, .hslides and other extensions are rejected', () => {
  const SLFile = loadSLFile();
  assert.equal(SLFile.isDeckName('talk.hop'), true);
  assert.equal(SLFile.isDeckName('talk.HOP'), true);
  /* (before PN4) assert.equal(SLFile.isDeckName('talk.hslides'), true); */
  /* (before PN4) assert.equal(SLFile.isDeckName('talk.HSLIDES'), true); */
  assert.equal(SLFile.isDeckName('talk.hslides'), false);
  assert.equal(SLFile.isDeckName('talk.HSLIDES'), false);
  assert.equal(SLFile.isDeckName({ name: 'talk.hop' }), true);
  /* (before PN4) assert.equal(SLFile.isDeckName({ name: 'talk.hslides' }), true); */
  assert.equal(SLFile.isDeckName({ name: 'talk.hslides' }), false);
  assert.equal(SLFile.isDeckName('talk.pptx'), false);
  assert.equal(SLFile.isDeckName('talk.json'), false);
  assert.equal(SLFile.isDeckName('talk.how'), false);
  assert.equal(SLFile.isDeckName('talk'), false);
  assert.equal(SLFile.isDeckName(''), false);
});

test('JSON format stays hub-slides version 6', () => {
  const src = fs.readFileSync(path.join(__dirname, 'slides_file.js'), 'utf8');
  assert.ok(src.indexOf("format: 'hub-slides', version: 6") !== -1);
  assert.ok(src.indexOf("j.format !== 'hub-slides'") !== -1);
});
