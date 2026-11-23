'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../..');
const WRITER = path.join(ROOT, 'apps/office/writer');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function liveHtml() {
  return read('apps/office/writer/writer.html').replace(/<!--[\s\S]*?-->/g, '');
}

test('DW26 writer.html: title, deferred core scripts, lazy modules removed, split CSS, loading hint', () => {
  const html = liveHtml();
  assert.ok(html.includes('<title>Writer DW26</title>'));
  assert.ok(html.includes('<body class="writer-loading">'));
  assert.ok(html.includes('id="loadingHint"'));

  const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)];
  const extScripts = scriptTags
    .map((m) => m[1])
    .filter((attrs) => /\bsrc=/i.test(attrs));
  assert.equal(extScripts.length, 51, 'expected 51 deferred core scripts');
  extScripts.forEach((attrs) => {
    assert.ok(/\bdefer\b/i.test(attrs), 'every static script must have defer: ' + attrs);
  });

  const lazyModules = [
    'writer-export.js', 'writer-pdf.js', 'writer-pdfgen.js', 'writer-zip.js',
    'writer-odtgen.js', 'writer-docxgen.js', 'writer-docxread.js', 'writer-odtread.js',
    'writer-txt.js', 'writer-imgdrop.js', 'writer-docxopen.js', 'writer-csv.js',
    'writer-numfmt.js', 'writer-xlsx.js', 'writer-hos.js', 'writer-merge.js',
    'writer-merge-ui.js', 'writer-hfimg.js', 'writer-find.js', 'writer-writetext.js',
    'writer-write.js'
  ];
  lazyModules.forEach((mod) => {
    assert.equal(html.includes('src="modules/' + mod + '"'), false, mod + ' must be lazy, not in writer.html');
  });

  const links = [...html.matchAll(/<link\b([^>]*)>/gi)]
    .map((m) => m[1])
    .filter((a) => /rel="stylesheet"/i.test(a));
  assert.equal(links.length, 25, '16 core + 1 print + 8 non-blocking secondary CSS');

  const printLink = links.find((a) => a.includes('href="ui/print.css"'));
  assert.ok(printLink && /media="print"/i.test(printLink) && !/onload=/i.test(printLink));

  const secondary = [
    'ui/popups.css', '../shared/office-dialog.css', 'ui/marks.css', '../shared/office-notify.css',
    'ui/table.css', 'ui/image.css', 'ui/format.css', 'ui/headerfooter.css'
  ];
  secondary.forEach((href) => {
    const l = links.find((a) => a.includes('href="' + href + '"'));
    assert.ok(l, 'missing secondary stylesheet ' + href);
    assert.ok(/media="print"/i.test(l) && /onload=/i.test(l), href + ' must be non-blocking');
  });

  ['ui/merge.css', '../shared/office-settings.css', 'ui/find.css', 'ui/write.css', 'ui/margins.css'].forEach((href) => {
    assert.equal(links.some((a) => a.includes('href="' + href + '"')), false, href + ' must be lazy');
  });
});

