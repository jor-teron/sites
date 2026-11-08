/* Agent — tests/ag40.test.cjs: AG40 folder layout, move_to_trash, rename_file. Real fs.js + move.js + files.js over a fake
   File System Access tree (binary Blobs), with fault injection. No browser, no network. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const err = (name, m) => Object.assign(new Error(m || name), { name });

function tree(faults) {
  let clock = 1000;
  function F(bytes) { return { kind: 'file', bytes: Uint8Array.from(bytes), mtime: ++clock }; }
  function D() { return { kind: 'directory', kids: new Map() }; }
  function dirH(node, name) {
    return { kind: 'directory', name,
      async getDirectoryHandle(n, o) { const k = node.kids.get(n); if (k) { if (k.kind !== 'directory') throw err('TypeMismatchError'); return dirH(k, n); }
        if (!(o && o.create)) throw err('NotFoundError'); const d = D(); node.kids.set(n, d); return dirH(d, n); },
      async getFileHandle(n, o) { const k = node.kids.get(n); if (k) { if (k.kind !== 'file') throw err('TypeMismatchError'); return fileH(k, n, node); }
        if (!(o && o.create)) throw err('NotFoundError'); const f = F([]); node.kids.set(n, f); return fileH(f, n, node); },
      async removeEntry(n) { if (faults.remove && faults.remove(n)) throw err('NoModificationAllowedError', 'locked'); if (!node.kids.has(n)) throw err('NotFoundError'); node.kids.delete(n); },
      async *values() { for (const [n, k] of node.kids) yield k.kind === 'file' ? fileH(k, n, node) : dirH(k, n); },
      async queryPermission() { return 'granted'; } };
  }
  function fileH(f, name) {
    return { kind: 'file', name,
      async getFile() { const b = new Blob([f.bytes]); return new File([f.bytes], name, { lastModified: f.mtime }); },
      async createWritable(o) {
        let buf = o && o.keepExistingData ? Array.from(f.bytes) : [], pos = 0;
        return { async seek(n) { pos = n; },
          async write(d) {
            if (faults.write && faults.write(name)) throw err('QuotaExceededError', 'disk full');
            const b = typeof d === 'string' ? Buffer.from(d, 'utf8') : new Uint8Array(await d.arrayBuffer());
            let out = Array.from(b); if (faults.corrupt && faults.corrupt(name)) out = out.map(x => x ^ 1);
            buf.splice(pos, out.length, ...out); pos += out.length; },
          async close() { f.bytes = Uint8Array.from(buf); f.mtime = ++clock; } };
      } };
  }
  const root = D();
  return { root, F, D, handle: dirH(root, 'Proj'), get(p) { let n = root; for (const s of p.split('/')) { n = n && n.kids && n.kids.get(s); } return n; },
    put(p, bytes) { const s = p.split('/'); let n = root; s.slice(0, -1).forEach(x => { if (!n.kids.get(x)) n.kids.set(x, D()); n = n.kids.get(x); }); n.kids.set(s[s.length - 1], F(bytes)); } };
}
async function setup(o = {}) {
  const faults = o.faults || {}, t = tree(faults), reg = {};
  const idb = { open() { const r = {}; setTimeout(() => { r.result = { transaction() { const tx = { objectStore: () => ({ put: () => ({}), get: () => ({ result: null }) }) }; setTimeout(() => tx.oncomplete && tx.oncomplete()); return tx; }, close() {} }; r.onsuccess(); }); return r; } };
  const settings = Object.assign({ allowWrite: 'on', autoWrite: 'on' }, o.settings);
  const HR = { tools: { register: d => { reg[d.name] = d; } }, set: { get: k => settings[k] } };
  const ctx = { HR, window: { showDirectoryPicker: async () => t.handle }, indexedDB: idb, setTimeout, Blob, File, Uint8Array, Date, console };
  vm.createContext(ctx);
  for (const f of ['app/storage/fs.js', 'app/storage/trash.js', 'app/storage/move.js', 'app/core/perms.js', 'app/tools/files.js']) vm.runInContext(read(f), ctx, { filename: f });
  await HR.fs.pick();
  const cards = [];
  const run = (name, args, ok = true) => reg[name].run(args, { approve: async c => { cards.push(c); return typeof ok === 'function' ? ok(c) : ok; } });
  return { HR, t, reg, run, cards, settings };
}
const BIN = [0, 255, 0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 128, 254];

test('AG40 binary move_to_trash: bytes kept, log appended, original gone; no permanent-delete tool', async () => {
  const s = await setup(); s.t.put('workspace/pic.png', BIN);
  const out = await s.run('move_to_trash', { path: 'workspace/pic.png', reason: 'old draft' });
  assert.match(out, /^Moved workspace\/pic\.png to trash → trash\/\d{4}-\d\d-\d\d\/workspace\/pic\.png$/);
  const to = out.split('→ ')[1];
  assert.deepEqual(Array.from(s.t.get(to).bytes), BIN);
  assert.equal(s.t.get('workspace/pic.png'), undefined);
  const log = Buffer.from(s.t.get('trash/trash.md').bytes).toString();
  assert.match(log, /^- \d{4}-\d\d-\d\d \d\d:\d\d:\d\d · `workspace\/pic\.png` → `trash\/.+\/workspace\/pic\.png` · old draft\n$/);
  assert.equal(s.cards[0].kind, 'trash');
  for (const n of Object.keys(s.reg)) assert.equal(/delete|remove/.test(n), false, n);
  assert.equal(/removeEntry|HR\.fs\.remove/.test(read('app/tools/files.js')), false);
});

test('AG40 trash collisions get unique names; existing trash files and log are never overwritten', async () => {
  const s = await setup(); s.t.put('a.txt', [1]);
  await s.run('move_to_trash', { path: 'a.txt', reason: 'one' });
  s.t.put('a.txt', [2]); await s.run('move_to_trash', { path: 'a.txt', reason: 'two' });
  s.t.put('a.txt', [3]); const third = await s.run('move_to_trash', { path: 'a.txt', reason: 'three' });
  const day = [...s.t.get('trash').kids.keys()].find(k => /^\d/.test(k)), names = [...s.t.get('trash/' + day).kids.keys()].sort();
  assert.equal(names.length, 3); assert.ok(names.includes('a.txt')); assert.ok(names.some(n => /^a~\d{6}\.txt$/.test(n))); assert.ok(names.some(n => /^a~\d{6}-2\.txt$/.test(n)));
  assert.deepEqual(Array.from(s.t.get('trash/' + day + '/a.txt').bytes), [1]);
  assert.match(third, /a~\d{6}-2\.txt$/);
  const log = Buffer.from(s.t.get('trash/trash.md').bytes).toString().trim().split('\n');
  assert.deepEqual(log.map(l => l.split(' · ').pop()), ['one', 'two', 'three']);
});

test('AG40 rename_file: binary, new folders, never overwrites, always asks even with auto-approve', async () => {
  const s = await setup(); s.t.put('user/photo.jpg', BIN); s.t.put('workspace/keep.md', [7]);
  const out = await s.run('rename_file', { path: 'user/photo.jpg', new_path: 'workspace/pics/photo.jpg' });
  assert.equal(out, 'Renamed user/photo.jpg → workspace/pics/photo.jpg');
  assert.deepEqual(Array.from(s.t.get('workspace/pics/photo.jpg').bytes), BIN); assert.equal(s.t.get('user/photo.jpg'), undefined);
  assert.equal(s.cards[0].kind, 'rename'); assert.equal(s.HR.perms.auto('rename'), false); assert.equal(s.HR.perms.auto('trash'), false); assert.equal(s.HR.perms.auto('write_user'), false); assert.equal(s.HR.perms.auto('write'), true);
  s.t.put('workspace/x.md', [9]);
  await assert.rejects(s.run('rename_file', { path: 'workspace/x.md', new_path: 'workspace/keep.md' }), /already exists/);
  assert.deepEqual(Array.from(s.t.get('workspace/keep.md').bytes), [7]); assert.deepEqual(Array.from(s.t.get('workspace/x.md').bytes), [9]);
  assert.equal(s.cards.length, 1);   // refused before any card
});

test('AG40 denial writes nothing; protected paths, traversal and folders refused', async () => {
  const s = await setup(); s.t.put('workspace/a.md', [1]); s.t.put('agent/memory.md', [2]); s.t.put('workspace/dir/x', [3]);
  assert.equal(await s.run('move_to_trash', { path: 'workspace/a.md', reason: 'r' }, false), 'User denied');
  assert.equal(await s.run('rename_file', { path: 'workspace/a.md', new_path: 'b.md' }, false), 'User denied');
  assert.deepEqual(Array.from(s.t.get('workspace/a.md').bytes), [1]); assert.equal(s.t.get('b.md'), undefined); assert.equal(s.t.get('trash/trash.md'), undefined);
  for (const [n, a, re] of [['move_to_trash', { path: 'agent/memory.md' }, /agent\/ .*protected/], ['move_to_trash', { path: 'trash/trash.md' }, /trash\/ is managed/],
    ['rename_file', { path: 'workspace/a.md', new_path: 'agent/x.md' }, /protected/], ['rename_file', { path: 'workspace/a.md', new_path: 'trash/x.md' }, /managed/],
    ['rename_file', { path: '../a.md', new_path: 'b.md' }, /'\.\.' is not allowed/], ['rename_file', { path: 'workspace/a.md', new_path: '/etc/x' }, /Absolute/],
    ['move_to_trash', { path: 'workspace/dir' }, /is a folder/], ['rename_file', { path: 'workspace/dir', new_path: 'z' }, /is a folder/],
    ['move_to_trash', { path: 'nope.md' }, /does not exist/]])
    await assert.rejects(s.run(n, a), re, n + ' ' + JSON.stringify(a));
  assert.deepEqual(Array.from(s.t.get('agent/memory.md').bytes), [2]);
  await assert.rejects(s.reg.write_file.run({ path: 'trash/x.md', content: 'x' }, { approve: async () => true }), /trash\/ holds removed files/);
});

test('AG40 failures keep the original: copy fail, corrupt copy, log fail, change after approval, remove fail', async () => {
  let s = await setup({ faults: { write: n => n === 'b.bin' } }); s.t.put('a.bin', BIN);
  await assert.rejects(s.run('rename_file', { path: 'a.bin', new_path: 'b.bin' }), /Could not copy.*original is unchanged/);
  assert.deepEqual(Array.from(s.t.get('a.bin').bytes), BIN); assert.equal(s.t.get('b.bin'), undefined);

  s = await setup({ faults: { corrupt: n => n === 'b.bin' } }); s.t.put('a.bin', BIN);
  await assert.rejects(s.run('rename_file', { path: 'a.bin', new_path: 'b.bin' }), /did not match/);
  assert.deepEqual(Array.from(s.t.get('a.bin').bytes), BIN); assert.equal(s.t.get('b.bin'), undefined);

  s = await setup({ faults: { write: n => n === 'trash.md' } }); s.t.put('a.bin', BIN);
  await assert.rejects(s.run('move_to_trash', { path: 'a.bin', reason: 'r' }), /Could not write trash\/trash\.md.*original is unchanged/);
  assert.deepEqual(Array.from(s.t.get('a.bin').bytes), BIN);
  const day = [...s.t.get('trash').kids.keys()].find(k => /^\d/.test(k)); assert.equal(day && s.t.get('trash/' + day + '/a.bin'), undefined);

  s = await setup(); s.t.put('a.bin', BIN);
  await assert.rejects(s.run('rename_file', { path: 'a.bin', new_path: 'b.bin' }, () => { s.t.put('a.bin', [1, 2, 3]); return true; }), /changed after you approved/);
  assert.deepEqual(Array.from(s.t.get('a.bin').bytes), [1, 2, 3]); assert.equal(s.t.get('b.bin'), undefined);

  s = await setup({ faults: { remove: n => n === 'a.bin' } }); s.t.put('a.bin', BIN);
  const out = await s.run('move_to_trash', { path: 'a.bin', reason: 'r' });
  assert.match(out, /^Not fully done: Copied to trash\/.+a\.bin but the original a\.bin could not be removed .*Both copies exist\./);
  assert.deepEqual(Array.from(s.t.get('a.bin').bytes), BIN);
  assert.match(Buffer.from(s.t.get('trash/trash.md').bytes).toString(), /\n  - not removed: /);
});

test('AG40 sibling folders are created without clobbering; files are not rearranged', async () => {
  const s = await setup(); s.t.put('workspace', [5]); s.t.put('notes.md', [6]); s.t.put('agent/trash/2026_01_01/x~010101', [7]);
  const made = await s.HR.move.ensureDirs();
  assert.deepEqual(Array.from(made), ['user', 'trash']);
  assert.equal(s.t.get('workspace').kind, 'file'); assert.deepEqual(Array.from(s.t.get('workspace').bytes), [5]);
  assert.deepEqual(Array.from(s.t.get('notes.md').bytes), [6]); assert.deepEqual(Array.from(s.t.get('agent/trash/2026_01_01/x~010101').bytes), [7]);
  assert.deepEqual(Array.from(await s.HR.move.ensureDirs()), []);
  assert.match(read('app/gui/folder.js'), /HR\.move\.ensureDirs\(\)/);
  assert.ok(read('agent.html').indexOf('app/storage/move.js') < read('agent.html').indexOf('app/tools/files.js'));
  assert.match(read('agent_sw.js'), /VER = 'agent-ag40'/); assert.match(read('agent_readme.md'), /## AG40/);
  s.settings.allowWrite = 'off'; assert.equal(s.HR.perms.allowed('move_to_trash'), false); assert.equal(s.HR.perms.allowed('rename_file'), false);
});
