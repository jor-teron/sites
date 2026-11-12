// H148: Office file thumbnails for .how / .hos / .hot in Files.
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/h148_office_thumbs.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

const ICONS = {
  how: 'apps/office/writer/writer_icon.png',
  hos: 'apps/office/spreadsheet/spreadsheet_icon.png',
  hot: 'apps/office/tables/tables_icon.svg'
};

function loadCore() {
  const els = [];
  function makeEl(tag) {
    const classList = {
      s: new Set(),
      add(c) { this.s.add(c); },
      remove(c) { this.s.delete(c); },
      contains(c) { return this.s.has(c); }
    };
    const e = {
      tagName: String(tag).toUpperCase(),
      className: '',
      textContent: '',
      src: '',
      alt: '',
      draggable: false,
      childNodes: [],
      classList,
      setAttribute() {},
      appendChild(n) { this.childNodes.push(n); return n; }
    };
    els.push(e);
    return e;
  }
  const ctx = {
    window: {},
    document: {
      baseURI: 'https://example.test/sites/apps/system/files/index.html',
      createElement: makeEl,
      getElementById() { return { hidden: true, textContent: '', classList: { toggle() {} }, querySelector() { return {}; } }; }
    },
    location: { href: 'https://example.test/sites/apps/system/files/index.html' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    URL
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps/system/files/files_core.js'), 'utf8'), ctx);
  return { FX: ctx.window.FX, els };
}

function liveBadgeList(src) {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = stripped.match(/const BADGE = \[([\s\S]*?)\];/);
  assert.ok(m, 'live const BADGE list must exist in files_view.js');
  return vm.runInNewContext('[' + m[1] + ']');
}

function badgeClass(name, BADGE) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const hit = BADGE.find((b) => b[0].test(ext));
  return 'b-' + (hit ? hit[1] : 'other');
}

test('H148: icon files exist at the Office app paths', () => {
  Object.values(ICONS).forEach((rel) => {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist');
  });
});

test('H148: icon() maps .how / .hos / .hot to the app icon, not the package emoji', () => {
  const { FX } = loadCore();
  const pack = '\uD83D\uDCE6';
  const how = FX.icon({ kind: 'file', name: 'Letter.how' });
  const hos = FX.icon({ kind: 'file', name: 'Budget.HOS' });
  const hot = FX.icon({ kind: 'file', name: 'Contacts.hot' });
  assert.equal(typeof how, 'object');
  assert.equal(how.rel, ICONS.how);
  assert.equal(how.alt, 'HOW');
  assert.match(how.src, /\/apps\/office\/writer\/writer_icon\.png$/);
  assert.equal(hos.rel, ICONS.hos);
  assert.equal(hos.alt, 'HOS');
  assert.match(hos.src, /\/apps\/office\/spreadsheet\/spreadsheet_icon\.png$/);
  assert.equal(hot.rel, ICONS.hot);
  assert.equal(hot.alt, 'HOT');
  assert.match(hot.src, /\/apps\/office\/tables\/tables_icon\.svg$/);
  // Base and Slides stay the generic package icon
  assert.equal(FX.icon({ kind: 'file', name: 'data.hob' }), pack);
  assert.equal(FX.icon({ kind: 'file', name: 'data.hbase' }), pack);
  assert.equal(FX.icon({ kind: 'file', name: 'deck.hop' }), pack);
  assert.equal(FX.icon({ kind: 'file', name: 'deck.hslides' }), pack);
  // Other types are unchanged
  assert.equal(FX.icon({ kind: 'directory', name: 'Docs' }), '\uD83D\uDCC1');
  assert.equal(FX.icon({ kind: 'file', name: 'notes.txt' }), '\uD83D\uDCC4');
  assert.equal(FX.icon({ kind: 'file', name: 'pack.zip' }), '\uD83D\uDDDC\uFE0F');
  assert.equal(FX.icon({ kind: 'file', name: 'doc.pdf' }), '\uD83D\uDCD5');
});

test('H148: iconEl() paints an <img class="fmt-ico"> for Office formats and an emoji otherwise', () => {
  const { FX } = loadCore();
  const how = FX.iconEl({ kind: 'file', name: 'a.how' });
  assert.equal(how.className, 'item-ico');
  assert.ok(how.classList.contains('has-fmt'));
  assert.equal(how.childNodes.length, 1);
  assert.equal(how.childNodes[0].tagName, 'IMG');
  assert.equal(how.childNodes[0].className, 'fmt-ico');
  assert.match(how.childNodes[0].src, /writer_icon\.png$/);
  assert.equal(how.childNodes[0].alt, 'HOW');
  assert.equal(how.childNodes[0].draggable, false);

  const hos = FX.iconEl({ kind: 'file', name: 'b.hos' });
  assert.match(hos.childNodes[0].src, /spreadsheet_icon\.png$/);
  const hot = FX.iconEl({ kind: 'file', name: 'c.hot' });
  assert.match(hot.childNodes[0].src, /tables_icon\.svg$/);

  const txt = FX.iconEl({ kind: 'file', name: 'notes.txt' });
  assert.equal(txt.className, 'item-ico');
  assert.ok(!txt.classList.contains('has-fmt'));
  assert.equal(txt.childNodes.length, 0);
  assert.equal(txt.textContent, '\uD83D\uDCC4');
});

test('H148: badges map HOW / HOS / HOT to distinct classes; Base and Slides stay other', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/system/files/files_view.js'), 'utf8');
  const BADGE = liveBadgeList(src);
  assert.equal(badgeClass('Letter.how', BADGE), 'b-how');
  assert.equal(badgeClass('Budget.HOS', BADGE), 'b-hos');
  assert.equal(badgeClass('Contacts.hot', BADGE), 'b-hot');
  assert.equal(badgeClass('data.hob', BADGE), 'b-other');
  assert.equal(badgeClass('data.hbase', BADGE), 'b-other');
  assert.equal(badgeClass('deck.hop', BADGE), 'b-other');
  // .hslides is 7 chars, so the H109 ext cap does not even capture it
  assert.equal(badgeClass('deck.hslides', BADGE), null);
  assert.equal(badgeClass('sheet.csv', BADGE), 'b-sheet');
  assert.equal(badgeClass('file.docx', BADGE), 'b-office');
  assert.match(src, /\(before H148\)/);
});

