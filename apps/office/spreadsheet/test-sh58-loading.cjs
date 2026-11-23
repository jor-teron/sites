#!/usr/bin/env node
/* SH58: Spreadsheet UI-first loading, deferred core, and lazy feature loader.
   Run: node --test apps/office/spreadsheet/test-sh58-loading.cjs
   No browser, no network. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const live = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

function makeEl(tag, attrs) {
  const listeners = {};
  const cls = new Set();
  const attrMap = Object.assign({}, attrs || {});
  const props = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: attrMap.id || '',
    type: attrMap.type || '',
    src: '',
    href: '',
    rel: '',
    async: true,
    disabled: !!attrMap.disabled,
    hidden: !!attrMap.hidden,
    value: '',
    dataset: {},
    children: [],
    parentNode: null,
    style: {
      setProperty(k, v) { props[k] = v; },
      getPropertyValue(k) { return props[k] || ''; }
    },
    _props: props,
    classList: {
      add(...xs) { xs.forEach((x) => cls.add(x)); },
      remove(...xs) { xs.forEach((x) => cls.delete(x)); },
      toggle(x, on) { if (on === undefined) { cls.has(x) ? cls.delete(x) : cls.add(x); } else if (on) cls.add(x); else cls.delete(x); },
      contains(x) { return cls.has(x); }
    },
    setAttribute(k, v) { attrMap[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrMap, k) ? attrMap[k] : null; },
    removeAttribute(k) { delete attrMap[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrMap, k); },
    addEventListener(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    removeEventListener(ev, fn) {
      if (!listeners[ev]) return;
      listeners[ev] = listeners[ev].filter((f) => f !== fn);
    },
    dispatchEvent(ev) {
      (listeners[ev.type] || []).slice().forEach((fn) => fn(ev));
    },
    click() {
      el.clicks = (el.clicks || 0) + 1;
      el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    focus() {},
    closest() { return null; }
  };
  return el;
}

test('Phase 1: 5 core blocking CSS, 5 non-blocking CSS, lazy CSS removed, theme head script, loading hint, static ribbon+grid', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH58</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH58) <title>Spreadsheet SH47</title> -->') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH58";') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH58') !== -1);

  const l = live(html);
  const links = l.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g) || [];
  const blocking = links.filter((t) => !/\bmedia=/.test(t));
  const nonBlocking = links.filter((t) => /media=["']print["']/.test(t) && /onload=/.test(t));
  assert.equal(blocking.length, 5, 'expected 5 blocking core stylesheets');
  assert.equal(nonBlocking.length, 5, 'expected 5 non-blocking secondary stylesheets');

  for (const coreCss of ['spreadsheet.css?v=SH58', '../shared/office-ribbon.css', '../shared/office-tools.css', '../shared/office-theme.css', 'spreadsheet_ribbon.css?v=SH58']) {
    assert.ok(blocking.some((t) => t.includes(coreCss)), 'blocking core CSS missing: ' + coreCss);
  }
  for (const lazyCss of ['../shared/office-settings.css', '../shared/office-colour.css', 'spreadsheet_page.css']) {
    assert.ok(!l.includes(lazyCss), 'lazy CSS should not be in live <head>: ' + lazyCss);
  }

  const head = l.slice(0, l.indexOf('</head>'));
  assert.ok(head.includes('spreadsheet_settings') && head.includes('sites-hub.theme') && head.includes('__sheetBootTheme'), 'head script applies theme & font');
  assert.ok(l.includes('<body class="sheet-loading">'));
  assert.ok(l.includes('id="loadingHint"'));
  assert.ok(l.includes('id="of-tab-home"') && l.includes('id="of-tab-page"'), 'static ribbon tabs present');
  assert.ok(l.includes('class="sheet-grid sheet-boot-grid"'), 'static first-paint grid present');

  const hubJs = fs.readFileSync(path.join(dir, '..', 'hub-office', 'hub_office.js'), 'utf8');
  assert.ok(hubJs.includes("url: '../spreadsheet/spreadsheet.html'"), 'hub_office.js points directly to spreadsheet.html');
});

test('Phase 2: all core scripts deferred in order, formula+functions+session.start in core, lazy modules removed', () => {
  const l = live(read('spreadsheet.html'));
  const scripts = l.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/g) || [];
  assert.ok(scripts.length >= 40);
  for (const tag of scripts) {
    assert.ok(/\bdefer\b/.test(tag), 'core script must have defer: ' + tag);
  }
  assert.ok(l.includes('spreadsheet_loader.js?v=SH58'));
  assert.ok(l.includes('spreadsheet_formula.js?v=SH46'));
  assert.ok(l.includes('spreadsheet_functions.js?v=SH58'));
  assert.ok(l.includes('spreadsheet_hos.js?v=SH58'));

  const lazyScripts = [
    'office-page.js', 'office-colour.js', 'spreadsheet_spellnumber.js', 'spreadsheet_fx.js',
    'spreadsheet_page.js', 'spreadsheet_charts.js', 'spreadsheet_sort.js', 'spreadsheet_data.js',
    'spreadsheet_xlsx.js', 'spreadsheet_lazy.js', 'spreadsheet_xlsm.js', 'spreadsheet_saveformat.js'
  ];
  for (const f of lazyScripts) {
    assert.ok(!l.includes(f), 'lazy module should not be static script tag: ' + f);
  }
  assert.ok(l.includes('__sheetBootQueue') && l.includes('data-boot-wait'), 'pre-boot click queue script present');
});

test('Phase 2 finishBoot restores controls, clears loading hint, and replays queued clicks', () => {
  const btn = makeEl('button', { id: 'btn-bold' });
  btn.setAttribute('data-boot-wait', '1');
  btn.setAttribute('aria-disabled', 'true');
  const sel = makeEl('select', { id: 'fmt-sel', disabled: true });
  sel.setAttribute('data-boot-wait', '1');
  const disabledBtn = makeEl('button', { id: 'btn-save', disabled: true });
  disabledBtn.setAttribute('data-boot-wait', '1');
  disabledBtn.setAttribute('aria-disabled', 'true');
  const hint = makeEl('div', { id: 'loadingHint' });
  const body = makeEl('body');
  body.classList.add('sheet-loading');
  let removedListener = false;
  const onClick = () => {};

  const ctx = {
    window: null,
    Promise,
    Array,
    console,
    document: {
      readyState: 'loading',
      body,
      addEventListener() {},
      removeEventListener(ev, fn) { if (ev === 'click' && fn === onClick) removedListener = true; },
      getElementById(id) { return ({ loadingHint: hint, 'btn-bold': btn, 'fmt-sel': sel, 'btn-save': disabledBtn })[id] || null; },
      querySelectorAll(s) { return s === '[data-boot-wait]' ? [btn, sel, disabledBtn] : []; },
      contains(el) { return el === btn || el === sel || el === disabledBtn; }
    }
  };
  ctx.window = ctx;
  ctx.__sheetBootOnClick = onClick;
  ctx.__sheetBootQueue = [btn];
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_logic.js'), ctx, { filename: 'spreadsheet_logic.js' });

  ctx.finishBoot();
  assert.equal(removedListener, true);
  assert.equal(body.classList.contains('sheet-loading'), false);
  assert.equal(hint.hidden, true);
  assert.equal(btn.hasAttribute('data-boot-wait'), false);
  assert.equal(btn.hasAttribute('aria-disabled'), false);
  assert.equal(sel.disabled, false);
  assert.equal(disabledBtn.hasAttribute('aria-disabled'), true, 'originally disabled button keeps aria-disabled');
  assert.equal(btn.clicks, 1, 'queued click replayed');
});

test('Phase 3 SHEET_LOADER: deduplicates script & CSS loads, async=false, file://-safe, resets pending on error', async () => {
  const appended = [];
  const head = {
    appendChild(el) {
      appended.push(el);
      if (el.src && el.src.includes('fail.js')) {
        setImmediate(() => el.onerror && el.onerror());
      } else {
        setImmediate(() => el.onload && el.onload());
      }
    }
  };
  const ctx = {
    window: null,
    Promise,
    Error,
    setImmediate,
    document: {
      head,
      createElement: (tag) => makeEl(tag),
      querySelector: () => null
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_loader.js'), ctx, { filename: 'spreadsheet_loader.js' });

  const L = ctx.SHEET_LOADER;
  const p1 = L.load('spreadsheet_charts.js?v=SH58');
  const p2 = L.load('spreadsheet_charts.js?v=SH58');
  assert.equal(p1, p2, 'concurrent loads of same script dedupe to one promise');
  await p1;
  assert.equal(appended.filter((x) => x.tagName === 'SCRIPT').length, 1);
  assert.equal(appended[0].async, false, 'dynamic scripts use async=false for ordered execution');

  const c1 = L.loadCss('spreadsheet_page.css?v=HO3');
  const c2 = L.loadCss('spreadsheet_page.css?v=HO3');
  assert.equal(c1, c2, 'CSS loads dedupe');
  await c1;
  assert.equal(appended.filter((x) => x.tagName === 'LINK').length, 1);
  assert.equal(appended[1].rel, 'stylesheet');

  await assert.rejects(() => L.load('fail.js'), /Could not load fail\.js/);
  assert.equal(L.pending['fail.js'], undefined, 'failed load clears pending for retry');
});

test('Phase 3 hash check & lazy triggers: xlsx hash, charts, data/filters/validation, fx, spellnumber, page/print, settings', async () => {
  const loaded = [];
  const ctx = {
    window: null,
    Promise,
    console,
    location: { hash: '#drive=local&path=Docs&file=Sales.xlsx' },
    document: {
      head: { appendChild(el) { loaded.push(el.src || el.href); setImmediate(() => el.onload && el.onload()); } },
      createElement: (tag) => makeEl(tag),
      querySelector: () => null,
      getElementById: () => null
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_loader.js'), ctx, { filename: 'spreadsheet_loader.js' });
  const L = ctx.SHEET_LOADER;

  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=Sales.xlsx'), true);
  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=Macro.xlsm'), true);
  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=Data.ods'), true);
  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=Legacy.xls'), true);
  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=List.csv'), true);
  assert.equal(L.needsXlsxForHash('#drive=local&path=Docs&file=Sheet.hos'), false);

  await L.ensureXlsx();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_xlsx.js')));
  assert.ok(loaded.some((s) => s.includes('spreadsheet_xlsm.js')));
  assert.ok(loaded.some((s) => s.includes('spreadsheet_lazy.js')));
  assert.ok(loaded.some((s) => s.includes('spreadsheet_saveformat.js')));

  await L.ensureCharts();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_charts.js')));

  await L.ensureData();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_sort.js')));
  assert.ok(loaded.some((s) => s.includes('spreadsheet_data.js')));

  await L.ensureFx();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_fx.js')));

  await L.ensureSpellnumber();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_spellnumber.js')));

  await L.ensurePage();
  assert.ok(loaded.some((s) => s.includes('spreadsheet_page.css')));
  assert.ok(loaded.some((s) => s.includes('office-page.js')));
  assert.ok(loaded.some((s) => s.includes('spreadsheet_page.js')));

  await L.ensureColour();
  assert.ok(loaded.some((s) => s.includes('office-colour.css')));
  assert.ok(loaded.some((s) => s.includes('office-colour.js')));

  await L.ensureSettingsCss();
  assert.ok(loaded.some((s) => s.includes('office-settings.css')));
});

test('Phase 3 SPELLNUMBER lazy hook triggers ensureSpellnumber and recalculates when loaded', async () => {
  let recalcs = 0, paints = 0, spellLoaded = false;
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, JSON,
    parseInt, parseFloat, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, Promise,
    window: {},
    document: { addEventListener() {}, getElementById: () => null },
    recalcAll() { recalcs++; },
    paintAll() { paints++; },
    updateStats() {},
    SHEET_LOADER: {
      ensureSpellnumber() {
        return new Promise((resolve) => {
          setImmediate(() => {
            ctx.SPELLNUMBER = { spell: (n) => 'WORD:' + n };
            spellLoaded = true;
            resolve();
          });
        });
      }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.SHEET_INIT = [];
  ctx.setTimeout = setTimeout;
  ctx.clearTimeout = clearTimeout;
  vm.runInContext(['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_refs.js', 'spreadsheet_state.js'].map(read).join('\n;\n'), ctx, { filename: 'spell-lazy.js' });
  ctx.emptyWorkbook();
  ctx.bindActiveSheet();

  ctx.cells[0][0].formula = '=SPELLNUMBER(42)';
  ctx.recalcAll();
  assert.equal(ctx.cells[0][0].value, '', 'returns blank placeholder while SPELLNUMBER lazy-loads');
  await new Promise((r) => setImmediate(r));
  assert.equal(spellLoaded, true);
  assert.equal(paints, 1);
  assert.equal(ctx.cells[0][0].value, 'WORD:42', 'recalcAll updates cell value once SPELLNUMBER loads');
});

test('Phase 3 Settings uses lazy OfficeSettings option while applying theme & font at startup', async () => {
  const store = { spreadsheet_settings: JSON.stringify({ theme: 'light', font: 'Calibri', fontSize: '14pt', gridlines: false }) };
  const body = makeEl('body');
  const gear = makeEl('button', { id: 'settingsBtn' });
  let cssLoaded = 0;
  const ctx = {
    console, Math, Number, String, Boolean, Array, Object, JSON, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Error, Promise,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: {
      body,
      createElement: (tag) => makeEl(tag),
      getElementById: (id) => (id === 'settingsBtn' ? gear : null),
      addEventListener() {}
    },
    location: { origin: 'http://x' },
    addEventListener() {},
    OfficeTheme: { isDark: () => false, apply() {}, watch() {} },
    OfficeNotify: { show() {} },
    SHEET_LOADER: {
      ensureSettingsCss() { cssLoaded++; return Promise.resolve(); }
    }
  };
  ctx.window = ctx;
  ctx.window.parent = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, '..', 'shared', 'office-settings.js'), 'utf8'), ctx, { filename: 'office-settings.js' });
  vm.runInContext(read('spreadsheet_settings.js'), ctx, { filename: 'spreadsheet_settings.js' });

  assert.equal(ctx.SHEET_SETTINGS.panel, undefined, 'settings panel is NOT built at startup');
  assert.equal(body._props['--sheet-font'], "'Calibri', system-ui, sans-serif", 'font applied at startup');
  assert.equal(body._props['--sheet-font-size'], '14pt', 'fontSize applied at startup');
  assert.equal(body.classList.contains('sheet-no-grid'), true, 'gridlines applied at startup');
  assert.equal(cssLoaded, 0, 'office-settings.css not loaded yet');

  await ctx.SHEET_SETTINGS.open();
  assert.equal(cssLoaded, 1, 'opening Settings loads office-settings.css');
  assert.ok(ctx.SHEET_SETTINGS.panel, 'settings panel built on open');
});

test('Phase 3 .hos applyDoc preloads charts, filters/validation, and non-default page setup', () => {
  const hosSrc = read('spreadsheet_hos.js');
  assert.ok(hosSrc.includes('hasCharts') && hosSrc.includes('L.ensureCharts'), 'applyDoc preloads charts');
  assert.ok(hosSrc.includes('hasData') && hosSrc.includes('L.ensureData'), 'applyDoc preloads filters/validations');
  assert.ok(hosSrc.includes('hasPage') && hosSrc.includes('L.ensurePage'), 'applyDoc preloads page setup');
  assert.ok(hosSrc.includes('L.needsXlsxForHash') && hosSrc.includes('SHEET_BOOT_START'), 'start preloads xlsx for hash and exposes SHEET_BOOT_START');
});

test('Phase 3 bindLazy wires charts, data/Ctrl+F, fx picker, colour picker, and printSheet', async () => {
  const els = {};
  const ids = ['btn-export-xlsx', 'btn-export-ods', 'btn-chart-col', 'btn-chart-bar', 'btn-chart-line', 'btn-chart-pie',
    'btn-sort-asc', 'btn-sort-desc', 'btn-find', 'btn-filter', 'btn-filter-clear', 'btn-sort-more', 'btn-dups', 'btn-valid',
    'data-valid-arrow', 'btn-fx', 'formula-bar', 'sheet-wrap', 'of-panel-page',
    'fill-colour-btn', 'fill-colour-arrow', 'text-colour-btn', 'text-colour-arrow'];
  for (const id of ids) els[id] = makeEl('button', { id });
  const docListeners = {};
  const loaded = [];
  let printed = 0, addedChart = null, openedFind = 0;

  const ctx = {
    window: null,
    Promise,
    console,
    setImmediate,
    location: { hash: '' },
    document: {
      head: {
        appendChild(el) {
          const src = el.src || el.href || '';
          loaded.push(src);
          if (src.includes('spreadsheet_charts.js')) ctx.addChart = (t) => { addedChart = t; };
          if (src.includes('spreadsheet_data.js')) ctx.dataOpenFind = () => { openedFind++; };
          if (src.includes('spreadsheet_sort.js')) ctx.sortSelection = () => {};
          if (src.includes('spreadsheet_page.js')) ctx.initPageSetup = () => { ctx._sheetPageInited = true; };
          setImmediate(() => el.onload && el.onload());
        }
      },
      createElement: (tag) => makeEl(tag),
      querySelector: () => null,
      getElementById: (id) => els[id] || null,
      addEventListener(ev, fn) { (docListeners[ev] || (docListeners[ev] = [])).push(fn); }
    },
    addEventListener() {},
    print() { printed++; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_loader.js'), ctx, { filename: 'spreadsheet_loader.js' });
  vm.runInContext(read('spreadsheet_files.js'), ctx, { filename: 'spreadsheet_files.js' });
  ctx.SHEET_LOADER.bindLazy();

  els['btn-chart-col'].click();
  await new Promise((r) => setImmediate(r));
  assert.equal(addedChart, 'column');

  (docListeners.keydown || []).forEach((fn) => fn({ ctrlKey: true, key: 'f', preventDefault() {} }));
  await new Promise((r) => setImmediate(r));
  assert.equal(openedFind, 1);

  await ctx.printSheet();
  assert.equal(printed, 1);
  assert.ok(loaded.some((s) => s.includes('spreadsheet_page.css')));
});
