/* Remote RM3 — transfer queue/progress, size cap (no chunking), overwrite helpers, folder walk plans. */
'use strict';

var path = require('path');
var fs = require('fs');
var app = path.join(__dirname, '..');

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else {
    console.log('ok:', msg);
  }
}

var C = require(path.join(app, 'rm_config.js'));
var Store = require(path.join(app, 'rm_store.js'));
var Path = require(path.join(app, 'rm_sftp_path.js'));
var Client = require(path.join(app, 'rm_sftp_client.js'));
var Xfer = require(path.join(app, 'rm_sftp_xfer.js'));

assert(/^RM\d+$/.test(C.RELEASE), 'release tag is RMn');
assertEq(C.TWO_PANE_MIN, 900, 'two-pane breakpoint is 900px');
assert(C.SFTP_DEFAULT_MAX === 100 * 1024 * 1024, 'default max is 100 MB');
assert(C.DELETE_FOLDER && /everything/.test(C.DELETE_FOLDER), 'folder delete confirm is recursive');

/* -------------------------------------------------------------------------- */
/* Start folder / path helpers                                                */
/* -------------------------------------------------------------------------- */

assertEq(Path.normalizeRoot('projects/app').value, 'projects/app', 'relative start folder');
assertEq(Path.normalizeRoot('/var/www').value, '/var/www', 'absolute start folder keeps the slash');
assertEq(Path.normalizeRoot('').value, '', 'empty start folder is the home');
assert(!Path.normalizeRoot('a/../b').ok, 'start folder rejects ..');
assertEq(Path.normalizeRoot('foo\\bar').value, 'foo/bar', 'start folder slashes backslashes');

function memoryStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}
var store = Store.make(memoryStorage(), function () { return 10; });
var saved = store.save({ name: 'Pi', protocol: 'sftp', host: 'h', folder: 'projects/app', password: 'nope' });
assertEq(saved.folder, 'projects/app', 'start folder is stored on the connection');
assert(JSON.stringify(saved).indexOf('nope') < 0, 'password is still not stored');
assert(typeof store.save({ name: 'X', protocol: 'sftp', host: 'h', folder: 'a/../secret' }) === 'string', 'store rejects .. in the start folder');
var open = Client.buildOpen({ host: 'h', folder: 'projects/app', user: 'pi', pass: 'x' });
assertEq(open.root, 'projects/app', 'open message sends folder as root');

/* -------------------------------------------------------------------------- */
/* Size cap — the relay has no chunking                                       */
/* -------------------------------------------------------------------------- */

var max = 100 * 1024 * 1024;
assert(!Xfer.isTooBig(50, max), 'a small file is under the cap');
assert(Xfer.isTooBig(max + 1, max), 'a file over max is too big');
assert(!Xfer.isTooBig(max + 1, 0), 'a max of 0 means no cap');
var big = Xfer.checkSize(max + 1, max, 'movie.mp4');
assert(!big.ok && big.code === 'toobig', 'checkSize returns toobig');
assert(/movie\.mp4/.test(big.message) && /100 MB/.test(big.message), 'toobig message names the file and the limit');
var wr = Client.buildRequest(4, 'write', ['docs', 'a.txt'], { size: 12 });
assertEq(wr.op, 'write', 'write request op');
assertEq(wr.size, 12, 'write request includes the whole-file size (one frame, no chunks)');
assertEq(Client.maxLabel(max), '100 MB', 'maxLabel is in MB');

/* -------------------------------------------------------------------------- */
/* Overwrite / conflict helpers                                               */
/* -------------------------------------------------------------------------- */