test('H148: CSS has coloured badges and format-icon sizes; SHELL lists the three icons', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps/system/files/files.css'), 'utf8');
  assert.match(css, /\.b-how\s*\{[^}]*#2563eb/);
  assert.match(css, /\.b-hos\s*\{[^}]*#16a34a/);
  assert.match(css, /\.b-hot\s*\{[^}]*#0d9488/);
  assert.match(css, /\.list\.v-grid\s+\.item-ico\s+\.fmt-ico\s*\{[^}]*width:\s*48px/);
  assert.match(css, /\.list\.v-list\s+\.item-ico\s+\.fmt-ico\s*\{[^}]*width:\s*30px/);

  const sw = fs.readFileSync(path.join(ROOT, 'hub/update/hub_sw.js'), 'utf8');
  assert.match(sw, /'apps\/office\/writer\/writer_icon\.png'/);
  assert.match(sw, /'apps\/office\/spreadsheet\/spreadsheet_icon\.png'/);
  assert.match(sw, /'apps\/office\/tables\/tables_icon\.svg'/);
  assert.doesNotMatch(sw, /'apps\/office\/base\//);
  assert.doesNotMatch(sw, /hslides_icon|slides_icon/);
});

test('H148: view uses iconEl and does not change open-with filetypes', () => {
  const view = fs.readFileSync(path.join(ROOT, 'apps/system/files/files_view.js'), 'utf8');
  assert.match(view, /const ico = iconEl\(e\);/);
  assert.match(view, /\/\/ \(before H148\) const ico = el\('span', 'item-ico', icon\(e\)\);/);
  const types = fs.readFileSync(path.join(ROOT, 'shared/fs/filetypes.js'), 'utf8');
  assert.match(types, /how:\s*\['writer'\]/);
  assert.match(types, /hos:\s*\['spreadsheet'\]/);
  assert.match(types, /hot:\s*\['tables'\]/);
});
