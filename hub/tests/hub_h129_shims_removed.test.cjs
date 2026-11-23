'use strict';
// H177: the 28 H129 path-forwarder shims are gone. Live Desktop loads the desktop/… files only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

const SHIMS = [
  'hub/menu/hub_ctx.js',
  'hub/menu/hub_ctx_menus.js',
  'hub/menu/hub_flyout.css',
  'hub/menu/hub_flyout.js',
  'hub/menu/hub_settings.js',
  'hub/menu/hub_tiles.js',
  'hub/wm/wm.css',
  'hub/wm/wm_mode.js',
  'hub/wm/wm_snap.js',
  'hub/wm/wm_taskbar.js',
  'hub/wm/wm_windows.js',
  'hub/wm/wm_workspaces.js',
  'hub/controller/hub-controller.js',
  'hub/controller/hub_controller.css',
  'hub/controller/hub_controller_config.js',
  'hub/controller/hub_textedit.js',
  'hub/link/hub-gamebar.js',
  'hub/link/hub_chat.css',
  'hub/link/hub_chat.js',
  'hub/link/hub_panels.css',
  'hub/link/hub_panels.js',
  'hub/link/hub_pointer.js',
  'hub/link/hub_receive.js',
  'hub/link/hub_remote.js',
  'hub/viewer/hub_notify.js',
  'hub/viewer/hub_notifcenter.js',
  'hub/viewer/hub_notification.css',
  'hub/viewer/hub_notifcenter.css'
];

const LINK_SHIMS = SHIMS.filter((p) => p.startsWith('hub/link/'));

function liveShell(sw) {
  const i = sw.indexOf('const SHELL = [');
  const j = sw.indexOf('];', i);
  assert.ok(i !== -1 && j > i, 'SHELL array is present');
  const listed = Array.from(strip(sw.slice(i, j + 2)).matchAll(/'([^']+)'/g), (m) => m[1]);
  return listed;
}

test('H177: the 28 H129 forwarder shims are gone; desktop replacements and protected files remain', () => {
  assert.equal(SHIMS.length, 28);
  for (const p of SHIMS) {
    assert.equal(fs.existsSync(path.join(ROOT, p)), false, p + ' should be removed');
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'hub/menu')), false, 'hub/menu/ dir is empty and gone');
  assert.equal(fs.existsSync(path.join(ROOT, 'hub/wm')), false, 'hub/wm/ dir is empty and gone');
  for (const p of [
    'desktop/menu/hub_ctx.js', 'desktop/menu/hub_ctx_menus.js', 'desktop/menu/hub_flyout.css',
    'desktop/menu/hub_flyout.js', 'desktop/menu/hub_settings.js', 'desktop/menu/hub_tiles.js',
    'desktop/wm/wm.css', 'desktop/wm/wm_mode.js', 'desktop/wm/wm_snap.js',
    'desktop/wm/wm_taskbar.js', 'desktop/wm/wm_windows.js', 'desktop/wm/wm_workspaces.js',
    'desktop/controller/hub-controller.js', 'desktop/controller/hub_controller.css',
    'desktop/controller/hub_controller_config.js', 'desktop/controller/hub_textedit.js',
    'desktop/gamebar/hub-gamebar.js', 'desktop/panels/hub_chat.css', 'desktop/panels/hub_chat.js',
    'desktop/panels/hub_panels.css', 'desktop/panels/hub_panels.js',
    'desktop/link/hub_pointer.js', 'desktop/link/hub_receive.js', 'desktop/link/hub_remote.js',
    'desktop/notify/hub_notify.js', 'desktop/notify/hub_notifcenter.js',
    'desktop/notify/hub_notification.css', 'desktop/notify/hub_notifcenter.css',
    'hub/controller/controller.html', 'hub/viewer/hub_viewer.js', 'hub/viewer/hub_viewer_pdf.js',
    'hub/core/hub_core.js'
  ]) assert.equal(fs.existsSync(path.join(ROOT, p)), true, p + ' must remain');
});

test('H177: desktop.html, hub_loader.js, and live SHELL do not reference the old shim paths', () => {
  const html = strip(read('desktop/desktop.html'));
  const loader = strip(read('hub/core/hub_loader.js'));
  const sw = read('hub/update/hub_sw.js');
  const shell = liveShell(sw);
  const shellText = shell.join('\n');
  const sources = [
    ['desktop.html', html],
    ['hub_loader.js', loader],
    ['SHELL', shellText]
  ];
  for (const [name, text] of sources) {
    assert.equal(text.includes('hub/menu/'), false, name + ' must not reference hub/menu/');
    assert.equal(text.includes('hub/wm/'), false, name + ' must not reference hub/wm/');
    for (const p of LINK_SHIMS) {
      assert.equal(text.includes(p), false, name + ' must not reference ' + p);
    }
    for (const p of SHIMS) {
      assert.equal(text.includes(p), false, name + ' must not reference ' + p);
    }
  }
  // comments may still mention the old paths (keep-comment rule)
  assert.match(read('hub/update/hub_sw.js'), /\/\/ \(before H129b\) 'hub\/menu\/hub_ctx\.js'/);
  assert.match(read('desktop/desktop.html'), /hub\/wm\/|hub\/menu\//); // kept in (before …) comments
});
