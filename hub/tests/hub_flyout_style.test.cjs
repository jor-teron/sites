// H154: the Start menu flyout columns (desktop/menu/hub_flyout.css .menu-fly, .menu-fly-apps) look exactly like
// the Start menu (.menu, hub/core/hub_main.css) in Dark, Light (desktop/wm/wm.css), XP light / dark
// (hub/core/hub_xp.css) and Glass (hub/core/hub_glass.css). Reads the CSS text only (no browser).
// Run: node --test hub/tests/hub_flyout_style.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
/** Top-level rules of a CSS file (comments dropped; @media blocks skipped): [{ sel: [...], decl: {prop: value} }]. */
function rules(file) {
  let css = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (head[0] !== '@') {
      const decl = {};
      body.split(';').forEach((d) => { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, ' '); });
      out.push({ sel: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), decl });
    }
    i = j;
  }
  return out;
}
const ALL = {
  main: rules('hub/core/hub_main.css'), fly: rules('desktop/menu/hub_flyout.css'), wm: rules('desktop/wm/wm.css'),
  glass: rules('hub/core/hub_glass.css'), xp: rules('hub/core/hub_xp.css')
};
/** The declarations for one selector, merged over the given files in load order (desktop.html order). */
function style(sel, files) {
  const d = {};
  (files || ['main', 'fly', 'wm', 'glass', 'xp']).forEach((f) => ALL[f].forEach((r) => { if (r.sel.includes(sel)) Object.assign(d, r.decl); }));
  return d;
}
const same = (a, b, props, msg) => props.forEach((p) => assert.equal(a[p], b[p], (msg || '') + ' ' + p + ': ' + a[p] + ' vs ' + b[p]));
/** Index of the last rule in a file that lists sel (load order inside the file). */
const at = (f, sel) => ALL[f].map((r, i) => (r.sel.includes(sel) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);

test('panel: radius and shadow = .menu', () => {
  const m = style('.menu'), f = style('.menu-fly');
  same(f, m, ['border-radius', 'box-shadow', 'padding', 'background', 'border']);
  assert.equal(f['border-radius'], '10px');
  assert.equal(f['box-shadow'], '0 12px 40px rgba(0,0,0,0.45)');
});

test('section rows = menu category rows (size, type, hover, open)', () => {
  const cat = style('.menu .menu-cat'), row = style('.menu-fly .fly-row');
  same(row, cat, ['min-height', 'font-size', 'padding', 'border-radius', 'font-weight', 'text-transform', 'letter-spacing']);
  assert.equal(row['min-height'], '46px');
  same(style('.menu-fly .fly-row:hover', ['main', 'fly']), style('.menu .menu-cat:hover', ['main', 'fly']), ['background', 'color'], 'hover');
  same(style('.menu-fly .fly-row.fly-on', ['main', 'fly']), style('.menu .menu-cat.fly-on', ['main', 'fly']), ['background', 'color'], 'open');
});

test('app rows = menu app rows (padding, radius, 22px icon, hover, no slide)', () => {
  const app = style('.menu button.app'), fa = style('.menu-fly .fly-app');
  same(fa, app, ['padding', 'border-radius', 'font-size', 'gap', 'color']);
  assert.equal(fa['min-height'], undefined);
  const h = style('.menu-fly .fly-app:hover', ['main', 'fly']);
  same(h, style('.menu button.app:hover', ['main', 'fly']), ['background', 'color'], 'hover');
  assert.equal(h.transform, undefined, 'no translateX on hover');
  assert.ok(!ALL.fly.some((r) => r.sel.some((s) => s.startsWith('.menu-fly .fly-app')) && /translate/.test(r.decl.transform || '')));
  same(style('.menu-fly .icon'), style('.menu button.app .icon'), ['width', 'height', 'border-radius', 'background', 'flex']);
  assert.equal(style('.menu-fly .icon').width, '22px');
});

test('heading = .menu-group', () => {
  const h = style('.menu-fly .fly-head'), g = style('.menu-group');
  same(h, g, ['padding', 'font-size', 'text-transform', 'letter-spacing', 'color', 'font-weight']);
});

test('Light: flyout hovers and open row = the menu', () => {
  const L = (s) => style('html.hub-light ' + s, ['wm']);
  same(L('.menu-fly .fly-app:hover'), L('.menu button.app:hover'), ['background', 'color'], 'app hover');
  same(L('.menu-fly .fly-row:hover'), L('.menu .menu-cat:hover'), ['background', 'color'], 'row hover');
  same(L('.menu-fly .fly-row.fly-on'), L('.menu .menu-cat.fly-on'), ['background', 'color'], 'open row');
  assert.ok(at('wm', 'html.hub-light .menu-fly .fly-row:hover') < at('wm', 'html.hub-light .menu-fly .fly-row.fly-on'), 'open row wins over hover, as in the menu');
});

test('XP light / dark: flyout background, edge and shadow = the XP menu; rows highlight like the menu', () => {
  const X = (s) => style(s, ['xp']);
  same(X('html.hub-xp .menu-fly'), X('html.hub-xp .menu'), ['background', 'border', 'box-shadow', '--text', '--muted']);
  assert.equal(X('html.hub-xp .menu-fly')['border-left'], undefined, 'no orange left edge');
  const D = 'html.hub-xp:not(.hub-light) ';
  same(X(D + '.menu-fly'), X(D + '.menu'), ['background', 'border-color', 'box-shadow', '--text', '--muted']);
  const sel = X('html.hub-xp .menu button.app:hover');
  ['.fly-app:hover', '.fly-row:hover', '.fly-row.fly-on'].forEach((s) => same(X('html.hub-xp .menu-fly ' + s), sel, ['background', 'color'], s));
  ['.fly-app:hover', '.fly-row.fly-on'].forEach((s) => same(X(D + '.menu-fly ' + s), X(D + '.menu button.app:hover'), ['background', 'color'], 'dark ' + s));
  assert.equal(X('html.hub-xp .menu-fly .fly-app')['border-radius'], '0');
});

test('Glass: one panel rule for both; rows and hovers = the menu', () => {
  assert.ok(ALL.glass.some((r) => r.sel.includes('html.hub-glass .menu') && r.sel.includes('html.hub-glass .menu-fly') && r.decl['border-radius']));
  const G = (s) => style('html.hub-glass ' + s, ['fly', 'glass']);
  same(G('.menu-fly .fly-app:hover'), G('.menu button.app:hover'), ['background', 'color'], 'app hover');
  same(G('.menu-fly .fly-row:hover'), G('.menu .menu-cat:hover'), ['background', 'color'], 'row hover');
  same(G('.menu-fly .fly-row.fly-on'), G('.menu .menu-cat.fly-on'), ['background', 'color'], 'open row');
});

test('kept: jelly slide-in, › arrows, hidden scrollbar + fade, apps column above', () => {
  const css = fs.readFileSync(path.join(ROOT, 'desktop/menu/hub_flyout.css'), 'utf8');
  assert.match(css, /@keyframes fly-jelly/);
  assert.match(css, /\.menu-fly \.fly-row::after \{ content: '\\203A'/);
  assert.equal(style('.menu-fly', ['fly'])['scrollbar-width'], 'none');
  assert.ok(style('.menu-fly.more', ['fly'])['mask-image']);
  assert.equal(style('.menu-fly.menu-fly-apps', ['fly'])['z-index'], '102');
});
