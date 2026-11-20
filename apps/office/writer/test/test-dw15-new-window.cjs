/* DW15: File > New opens a new Hub window or a new browser tab.
   Pure checks (no browser): newMode, takeOpenNew, launchIsNew,
   consumeNewLaunch, newTabUrl, requestNew routing.
   Run: node --test apps/office/writer/test/test-dw15-new-window.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');

function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function memStore(init) {
  const data = Object.assign({}, init || {});
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; }
  };
}

function loadDocs(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const log = [];
  const store = opts.store || memStore();
  const parent = opts.parent || { postMessage(msg, origin) { log.push(['post', msg, origin]); } };
  const loc = opts.location || { href: 'http://x/apps/office/writer/writer.html', protocol: 'http:', origin: 'http://x', hash: '', pathname: '/apps/office/writer/writer.html', search: '' };
  const win = {
    parent: opts.inFrame ? parent : undefined,
    localStorage: store,
    location: loc,
    history: {
      replaceState(state, title, url) { log.push(['replace', url]); loc.href = String(url); loc.hash = ''; }
    },
    open(url, target) {
      log.push(['open', url, target]);
      if (opts.blockOpen) return null;
      return { url: url };
    }
  };
  if (!opts.inFrame) win.parent = win;
  if (opts.hubLinked) {
    /* set after create below */
  }
  win.Writer = {
    ui: { onClick() {}, showToast(m) { log.push(['toast', m]); } },
    how: { autosave() { log.push(['autosave']); return Promise.resolve(); }, fresh() { log.push(['fresh']); return Promise.resolve('Untitled 1'); } },
    hub: { linked: !!opts.hubLinked },
    docs: {},
    app: {}
  };
  const bodyClass = { has: !!opts.inHubClass, contains(c) { return c === 'in-hub' && this.has; } };
  const ctx = {
    console,
    URL,
    window: win,
    document: {
      body: { classList: bodyClass },
      getElementById() { return null; },
      addEventListener() {}
    }
  };
  /* parent !== window is how inFrame is detected; keep the same object. */
  if (!opts.inFrame) win.parent = win;
  else win.parent = parent;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'writer-docs.js' });
  const docs = ctx.window.Writer.docs;
  const origNew = docs.newDoc;
  docs.newDoc = function () {
    log.push(['newDoc']);
    return Promise.resolve('same');
  };
  docs._origNew = origNew;
  return { docs, log, store, win, loc };
}

test('newMode: hub desktop, unknown phone, standalone tab, phone and unknown frame', () => {
  const { docs } = loadDocs();
  assert.equal(typeof docs.newMode, 'function');
  assert.equal(docs.newMode({ inFrame: true, inHub: true, phone: false }), 'hub-window');
  assert.equal(docs.newMode({ inFrame: true, inHub: true, phone: null }), 'hub-window');
  assert.equal(docs.newMode({ inFrame: true, inHub: true }), 'hub-window');
  assert.equal(docs.newMode({ inFrame: true, inHub: true, phone: true }), 'same');
  assert.equal(docs.newMode({ inFrame: false, inHub: false }), 'tab');
  assert.equal(docs.newMode({ inFrame: false, inHub: true }), 'tab');
  assert.equal(docs.newMode({ inFrame: true, inHub: false }), 'same');
  assert.equal(docs.newMode({}), 'same');
  assert.equal(docs.newMode(null), 'same');
});

test('takeOpenNew: fresh flag is taken; stale and invalid flags are dropped', () => {
  const { docs } = loadDocs();
  const now = 1_000_000;
  const key = docs.OPEN_NEW_KEY;
  assert.equal(docs.OPEN_NEW_MS, 30000);
  assert.equal(docs.takeOpenNew(now, null), false);

  const fresh = memStore();
  docs.markOpenNew(now, fresh);
  assert.equal(fresh.getItem(key), String(now));
  assert.equal(docs.takeOpenNew(now + 29_999, fresh), true);
  assert.equal(fresh.getItem(key), null);

  const edge = memStore({ [key]: String(now) });
  assert.equal(docs.takeOpenNew(now + 30_000, edge), false);
  assert.equal(edge.getItem(key), null);

  const stale = memStore({ [key]: String(now) });
  assert.equal(docs.takeOpenNew(now + 30_001, stale), false);
  assert.equal(stale.getItem(key), null);

  const empty = memStore();
  assert.equal(docs.takeOpenNew(now, empty), false);

  const bad = memStore({ [key]: 'nope' });
  assert.equal(docs.takeOpenNew(now, bad), false);
  assert.equal(bad.getItem(key), null);

  const future = memStore({ [key]: String(now + 5) });
  assert.equal(docs.takeOpenNew(now, future), false);
  assert.equal(future.getItem(key), null);
});

test('launchIsNew, newTabUrl and consumeNewLaunch clean #new and the storage flag', () => {
  const { docs, loc } = loadDocs();
  assert.equal(docs.launchIsNew({ hash: '#new' }), true);
  assert.equal(docs.launchIsNew({ hash: '' }), false);
  assert.equal(docs.launchIsNew({ hash: '#drive=local&file=Doc.how' }), false);
  assert.equal(docs.launchIsNew({ search: '?new=1', hash: '' }), false);
  assert.equal(docs.launchIsNew(null), false);

  const url = docs.newTabUrl('http://x/apps/office/writer/writer.html#drive=local&file=A.how');
  assert.equal(url, 'http://x/apps/office/writer/writer.html#new');

  const store = memStore();
  const loc2 = { href: 'http://x/apps/office/writer/writer.html#new', hash: '#new', pathname: '/apps/office/writer/writer.html', search: '' };
  const hist = { calls: [], replaceState(s, t, u) { this.calls.push(u); loc2.href = u; loc2.hash = ''; } };
  assert.equal(docs.consumeNewLaunch(50, store, loc2, hist), true);
  assert.ok(hist.calls.length === 1);
  assert.equal(String(hist.calls[0]).indexOf('#new'), -1);

  const store2 = memStore();
  docs.markOpenNew(10, store2);
  const loc3 = { href: 'http://x/apps/office/writer/', hash: '' };
  assert.equal(docs.consumeNewLaunch(20, store2, loc3, { replaceState() { throw new Error('should not clean'); } }), true);
  assert.equal(store2.getItem(docs.OPEN_NEW_KEY), null);

  const store3 = memStore();
  const loc4 = { href: 'http://x/apps/office/writer/', hash: '' };
  assert.equal(docs.consumeNewLaunch(20, store3, loc4, { replaceState() {} }), false);
});

