/* Web MCP — wm_cmd_exec.js: run a parsed plan against BusyBox-WASM MEMFS. MCP2 */
(function (root) {
  'use strict';

  /* Shared config, hash helper, from the global or via require() in tests. */
  var C = root.WM_CONFIG || (typeof require === 'function' ? require('./wm_config.js') : {});
  var D = root.WMCmdDiff || (typeof require === 'function' ? require('./wm_cmd_diff.js') : {});

  /**
   * Decode bytes as UTF-8, replacing invalid sequences.
   */
  function decodeUtf8(bytes) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes || new Uint8Array(0));
  }

  /**
   * Concatenate an array of Uint8Array chunks into one buffer.
   */
  function concatBytes(chunks) {
    var total = 0;
    var i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (i = 0; i < chunks.length; i++) {
      out.set(chunks[i], off);
      off += chunks[i].length;
    }
    return out;
  }

  /**
   * Create parent directories of an absolute MEMFS path, then the path itself if asDir.
   */
  function mkdirParents(FS, abs, asDir) {
    var parts = abs.split('/').filter(Boolean);
    var built = '';
    var last = asDir ? parts.length : parts.length - 1;
    var i;
    for (i = 0; i < last; i++) {
      built += '/' + parts[i];
      try { FS.mkdir(built); } catch (_) { /* already exists */ }
    }
  }

  /**
   * Populate a fresh MEMFS with /bin applet links plus the staged /work tree.
   */
  function stageMemfs(FS, memRoot, dirs, files, cwd) {
    /* Standard scratch directories. */
    try { FS.mkdir('/tmp'); } catch (_) { /* default image may already have /tmp */ }
    try { FS.mkdir('/bin'); } catch (_) { /* ok */ }
    /* The busybox binary itself is a placeholder so /bin/<applet> symlinks resolve. */
    try { FS.writeFile('/bin/busybox', new Uint8Array(0)); } catch (_) { /* ok */ }
    var applets = C.CMD_APPLETS || [];
    var i;
    for (i = 0; i < applets.length; i++) {
      try { FS.symlink('/bin/busybox', '/bin/' + applets[i]); } catch (_) { /* ok */ }
    }
    mkdirParents(FS, memRoot, true);
    try { FS.mkdir(memRoot); } catch (_) { /* ok */ }
    /* Staged directories, shortest first. */
    var sortedDirs = (dirs || []).slice().sort(function (a, b) { return a.length - b.length; });
    for (i = 0; i < sortedDirs.length; i++) {
      var drel = sortedDirs[i];
      if (!drel || drel === '.') continue;
      var dabs = memRoot + '/' + drel;
      mkdirParents(FS, dabs, true);
    }
    /* Staged files. */
    for (i = 0; i < (files || []).length; i++) {
      var f = files[i];
      var fabs = memRoot + '/' + f.path;
      mkdirParents(FS, fabs, false);
      FS.writeFile(fabs, f.data || new Uint8Array(0));
    }
    /* Working directory: memRoot, or memRoot itself if cwd is missing. */
    var work = cwd || memRoot;
    try { FS.chdir(work); } catch (_) { FS.chdir(memRoot); }
  }

  /**
   * Walk MEMFS under memRoot and return { dirs, files } with relative paths and hashes.
   */
  function snapTree(FS, memRoot) {
    /* Directory relative paths (never includes '.'). */
    var dirs = [];
    /* File map of relPath -> { size, hash, data }. */
    var files = {};
    function walk(abs, rel) {
      var names;
      try { names = FS.readdir(abs); } catch (_) { return; }
      var i;
      for (i = 0; i < names.length; i++) {
        var n = names[i];
        if (n === '.' || n === '..') continue;
        var childAbs = abs + '/' + n;
        var childRel = rel ? rel + '/' + n : n;
        var st;
        try { st = FS.lstat(childAbs); } catch (_) { continue; }
        if (FS.isDir(st.mode)) {
          dirs.push(childRel);
          walk(childAbs, childRel);
        } else if (FS.isFile(st.mode)) {
          var data = FS.readFile(childAbs, { encoding: 'binary' });
          files[childRel] = D.fileEntry(data);
        }
      }
    }
    walk(memRoot, '');
    return { dirs: dirs, files: files };
  }

  /**
   * Run one BusyBox applet in a fresh Module instance, with the given MEMFS
   * already described by dirs/files (re-staged into the new instance).
   * Returns { code, stdout, stderr, dirs, files, cut }.
   */
  async function runApplet(opts) {
    /* Factory comes from the vendored busybox.js (BusyBoxModule). */
    var factory = opts.BusyBoxModule;
    /* Optional precompiled wasm (browser worker); Node loads the file itself. */
    var wasm = opts.wasm;
    /* Captured standard streams. */
    var outChunks = [];
    var errChunks = [];
    var outN = 0;
    var errN = 0;
    var cut = false;
    var maxOut = opts.maxOut || C.CMD_MAX_OUTPUT_BYTES;
    var inp = opts.stdin || new Uint8Array(0);
    var inPos = 0;
    /* Environment visible to the applet. */
    var env = opts.env || {};
    var argv = opts.argv;
    var M = await factory({
      thisProgram: argv[0],
      noInitialRun: true,
      locateFile: opts.locateFile,
      instantiateWasm: wasm
        ? function (imports, done) {
            WebAssembly.instantiate(wasm, imports).then(function (inst) { done(inst); });
            return {};
          }
        : undefined,
      stdin: function () {
        return inPos < inp.length ? inp[inPos++] : null;
      },
      stdout: function (c) {
        if (outN + errN >= maxOut) { cut = true; throw new Error('cut'); }
        outChunks.push(c);
        outN += 1;
      },
      stderr: function (c) {
        if (outN + errN >= maxOut) { cut = true; return; }
        errChunks.push(c);
        errN += 1;
      },
      print: function () {},
      printErr: function () {},
      preRun: [function (mod) {
        var E = (mod || {}).ENV;
        if (E) {
          var k;
          for (k in env) {
            if (Object.prototype.hasOwnProperty.call(env, k)) E[k] = env[k];
          }
        }
      }]
    });
    var FS = M.FS;
    stageMemfs(FS, opts.memRoot, opts.dirs, opts.files, opts.cwd);
    var code = 0;
    try {
      code = M.callMain(argv.slice(1));
    } catch (err) {
      if (err && typeof err.status === 'number') code = err.status;
      else if (err && err.name === 'ExitStatus') code = err.status | 0;
      else if (cut) code = 1;
      else {
        code = 1;
        var msg = 'busybox: ' + (err && err.message ? err.message : 'crashed') + '\n';
        var extra = new TextEncoder().encode(msg);
        errChunks.push.apply(errChunks, extra);
      }
    }
    if (typeof code !== 'number' || !isFinite(code)) code = 0;
    var after = snapTree(FS, opts.memRoot);
    /* Pack files back into the {path, data} list used to restage the next applet. */
    var fileList = [];
    Object.keys(after.files).forEach(function (path) {
      fileList.push({ path: path, data: after.files[path].data });
    });
    return {
      code: code,
      stdout: new Uint8Array(outChunks),
      stderr: new Uint8Array(errChunks),
      dirs: after.dirs,
      files: fileList,
      fileMap: after.files,
      cut: cut
    };
  }

  /**
   * Run a parsed plan (pipelines joined by && / ;) against one staged tree.
   * Each applet gets a fresh Module because this BusyBox is built with EXIT_RUNTIME.
   * File changes carry forward by restaging the previous snapshot.
   * Returns { exit_code, stdout, stderr, truncated, after }.
   */
  async function runPlan(opts) {
    /* MEMFS root that mirrors the picked folder or cwd subtree. */
    var memRoot = opts.memRoot || C.CMD_MEMFS_ROOT || '/work';
    /* Combined output cap. */
    var maxOut = opts.maxOut || C.CMD_MAX_OUTPUT_BYTES;
    /* Mutable tree that carries changes from one applet to the next. */
    var dirs = (opts.dirs || []).slice();
    var files = (opts.files || []).slice();
    /* Environment handed to every applet. */
    var env = {
      HOME: memRoot,
      USER: 'mcp',
      LOGNAME: 'mcp',
      HOSTNAME: 'web-mcp',
      PATH: '/bin',
      SHELL: '/bin/false',
      TERM: 'dumb',
      LANG: 'C.UTF-8',
      PWD: memRoot
    };
    /* Pipeline stdin starts empty; later stages receive the previous stdout. */
    var stdin = new Uint8Array(0);
    /* Last command's streams, used as the plan result. */
    var lastOut = new Uint8Array(0);
    var errChunks = [];
    var code = 0;
    var truncated = false;
    var steps = opts.steps || [];
    var s;
    for (s = 0; s < steps.length; s++) {
      var step = steps[s];
      stdin = new Uint8Array(0);
      var c;
      for (c = 0; c < step.commands.length; c++) {
        var cmd = step.commands[c];
        var ran = await runApplet({
          BusyBoxModule: opts.BusyBoxModule,
          wasm: opts.wasm,
          locateFile: opts.locateFile,
          argv: cmd.argv,
          stdin: stdin,
          dirs: dirs,
          files: files,
          memRoot: memRoot,
          cwd: memRoot,
          env: env,
          maxOut: maxOut
        });
        dirs = ran.dirs;
        files = ran.files;
        if (ran.cut) truncated = true;
        if (ran.stderr && ran.stderr.length) errChunks.push(ran.stderr);
        code = ran.code;
        /* Redirects consume this command's stdout into a file in the staged tree. */
        if (cmd.redir) {
          files = applyRedirectToFiles(files, dirs, cmd.redir, ran.stdout, memRoot);
          stdin = new Uint8Array(0);
          lastOut = new Uint8Array(0);
        } else {
          stdin = ran.stdout;
          lastOut = ran.stdout;
        }
      }
      /* && stops the chain on the first failing step; ; always continues. */
      if (step.join === '&&' && code !== 0) break;
    }
    /* Build the after-tree map from the latest file list. */
    var fileMap = {};
    var i;
    for (i = 0; i < files.length; i++) {
      fileMap[files[i].path] = D.fileEntry(files[i].data);
    }
    var stdout = lastOut;
    var stderr = concatBytes(errChunks);
    if (truncated) {
      var mark = new TextEncoder().encode(C.CMD_TRUNC_MARK || '\n[truncated]\n');
      var marked = new Uint8Array(stdout.length + mark.length);
      marked.set(stdout, 0);
      marked.set(mark, stdout.length);
      stdout = marked;
    }
    return {
      exit_code: code,
      stdout: stdout,
      stderr: stderr,
      truncated: truncated,
      after: { dirs: dirs, files: fileMap }
    };
  }

  /**
   * Apply a > / >> redirect to the in-memory file list (no live FS after EXIT_RUNTIME).
   * dirs is unused except to document the tree shape; new files appear under existing dirs.
   */
  function applyRedirectToFiles(files, dirs, redir, stdout, memRoot) {
    /* memRoot is unused: paths in the list are already relative to /work. */
    void memRoot;
    void dirs;
    var path = redir.file;
    var data = stdout || new Uint8Array(0);
    var i;
    for (i = 0; i < files.length; i++) {
      if (files[i].path === path) {
        if (redir.op === '>>') {
          var merged = new Uint8Array(files[i].data.length + data.length);
          merged.set(files[i].data, 0);
          merged.set(data, files[i].data.length);
          files[i] = { path: path, data: merged };
        } else {
          files[i] = { path: path, data: data };
        }
        return files;
      }
    }
    /* New file: also ensure parent dirs exist in the dir list (caller may already have them). */
    var parts = path.split('/');
    var built = '';
    var d;
    for (d = 0; d < parts.length - 1; d++) {
      built = built ? built + '/' + parts[d] : parts[d];
      if (dirs.indexOf(built) < 0) dirs.push(built);
    }
    files.push({ path: path, data: data });
    return files;
  }

  /* Public API, also exported for Node tests. */
  var api = {
    decodeUtf8: decodeUtf8,
    concatBytes: concatBytes,
    stageMemfs: stageMemfs,
    snapTree: snapTree,
    runApplet: runApplet,
    runPlan: runPlan,
    applyRedirectToFiles: applyRedirectToFiles
  };
  root.WMCmdExec = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
