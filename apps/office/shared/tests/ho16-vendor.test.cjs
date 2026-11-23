#!/usr/bin/env node
/* HO16: one shared copy of jsPDF, jsQR and qrcode under apps/office/shared/vendor/.
 * Run with: node --test apps/office/shared/tests/ho16-vendor.test.cjs
 * Node only: no browser, no network.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const OFFICE = path.join(ROOT, 'apps/office');
const SHARED_VENDOR = 'apps/office/shared/vendor';

const HASHES = {
  'jspdf.umd.min.js': '98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875',
  'jsQR.js': '36ac8bccf405066db8cc12faea47ba36f214fa1410de7d4d01c1a90e06b1c532',
  'qrcode.js': '18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780'
};

const EDITED_JS = [
  'apps/office/writer/modules/writer-vendor.js',
  'apps/office/sketchbook/sk_export.js',
  'apps/office/print/print_scan.js',
  'apps/office/paper-scan/ps_send.js',
  'apps/office/shared/tests/ho16-vendor.test.cjs',
  'apps/office/shared/tests/ho2.test.cjs'
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function sha256(rel) {
  return crypto.createHash('sha256').update(read(rel)).digest('hex');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function posix(p) {
  return String(p).split(path.sep).join('/');
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

function live(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

test('node --check on edited JavaScript', () => {
  EDITED_JS.forEach(function (rel) {
    cp.execFileSync(process.execPath, ['--check', path.join(ROOT, rel)]);
  });
});

test('shared vendor files exist with the expected hashes and licenses', () => {
  const names = [
    'jspdf.umd.min.js',
    'LICENSE-jspdf.txt',
    'jsQR.js',
    'jsQR.LICENSE',
    'qrcode.js',
    'README.txt'
  ];
  names.forEach(function (name) {
    assert.ok(exists(SHARED_VENDOR + '/' + name), 'missing ' + SHARED_VENDOR + '/' + name);
  });
  Object.keys(HASHES).forEach(function (name) {
    assert.equal(sha256(SHARED_VENDOR + '/' + name), HASHES[name], name);
  });
});

test('Office vendor folders keep at most the allowed copies', () => {
  const found = { 'jspdf.umd.min.js': [], 'jsQR.js': [], 'qrcode.js': [] };
  walk(OFFICE, []).forEach(function (file) {
    const rel = posix(path.relative(ROOT, file));
    const base = path.basename(file);
    if (!Object.prototype.hasOwnProperty.call(found, base)) return;
    if (rel.indexOf('/vendor/') === -1 && rel.indexOf('/vendor\\') === -1) return;
    if (!/\/vendor\//.test(rel)) return;
    found[base].push(rel);
  });
  found['jspdf.umd.min.js'].sort();
  found['jsQR.js'].sort();
  found['qrcode.js'].sort();
  assert.deepEqual(found['jspdf.umd.min.js'], [
    'apps/office/shared/vendor/jspdf.umd.min.js',
    'apps/office/writer/vendor/jspdf.umd.min.js'
  ]);
  assert.deepEqual(found['jsQR.js'], [
    'apps/office/shared/vendor/jsQR.js'
  ]);
  assert.deepEqual(found['qrcode.js'], [
    'apps/office/shared/vendor/qrcode.js'
  ]);
  assert.equal(sha256('apps/office/writer/vendor/jspdf.umd.min.js'), HASHES['jspdf.umd.min.js']);
});

test('live script and loader paths resolve to a real file', () => {
  const pages = {
    'apps/office/writer/writer.html': 'apps/office/writer',
    'apps/office/sketchbook/sketchbook.html': 'apps/office/sketchbook',
    'apps/office/print/print.html': 'apps/office/print',
    'apps/office/print/print-send.html': 'apps/office/print',
    'apps/office/paper-scan/paper-scan.html': 'apps/office/paper-scan',
    'apps/office/ocr/ocr.html': 'apps/office/ocr'
  };
  const libRe = /(?:jspdf\.umd\.min|jsQR|qrcode)\.js/;
  const srcRe = /(?:src|href)\s*=\s*['"]([^'"]+)['"]/g;
  const assignRe = /\.src\s*=\s*['"]([^'"]+)['"]/g;
  const loadRe = /\.load\(\s*['"]([^'"]+)['"]/g;

  function check(relFile, baseDir, text) {
    const body = live(text);
    let m;
    const paths = [];
    srcRe.lastIndex = 0;
    while ((m = srcRe.exec(body))) paths.push(m[1]);
    assignRe.lastIndex = 0;
    while ((m = assignRe.exec(body))) paths.push(m[1]);
    loadRe.lastIndex = 0;
    while ((m = loadRe.exec(body))) paths.push(m[1]);
    paths.forEach(function (src) {
      if (!libRe.test(src)) return;
      const resolved = posix(path.normalize(path.join(baseDir, src)));
      assert.ok(exists(resolved), relFile + ' -> ' + src + ' (' + resolved + ')');
    });
  }

  Object.keys(pages).forEach(function (page) {
    check(page, pages[page], read(page).toString('utf8'));
  });
  check(
    'apps/office/writer/modules/writer-vendor.js',
    'apps/office/writer',
    read('apps/office/writer/modules/writer-vendor.js').toString('utf8')
  );
  check(
    'apps/office/print/print_scan.js',
    'apps/office/print',
    read('apps/office/print/print_scan.js').toString('utf8')
  );
  check(
    'apps/office/paper-scan/ps_send.js',
    'apps/office/paper-scan',
    read('apps/office/paper-scan/ps_send.js').toString('utf8')
  );

  const vendor = read('apps/office/writer/modules/writer-vendor.js').toString('utf8');
  assert.ok(vendor.indexOf("../shared/vendor/jspdf.umd.min.js") !== -1);
  assert.ok(vendor.indexOf("vendor/html2canvas.min.js") !== -1);
  assert.ok(live(read('apps/office/sketchbook/sketchbook.html').toString('utf8')).indexOf('../shared/vendor/jspdf.umd.min.js') !== -1);
  assert.ok(live(read('apps/office/print/print.html').toString('utf8')).indexOf('../shared/vendor/qrcode.js') !== -1);
  assert.ok(live(read('apps/office/ocr/ocr.html').toString('utf8')).indexOf('../shared/vendor/qrcode.js') !== -1);
  assert.ok(read('apps/office/print/print_scan.js').toString('utf8').indexOf("../shared/vendor/jsQR.js") !== -1);
  assert.ok(read('apps/office/paper-scan/ps_send.js').toString('utf8').indexOf("../shared/vendor/jsQR.js") !== -1);
});
