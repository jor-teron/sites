/* Agent — tests/ag38.test.cjs: AG38 full-page Settings with categories (HR.setNav) and Usage inside Settings.
   Tiny fake DOM (no browser, no network, no secrets). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const live = s => s.replace(/<!--[\s\S]*?-->/g, '');

function el(tag, id) {
  const e = { tagName: tag, id: id || '', hidden: false, open: false, dataset: {}, children: [], attrs: {}, listeners: {}, textContent: '',
    classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; }, set innerHTML(v) { this.children = []; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    click() { if (this.onclick) this.onclick({ preventDefault() {} }); (this.listeners.click || []).forEach(f => f({ preventDefault() {} })); },
    focus() { doc.focused = this; },
    querySelector(q) { return this.querySelectorAll(q)[0] || null; },
    querySelectorAll(q) {
      if (q === 'summary') return this.summary ? [this.summary] : [];
      if (q === '.scard') return this.cards || [];
      if (q === 'button[data-card]') return this.children.filter(c => c.dataset.card);
      if (q === 'button.on') return this.children.filter(c => c.classList.contains('on'));
      if (q === 'button') return this.children.filter(c => c.tagName === 'button');
      return [];
    } };
  return e;
}
let doc;
function setup(o = {}) {
  const ids = ['sc_model', 'sc_folder', 'sc_know', 'sc_perms', 'sc_web', 'sc_helper', 'sc_display', 'sc_usage', 'sc_adv'];
  const byId = {};
  const dlg = el('dialog', 'settings'); dlg.cards = ids.map(i => { const c = el('details', i); c.summary = el('summary'); c.summary.textContent = i.slice(3); byId[i] = c; return c; });
  for (const i of ['setNav', 'setBack', 'btnSet', 'btnUsage']) byId[i] = el(i === 'setNav' ? 'nav' : 'button', i);
  byId.settings = dlg; byId.btnSet.listeners.click = [() => { dlg.open = true; }];
  doc = { getElementById: i => byId[i] || null, createElement: t => el(t), focused: null };
  const store = new Map(Object.entries(o.store || {}));
  const draws = [], replaced = [];
  const ctx = { HR: { usageView: { draw: () => draws.push(1) } }, document: doc, window: { addEventListener() {} },
    matchMedia: () => ({ matches: o.wide !== false }), location: { hash: o.hash || '', pathname: '/agent.html', search: '' },
    history: { replaceState: (a, b, u) => replaced.push(u) },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) } };
  ctx.window.matchMedia = ctx.matchMedia;
  vm.createContext(ctx); vm.runInContext(read('app/gui/setnav.js'), ctx);
  ctx.HR.setNav.init();
  return { HR: ctx.HR, byId, dlg, store, draws, replaced, nav: byId.setNav };
}

test('AG38 nav lists every Settings card plus the API & Providers link', () => {
  const t = setup();
  const btns = t.nav.children.filter(c => c.dataset.card);
  assert.deepEqual(btns.map(b => b.dataset.card), ['sc_model', 'sc_folder', 'sc_know', 'sc_perms', 'sc_web', 'sc_helper', 'sc_display', 'sc_usage', 'sc_adv']);
  const ext = t.nav.children.find(c => c.href === 'providers.html'); assert.ok(ext);
  assert.equal(t.byId.sc_model.hidden, false); assert.equal(t.byId.sc_web.hidden, true);
});

test('AG38 selecting a category shows only it, persists agent.setCard, Usage draws', () => {
  const t = setup({ store: { 'agent.setCard': 'sc_web' } });
  assert.equal(t.HR.setNav.current(), 'sc_web');
  t.nav.children.find(c => c.dataset.card === 'sc_usage').click();
  assert.equal(t.store.get('agent.setCard'), 'sc_usage');
  assert.equal(t.byId.sc_usage.hidden, false); assert.equal(t.byId.sc_usage.open, true); assert.equal(t.byId.sc_web.hidden, true);
  assert.equal(t.draws.length, 1);
  assert.equal(t.nav.children.find(c => c.dataset.card === 'sc_usage').attrs['aria-current'], 'page');
});

test('AG38 #settings/usage and the 📊 button open Settings at Usage', () => {
  const t = setup({ hash: '#settings/usage' });
  assert.equal(t.HR.setNav.fromHash(), true);
  assert.equal(t.dlg.open, true); assert.equal(t.HR.setNav.current(), 'sc_usage'); assert.deepEqual(t.replaced, ['/agent.html']);
  const u = setup(); u.byId.btnUsage.click(); assert.equal(u.dlg.open, true); assert.equal(u.HR.setNav.current(), 'sc_usage');
  assert.equal(setup({ hash: '#chat' }).HR.setNav.fromHash(), false);
});

test('AG38 narrow: list first, section with Back', () => {
  const t = setup({ wide: false });
  assert.equal(t.dlg.classList.contains('set-sec'), false);
  t.nav.children.find(c => c.dataset.card === 'sc_know').click();
  assert.equal(t.dlg.classList.contains('set-sec'), true);
  t.byId.setBack.onclick(); assert.equal(t.dlg.classList.contains('set-sec'), false);
});

test('AG38 markup, usage.html redirect, SW, readme', () => {
  const h = live(read('agent.html'));
  for (const id of ['setNav', 'setBack', 'usagePage', 'usagePeriod', 'usageSpend', 'usageRates', 'semMore', 'conMore', 'btnSemReset', 'webCredits', 'setSteps'])
    assert.match(h, new RegExp('id="' + id + '"'));
  assert.match(h, /src="app\/gui\/setnav\.js"/); assert.match(h, /href="providers\.html"/);
  assert.ok(h.indexOf('settings.js"') < h.indexOf('setnav.js"'));
  const p = read('usage.html'); assert.match(p, /agent\.html#settings\/usage/); assert.equal(live(p).includes('usageview.js'), false);
  assert.match(read('app/gui/usageview.js'), /!document\.getElementById\('settings'\)/);
  assert.match(read('agent_sw.js'), /VER = 'agent-ag38'/);
  assert.match(read('agent_readme.md'), /## AG38/);
  for (const f of ['app/gui/setnav.js', 'app/gui/settings.js']) assert.equal(/HubProviders|secret\(|top\./.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')), false);
});
