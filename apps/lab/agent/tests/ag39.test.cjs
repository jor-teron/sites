/* Agent — tests/ag39.test.cjs: AG39 top bar, folder-name chip, rate fields, image-generation usage. Mocked, no network. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const live = s => s.replace(/<!--[\s\S]*?-->/g, '');

function usageCtx(prices) {
  const files = new Map(), settings = { prices: prices || {} };
  const HR = { fs: { ready: () => true, read: async p => { if (!files.has(p)) throw new Error('NotFound'); return { text: files.get(p) }; }, write: async (p, t) => { files.set(p, t); } },
    set: { get: k => settings[k], put: (k, v) => { settings[k] = v; } } };
  const ctx = { HR, console }; vm.createContext(ctx); vm.runInContext(read('app/storage/usage.js'), ctx);
  return { HR, files, settings };
}

test('AG39 image usage: ok/fail/stop counted apart, tokens only when reported, nothing private stored', async () => {
  const t = usageCtx();
  await t.HR.usage.record('openai', 'gpt', 100, 20, false);
  await t.HR.usage.image('openrouter', 'img-model', 'ok', { p: 12, o: 1290 });
  await t.HR.usage.image('openrouter', 'img-model', 'ok', null);
  await t.HR.usage.image('openrouter', 'img-model', 'ok', { p: 1.5, o: 'x' });   // not integers -> unknown, not guessed
  await t.HR.usage.image('pollinations', 'flux', 'fail');
  await t.HR.usage.image('pollinations', 'flux', 'abort');
  const j = JSON.parse([...t.files.values()][0]), d = Object.keys(j.img)[0];
  assert.deepEqual(JSON.parse(JSON.stringify(j.img[d]['openrouter|img-model'])), { n: 3, f: 0, x: 0, k: 1, p: 12, o: 1290 });
  assert.deepEqual(JSON.parse(JSON.stringify(j.img[d]['pollinations|flux'])), { n: 0, f: 1, x: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(j.days[d]['openai|gpt'])), { p: 100, o: 20, n: 1, e: 0 });   // text totals untouched
  assert.equal(Object.keys(j.days[d]).some(k => /img|flux/.test(k)), false);
  assert.equal(/prompt|blob|b64|key/i.test(JSON.stringify(j.img)), false);
});

test('AG39 manual per-image estimate and local zero rates', () => {
  const t = usageCtx({ 'img:openrouter|m': { each: 0.04 } });
  assert.equal(t.HR.usage.imgCost('openrouter|m', 3).toFixed(2), '0.12');
  assert.equal(t.HR.usage.imgCost('gemini|x', 3), null);
  t.HR.usage.setPrice('ollama|llama3', 'in', '0'); assert.equal(t.settings.prices['ollama|llama3'].in, 0);
  t.HR.usage.setPrice('browser|q', 'out', '0.5'); assert.equal(t.HR.usage.cost('browser|q', 0, 2e6), 1);
  const v = read('app/gui/usageview.js');
  assert.match(v, /function costOf\(key, p, o\) \{ var c = HR\.usage\.cost\(key, p, o\); return c == null && !online\(key\) \? 0 : c; \}/);
  assert.equal(/if \(online\(key\) \|\| HR\.usage\.prices\(\)\[key\]\) td\.appendChild/.test(v), false);   // inputs for local rows too
  assert.match(v, /td\.appendChild\(priceInput\(key, kind, label\)\); return td;/);   // one field, no duplicate value/label
  assert.match(v, /Input price, US dollars per million tokens/);
});

test('AG39 image rollup separate from chat rows', () => {
  const t = usageCtx(); const HR = t.HR; HR.usage.prices = () => ({});
  const ctx = { HR, document: {}, console }; vm.createContext(ctx); vm.runInContext(read('app/gui/usageview.js'), ctx);
  const doc = { days: { '2026-11-09': { 'a|b': { p: 1, o: 1, n: 1, e: 0 } } }, img: { '2026-11-09': { 'x|y': { n: 2, f: 1, x: 0 } }, '2026-11-08': { 'x|y': { n: 1, f: 0, x: 1, k: 1, p: 5, o: 6 } } } };
  const today = HR.usageView.rollup([{ doc }], 'today', '2026-11-09'), all = HR.usageView.rollup([{ doc }], 'all', '2026-11-09');
  assert.equal(today.img['x|y'].n, 2); assert.equal(today.img['x|y'].k, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(all.img['x|y'])), { n: 3, f: 1, x: 1, k: 1, p: 5, o: 6 });
  assert.deepEqual(Object.keys(all.rows), ['a|b']);
});

test('AG39 folder chip shows the real handle name, Folder fallback', () => {
  let st = 'none', nm = '', subs = [];
  const mk = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const els = { btnFolder: mk(), folderStat: { classList: { toggle() {} } }, btnPick: {}, btnReconnect: {} };
  const HR = { fs: { state: () => st, name: () => nm, onChange: f => subs.push(f), init: () => Promise.resolve() }, migrate: { folder() {} }, notify() {} };
  const ctx = { HR, document: { getElementById: i => els[i] } }; vm.createContext(ctx); vm.runInContext(read('app/gui/folder.js'), ctx);
  HR.folder.init(); const c = els.btnFolder;
  assert.equal(c.textContent, '📁 Folder');
  st = 'ready'; nm = 'My Very Long Project Folder'; subs.forEach(f => f(st));
  assert.equal(c.textContent, '📁 My Very Long Project Folder'); assert.match(c.title, /My Very Long Project Folder/); assert.equal(c.attrs['aria-label'], c.title);
  st = 'need'; subs.forEach(f => f(st)); assert.equal(c.textContent, '📁 My Very Long Project Folder'); assert.match(c.title, /reconnect/);
  st = 'none'; nm = ''; subs.forEach(f => f(st)); assert.equal(c.textContent, '📁 Folder');
});

test('AG39 top bar order, no duplicate New chat, no Usage shortcut; image page logs once', () => {
  const h = live(read('agent.html')), top = h.slice(h.indexOf('<header class="top">'), h.indexOf('</header>'));
  const order = ['id="btnClear"', 'id="btnImage"', 'id="btnFolder"', 'id="btnSet"'].map(x => top.indexOf(x));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])));
  assert.match(top, /<span class="tb-lbl">Images<\/span>/);
  assert.equal(h.includes('id="btnNewChat"'), false); assert.equal(h.includes('id="btnUsage"'), false);
  assert.match(h, /id="sc_usage"/);
  assert.match(read('ui/main.css'), /\.top>\.hb\{min-width:44px;height:40px/);
  const ip = read('app/gui/imagepage.js');
  assert.match(ip, /if \(logged \|\| !HR\.usage \|\| !HR\.usage\.image\) return; logged = true;/);
  assert.match(ip, /log\('ok', r && r\.tokens\)/); assert.match(ip, /log\(e\.kind === 'abort' \? 'abort' : 'fail'\)/);
  const ih = live(read('image.html')); assert.ok(ih.indexOf('app/storage/usage.js') > 0 && ih.indexOf('usage.js') < ih.indexOf('imagepage.js'));
  assert.match(read('agent_sw.js'), /VER = 'agent-ag39'/); assert.match(read('agent_readme.md'), /## AG39/);
});