var listing = [
  { name: 'readme.txt', isDir: false, size: 12 },
  { name: 'src', isDir: true, size: 0 }
];
assert(!Xfer.nameConflict(listing, 'new.txt').conflict, 'a new name is not a conflict');
assert(Xfer.nameConflict(listing, 'readme.txt').conflict, 'an existing file is a conflict');
assert(Xfer.nameConflict(listing, 'src').isDir, 'an existing folder is flagged as a dir');
assertEq(Xfer.mergeConflict({ isDir: false }, { name: 'readme.txt', isDir: false }), 'conflict', 'file vs file is overwrite');
assertEq(Xfer.mergeConflict({ isDir: true }, { name: 'src', isDir: true }), 'merge', 'folder vs folder is merge');
assertEq(Xfer.mergeConflict({ isDir: true }, { name: 'readme.txt', isDir: false }), 'type-mismatch', 'folder vs file is a mismatch');
assertEq(Xfer.mergeConflict({ isDir: false }, null), 'create', 'missing name is create');

/* -------------------------------------------------------------------------- */
/* Remote folder walk                                                         */
/* -------------------------------------------------------------------------- */

var tree = {
  '': [
    { name: 'src', isDir: true, size: 0 },
    { name: 'readme.txt', isDir: false, size: 12 },
    { name: 'huge.bin', isDir: false, size: max + 5 }
  ],
  src: [
    { name: 'a.txt', isDir: false, size: 3 },
    { name: 'nested', isDir: true, size: 0 }
  ],
  'src/nested': [
    { name: 'b.txt', isDir: false, size: 5 }
  ]
};

function listFn(p) {
  var key = (p || []).join('/');
  return Promise.resolve(tree[key] || []);
}

