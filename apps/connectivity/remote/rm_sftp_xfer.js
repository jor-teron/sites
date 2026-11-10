/* Remote — rm_sftp_xfer.js: SFTP transfer plans, overwrite checks and a progress queue. No DOM.
 *
 * The Hub SFTP relay (hub/relay/sftp_relay.py) has no chunked transfer: each file is one JSON
 * message plus one binary frame, up to the `max` byte limit from the open reply (default 100 MB).
 * This module plans walks, rejects files over max, and runs jobs one at a time so the UI can
 * show overall progress and cancel after the current file.
 */
(function (root) {
  'use strict';

  /* Config and path helpers, loaded first in the page or required in tests. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Path = root.RMSftpPath || (typeof require === 'function' ? require('./rm_sftp_path.js') : {});
  var Client = root.RMSftpClient || (typeof require === 'function' ? require('./rm_sftp_client.js') : {});

  /* Copy a path array. */
  function parts(path) {
    return Path.parts ? Path.parts(path) : (Array.isArray(path) ? path.slice() : []);
  }

  /* Relay max as a number of bytes, or 0 meaning "not set". */
  function maxBytes(max) {
    return Number(max) || 0;
  }

  /* True when size exceeds the relay max (a max of 0 is treated as no cap). */
  function isTooBig(size, max) {
    var cap = maxBytes(max);
    return !!(cap && Number(size) > cap);
  }

  /* { ok } or { ok:false, code:'toobig', message }. */
  function checkSize(size, max, name) {
    if (!isTooBig(size, max)) return { ok: true };
    var msg = (Client.tooBigMessage ? Client.tooBigMessage(name, size, max) : ((name || 'This file') + ' is larger than the relay limit.'));
    return { ok: false, code: 'toobig', message: msg };
  }

  /**
   * Look up a name in a folder listing.
   * Returns { conflict:false } or { conflict:true, existing, isDir }.
   */
  function nameConflict(entries, name) {
    var list = Array.isArray(entries) ? entries : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === name) {
        return { conflict: true, existing: list[i], isDir: !!list[i].isDir };
      }
    }
    return { conflict: false };
  }

  /**
   * How an incoming local node should meet an existing remote entry.
   * 'create' | 'merge' (both folders) | 'conflict' (file exists) | 'type-mismatch'.
   */
  function mergeConflict(localNode, remoteEntry) {
    if (!remoteEntry) return 'create';
    var localDir = !!(localNode && localNode.isDir);
    var remoteDir = !!(remoteEntry.isDir);
    if (localDir && remoteDir) return 'merge';
    if (localDir !== remoteDir) return 'type-mismatch';
    return 'conflict';
  }

  /**
   * Recursively plan a download of a remote folder.
   * listFn(path) returns a Promise (or array) of { name, isDir, size } entries.
   * Files over max are skipped with reason 'toobig' rather than planned.
   * The root folder itself is not included; its children are.
   */
  function planRemoteTree(listFn, rootPath, max) {
    var jobs = [];
    var skipped = [];
    var bytes = 0;

    function walk(dir) {
      return Promise.resolve(listFn(dir)).then(function (entries) {
        var list = Array.isArray(entries) ? entries : [];
        var i = 0;
        function next() {
          if (i >= list.length) return Promise.resolve();
          var e = list[i++];
          var p = parts(dir).concat(e.name);
          if (e.isDir) {
            jobs.push({ kind: 'dir', path: p, name: e.name, size: 0 });
            return walk(p).then(next);
          }
          var size = Number(e.size) || 0;
          if (isTooBig(size, max)) {
            skipped.push({ kind: 'file', path: p, name: e.name, size: size, reason: 'toobig', message: checkSize(size, max, e.name).message });
            return next();
          }
          jobs.push({ kind: 'file', path: p, name: e.name, size: size });
          bytes += size;
          return next();
        }
        return next();
      });
    }

    return walk(parts(rootPath)).then(function () {
      return {
        jobs: jobs,
        skipped: skipped,
        bytes: bytes,
        files: jobs.filter(function (j) { return j.kind === 'file'; }).length,
        dirs: jobs.filter(function (j) { return j.kind === 'dir'; }).length
      };
    });
  }

  /**
   * Plan an upload from a flat local tree.
   * nodes: [{ parts:['sub','file.txt'], isDir, size, name }].
   * Directories are sorted before their children (shorter paths first) so mkdir can run first.
   * Files over max are skipped with reason 'toobig'.
   */
  function planLocalTree(nodes, max) {
    var list = Array.isArray(nodes) ? nodes.slice() : [];
    var jobs = [];
    var skipped = [];
    var bytes = 0;
    list.sort(function (a, b) {
      var ap = (a.parts || []).length;
      var bp = (b.parts || []).length;
      if (ap !== bp) return ap - bp;
      if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1;
      return 0;
    });
    list.forEach(function (n) {
      var p = parts(n.parts);
      var name = n.name || (p.length ? p[p.length - 1] : '');
      var size = Number(n.size) || 0;
      if (n.isDir) {
        jobs.push({ kind: 'dir', path: p, name: name, size: 0 });
        return;
      }
      if (isTooBig(size, max)) {
        skipped.push({ kind: 'file', path: p, name: name, size: size, reason: 'toobig', message: checkSize(size, max, name).message });
        return;
      }
      jobs.push({ kind: 'file', path: p, name: name, size: size, node: n });
      bytes += size;
    });
    return {
      jobs: jobs,
      skipped: skipped,
      bytes: bytes,
      files: jobs.filter(function (j) { return j.kind === 'file'; }).length,
      dirs: jobs.filter(function (j) { return j.kind === 'dir'; }).length
    };
  }

  /**
   * A sequential job queue with overall progress and cancel.
   * Cancel stops further jobs; the worker already in flight is allowed to finish
   * (the relay cannot abort a single-frame read or write mid-file).
   */
  function makeQueue() {
    /* True once cancel() has been called for the current run. */
    var cancelled = false;
    /* True while run() is looping. */
    var running = false;
    /* Latest snapshot, copied out to listeners. */
    var progress = emptyProgress();
    /* Listeners notified after each job and on cancel. */
    var listeners = [];

    function emptyProgress() {
      return {
        running: false,
        cancelled: false,
        done: 0,
        total: 0,
        bytes: 0,
        totalBytes: 0,
        name: '',
        action: '',
        error: ''
      };
    }

    function snapshot() {
      var s = {};
      Object.keys(progress).forEach(function (k) { s[k] = progress[k]; });
      return s;
    }

    function notify() {
      var s = snapshot();
      listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* listener threw */ } });
    }

    function onProgress(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }

    function cancel() {
      cancelled = true;
      progress.cancelled = true;
      notify();
    }

    function isBusy() {
      return running;
    }

    /**
     * Run jobs one by one through worker(job, progress).
     * jobs is the plan.jobs array (files and dirs).
     * Returns a Promise of { ok, cancelled, done, failed, skipped, error }.
     */
    function run(jobs, worker, extraSkipped) {
      var list = Array.isArray(jobs) ? jobs : [];
      cancelled = false;
      running = true;
      progress = emptyProgress();
      progress.running = true;
      progress.total = list.length;
      progress.totalBytes = list.reduce(function (n, j) { return n + (Number(j.size) || 0); }, 0);
      var failed = [];
      var doneJobs = [];
      notify();

      var i = 0;
      function next() {
        if (cancelled) {
          running = false;
          progress.running = false;
          progress.cancelled = true;
          notify();
          return Promise.resolve({ ok: false, cancelled: true, done: doneJobs.length, failed: failed, skipped: extraSkipped || [], error: C.XFER_CANCELLED || 'Cancelled.' });
        }
        if (i >= list.length) {
          running = false;
          progress.running = false;
          progress.name = '';
          notify();
          return Promise.resolve({ ok: failed.length === 0, cancelled: false, done: doneJobs.length, failed: failed, skipped: extraSkipped || [], error: '' });
        }
        var job = list[i++];
        progress.name = job.name || '';
        progress.action = job.kind || '';
        notify();
        return Promise.resolve().then(function () { return worker(job, snapshot()); }).then(function () {
          doneJobs.push(job);
          progress.done = doneJobs.length;
          progress.bytes += Number(job.size) || 0;
          notify();
          return next();
        }, function (err) {
          failed.push({ job: job, error: (err && (err.explain || err.message)) || String(err) });
          progress.error = failed[failed.length - 1].error;
          notify();
          /* A single job error does not cancel the rest of the queue. */
          return next();
        });
      }

      return next();
    }

    return {
      run: run,
      cancel: cancel,
      isBusy: isBusy,
      onProgress: onProgress,
      snapshot: snapshot
    };
  }

  /* Public API, also exported for Node tests. */
  var api = {
    maxBytes: maxBytes,
    isTooBig: isTooBig,
    checkSize: checkSize,
    nameConflict: nameConflict,
    mergeConflict: mergeConflict,
    planRemoteTree: planRemoteTree,
    planLocalTree: planLocalTree,
    makeQueue: makeQueue
  };
  root.RMSftpXfer = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
