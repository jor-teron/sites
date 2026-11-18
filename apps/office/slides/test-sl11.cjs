#!/usr/bin/env node
/* SL11: Presentation Save / Save As of a .hop file (OfficeNative).
   Run: node --test apps/office/slides/test-sl11.cjs
   No DOM, no browser, no network. Loads office-native.js and slides_hop.js in a vm
   (same pattern as test-hop1.cjs). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const shared = path.join(dir, '../shared');

function loadHop() {
  const ctx = { window: {}, console: console, URLSearchParams: URLSearchParams };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(shared, 'office-native.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_hop.js'), 'utf8'), ctx);
  return { Hop: ctx.SlidesHop, OfficeNative: ctx.OfficeNative, ctx: ctx };
}

/* parseHash objects are created in the vm, so their Object prototype is not this realm's. */
function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

test('fileName writes a .hop name and only strips .hop', () => {
  const { Hop } = loadHop();
  assert.equal(Hop.fileName('My talk'), 'My talk.hop');
  assert.equal(Hop.fileName('My talk.hop'), 'My talk.hop');
  /* (before PN4) assert.equal(Hop.fileName('My talk.hslides'), 'My talk.hop'); */
  assert.equal(Hop.fileName('My talk.hslides'), 'My talk.hslides.hop');
  assert.equal(Hop.fileName('Q?.hop'), 'Q.hop');
  assert.equal(Hop.fileName(''), 'presentation.hop');
  assert.ok(Hop.fileName('Deck').endsWith('.hop'));
});

test('.hop is accepted, .hslides and other extensions are rejected', () => {
  const { Hop } = loadHop();
  assert.equal(Hop.acceptsName('talk.hop'), true);
  assert.equal(Hop.acceptsName('talk.HOP'), true);
  /* (before PN4) assert.equal(Hop.acceptsName('talk.hslides'), true); */
  /* (before PN4) assert.equal(Hop.acceptsName('talk.HSLIDES'), true); */
  assert.equal(Hop.acceptsName('talk.hslides'), false);
  assert.equal(Hop.acceptsName('talk.HSLIDES'), false);
  assert.equal(Hop.acceptsName({ name: 'talk.hop' }), true);
  /* (before PN4) assert.equal(Hop.acceptsName({ name: 'talk.hslides' }), true); */
  assert.equal(Hop.acceptsName({ name: 'talk.hslides' }), false);
  assert.equal(Hop.acceptsName('talk.pptx'), false);
  assert.equal(Hop.acceptsName('talk.json'), false);
  assert.equal(Hop.acceptsName('talk.how'), false);
  assert.equal(Hop.acceptsName('talk'), false);
  assert.equal(Hop.acceptsName(''), false);
});

test('OfficeNative session is configured for .hop', () => {
  const { Hop, OfficeNative } = loadHop();
  const names = [];
  const session = OfficeNative.create({
    ext: Hop.EXT,
    label: 'Hub Office Presentation',
    fallback: Hop.FALLBACK,
    max: Hop.MAX,
    capture: function () {
      return { name: 'My talk', theme: 'light', created: 1000, updated: 2000, slides: [{ title: 'Hi' }] };
    },
    pack: Hop.pack,
    parse: Hop.parse,
    apply: function () {},
    currentName: function () { return 'My talk'; },
    setName: function (n) { names.push(n); }
  });
  assert.equal(session.ext, 'hop');
  assert.equal(session.fileName('My talk'), 'My talk.hop');
  assert.equal(session.fileName('My talk.hop'), 'My talk.hop');
  assert.equal(session.isFile({ name: 'talk.hop' }), true);
  assert.equal(session.isFile({ name: 'talk.HOP' }), true);
  /* default OfficeNative matcher is the primary ext only; install() widens this */
  assert.equal(session.isFile({ name: 'talk.hslides' }), false);
  const installed = Hop.install({
    capture: function () {
      return { name: 'My talk', theme: 'light', created: 1000, updated: 2000, slides: [{ title: 'Hi' }] };
    },
    apply: function () {},
    currentName: function () { return 'My talk'; }
  });
  assert.ok(installed);
  assert.equal(installed.ext, 'hop');
  assert.equal(installed.isFile({ name: 'talk.hop' }), true);
  /* (before PN4) assert.equal(installed.isFile({ name: 'talk.hslides' }), true); */
  assert.equal(installed.isFile({ name: 'talk.hslides' }), false);
  assert.equal(installed.isFile({ name: 'talk.pptx' }), false);
});

