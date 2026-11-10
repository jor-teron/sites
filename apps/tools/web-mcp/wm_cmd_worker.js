/*
 * Web MCP — wm_cmd_worker.js: run one run_command plan in a Web Worker. MCP2
 *
 * The page stages the picked folder (or cwd subtree), then posts one 'run'
 * message with the staged tree and the parsed plan. This worker loads a copy
 * of BusyBox-WASM, runs each applet in a fresh instance (the build uses
 * EXIT_RUNTIME=1, and there is no fork), carries file changes forward, and
 * posts back stdout, stderr, the exit code, and the after-tree.
 *
 * The page owns the timeout: it terminates this worker and makes a new one
 * if the call runs too long. Nothing is written back from here.
 *
 * Messages in:  { type: 'ping' }
 *               { type: 'run', id, dirs, files, steps, maxOut, memRoot }
 * Messages out: { type: 'pong', fail? }
 *               { type: 'done', id, exit_code, stdout, stderr, truncated, after }
 *               { type: 'fail', id, msg }
 */
'use strict';

/* Shared helpers loaded next to this script. */
importScripts('wm_config.js');
importScripts('wm_cmd_diff.js');
importScripts('wm_cmd_exec.js');
importScripts('vendor/busybox/busybox.js');

/* Compiled wasm, kept so later calls do not fetch it again. */
var compiledWasm = null;

/**
 * Fetch and compile busybox.wasm once per worker lifetime.
 */
async function ready() {
  if (compiledWasm) return compiledWasm;
  var url = (self.WM_CONFIG && self.WM_CONFIG.CMD_BUSYBOX_WASM) || 'vendor/busybox/busybox.wasm';
  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
  compiledWasm = await WebAssembly.compile(await res.arrayBuffer());
  return compiledWasm;
}

self.onmessage = async function (ev) {
  /* Incoming message from the page. */
  var msg = ev.data || {};
  if (msg.type === 'ping') {
    try {
      await ready();
      self.postMessage({ type: 'pong' });
    } catch (err) {
      self.postMessage({ type: 'pong', fail: String(err && err.message ? err.message : err) });
    }
    return;
  }
  /* Request id so the page can ignore a stale reply. */
  var id = msg.id;
  if (msg.type !== 'run') {
    self.postMessage({ type: 'fail', id: id, msg: 'unknown worker message' });
    return;
  }
  var wasm;
  try {
    wasm = await ready();
  } catch (err) {
    self.postMessage({ type: 'fail', id: id, msg: 'BusyBox could not be loaded: ' + (err && err.message ? err.message : err) });
    return;
  }
  try {
    var result = await self.WMCmdExec.runPlan({
      BusyBoxModule: self.BusyBoxModule,
      wasm: wasm,
      dirs: msg.dirs || [],
      files: msg.files || [],
      steps: msg.steps,
      maxOut: msg.maxOut,
      memRoot: msg.memRoot
    });
    /* Transfer the stdout/stderr buffers and any after-tree file bytes. */
    var xfer = [];
    if (result.stdout && result.stdout.buffer) xfer.push(result.stdout.buffer);
    if (result.stderr && result.stderr.buffer) xfer.push(result.stderr.buffer);
    var afterFiles = result.after && result.after.files ? result.after.files : {};
    Object.keys(afterFiles).forEach(function (path) {
      var data = afterFiles[path] && afterFiles[path].data;
      if (data && data.buffer) xfer.push(data.buffer);
    });
    self.postMessage({
      type: 'done',
      id: id,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
      after: result.after
    }, xfer);
  } catch (err) {
    self.postMessage({ type: 'fail', id: id, msg: err && err.message ? err.message : String(err) });
  }
};
