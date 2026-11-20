/* DW16: Writer File menu uses the full window height, not the 360px popup cap.
   Pure checks (no browser): menuMaxHeight, setFileMenuTop, and the CSS / open hooks.
   Run: node --test apps/office/writer/test/test-dw16-filemenu-height.cjs */
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

function read(rel) {
  return fs.readFileSync(path.join(DIR, rel), 'utf8');
}

function loadUi() {
  const src = read('modules/writer-ui.js');
  const ctx = {
    console,
    window: {},
    document: {
      body: { classList: { contains() { return false; }, toggle() {} } },
      getElementById() { return null; },
      addEventListener() {},
      querySelectorAll() { return []; }
    }
  };
  ctx.window.Writer = {
    config: { toastMs: 1, darkClass: 'dark', editorClass: 'ed', nonPrintClass: 'np', landscapeClass: 'ls', resizeDebounceMs: 300 }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'writer-ui.js' });
  return ctx.window.Writer.ui;
}

test('menuMaxHeight: window height minus top minus 8px, never under 160', () => {
  const ui = loadUi();
  assert.equal(ui.menuMaxHeight(80, 800), 712);
  assert.equal(ui.menuMaxHeight(0, 200), 192);
  assert.equal(ui.menuMaxHeight(700, 800), 160);
  assert.equal(ui.menuMaxHeight(0, 100), 160);
  assert.equal(ui.menuMaxHeight(0, 168), 160);
  assert.equal(ui.menuMaxHeight(0, 169), 161);
  assert.equal(ui.menuMaxHeight(NaN, 800), 792);
  assert.equal(ui.menuMaxHeight(80, 0), 160);
  assert.equal(ui.menuMaxHeight(80, -10), 160);
  assert.equal(ui.menuMaxHeight(undefined, 800), 792);
});

test('setFileMenuTop writes --file-menu-top from the rounded top', () => {
  const ui = loadUi();
  const props = {};
  const menu = {
    getBoundingClientRect() { return { top: 96.4, bottom: 400, left: 8, right: 200 }; },
    style: { setProperty(k, v) { props[k] = v; } }
  };
  ui.setFileMenuTop(menu);
  assert.equal(props['--file-menu-top'], '96px');
  ui.setFileMenuTop(null);
  assert.equal(props['--file-menu-top'], '96px');
});

test('syncOpenFileMenus updates only visible File and Export menus', () => {
  const src = read('modules/writer-ui.js');
  const props = { fileMenu: {}, exportMenu: {}, other: {} };
  const nodes = {
    fileMenu: {
      hidden: false,
      getBoundingClientRect() { return { top: 120 }; },
      style: { setProperty(k, v) { props.fileMenu[k] = v; } }
    },
    exportMenu: {
      hidden: true,
      getBoundingClientRect() { return { top: 200 }; },
      style: { setProperty(k, v) { props.exportMenu[k] = v; } }
    },
    other: {
      hidden: false,
      getBoundingClientRect() { return { top: 10 }; },
      style: { setProperty(k, v) { props.other[k] = v; } }
    }
  };
  const ctx = {
    console,
    window: {},
    document: {
      body: { classList: { contains() { return false; }, toggle() {} } },
      getElementById(id) { return nodes[id] || null; },
      addEventListener() {},
      querySelectorAll() { return []; }
    }
  };
  ctx.window.Writer = { config: { toastMs: 1, darkClass: 'dark', editorClass: 'ed', nonPrintClass: 'np', landscapeClass: 'ls', resizeDebounceMs: 300 } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'writer-ui.js' });
  ctx.window.Writer.ui.syncOpenFileMenus();
  assert.equal(props.fileMenu['--file-menu-top'], '120px');
  assert.equal(props.exportMenu['--file-menu-top'], undefined);
  assert.equal(props.other['--file-menu-top'], undefined);
});

test('popups.css lifts the cap on #fileMenu and #exportMenu only', () => {
  const css = read('ui/popups.css');
  const src = live(css);
  assert.ok(/\.pop-menu\s*\{[^}]*max-height:\s*min\(\s*360px/.test(src), 'other popups keep the 360px cap');
  const rule = src.slice(src.search(/#fileMenu\s*,\s*#exportMenu\s*\{/), src.length);
  assert.ok(rule.length > 0, 'missing #fileMenu, #exportMenu rule');
  const body = rule.slice(0, rule.indexOf('}') + 1);
  assert.ok(/max-height:\s*calc\(\s*100vh\s*-\s*var\(--file-menu-top,\s*80px\)\s*-\s*8px\s*\)/.test(body), body);
  assert.ok(/max-height:\s*calc\(\s*100dvh\s*-\s*var\(--file-menu-top,\s*80px\)\s*-\s*8px\s*\)/.test(body), body);
  const vhAt = body.indexOf('100vh');
  const dvhAt = body.indexOf('100dvh');
  assert.ok(vhAt !== -1 && dvhAt !== -1 && vhAt < dvhAt, '100vh fallback must come before 100dvh');
  assert.ok(/overflow:\s*auto/.test(body), body);
  assert.ok(css.indexOf('(before DW16)') !== -1);
});

test('setFile, openChooser and Hub openFile set --file-menu-top after positioning', () => {
  const ribbon = live(read('modules/writer-ribbon.js'));
  const exp = live(read('modules/writer-export.js'));
  const hub = live(read('modules/writer-hub.js'));
  const ui = live(read('modules/writer-ui.js'));
  assert.ok(ribbon.indexOf('Writer.ui.setFileMenuTop(menu)') !== -1);
  assert.ok(ribbon.indexOf("menu.style.top = Math.round(r.bottom + 8) + 'px';") < ribbon.indexOf('Writer.ui.setFileMenuTop(menu)'));
  assert.ok(exp.indexOf('Writer.ui.setFileMenuTop(menu)') !== -1);
  assert.ok(exp.indexOf('Writer.view.place(menu, anchor)') < exp.indexOf('Writer.ui.setFileMenuTop(menu)'));
  assert.ok(hub.indexOf('Writer.ui.setFileMenuTop(m)') !== -1);
  assert.ok(hub.indexOf('m.style.top = H.menuInset +') < hub.indexOf('Writer.ui.setFileMenuTop(m)'));
  assert.ok(ui.indexOf('Writer.ui.syncOpenFileMenus()') !== -1);
});

test('writer.html title is DW16; config release is DW16; old ids are kept as comments', () => {
  const html = read('writer.html');
  const cfg = read('modules/writer-config.js');
  const src = live(html);
  assert.ok(/<title>Writer DW16<\/title>/.test(src));
  assert.ok(html.indexOf('<!-- (before DW16) <title>Writer DW15</title> -->') !== -1);
  assert.ok(/release:\s*'DW16'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("(before DW16) release: 'DW15'") !== -1);
});