test('DW26 writer-config.js release is DW26 and hub_office.js opens ../writer/writer.html', () => {
  const cfg = read('apps/office/writer/modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/release:\s*'DW26'/.test(cfg));
  const hub = read('apps/office/hub-office/hub_office.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(hub.includes("url: '../writer/writer.html'"));
});

test('DW26 writer-vendor.js: file://-safe lazy loaders, deduping, no fetch()', async () => {
  const src = read('apps/office/writer/modules/writer-vendor.js');
  assert.equal(/\bfetch\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'must work on file:// without fetch()');

  const appended = [];
  const doc = {
    head: {
      appendChild(el) {
        appended.push(el);
        queueMicrotask(() => { if (el.onload) el.onload(); });
      }
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase() };
    },
    querySelector() { return null; }
  };
  const ctx = vm.createContext({ window: {}, document: doc, Promise });
  ctx.window = ctx;
  vm.runInContext(src, ctx, { filename: 'writer-vendor.js' });
  const V = ctx.Writer.vendor;

  assert.equal(V.LAZY_MODULES.length, 21);
  assert.equal(V.LAZY_CSS.length, 5);

  // Dedupe concurrent loads
  await Promise.all([V.load('modules/writer-find.js'), V.load('modules/writer-find.js')]);
  assert.equal(appended.filter((e) => e.src === 'modules/writer-find.js').length, 1);
  assert.equal(appended[0].async, false);

  await Promise.all([V.loadCss('ui/find.css'), V.loadCss('ui/find.css')]);
  assert.equal(appended.filter((e) => e.href === 'ui/find.css').length, 1);
  assert.equal(appended[1].rel, 'stylesheet');

  // ensureMerge loads ui/merge.css and all 6 merge scripts in order
  appended.length = 0;
  await V.ensureMerge();
  const srcs = appended.filter((e) => e.src).map((e) => e.src);
  assert.deepEqual(srcs, [
    'modules/writer-csv.js',
    'modules/writer-numfmt.js',
    'modules/writer-xlsx.js',
    'modules/writer-hos.js',
    'modules/writer-merge.js',
    'modules/writer-merge-ui.js'
  ]);
  assert.ok(appended.some((e) => e.href === 'ui/merge.css'));

  // ensureExport('docx') loads hfimg, zip, docxgen, export
  appended.length = 0;
  await V.ensureExport('docx');
  assert.deepEqual(appended.map((e) => e.src), [
    'modules/writer-hfimg.js',
    'modules/writer-zip.js',
    'modules/writer-docxgen.js',
    'modules/writer-export.js'
  ]);
});

test('DW26 boot wait: disables enabled buttons, queues clicks, replays & focuses on finishBoot()', () => {
  const mkEl = (tag, id, opts = {}) => {
    const attrs = {};
    if (opts.disabled) attrs.disabled = true;
    const listeners = {};
    const el = {
      tagName: tag,
      id,
      disabled: !!opts.disabled,
      hidden: !!opts.hidden,
      classList: new Set(opts.classes || []),
      attrs,
      focused: false,
      clicks: 0,
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] !== undefined ? attrs[k] : null; },
      removeAttribute(k) { delete attrs[k]; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      focus() { el.focused = true; },
      click() { el.clicks++; (listeners.click || []).forEach((fn) => fn({ target: el })); },
      closest(sel) {
        if (sel.includes('button') && tag === 'BUTTON') return el;
        return null;
      }
    };
    return el;
  };

  const bodyClasses = new Set(['writer-loading']);
  const hint = mkEl('DIV', 'loadingHint');
  const saveBtn = mkEl('BUTTON', 'saveBtn');
  const undoBtn = mkEl('BUTTON', 'undoBtn', { disabled: true });
  const emptyDisabledBtn = mkEl('BUTTON', 'printBtn');
  const zoomSel = mkEl('SELECT', 'zoomSelect');
  const suffixSel = mkEl('SELECT', 'suffixSelect', { disabled: true });
  const editor = mkEl('DIV', 'editor');

  const docListeners = {};
  const allControls = [saveBtn, undoBtn, emptyDisabledBtn, zoomSel, suffixSel];
  const doc = {
    body: {
      classList: {
        contains: (c) => bodyClasses.has(c),
        remove: (c) => bodyClasses.delete(c),
        add: (c) => bodyClasses.add(c)
      }
    },
    getElementById: (id) => ({ loadingHint: hint }[id] || null),
    querySelectorAll: (sel) => {
      if (sel.includes('data-boot-wait')) return allControls.filter((e) => e.hasAttribute('data-boot-wait'));
      return allControls;
    },
    contains: () => true,
    addEventListener(ev, fn, cap) { (docListeners[ev] = docListeners[ev] || []).push({ fn, cap }); },
    removeEventListener(ev, fn) {
      docListeners[ev] = (docListeners[ev] || []).filter((x) => x.fn !== fn);
    }
  };

  // Extract inline boot script from writer.html
  const html = fs.readFileSync(path.join(WRITER, 'writer.html'), 'utf8');
  const match = html.match(/window\.__writerBootQueue[\s\S]*?<\/script>/);
  assert.ok(match, 'inline boot script present');
  const bootCode = '(function () {\n      var b = document.body;' + match[0].replace(/<\/script>$/, '');

  const ctx = vm.createContext({
    window: {},
    document: doc,
    console,
    setTimeout,
    clearTimeout,
    Promise
  });
  ctx.window = ctx;
  // Stub required Writer modules so writer-app.js only defines finishBoot without running init side effects
  ctx.Writer = {
    app: {},
    empty: { isEmpty: () => false },
    editor: {}
  };
  vm.runInContext(bootCode, ctx);

  // Enabled controls got data-boot-wait; pre-disabled controls stayed disabled
  assert.equal(saveBtn.getAttribute('data-boot-wait'), '1');
  assert.equal(saveBtn.getAttribute('aria-disabled'), 'true');
  assert.equal(undoBtn.hasAttribute('data-boot-wait'), false);
  assert.equal(undoBtn.disabled, true);
  assert.equal(zoomSel.disabled, true);
  assert.equal(suffixSel.hasAttribute('data-boot-wait'), false);

  // Simulate user clicking saveBtn and emptyDisabledBtn before ready
  let prevented = false;
  let stopped = false;
  const clickFn = docListeners.click[0].fn;
  clickFn({ target: saveBtn, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
  clickFn({ target: emptyDisabledBtn, preventDefault: () => {}, stopImmediatePropagation: () => {} });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(ctx.__writerBootQueue.length, 1 + 1);

  // Now simulate empty mode disabling printBtn right before finishBoot
  emptyDisabledBtn.disabled = true;

  // Load writer-app.js finishBoot (guard returns early in init since required modules aren't stubbed)
  vm.runInContext(read('apps/office/writer/modules/writer-app.js'), ctx, { filename: 'writer-app.js' });
  ctx.Writer.app.finishBoot(editor);

  assert.equal(bodyClasses.has('writer-loading'), false);
  assert.equal(hint.hidden, true);
  assert.equal(saveBtn.getAttribute('aria-disabled'), null);
  assert.equal(zoomSel.disabled, false);
  assert.equal(editor.focused, true);
  assert.equal(saveBtn.clicks, 1, 'queued click on enabled button replayed');
  assert.equal(emptyDisabledBtn.clicks, 0, 'button disabled by empty mode is NOT replayed');
});

test('DW26 lazy OfficeSettings builds panel & loads CSS only on open()', async () => {
  const store = {};
  const els = {};
  let built = 0;
  let cssLoaded = 0;
  function mkNode(tag) {
    const cls = new Set();
    const attrs = {};
    const listeners = {};
    const n = {
      tagName: tag.toUpperCase(),
      className: '',
      hidden: false,
      children: [],
      style: {},
      classList: { toggle: (c, f) => (f ? cls.add(c) : cls.delete(c)) },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      appendChild(c) { n.children.push(c); if (c.id) els[c.id] = c; return c; },
      focus() { n.focused = true; },
      trigger(ev) { (listeners[ev] || []).forEach((fn) => fn({ key: 'Escape' })); }
    };
    return n;
  }
  const gear = mkNode('button');
  gear.id = 'settingsBtn';
  els.settingsBtn = gear;
  const doc = {
    body: mkNode('body'),
    createElement: (t) => mkNode(t),
    getElementById: (id) => els[id] || null,
    addEventListener() {}
  };
  const ctx = vm.createContext({
    window: {},
    document: doc,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    Promise,
    OfficeTheme: { modes: [['light', 'Light']], isDark: () => false, watchHub() {} },
    Writer: {
      vendor: {
        ensureSettingsCss() { cssLoaded++; return Promise.resolve(); }
      }
    }
  });
  ctx.window = ctx;
  vm.runInContext(read('apps/office/shared/office-settings.js'), ctx);

  const S = ctx.OfficeSettings.create({
    key: 'writer_settings',
    defaults: { theme: 'light', ruler: false },
    gearBtn: gear,
    lazy: true,
    beforeOpen: () => ctx.Writer.vendor.ensureSettingsCss(),
    onBuild: () => { built++; },
    sections: [{ title: 'View', rows: [{ key: 'ruler', type: 'switch', id: 'rulerToggle', label: 'Ruler' }] }]
  });

  assert.equal(S.panel, undefined, 'panel DOM not created at boot');
  assert.equal(cssLoaded, 0);
  assert.equal(built, 0);
  assert.equal(S.s.theme, 'light');

  await S.open();
  assert.equal(cssLoaded, 1);
  assert.equal(built, 1);
  assert.ok(S.panel && S.panel.hidden === false, 'panel built and opened on first open()');
});