test('pack / parse round-trips a deck to hub-slides v6 .hop JSON', () => {
  const { Hop } = loadHop();
  const src = {
    name: 'My talk',
    theme: 'ocean',
    created: 1_700_000_000_000,
    updated: 1_700_000_100_000,
    slides: [{ layout: 'tc', title: 'Hello', bullets: [{ text: 'First point', level: 0 }] }]
  };
  const packed = Hop.pack(src);
  assert.equal(packed.format, 'hub-slides');
  assert.equal(packed.version, 6);
  assert.equal(packed.name, 'My talk');
  assert.equal(packed.theme, 'ocean');
  assert.ok(typeof packed.created === 'string' && packed.created.indexOf('T') !== -1);
  assert.ok(Array.isArray(packed.slides) && packed.slides.length === 1);
  assert.equal(packed.slides[0].title, 'Hello');
  const text = Hop.stringify(src);
  assert.ok(text.indexOf('"format": "hub-slides"') !== -1);
  assert.ok(text.indexOf('.hop') === -1); /* extension is the file name, not a JSON field */
  const doc = Hop.parse(text);
  assert.equal(doc.name, 'My talk');
  assert.equal(doc.theme, 'ocean');
  assert.equal(doc.created, src.created);
  assert.ok(Array.isArray(doc.slides) && doc.slides.length === 1);
  const packed2 = Hop.pack(doc);
  assert.equal(packed2.format, 'hub-slides');
  assert.equal(packed2.version, 6);
  assert.equal(packed2.name, 'My talk');
  assert.equal(packed2.slides[0].title, 'Hello');
});

test('parse refuses a non hop / newer version', () => {
  const { Hop } = loadHop();
  assert.throws(() => Hop.parse('{'), { message: /not valid JSON/ });
  assert.throws(() => Hop.parse(JSON.stringify({ format: 'hos', version: 1, slides: [] })), { message: /hub-slides/ });
  assert.throws(() => Hop.parse(JSON.stringify({ format: 'hub-slides', version: 7, slides: [] })), { message: /version 7/ });
  assert.throws(() => Hop.parse(JSON.stringify({ format: 'hub-slides', version: 6 })), { message: /no slides list/ });
});

test('parseHash accepts .hop and rejects .hslides and other files', () => {
  const { Hop } = loadHop();
  assert.deepEqual(plain(Hop.parseHash('#drive=local&path=Documents&file=Talk.hop')), {
    drive: 'local', path: 'Documents', name: 'Talk.hop'
  });
  /* (before PN4) parseHash('drive=local&file=old.hslides') returned { drive: 'local', path: '', name: 'old.hslides' } */
  assert.equal(Hop.parseHash('drive=local&file=old.hslides'), null);
  assert.deepEqual(plain(Hop.parseHash('#drive=local&path=A%2FB&file=Q.HOP')), {
    drive: 'local', path: 'A/B', name: 'Q.HOP'
  });
  assert.equal(Hop.parseHash('#drive=local&file=talk.pptx'), null);
  assert.equal(Hop.parseHash('#drive=local&file=talk.how'), null);
  assert.equal(Hop.parseHash('#file=talk.hop'), null); /* no drive */
  assert.equal(Hop.parseHash('#drive=local'), null);
  assert.equal(Hop.parseHash(''), null);
  assert.equal(Hop.parseHash(null), null);
});
