/* AG30: syntax/static + offline VM smoke for the Usage page.
   No browser, no network, no GPU, no paid API calls.
   The clock is fixed at local 2026-11-08 so filters do not depend on the VM date. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
function liveSource(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
}
function liveHtml(src) { return src.replace(/<!--[\s\S]*?-->/g, ''); }
function check(rel) { execFileSync(process.execPath, ['--check', path.join(base, rel)]); }

const TODAY = '2026-11-08';
const YM = '2026_11';
const IMG = 'openai|<img src=x onerror=alert(1)>';

function novFile() {
  return {
    v: 1,
    credits: { tavily: 5 },
    days: {
      '2026-11-08': {
        'openai|gpt': { p: 1000, o: 500, n: 2, e: 0 },
        'ollama|llama': { p: 40, o: 10, n: 1, e: 1 },
        'browser|story': { p: 10, o: 10, n: 1, e: 0 },
        [IMG]: { p: 2, o: 2, n: 1, e: 0 },
        _credits: { tavily: 1 }
      },
      '2026-11-02': {
        'gemini|gem': { p: 1000000, o: 2000000, n: 1, e: 0 },
        'openai|gpt': { p: 1, o: 1, n: 1, e: 0 },
        'openai|bad': { p: 'nope', o: 5, n: 1, e: 0 }
      }
    }
  };
}
function octFile() {
  return {
    v: 1,
    credits: { tavily: 2 },
    days: { '2026-10-02': { 'openai|OCTOBERONLY': { p: 3, o: 4, n: 1, e: 0 }, 'custom|__proto__': { p: 6, o: 6, n: 1, e: 0 } } }
  };
}
const PRICES = {
  'openai|gpt': { in: 2, out: 4 },
  'gemini|gem': { in: 3 },
  'browser|story': { in: 0, out: 0 },
  'custom|saved-only': { in: 9, out: 8 }
};

function installClock(context) {
  const fixed = new Date(2026, 10, 8, 12, 0, 0);
  function Clock(...args) {
    const Real = context._RealDate;
    if (!args.length) return new Real(fixed.getTime());
    return new Real(...args);
  }
  Clock.now = () => fixed.getTime();
  Clock.parse = Date.parse;
  Clock.UTC = Date.UTC;
  Clock.prototype = Date.prototype;
  context.Date = Clock;
}

function makeNode(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(), id: '', className: '', textContent: '', value: '',
    type: '', placeholder: '', min: '', step: '', hidden: false, open: false, children: [], attrs: {},
    listeners: {}, parentNode: null, _html: null
  };
  node.classList = { toggle(name, force) { node.attrs['toggle:' + name] = !!force; } };
  node.setAttribute = (k, v) => { node.attrs[k] = String(v); if (k === 'id') node.id = String(v); };
  node.getAttribute = k => node.attrs[k];
  node.appendChild = ch => { node.children.push(ch); ch.parentNode = node; return ch; };
  node.append = (...chs) => { chs.forEach(ch => node.appendChild(ch)); };
  node.removeChild = ch => { const i = node.children.indexOf(ch); if (i >= 0) node.children.splice(i, 1); return ch; };
  node.addEventListener = (type, fn) => { (node.listeners[type] || (node.listeners[type] = [])).push(fn); };
  Object.defineProperty(node, 'firstChild', { get() { return node.children[0] || null; } });
  Object.defineProperty(node, 'innerHTML', { get() { return node._html; }, set(v) { node._html = String(v); } });
  return node;
}
function walk(node, fn) { fn(node); (node.children || []).forEach(ch => walk(ch, fn)); }
function text(node) { return (node.textContent || '') + (node.children || []).map(text).join(''); }
function byTag(root, tag) { const out = []; walk(root, n => { if (n.tagName === tag) out.push(n); }); return out; }
function headings(root) { return byTag(root, 'H3').map(n => n.textContent); }
function rowsOf(root) { return byTag(root, 'TR'); }
function rowWith(root, label) {
  return rowsOf(root).find(tr => tr.children.some(td => text(td) === label));
}

function fakeIDB(data, opts) {
  opts = opts || {};
  return { open() {
    const req = { result: {
      createObjectStore() {},
      close() {},
      transaction() {
        const tx = { objectStore() { return {
          get: k => ({ result: Object.prototype.hasOwnProperty.call(data, k) ? data[k] : undefined }),
          put: (v, k) => { data[k] = v; return { result: k }; },
          getAllKeys: opts.noKeys ? undefined : () => ({ result: Object.keys(data) })
        }; } };
        queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
        return tx;
      }
    } };
    queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); });
    return req;
  } };
}

function boot(o) {
  o = o || {};
  const store = {};
  const settings = {
    maxSteps: 99, ctxMax: 8192, theme: 'light',
    prices: JSON.parse(JSON.stringify(o.prices == null ? PRICES : o.prices))
  };
  store['agent.settings'] = JSON.stringify(settings);
  const localStorage = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }
  };
  const idb = {};
  if (o.idb) Object.assign(idb, o.idb);
  const files = Object.assign({}, o.files || {});
  const created = [];
  const ids = {};
  function add(id, tag) { const n = makeNode(tag || 'div'); n.id = id; ids[id] = n; return n; }
  if (o.page !== false) {
    add('usagePage', 'main'); add('usageSpend', 'div'); add('usageRates', 'div'); add('usagePeriod', 'div');
  }
  if (o.chat) {
    add('btnSet', 'button'); add('webCredits', 'p'); add('settings', 'dialog');
  }
  const document = {
    getElementById: id => ids[id] || null,
    createElement: tag => { created.push(String(tag).toLowerCase()); return makeNode(tag); },
    documentElement: { dataset: {} },
    body: makeNode('body'),
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  let writes = 0, inits = 0, lists = 0;
  const fsStub = {
    ready: () => o.ready !== false && o.state !== 'need',
    state: () => o.state || (o.ready === false ? 'none' : 'ready'),
    init: () => { inits += 1; return Promise.resolve(); },
    list: () => { lists += 1; if (o.listError) return Promise.reject(o.listError); return Promise.resolve(o.list || []); },
    read: p => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) { const e = new Error('missing'); e.name = 'NotFoundError'; return Promise.reject(e); }
      return Promise.resolve({ text: files[p], size: files[p].length });
    },
    write: () => { writes += 1; return Promise.reject(new Error('usage page must not write usage files')); },
    reconnect: () => { throw new Error('permission prompt'); }
  };
  const HR = { fs: fsStub };
  const context = {
    HR, console, queueMicrotask, Promise, JSON, Math, Number, String, Object, Array, RegExp, parseFloat, isNaN,
    localStorage, indexedDB: fakeIDB(idb, o.idbOpts), document, _RealDate: Date,
    window: { HR, document, localStorage }
  };
  installClock(context);
  vm.createContext(context);
  vm.runInContext(read('app/gui/settings.js'), context, { filename: 'settings.js' });
  vm.runInContext(read('app/storage/usage.js'), context, { filename: 'usage.js' });
  if (o.view !== false) vm.runInContext(read('app/gui/usageview.js'), context, { filename: 'usageview.js' });
  return { HR, store, idb, files, ids, created, writes: () => writes, inits: () => inits, lists: () => lists, context };
}

test('AG30 page, navigation, service worker and readme', () => {
  for (const f of ['app/gui/usageview.js', 'app/storage/usage.js', 'app/gui/settings.js', 'agent_sw.js', 'app/main.js']) check(f);
  execFileSync(process.execPath, ['--check'], { input: read('usage.html').match(/<script>([\s\S]*?)<\/script>/g).map(s => s.replace(/<\/?script>/g, '')).join('\n') });
  const html = read('agent.html'), page = read('usage.html'), sw = read('agent_sw.js'), liveSw = liveSource(sw);
  const live = liveHtml(html), livePage = liveHtml(page);
  assert.match(live, /id="btnUsage" href="usage.html"/);
  assert.match(live, /aria-label="Usage"/);
  assert.equal(live.includes('id="sc_usage"'), false);
  assert.equal(live.includes('id="usageBox"'), false);
  assert.match(html, /AG30 Legacy:/);
  assert.match(html, /id="sc_usage"/); /* kept only in the legacy comment */
  for (const id of ['sc_model', 'sc_folder', 'sc_perms', 'sc_web', 'sc_helper', 'sc_display', 'sc_adv']) assert.match(live, new RegExp('id="' + id + '"'));
  assert.equal(live.match(/class="scard"/g).length, 7);
  assert.match(live, /id="webCredits"/);
  assert.match(live, /id="setSteps"/);
  assert.ok(live.indexOf('id="setSteps"') < live.indexOf('id="setCtx"'));
  assert.match(livePage, /Token usage &amp; spending|Token usage & spending/);
  assert.match(page, /id="usageSpendTitle">Token usage &amp; spending</);
  assert.match(page, /id="usageRatesTitle">Rates</);
  assert.match(page, /href="agent.html"/);
  assert.match(page, /history\.back/);
  assert.match(page, /location\.protocol !== 'file:'/);
  assert.equal(page.includes('window.prompt'), false);
  assert.equal(liveSource(read('app/gui/usageview.js')).includes('fetch('), false);
  assert.equal(liveSource(read('app/gui/usageview.js')).includes('window.prompt'), false);
  assert.match(read('app/gui/usageview.js'), /AG30 Legacy:/);
  assert.match(read('app/storage/usage.js'), /AG30 Legacy:/);
  assert.equal(liveSw.includes("VER = 'agent-ag30'"), true);
  assert.equal(liveSw.includes("VER = 'agent-ag29'"), false);
  assert.equal(liveSw.includes("VER = 'agent-ag28'"), false);
  assert.match(sw, /AG30 Legacy: VER = 'agent-ag29'/);
  assert.match(sw, /AG29 Legacy: VER = 'agent-ag28'/);
  assert.match(sw, /usage\.html/);
  assert.match(liveSw, /var FILES = 'agent-files'/);
  assert.match(read('agent_readme.md'), /## AG30 — Usage page/);
  assert.match(read('agent_readme.md'), /### Legacy code notes — AG30/);
  assert.match(read('app/gui/chat.js'), /HR\.usage\.record\(HR\.models\.id\(\), req\.model/);
  assert.match(read('app/storage/usage.js'), /r\.p \+= p; r\.o \+= o; r\.n \+= 1; if \(est\) r\.e \+= 1;/);
  assert.match(read('app/storage/usage.js'), /return \(p \* \(r\.in \|\| 0\) \+ o \* \(r\.out \|\| 0\)\) \/ 1e6;/);
});

test('service worker install precaches the Usage page', async () => {
  const root = 'https://hub.example/apps/lab/agent/';
  const store = new Map();
  const listeners = {};
  const self = {
    location: { href: root + 'agent_sw.js' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };
  function fetch(url) {
    const rel = String(url).startsWith(root) ? String(url).slice(root.length).split('?')[0] : '';
    const file = path.join(base, rel);
    if (rel && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const text = rel.endsWith('.html') || rel.startsWith('prompts/') ? fs.readFileSync(file, 'utf8') : '';
      return Promise.resolve({ ok: true, status: 200, text: async () => text, clone() { return this; } });
    }
    return Promise.resolve({ ok: false, status: 404, text: async () => '', clone() { return this; } });
  }
  const caches = { open: async (name) => {
    assert.equal(name, 'agent-files');
    return { put: (url, res) => { store.set(url, res); return Promise.resolve(); } };
  } };
  const context = { self, caches, fetch, URL, Promise, console };
  vm.createContext(context);
  vm.runInContext(read('agent_sw.js'), context, { filename: 'agent_sw.js' });
  let done;
  listeners.install({ waitUntil: p => { done = p; } });
  await done;
  for (const rel of ['usage.html', 'ui/usage.css', 'app/gui/usageview.js', 'app/storage/usage.js', 'agent.html', 'image.html']) {
    assert.equal(store.has(root + rel), true, rel);
  }
  assert.equal(await store.get(root + 'usage.html').text(), read('usage.html'));
});

test('stored totals, filters, grouping, rates and safe text', async () => {
  const files = {
    ['agent/usage/' + YM + '.json']: JSON.stringify(novFile()),
    'agent/usage/2026_10.json': JSON.stringify(octFile()),
    'agent/usage/2026_09.json': '{not json'
  };
  const list = [
    { name: YM + '.json', kind: 'file' },
    { name: '2026_10.json', kind: 'file' },
    { name: '2026_09.json', kind: 'file' },
    { name: 'notes.txt', kind: 'file' },
    { name: 'extra', kind: 'directory' }
  ];
  const app = boot({ files, list, ready: true });
  const months = await app.HR.usage.listMonths();
  assert.equal(months.listed, true);
  assert.deepEqual(Array.from(months.ids), ['2026_09', '2026_10', YM]);
  await app.HR.usageView.init();
  const spend = app.ids.usageSpend, rates = app.ids.usageRates, period = app.ids.usagePeriod;
  assert.deepEqual(headings(spend), ['gemini', 'openai', 'ollama', 'browser']);
  assert.match(text(spend), /Showing: This month \(2026-11\)/);
  assert.equal(text(spend).includes('OCTOBERONLY'), false);
  assert.equal(text(spend).includes('__proto__'), false);
  const gpt = rowWith(spend, 'gpt');
  assert.match(text(gpt), /1,001/);
  assert.match(text(gpt), /501/);
  assert.match(text(gpt), /\$0\.0040 estimated/);
  assert.equal(text(gpt).includes('Rate unavailable'), false);
  const gem = rowWith(spend, 'gem');
  assert.match(text(gem), /\$3\.00 estimated/);
  assert.match(text(gem), /output rate unavailable; the existing estimate counts that side as 0/);
  const story = rowWith(spend, 'story');
  assert.match(text(story), /\$0\.0000 estimated/);
  assert.equal(text(story).includes('Rate unavailable'), false);
  const llama = rowWith(spend, 'llama');
  assert.match(text(llama), /≈40/);
  assert.match(text(llama), /Rate unavailable/);
  const bad = rowWith(spend, 'bad');
  assert.match(text(bad), /Unreadable/);
  assert.match(text(bad), /5/);
  assert.equal(text(bad).includes('$'), false);
  assert.match(text(spend), /\$3\.00 estimated/);
  assert.match(text(spend), /Rate unavailable is not counted as zero/);
  assert.match(text(spend), /not a provider bill/);
  assert.match(text(spend), /No provider billing total is stored/);
  assert.match(text(spend), /no image-cost records are stored/);
  assert.match(text(spend), /Tavily credits recorded for this period: 5/);
  assert.match(text(spend), /Search credits are not token spend/);
  assert.equal(/\bfree\b/i.test(text(spend) + text(rates)), false);
  assert.equal(/\b(billed|invoice|charged)\b/i.test(text(spend) + text(rates)), false);
  byTag(spend, 'TD').forEach(td => {
    assert.equal(text(td).includes('image-cost'), false);
    assert.equal(text(td).includes('Tavily'), false);
  });
  assert.equal(rowWith(rates, 'OCTOBERONLY') != null, true);
  assert.equal(rowWith(rates, 'saved-only') != null, true);
  const saved = rowWith(rates, 'saved-only');
  assert.match(text(saved), /Manually entered/);
  assert.match(text(saved), /9/);
  assert.match(text(saved), /8/);
  const storyRate = rowWith(rates, 'story');
  assert.match(text(storyRate), /Manually entered/);
  assert.equal(text(storyRate).includes('Rate unavailable'), false);
  const llamaRate = rowWith(rates, 'llama');
  assert.match(text(llamaRate), /Rate unavailable/);
  assert.match(text(llamaRate), /Not recorded/);
  assert.equal(byTag(llamaRate, 'INPUT').length, 0);
  const gemRate = rowWith(rates, 'gem');
  assert.match(text(gemRate), /Manually entered/);
  assert.match(text(gemRate), /Rate unavailable/);
  assert.match(text(rates), /No rate-update time is stored/);
  assert.match(text(rates), /Currency is not stored/);
  assert.match(text(rates), /Rates are not filtered by the period/);
  const xss = rowWith(spend, '<img src=x onerror=alert(1)>');
  assert.ok(xss);
  assert.equal(xss.children.some(td => td.textContent === '<img src=x onerror=alert(1)>'), true);
  walk(spend, n => { assert.equal(n._html, null); assert.notEqual(n.tagName, 'IMG'); assert.notEqual(n.tagName, 'SCRIPT'); });
  walk(rates, n => { assert.equal(n._html, null); assert.notEqual(n.tagName, 'IMG'); });
  assert.equal(app.created.includes('img'), false);
  assert.equal(app.created.includes('script'), false);

  const todayBtn = byTag(period, 'BUTTON').find(b => b.textContent === 'Today');
  assert.equal(todayBtn.attrs['aria-checked'], 'false');
  assert.equal(byTag(period, 'BUTTON').find(b => b.textContent === 'This month').attrs['aria-checked'], 'true');
  await todayBtn.listeners.click[0]();
  assert.deepEqual(headings(spend), ['openai', 'ollama', 'browser']);
  assert.match(text(spend), /Showing: Today \(2026-11-08\)/);
  assert.equal(text(spend).includes('gem'), false);
  assert.equal(rowWith(spend, 'gpt') != null, true);
  assert.match(text(spend), /Tavily credits recorded for this period: 1/);
  assert.equal(rowWith(rates, 'OCTOBERONLY') != null, true);
  assert.match(text(spend), /\$0\.0040 estimated/);

  const allBtn = byTag(period, 'BUTTON').find(b => b.textContent === 'All time');
  await allBtn.listeners.click[0]();
  assert.match(text(spend), /Showing: All time \(3 stored month files\)/);
  assert.equal(rowWith(spend, 'OCTOBERONLY') != null, true);
  assert.equal(rowWith(spend, '__proto__') != null, true);
  assert.match(text(spend), /Tavily credits recorded for this period: 7/);
  assert.equal(app.writes(), 0);
  assert.equal(app.inits() > 0, true);

  const outBox = byTag(rowWith(rates, 'saved-only'), 'INPUT').find(i => i.attrs['aria-label'] === '$ / 1M out for custom|saved-only');
  outBox.value = '';
  await outBox.listeners.change[0]();
  const after = rowWith(rates, 'saved-only');
  assert.match(text(after), /Rate unavailable/);
  assert.match(text(after), /Manually entered/);
  const savedPrices = JSON.parse(app.store['agent.settings']);
  assert.equal(savedPrices.maxSteps, 99);
  assert.equal(savedPrices.ctxMax, 8192);
  assert.equal(savedPrices.theme, 'light');
  assert.deepEqual(savedPrices.prices['custom|saved-only'], { in: 9 });
  assert.equal(savedPrices.prices['custom|saved-only'].currency, undefined);
  assert.equal(savedPrices.prices['custom|saved-only'].updated, undefined);
  assert.deepEqual(savedPrices.prices['browser|story'], { in: 0, out: 0 });
});

test('all-time is withheld when month files cannot be listed', async () => {
  const files = { ['agent/usage/' + YM + '.json']: JSON.stringify(novFile()) };
  const app = boot({ files, ready: true, listError: new Error('disk') });
  await app.HR.usageView.init();
  const allBtn = byTag(app.ids.usagePeriod, 'BUTTON').find(b => b.textContent === 'All time');
  await allBtn.listeners.click[0]();
  const spend = text(app.ids.usageSpend), rates = text(app.ids.usageRates);
  assert.match(spend, /All-time totals are not shown/);
  assert.equal(spend.includes('OCTOBERONLY'), false);
  assert.equal(spend.includes('1,000'), false);
  assert.match(rates, /Older usage files could not be listed/);
  assert.match(rates, /saved-only/);
  assert.match(rates, /Manually entered/);
  assert.equal(rates.includes('OCTOBERONLY'), false);
});

test('missing folder is an empty all-time list, and a needed permission is named', async () => {
  const empty = boot({ ready: true, listError: Object.assign(new Error('gone'), { name: 'NotFoundError' }), files: {}, prices: {} });
  const none = await empty.HR.usage.listMonths();
  assert.equal(none.listed, true);
  assert.deepEqual(Array.from(none.ids), []);
  await empty.HR.usageView.init();
  assert.match(text(empty.ids.usageSpend), /No model calls stored for this period/);
  assert.match(text(empty.ids.usageRates), /No saved rates and no models in the stored usage\. Rate unavailable\./);

  const need = boot({ state: 'need', prices: {}, files: {} });
  await need.HR.usageView.init();
  assert.match(text(need.ids.usageSpend), /does not have permission to read it/);
  assert.equal(need.writes(), 0);
});

test('record, credits, prices and cost keep the AG7 shape', async () => {
  const app = boot({ view: false, ready: false, page: false, prices: { 'openai|gpt': { in: 1 } } });
  assert.equal(app.HR.usage.day(), TODAY);
  assert.equal(app.HR.usage.ym(), YM);
  await app.HR.usage.record('openai', 'gpt', 3, 4, false);
  await app.HR.usage.record('openai', 'gpt', 1, 1, true);
  await app.HR.usage.record('openai', 'gpt', 0, 0, true);
  await app.HR.usage.record('ollama', 'llama', 8, 0, false);
  let doc = JSON.parse(app.idb['usage:' + YM]);
  assert.deepEqual(Object.keys(doc).sort(), ['days', 'v']);
  assert.equal(doc.v, 1);
  const row = doc.days[TODAY]['openai|gpt'];
  assert.deepEqual(row, { p: 4, o: 5, n: 2, e: 1 });
  assert.deepEqual(Object.keys(row).sort(), ['e', 'n', 'o', 'p']);
  assert.deepEqual(doc.days[TODAY]['ollama|llama'], { p: 8, o: 0, n: 1, e: 0 });
  await app.HR.usage.credits('tavily', 2);
  doc = JSON.parse(app.idb['usage:' + YM]);
  assert.equal(doc.credits.tavily, 2);
  assert.equal(doc.days[TODAY]._credits.tavily, 2);
  assert.deepEqual(doc.days[TODAY]['openai|gpt'], { p: 4, o: 5, n: 2, e: 1 });
  const listed = await app.HR.usage.listMonths();
  assert.equal(listed.listed, true);
  assert.deepEqual(Array.from(listed.ids), [YM]);

  assert.equal(app.HR.usage.cost('openai|gpt', 1000000, 0), 1);
  app.HR.usage.setPrice('openai|gpt', 'out', '0');
  app.HR.usage.setPrice('openai|gpt', 'in', '1.5');
  let prices = JSON.parse(app.store['agent.settings']);
  assert.equal(prices.maxSteps, 99);
  assert.equal(prices.ctxMax, 8192);
  assert.equal(prices.theme, 'light');
  assert.deepEqual(prices.prices['openai|gpt'], { in: 1.5, out: 0 });
  assert.equal(prices.prices['openai|gpt'].updated, undefined);
  assert.equal(prices.prices['openai|gpt'].currency, undefined);
  assert.equal(app.HR.usage.cost('openai|gpt', 1000000, 1000000), 1.5);
  app.HR.usage.setPrice('openai|gpt', 'out', '');
  app.HR.usage.setPrice('openai|gpt', 'in', '-3');
  prices = JSON.parse(app.store['agent.settings']);
  assert.equal(prices.prices['openai|gpt'], undefined);
  assert.equal(app.HR.usage.cost('missing|model', 10, 10), null);
  app.HR.usage.setPrice('browser|story', 'in', '0');
  app.HR.usage.setPrice('browser|story', 'out', '0');
  assert.equal(app.HR.usage.cost('browser|story', 10, 10), 0);
  prices = JSON.parse(app.store['agent.settings']);
  assert.equal(prices.maxSteps, 99);
  assert.equal(prices.ctxMax, 8192);
  assert.deepEqual(prices.prices['browser|story'], { in: 0, out: 0 });

  const blind = boot({ view: false, ready: false, page: false, idbOpts: { noKeys: true } });
  const unknown = await blind.HR.usage.listMonths();
  assert.equal(unknown.listed, false);
  assert.deepEqual(Array.from(unknown.ids), []);
});

test('Settings still shows the Tavily credit line and not the usage tables', async () => {
  const app = boot({
    page: false, chat: true, ready: false,
    idb: { ['usage:' + YM]: JSON.stringify({ v: 1, days: {}, credits: { tavily: 3 } }) }
  });
  await app.HR.usageView.init();
  assert.equal(app.ids.usageSpend, undefined);
  await app.ids.btnSet.listeners.click[0]();
  assert.equal(app.ids.webCredits.textContent, 'Tavily: 3/1000 credits this month');
  assert.equal(app.ids.webCredits.attrs['toggle:warn'], false);
  app.idb['usage:' + YM] = JSON.stringify({ v: 1, days: {}, credits: { tavily: 1000 } });
  app.ids.settings.open = true;
  await app.ids.btnSet.listeners.click[0]();
  assert.match(app.ids.webCredits.textContent, /Tavily: 1000\/1000 credits this month — free credits used up/);
  assert.equal(app.ids.webCredits.attrs['toggle:warn'], true);
});