test('requestNew: Hub desktop posts hub-open-app and sets the one-shot flag', async () => {
  const { docs, log, store, win } = loadDocs({ inFrame: true, hubLinked: true });
  win.parent.HubMode = { isDesktop() { return true; } };
  win.parent.HubWM = {};
  const r = await docs.requestNew(win);
  assert.equal(r, undefined);
  assert.equal(log.filter((x) => x[0] === 'newDoc').length, 0);
  const posts = log.filter((x) => x[0] === 'post');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0][1], {
    type: 'hub-open-app',
    url: 'http://x/apps/office/writer/',
    name: 'Writer',
    newInstance: true
  });
  assert.equal(posts[0][2], 'http://x');
  assert.ok(store.getItem(docs.OPEN_NEW_KEY));
});

test('requestNew: Hub phone (detectable) stays in the same window', async () => {
  const { docs, log, store, win } = loadDocs({ inFrame: true, hubLinked: true });
  win.parent.HubMode = { isDesktop() { return false; } };
  const r = await docs.requestNew(win);
  assert.equal(r, 'same');
  assert.deepEqual(log.filter((x) => x[0] === 'newDoc'), [['newDoc']]);
  assert.equal(log.filter((x) => x[0] === 'post').length, 0);
  assert.equal(store.getItem(docs.OPEN_NEW_KEY), null);
});

test('requestNew: unknown Hub phone vs desktop prefers a new window', async () => {
  const { docs, log, win } = loadDocs({ inFrame: true, hubLinked: true });
  /* parent is a Hub frame but HubMode is not readable */
  const r = await docs.requestNew(win);
  assert.equal(r, undefined);
  assert.equal(log.filter((x) => x[0] === 'newDoc').length, 0);
  assert.equal(log.filter((x) => x[0] === 'post').length, 1);
});

test('requestNew: standalone opens a tab with #new; a blocked popup falls back', async () => {
  const a = loadDocs({ inFrame: false });
  const r = await a.docs.requestNew(a.win);
  assert.equal(r, undefined);
  assert.equal(a.log.filter((x) => x[0] === 'newDoc').length, 0);
  const opens = a.log.filter((x) => x[0] === 'open');
  assert.equal(opens.length, 1);
  assert.equal(opens[0][1], 'http://x/apps/office/writer/writer.html#new');
  assert.equal(opens[0][2], '_blank');

  const b = loadDocs({ inFrame: false, blockOpen: true });
  const r2 = await b.docs.requestNew(b.win);
  assert.equal(r2, 'same');
  assert.deepEqual(b.log.filter((x) => x[0] === 'newDoc'), [['newDoc']]);
});

test('requestNew: an unknown frame uses the same window', async () => {
  const { docs, log, win } = loadDocs({ inFrame: true, hubLinked: false });
  const r = await docs.requestNew(win);
  assert.equal(r, 'same');
  assert.deepEqual(log.filter((x) => x[0] === 'newDoc'), [['newDoc']]);
  assert.equal(log.filter((x) => x[0] === 'post').length, 0);
});

test('hubOpenTarget is * on file://; hubPhone reads parent.HubMode when it can', () => {
  const { docs } = loadDocs();
  assert.equal(docs.hubOpenTarget({ protocol: 'file:', origin: 'null' }), '*');
  assert.equal(docs.hubOpenTarget({ protocol: 'http:', origin: 'http://x' }), 'http://x');
  assert.equal(docs.hubPhone(null), null);
  const desktop = { parent: { HubMode: { isDesktop() { return true; } }, HubWM: {} } };
  desktop.parent !== desktop;
  assert.equal(docs.hubPhone(desktop), false);
  const phone = { parent: { HubMode: { isDesktop() { return false; } } } };
  assert.equal(docs.hubPhone(phone), true);
  const blocked = { get parent() { throw new Error('cross-origin'); } };
  assert.equal(docs.hubPhone(blocked), null);
});

test('writer.html title is DW15; old New click is kept as a comment', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const docs = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const src = live(html);
  const liveDocs = live(docs);
  /* (before DW16) assert.ok(/<title>Writer DW15<\/title>/.test(src)); */
  /* (before DW17) assert.ok(/<title>Writer DW1(5|6)<\/title>/.test(src)); */
  assert.ok(/<title>Writer DW1(5|6|7)<\/title>/.test(src));
  assert.ok(html.indexOf('<!-- (before DW15) <title>Writer DW14a</title> -->') !== -1);
  assert.ok(docs.indexOf('(before DW15)') !== -1);
  assert.ok(docs.indexOf("Writer.ui.onClick('newBtn', function () { Writer.docs.newDoc(); });") !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.requestNew') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.newMode') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.takeOpenNew') !== -1);
  assert.ok(liveDocs.indexOf("Writer.ui.onClick('newBtn', function () { Writer.docs.requestNew(); });") !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW16) assert.ok(/release:\s*'DW15'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW1(5|6)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW1(5|6|7)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});
