// H161: Base and Presentation file icons in Files (.hob / .hbase / .odb, .hop / .hslides / .odp).
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/h161_office_thumbs.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

const ICONS = {
  hob: 'apps/office/base/base_icon.png',
  hop: 'apps/office/slides/slides_icon.png'
};

function loadCore() {
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
  return { FX: ctx.window.FX };
}

function liveBadgeList(src) {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = stripped.match(/const BADGE = \[([\s\S]*?)\];/);
  assert.ok(m, 'live const BADGE list must exist in files_view.js');
  return vm.runInNewContext('[' + m[1] + ']');
}

// Mirrors files_view.js badge() extension capture after H161 (H109 5-char cap + .hslides).
function badgeClass(name, BADGE) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name)
    || (/\.hslides$/i.test(name) ? ['.hslides', 'hslides'] : null);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const hit = BADGE.find((b) => b[0].test(ext));
  return 'b-' + (hit ? hit[1] : 'other');
}

test('H161: Base and Presentation icon files exist at the Office app paths', () => {
  assert.ok(fs.existsSync(path.join(ROOT, ICONS.hob)), ICONS.hob + ' must exist');
  assert.ok(fs.existsSync(path.join(ROOT, ICONS.hop)), ICONS.hop + ' must exist');
});

test('H161: icon() maps Base and Presentation extensions to the app icons, not the package emoji', () => {
  const { FX } = loadCore();
  const pack = '\uD83D\uDCE6';
  const cases = [
    ['Records.hob', ICONS.hob, 'HOB', /\/apps\/office\/base\/base_icon\.png$/],
    ['old.HBASE', ICONS.hob, 'HBASE', /\/apps\/office\/base\/base_icon\.png$/],
    ['lib.odb', ICONS.hob, 'ODB', /\/apps\/office\/base\/base_icon\.png$/],
    ['Talk.hop', ICONS.hop, 'HOP', /\/apps\/office\/slides\/slides_icon\.png$/],
    ['deck.hslides', ICONS.hop, 'HSLIDES', /\/apps\/office\/slides\/slides_icon\.png$/],
    ['pitch.ODP', ICONS.hop, 'ODP', /\/apps\/office\/slides\/slides_icon\.png$/]
  ];
  cases.forEach(([name, rel, alt, srcRe]) => {
    const v = FX.icon({ kind: 'file', name });
    assert.equal(typeof v, 'object', name);
    assert.equal(v.rel, rel, name);
    assert.equal(v.alt, alt, name);
    assert.match(v.src, srcRe, name);
  });
  // H148 mappings stay, and other types are unchanged
  assert.equal(FX.icon({ kind: 'file', name: 'Letter.how' }).rel, 'apps/office/writer/writer_icon.png');
  assert.equal(FX.icon({ kind: 'directory', name: 'Docs' }), '\uD83D\uDCC1');
  assert.equal(FX.icon({ kind: 'file', name: 'notes.txt' }), '\uD83D\uDCC4');
  assert.equal(FX.icon({ kind: 'file', name: 'pack.zip' }), pack === '\uD83D\uDCE6' ? '\uD83D\uDDDC\uFE0F' : pack);
  assert.equal(FX.icon({ kind: 'file', name: 'doc.pdf' }), '\uD83D\uDCD5');
});

test('H161: iconEl() paints an <img class="fmt-ico"> for Base and Presentation files', () => {
  const { FX } = loadCore();
  const hob = FX.iconEl({ kind: 'file', name: 'data.hob' });
  assert.equal(hob.className, 'item-ico');
  assert.ok(hob.classList.contains('has-fmt'));
  assert.equal(hob.childNodes.length, 1);
  assert.equal(hob.childNodes[0].tagName, 'IMG');
  assert.equal(hob.childNodes[0].className, 'fmt-ico');
  assert.match(hob.childNodes[0].src, /base_icon\.png$/);
  assert.equal(hob.childNodes[0].alt, 'HOB');
  assert.equal(hob.childNodes[0].draggable, false);

  assert.match(FX.iconEl({ kind: 'file', name: 'a.hbase' }).childNodes[0].src, /base_icon\.png$/);
  assert.match(FX.iconEl({ kind: 'file', name: 'a.odb' }).childNodes[0].src, /base_icon\.png$/);
  assert.match(FX.iconEl({ kind: 'file', name: 'b.hop' }).childNodes[0].src, /slides_icon\.png$/);
  assert.match(FX.iconEl({ kind: 'file', name: 'b.hslides' }).childNodes[0].src, /slides_icon\.png$/);
  assert.match(FX.iconEl({ kind: 'file', name: 'b.odp' }).childNodes[0].src, /slides_icon\.png$/);

  const txt = FX.iconEl({ kind: 'file', name: 'notes.txt' });
  assert.ok(!txt.classList.contains('has-fmt'));
  assert.equal(txt.textContent, '\uD83D\uDCC4');
});

test('H161: badges map Base / Presentation extensions; .odp leaves the generic Office group', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/system/files/files_view.js'), 'utf8');
  const BADGE = liveBadgeList(src);
  assert.equal(badgeClass('Records.hob', BADGE), 'b-hob');
  assert.equal(badgeClass('old.hbase', BADGE), 'b-hob');
  assert.equal(badgeClass('lib.odb', BADGE), 'b-hob');
  assert.equal(badgeClass('Talk.hop', BADGE), 'b-hop');
  assert.equal(badgeClass('deck.hslides', BADGE), 'b-hop');
  assert.equal(badgeClass('pitch.odp', BADGE), 'b-hop');
  assert.equal(badgeClass('file.docx', BADGE), 'b-office');
  assert.equal(badgeClass('deck.pptx', BADGE), 'b-office');
  assert.equal(badgeClass('Letter.how', BADGE), 'b-how');
  assert.match(src, /\(before H161\)/);
});

test('H161: CSS has Base / Presentation badge colours; SHELL lists the two icons', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps/system/files/files.css'), 'utf8');
  assert.match(css, /\.b-hob\s*\{[^}]*#7c4dff/);
  assert.match(css, /\.b-hop\s*\{[^}]*#ea6a14/);

  const sw = fs.readFileSync(path.join(ROOT, 'hub/update/hub_sw.js'), 'utf8');
  assert.match(sw, /'apps\/office\/base\/base_icon\.png'/);
  assert.match(sw, /'apps\/office\/slides\/slides_icon\.png'/);
});

test('H161: does not change open-with filetypes', () => {
  const types = fs.readFileSync(path.join(ROOT, 'shared/fs/filetypes.js'), 'utf8');
  assert.match(types, /how:\s*\['writer'\]/);
  assert.match(types, /hos:\s*\['spreadsheet'\]/);
  assert.match(types, /hot:\s*\['tables'\]/);
  assert.doesNotMatch(types, /hob:\s*\[/);
  assert.doesNotMatch(types, /hop:\s*\[/);
});
