/* Web MCP — wm_cmd.js: stage a folder, run the BusyBox worker, write back changes. MCP2 */
(function (root) {
  'use strict';

  /* Shared modules, from the global or via require() in Node tests. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});
  var P = root.WMPaths || (typeof require === 'function' ? require('./wm_paths.js') : {});
  var Parse = root.WMCmdParse || (typeof require === 'function' ? require('./wm_cmd_parse.js') : {});
  var Diff = root.WMCmdDiff || (typeof require === 'function' ? require('./wm_cmd_diff.js') : {});

  /* Live worker, recreated after a timeout or a hard failure. */
  var worker = null;
  /* Monotonic id so a late reply from a killed worker is ignored. */
  var nextId = 1;

  /**
   * Terminate the current worker, if any, so the next call starts clean.
   */
  function dropWorker() {
    if (!worker) return;
    try { worker.terminate(); } catch (_) { /* already gone */ }
    worker = null;
  }

  /**
   * Create (or reuse) the BusyBox worker. The worker compiles wasm on first use.
   */
  function ensureWorker() {
    if (worker) return worker;
    var src = C.CMD_WORKER || 'wm_cmd_worker.js';
    worker = new root.Worker(src);
    return worker;
  }

  /**
   * Clamp a caller timeout to the configured default and maximum, in seconds.
   */
  function resolveTimeout(raw) {
    var value = C.CMD_DEFAULT_TIMEOUT_SEC;
    if (raw != null && raw !== '') {
      var n = Number(raw);
      if (!isFinite(n)) throw new Error('timeout must be a number');
      if (n <= 0) throw new Error('timeout must be positive');
      value = n;
    }
    return Math.min(value, C.CMD_MAX_TIMEOUT_SEC);
  }

  /**
   * Rewrite redirect targets in a parsed plan so they stay inside the staged root.
   */
  function containRedirects(steps) {
    var s;
    var c;
    for (s = 0; s < steps.length; s++) {
      for (c = 0; c < steps[s].commands.length; c++) {
        var redir = steps[s].commands[c].redir;
        if (!redir) continue;
        var resolved = P.requirePath(redir.file);
        if (resolved.isRoot) throw new Error('redirect cannot overwrite the picked folder');
        redir.file = resolved.path;
      }
    }
  }

  /**
   * Post a run message to the worker and wait for done/fail, or reject on timeout.
   */
  function callWorker(payload, timeoutSec) {
    return new Promise(function (ok, no) {
      var w = ensureWorker();
      var id = nextId++;
      /* Wall-clock timer: on fire, kill the worker so a runaway applet cannot linger. */
      var timer = root.setTimeout(function () {
        dropWorker();
        no(Object.assign(new Error('timed out after ' + timeoutSec + 's'), { timedOut: true }));
      }, timeoutSec * 1000);
      /**
       * Handle one worker message; ignore replies that belong to an older call.
       */
      function onMessage(ev) {
        var msg = ev.data || {};
        if (msg.id !== id) return;
        cleanup();
        if (msg.type === 'done') ok(msg);
        else no(new Error(msg.msg || 'BusyBox worker failed'));
      }
      /**
       * A worker crash is treated as a failed command, and the worker is dropped.
       */
      function onError(ev) {
        cleanup();
        dropWorker();
        no(new Error((ev && ev.message) || 'BusyBox worker stopped'));
      }
      /**
       * Detach listeners and cancel the timeout once we have a result.
       */
      function cleanup() {
        root.clearTimeout(timer);
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
      }
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      /* Transfer staged file bytes to the worker without copying them again. */
      var xfer = [];
      (payload.files || []).forEach(function (f) {
        if (f.data && f.data.buffer) xfer.push(f.data.buffer);
      });
      payload.id = id;
      payload.type = 'run';
      try {
        w.postMessage(payload, xfer);
      } catch (err) {
        cleanup();
        no(err);
      }
    });
  }

  /**
   * Build the public run_command result object (JSON-serializable).
   */
  function shapeResult(opts) {
    return {
      exit_code: opts.exit_code,
      stdout: opts.stdout,
      stderr: opts.stderr,
      timed_out: !!opts.timed_out,
      truncated: !!opts.truncated,
      duration_sec: opts.duration_sec,
      wrote: opts.wrote,
      skipped: opts.skipped || [],
      staged: opts.staged || { files: 0, bytes: 0, dirs: 0 }
    };
  }

  /**
   * Stage the picked folder (or cwd subtree), run the plan, and write back
   * only after a successful (exit 0, not timed out) run.
   */
  async function run(fs, args) {
    /* args.command is required, same as Linux MCP v2. */
    var command = args && args.command;
    if (!command || typeof command !== 'string') {
      throw new Error('command is required');
    }
    var parsed = Parse.parse(command);
    if (!parsed.ok) throw new Error(parsed.error);
    containRedirects(parsed.steps);

    var timeoutSec = resolveTimeout(args && args.timeout);
    /* cwd is optional; empty / omitted means the picked folder root (or the walk root). */
    var cwdRel = P.requirePath(args && args.cwd != null ? args.cwd : '.');

    /* Started-at timestamp so duration_sec can be reported even on timeout. */
    var started = Date.now();
    var staged = await fs.walkStage(cwdRel, {
      maxFiles: C.CMD_MAX_STAGE_FILES,
      maxBytes: C.CMD_MAX_STAGE_BYTES,
      maxFileBytes: C.CMD_MAX_STAGE_FILE_BYTES
    });

    /* Before-tree used to decide which files changed. */
    var before = { dirs: staged.dirs, files: {} };
    staged.files.forEach(function (f) {
      before.files[f.path] = Diff.fileEntry(f.data);
    });

    var memRoot = C.CMD_MEMFS_ROOT || '/work';
    var workerResult;
    try {
      workerResult = await callWorker({
        dirs: staged.dirs,
        files: staged.files,
        steps: parsed.steps,
        maxOut: C.CMD_MAX_OUTPUT_BYTES,
        memRoot: memRoot
      }, timeoutSec);
    } catch (err) {
      var duration = (Date.now() - started) / 1000;
      if (err && err.timedOut) {
        return shapeResult({
          exit_code: C.CMD_TIMEOUT_EXIT,
          stdout: '',
          stderr: err.message,
          timed_out: true,
          truncated: false,
          duration_sec: duration,
          wrote: { files: 0, deleted: 0, dirs: 0 },
          skipped: staged.skipped,
          staged: { files: staged.files.length, bytes: staged.bytes, dirs: staged.dirs.length }
        });
      }
      throw err;
    }

    var stdoutText = ExecDecode(workerResult.stdout);
    var stderrText = ExecDecode(workerResult.stderr);
    var durationSec = (Date.now() - started) / 1000;
    var wrote = { files: 0, deleted: 0, dirs: 0 };
    /* Write back only after a successful exit, and never after a timeout. */
    if (workerResult.exit_code === 0 && workerResult.after) {
      var diff = Diff.diffTrees(before, workerResult.after);
      if (typeof fs.applyDiff === 'function') {
        wrote = await fs.applyDiff(cwdRel, diff);
      }
    }

    /* Mention skipped staging in stderr so a client that only prints streams still sees it. */
    if (staged.skipped && staged.skipped.length) {
      var note = '[web-mcp] skipped ' + staged.skipped.length + ' file(s) while staging (size or count cap)\n';
      stderrText = stderrText ? stderrText + note : note;
    }

    return shapeResult({
      exit_code: workerResult.exit_code,
      stdout: stdoutText,
      stderr: stderrText,
      timed_out: false,
      truncated: !!workerResult.truncated,
      duration_sec: durationSec,
      wrote: wrote,
      skipped: staged.skipped,
      staged: { files: staged.files.length, bytes: staged.bytes, dirs: staged.dirs.length }
    });
  }

  /**
   * Decode worker bytes as UTF-8 text (already a string in some test fakes).
   */
  function ExecDecode(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return new TextDecoder('utf-8', { fatal: false }).decode(value);
  }

  /**
   * Build the run_command tool description, including the applet list and syntax.
   */
  function toolDescription() {
    var applets = (C.CMD_APPLETS || []).join(', ');
    return (
      'Run a command inside the picked folder (or cwd subtree) using BusyBox 1.36.1 in WebAssembly. ' +
      'There is no shell and no sh -c: the command is parsed here. ' +
      'Supported syntax: quotes and backslash escapes, simple | pipelines ' +
      '(run sequentially; stdout of one stage is stdin of the next), ' +
      '&& and ; chaining, and > / >> redirects to a file inside the folder. ' +
      'Rejected: ||, background &, < input redirects, $ expansion, backticks, subshells, and anything else. ' +
      'No network and no fork. Default timeout 30 seconds (max 120). ' +
      'The folder (or cwd subtree) is staged into memory with size caps; oversized files are skipped. ' +
      'Changed files are written back only if the command exits 0. ' +
      'Supported applets: ' + applets + '.'
    );
  }

  /* Public API, also exported for Node tests. */
  var api = {
    run: run,
    resolveTimeout: resolveTimeout,
    containRedirects: containRedirects,
    toolDescription: toolDescription,
    dropWorker: dropWorker
  };
  root.WMCmd = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
