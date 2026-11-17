#!/usr/bin/env node
/* BS12: Base exports LibreOffice .odb files (modules/base_odbgen.js).
   Builds a two-table database (quotes, NULL, boolean, date, non-ASCII),
   packs it, asserts the ODF package, and round-trips through base_odb.js.
   Run: node --test apps/office/base/test-bs12.cjs
   No DOM, no browser, no network. If soffice and python3-uno are on the
   machine, also opens the .odb headless and reads the tables and rows. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');
const net = require('net');

const dir = __dirname;
const MIME = 'application/vnd.oasis.opendocument.base';

function load() {
  const ctx = {
    window: {},
    console: console,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    Buffer: Buffer
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'modules/base_odb.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'modules/base_odbgen.js'), 'utf8'), ctx);
  return { Odb: ctx.BaseOdb, Gen: ctx.BaseOdbgen, ctx: ctx };
}

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function u16(b, o) { return b[o] | (b[o + 1] << 8); }

function zipEntries(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = b.length - 22, min = Math.max(0, i - 65535);
  for (; i >= min; i--) if (u32(b, i) === 0x06054b50) break;
  if (i < min) throw new Error('no zip end record');
  const n = u16(b, i + 10);
  let p = u32(b, i + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    const nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const method = u16(b, p + 10);
    const flags = u16(b, p + 8);
    const off = u32(b, p + 42);
    const localExtra = u16(b, off + 28);
    const localName = u16(b, off + 26);
    const usize = u32(b, p + 24);
    const data = b.subarray(off + 30 + localName + localExtra, off + 30 + localName + localExtra + usize);
    out.push({
      name: name,
      method: method,
      flags: flags,
      extra: localExtra,
      data: data,
      offset: off
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

function textOf(entry) {
  return new TextDecoder().decode(entry.data);
}

const SAMPLE = [
  {
    name: 'People',
    columns: [
      { name: 'ID', type: 'number', key: true },
      { name: 'Name', type: 'text' },
      { name: 'Age', type: 'number' }
    ],
    rows: [
      [1, 'Ada', 36],
      [2, null, null]
    ]
  },
  {
    name: 'My Notes',
    columns: [
      { name: 'Title', type: 'text' },
      { name: 'Body', type: 'text' },
      { name: 'Done', type: 'bool' },
      { name: 'When', type: 'date' }
    ],
    rows: [
      ["It's on", 'café', true, '2020-01-15']
    ]
  }
];

function buildSample() {
  const { Odb, Gen } = load();
  const built = Gen.build(SAMPLE);
  const bytes = Gen.pack(built.entries);
  return { Odb, Gen, built, bytes };
}

test('mimetype is the first ZIP entry, stored, flags 0, no extra field', () => {
  const { bytes } = buildSample();
  const ents = zipEntries(bytes);
  assert.ok(ents.length >= 4);
  assert.equal(ents[0].name, 'mimetype');
  assert.equal(ents[0].offset, 0);
  assert.equal(ents[0].method, 0);
  assert.equal(ents[0].flags, 0);
  assert.equal(ents[0].extra, 0);
  assert.equal(textOf(ents[0]), MIME);
  assert.equal(bytes[8], 0);
  assert.equal(bytes[9], 0);
});

test('manifest lists the package parts and the Base media type', () => {
  const { bytes, built } = buildSample();
  const ents = zipEntries(bytes);
  const man = ents.find((e) => e.name === 'META-INF/manifest.xml');
  assert.ok(man, 'manifest missing');
  const xml = textOf(man);
  assert.match(xml, /manifest:media-type="application\/vnd\.oasis\.opendocument\.base"/);
  assert.match(xml, /manifest:full-path="content\.xml"/);
  assert.match(xml, /manifest:full-path="settings\.xml"/);
  assert.match(xml, /manifest:full-path="database\/properties"/);
  assert.match(xml, /manifest:full-path="database\/script"/);
  assert.match(built.content, /xlink:href="sdbc:embedded:hsqldb"/);
  assert.match(built.content, /db:user-name="SA"/);
  assert.match(built.properties, /version=1\.8\.0/);
  assert.match(built.properties, /modified=no/);
  assert.match(built.script, /CREATE MEMORY TABLE "People"/);
  assert.match(built.script, /CREATE MEMORY TABLE "My Notes"/);
  assert.match(built.script, /PRIMARY KEY/);
  assert.match(built.script, /CREATE USER SA PASSWORD ""/);
  assert.match(built.script, /GRANT DBA TO SA/);
  assert.match(built.script, /SET WRITE_DELAY 60/);
  assert.match(built.script, /It''s on/);
  assert.match(built.script, /caf\\u00e9/);
  assert.match(built.script, /TRUE/);
  assert.match(built.script, /'2020-01-15'/);
  assert.match(built.script, /NULL/);
});

test('round-trips two tables through base_odb.js, including quotes, NULLs, a boolean, a date and a unicode escape', () => {
  const { Odb, built } = buildSample();
  const files = {
    mimetype: MIME,
    'META-INF/manifest.xml': built.manifest,
    'content.xml': built.content,
    'database/properties': built.properties,
    'database/script': built.script
  };
  const got = plain(Odb.parse(files));
  assert.equal(got.tables.length, 2);
  assert.deepEqual(got.warnings, []);

  const people = got.tables[0];
  assert.equal(people.name, 'People');
  assert.deepEqual(people.columns, [
    { name: 'ID', type: 'number' },
    { name: 'Name', type: 'text' },
    { name: 'Age', type: 'number' }
  ]);
  assert.deepEqual(people.rows, [
    [1, 'Ada', 36],
    [2, null, null]
  ]);

  const notes = got.tables[1];
  assert.equal(notes.name, 'My Notes');
  assert.deepEqual(notes.columns, [
    { name: 'Title', type: 'text' },
    { name: 'Body', type: 'text' },
    { name: 'Done', type: 'bool' },
    { name: 'When', type: 'date' }
  ]);
  assert.equal(notes.rows.length, 1);
  assert.equal(notes.rows[0][0], "It's on");
  assert.equal(notes.rows[0][1], 'café');
  assert.equal(notes.rows[0][2], true);
  assert.equal(notes.rows[0][3], '2020-01-15');
});

test('tablesFromDb maps a live Base db and skips picture columns', () => {
  const { Gen } = load();
  const db = {
    tables: [
      {
        name: 'Contacts',
        fields: [
          { id: 'id', name: 'ID', type: 'id' },
          { id: 'n', name: 'Name', type: 'text' },
          { id: 'p', name: 'Photo', type: 'picture' },
          { id: 'd', name: 'Done', type: 'bool' }
        ],
        rows: [
          { id: 'r1', v: { id: 1, n: 'Ada', p: 'pic_1', d: true } }
        ]
      }
    ]
  };
  const built = plain(Gen.tablesFromDb(db));
  assert.equal(built.skippedPics, 1);
  assert.equal(built.tables.length, 1);
  assert.deepEqual(built.tables[0].columns.map((c) => c.name), ['ID', 'Name', 'Done']);
  assert.equal(built.tables[0].columns[0].key, true);
  assert.deepEqual(built.tables[0].rows, [[1, 'Ada', true]]);
});

function sofficeBin() {
  if (fs.existsSync('/usr/bin/soffice')) return '/usr/bin/soffice';
  if (fs.existsSync('/usr/bin/libreoffice')) return '/usr/bin/libreoffice';
  return null;
}

function hasUno() {
  const r = spawnSync('python3', ['-c', 'import uno'], { encoding: 'utf8' });
  return r.status === 0;
}

function waitPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function once() {
      const sock = net.connect({ host: '127.0.0.1', port }, () => {
        sock.end();
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error('timeout waiting for soffice on ' + port));
        else setTimeout(once, 200);
      });
    }
    once();
  });
}

async function readWithLibreOffice(odbPath) {
  const bin = sofficeBin();
  if (!bin || !hasUno()) return { skipped: 'soffice or python3-uno not available' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs12-lo-'));
  const profile = path.join(tmp, 'profile');
  const pyPath = path.join(tmp, 'read_odb.py');
  fs.mkdirSync(profile);
  const port = 2000 + Math.floor(Math.random() * 20000);
  const script = [
    'import uno, json, sys',
    'local = uno.getComponentContext()',
    'resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)',
    'ctx = resolver.resolve("uno:socket,host=127.0.0.1,port=' + port + ';urp;StarOffice.ComponentContext")',
    'desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)',
    'url = uno.systemPathToFileUrl(sys.argv[1])',
    'doc = desktop.loadComponentFromURL(url, "_blank", 0, ())',
    'conn = doc.DataSource.getConnection("", "")',
    'tables = conn.getTables()',
    'out = []',
    'stmt = conn.createStatement()',
    'for name in tables.getElementNames():',
    '    rs = stmt.executeQuery(\'SELECT * FROM "\' + name.replace(\'"\', \'""\') + \'"\')',
    '    md = rs.getMetaData()',
    '    cols = [md.getColumnName(i) for i in range(1, md.getColumnCount()+1)]',
    '    rows = []',
    '    while rs.next():',
    '        row = []',
    '        for i in range(1, len(cols)+1):',
    '            v = rs.getString(i)',
    '            if rs.wasNull(): v = None',
    '            row.append(v)',
    '        rows.append(row)',
    '    rs.close()',
    '    out.append({"name": name, "columns": cols, "rows": rows})',
    'conn.close()',
    'doc.close(True)',
    'print(json.dumps(out))'
  ].join('\n');
  fs.writeFileSync(pyPath, script);
  const env = Object.assign({}, process.env, {
    JAVA_HOME: process.env.JAVA_HOME || '/usr/lib/jvm/java-21-openjdk-amd64'
  });
  const args = [
    '--headless', '--nologo', '--nofirststartwizard', '--nolockcheck', '--norestore',
    '-env:UserInstallation=file://' + profile,
    '--accept=socket,host=127.0.0.1,port=' + port + ';urp;StarOffice.ComponentContext'
  ];
  const child = spawn(bin, args, { env, stdio: 'ignore' });
  try {
    await waitPort(port, 25000);
    const r = spawnSync('python3', [pyPath, odbPath], { encoding: 'utf8', timeout: 30000, env });
    if (r.status !== 0) {
      return { error: (r.stderr || r.stdout || 'python uno failed').trim() };
    }
    return { data: JSON.parse(r.stdout) };
  } finally {
    try { child.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 2000);
  }
}

const canLo = !!(sofficeBin() && hasUno());
(canLo ? test : test.skip)('LibreOffice opens the exported .odb and can read the tables and rows', async (t) => {
  const { bytes } = buildSample();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs12-odb-'));
  const odbPath = path.join(tmp, 'sample.odb');
  fs.writeFileSync(odbPath, bytes);
  const got = await readWithLibreOffice(odbPath);
  if (got.skipped) return t.skip(got.skipped);
  if (got.error) assert.fail('LibreOffice could not read the export: ' + got.error);
  const byName = {};
  got.data.forEach((tbl) => { byName[tbl.name] = tbl; });
  assert.ok(byName.People, 'People table missing: ' + JSON.stringify(got.data));
  assert.ok(byName['My Notes'], 'My Notes table missing: ' + JSON.stringify(got.data));
  assert.deepEqual(byName.People.columns, ['ID', 'Name', 'Age']);
  assert.equal(byName.People.rows.length, 2);
  assert.equal(String(byName.People.rows[0][0]), '1');
  assert.equal(byName.People.rows[0][1], 'Ada');
  assert.equal(String(byName.People.rows[0][2]), '36');
  assert.equal(String(byName.People.rows[1][0]), '2');
  assert.equal(byName.People.rows[1][1] == null || byName.People.rows[1][1] === '', true);
  assert.equal(byName['My Notes'].rows[0][0], "It's on");
  assert.equal(byName['My Notes'].rows[0][1], 'café');
  assert.match(String(byName['My Notes'].rows[0][2]), /true/i);
  assert.match(String(byName['My Notes'].rows[0][3]), /2020-01-15/);
});