Promise.resolve().then(function () {
  return Xfer.planRemoteTree(listFn, [], max);
}).then(function (plan) {
  var names = plan.jobs.map(function (j) { return j.path.join('/'); });
  assert(names.indexOf('src') >= 0 && names.indexOf('src/nested') >= 0, 'plan includes nested folders');
  assert(names.indexOf('readme.txt') >= 0 && names.indexOf('src/a.txt') >= 0 && names.indexOf('src/nested/b.txt') >= 0, 'plan includes nested files');
  assertEq(plan.files, 3, 'three downloadable files');
  assertEq(plan.bytes, 12 + 3 + 5, 'bytes sum excludes the skipped file');
  assertEq(plan.skipped.length, 1, 'one file skipped as too big');
  assertEq(plan.skipped[0].name, 'huge.bin', 'skipped name is huge.bin');
  assertEq(plan.skipped[0].reason, 'toobig', 'skip reason is toobig');

  /* Local upload plan: dirs first by depth, skip oversized files. */
  var local = [
    { parts: ['bundle', 'z.txt'], name: 'z.txt', isDir: false, size: 4 },
    { parts: ['bundle'], name: 'bundle', isDir: true, size: 0 },
    { parts: ['bundle', 'big.dat'], name: 'big.dat', isDir: false, size: max + 1 },
    { parts: ['top.txt'], name: 'top.txt', isDir: false, size: 2 }
  ];
  var up = Xfer.planLocalTree(local, max);
  assertEq(up.jobs[0].name, 'bundle', 'mkdir for the folder comes before its files');
  assert(up.jobs.some(function (j) { return j.name === 'z.txt'; }), 'small file is planned');
  assert(up.jobs.some(function (j) { return j.name === 'top.txt'; }), 'top-level file is planned');
  assert(!up.jobs.some(function (j) { return j.name === 'big.dat'; }), 'oversized local file is not a job');
  assertEq(up.skipped.length, 1, 'one local file skipped');
  assertEq(up.files, 2, 'two uploadable files');
  assertEq(up.bytes, 6, 'upload bytes exclude the skipped file');

  /* -------------------------------------------------------------------------- */
  /* Queue: progress, cancel, continue after a job error                         */
  /* -------------------------------------------------------------------------- */

  var q = Xfer.makeQueue();
  assert(!q.isBusy(), 'a new queue is idle');
  var snaps = [];
  q.onProgress(function (p) { snaps.push(p.done + ':' + p.name); });
  var jobs = [
    { kind: 'file', name: 'a', size: 10 },
    { kind: 'file', name: 'b', size: 20 },
    { kind: 'file', name: 'c', size: 30 }
  ];
  var seen = [];
  return q.run(jobs, function (job) {
    seen.push(job.name);
    if (job.name === 'b') return Promise.reject(new Error('boom'));
  }).then(function (r) {
    assertEq(seen.join(','), 'a,b,c', 'a job error does not stop the rest of the queue');
    assertEq(r.done, 2, 'two jobs succeeded');
    assertEq(r.failed.length, 1, 'one job failed');
    assertEq(r.failed[0].job.name, 'b', 'failed job is b');
    assert(!r.cancelled && !r.ok, 'run is not ok when a job failed');
    assert(q.snapshot().bytes === 40, 'progress bytes count successful jobs only (a+c)');
    assert(!q.isBusy(), 'queue is idle after run');

    var q2 = Xfer.makeQueue();
    var started = 0;
    var finish;
    var blocked = new Promise(function (res) { finish = res; });
    var runP = q2.run([
      { kind: 'file', name: 'one', size: 1 },
      { kind: 'file', name: 'two', size: 1 },
      { kind: 'file', name: 'three', size: 1 }
    ], function (job) {
      started += 1;
      if (job.name === 'one') return blocked;
    });
    assert(q2.isBusy(), 'queue is busy while a job is in flight');
    /* Cancel while the first job is blocked; remaining jobs must not start. */
    q2.cancel();
    finish();
    return runP.then(function (r2) {
      assert(r2.cancelled, 'cancelled run reports cancelled');
      assertEq(started, 1, 'cancel does not start later jobs');
      assertEq(r2.done, 1, 'the in-flight job was allowed to finish');
    });
  });
}).then(function () {

  /* -------------------------------------------------------------------------- */
  /* Fake relay: read (JSON + binary) and write (JSON + binary), mkdir/rename    */
  /* -------------------------------------------------------------------------- */

  var blobs = { 'docs/a.txt': Buffer.from('hello world') };

  function fakeRelay(spec) {
    spec = spec || {};
    function WS(url) {
      this.url = url;
      this.readyState = 0;
      this.binaryType = 'arraybuffer';
      this._expectWrite = null;
      var self = this;
      setTimeout(function () {
        self.readyState = 1;
        if (self.onopen) self.onopen();
      }, 0);
    }
    function reply(self, obj, bin) {
      setTimeout(function () {
        if (self.readyState !== 1) return;
        if (self.onmessage) self.onmessage({ data: JSON.stringify(obj) });
        if (bin && self.onmessage) self.onmessage({ data: bin });
      }, 0);
    }
    WS.prototype.send = function (data) {
      var self = this;
      if (typeof data !== 'string') {
        var w = this._expectWrite;
        this._expectWrite = null;
        if (!w) return;
        var size = data.byteLength != null ? data.byteLength : data.length;
        if (spec.max && size > spec.max) {
          reply(self, { id: w.id, ok: false, code: 'toobig', error: 'file is larger than the relay limit (1 MB)' });
          return;
        }
        blobs[w.path.join('/')] = data;
        reply(self, { id: w.id, ok: true });
        return;
      }
      var m = JSON.parse(data);
      if (m.op === 'open') {
        reply(self, { id: 0, ok: true, root: '/home/pi', max: spec.max || max });
        return;
      }
      if (m.op === 'read') {
        var key = (m.path || []).join('/');
        var buf = blobs[key];
        if (!buf) { reply(self, { id: m.id, ok: false, code: 'notfound', error: 'not found' }); return; }
        var payload = buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
        reply(self, { id: m.id, ok: true, size: buf.length }, payload);
        return;
      }
      if (m.op === 'write') {
        self._expectWrite = m;
        return;
      }
      if (m.op === 'mkdir') {
        reply(self, { id: m.id, ok: true });
        return;
      }
      if (m.op === 'rename') {
        if (spec.existsName && (m.to || []).join('/') === spec.existsName) {
          reply(self, { id: m.id, ok: false, code: 'exists', error: 'already exists' });
          return;
        }
        reply(self, { id: m.id, ok: true });
        return;
      }
      if (m.op === 'delete') {
        self.lastDelete = m;
        reply(self, { id: m.id, ok: true });
        return;
      }
      reply(self, { id: m.id, ok: false, code: 'bad', error: 'unknown op' });
    };
    WS.prototype.close = function () {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    };
    return WS;
  }

  var WS = fakeRelay({ max: max });
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 't',
    host: 'h',
    port: 22,
    user: 'pi',
    pass: 'pw',
    root: 'projects',
    WebSocket: WS
  }).then(function (c) {
    assertEq(c.max, max, 'open replies with max');
    return c.read(['docs', 'a.txt']).then(function (data) {
      var text = Buffer.from(data).toString();
      assertEq(text, 'hello world', 'read returns the binary payload after the JSON');
      var payload = Buffer.from('new file');
      return c.write(['docs', 'b.txt'], payload, 'b.txt').then(function () {
        assert(blobs['docs/b.txt'], 'write stored the binary frame');
        return c.mkdir(['docs', 'src']);
      }).then(function () {
        return c.rename(['docs', 'b.txt'], ['docs', 'c.txt']);
      }).then(function () {
        return c.remove(['docs', 'src'], true);
      }).then(function () {
        /* over-max is refused on the client before send */
        var huge = new ArrayBuffer(max + 2);
        return c.write(['docs', 'huge.bin'], huge, 'huge.bin').then(function () {
          assert(false, 'over-max write should fail');
        }, function (e) {
          assert(e.sftp === 'toobig' && /huge\.bin/.test(e.message), 'client refuses a write over max');
        });
      }).then(function () {
        return c.rename(['docs', 'c.txt'], ['taken']).then(function () {
          /* use a relay that rejects exists */
        }, function () { /* not using existsName on this WS */ });
      }).then(function () {
        c.close();
      });
    });
  }).then(function () {
    var ExistsWS = fakeRelay({ existsName: 'docs/taken' });
    return Client.connect({
      relay: 'ws://127.0.0.1:8023', host: 'h', port: 22, WebSocket: ExistsWS
    }).then(function (c) {
      return c.rename(['docs', 'a.txt'], ['docs', 'taken']).then(function () {
        assert(false, 'rename over an existing name should fail');
      }, function (e) {
        assertEq(e.sftp, 'exists', 'rename reports exists when the target is taken');
        c.close();
      });
    });
  }).then(function () {
    var DelWS = fakeRelay({});
    var inst;
    /* Hook to capture the last delete: need the instance. Rebuild slightly. */
    return Client.connect({
      relay: 'ws://127.0.0.1:8023', host: 'h', port: 22,
      WebSocket: function (url) {
        inst = new DelWS(url);
        var orig = inst.send.bind(inst);
        inst.send = function (data) {
          orig(data);
        };
        return inst;
      }
    }).then(function (c) {
      return c.remove(['folder'], true).then(function () {
        assert(inst.lastDelete && inst.lastDelete.recursive === true, 'delete of a folder sends recursive:true');
        assertEq(inst.lastDelete.op, 'delete', 'delete op name is delete');
        c.close();
      });
    });
  });
}).then(function () {
  var src = ['rm_sftp_client.js', 'rm_sftp_xfer.js', 'rm_sftp_view.js', 'rm_store.js', 'remote.html']
    .map(function (f) { return fs.readFileSync(path.join(app, f), 'utf8'); })
    .join('\n');
  assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'RM3 sources do not link to ../ssh/ or ../vnc/');
  assert(src.indexOf('SftpFs') < 0, 'still no shared/fs SftpFs import');
  assert(/no chunk/.test(fs.readFileSync(path.join(app, 'rm_sftp_xfer.js'), 'utf8')), 'xfer module documents that there is no chunking');

  if (failed) {
    console.error(failed + ' test(s) failed');
    process.exit(1);
  }
  console.log('All RM3 tests passed.');
}).catch(function (e) {
  console.error('FAIL: unhandled', e && e.stack || e);
  process.exit(1);
});
