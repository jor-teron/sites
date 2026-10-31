/*
 * Terminal BusyBox worker (apps/system/terminal/terminal_worker.js), T7 — runs one BusyBox applet at a time
 * off the page, so the Terminal stays responsive and Ctrl+C can stop it (the page terminates this worker
 * and makes a new one on the next command).
 * Messages in:  { id, live, max, argv, env, stdin: Uint8Array, ops: [[fsMethod, ...args]], track: [[path, placeholder]], cwd }
 *   ops are the memory file system calls terminal_bb.js recorded while staging the /drive files (mkdir, writeFile,
 *   symlink, chmod, truncate, utime, mkdirTree, rmdir, chdir); they are replayed on a fresh BusyBox instance.
 * Messages out: { id, t: 'out' | 'err', b: Uint8Array }  output chunks, sent as they are produced (~every 40 ms)
 *               { id, t: 'done', code, cut, snap: { dirs: [path], files: [{ p, same?, ph?, b? }] } }
 *               { id, t: 'fail', msg }
 * live: the output is shown on screen (sent at most LIVE_RATE bytes/s); max: output cap in bytes.
 * snap lists everything under /drive after the run: a file the command did not change comes back as
 * { p, same: true } (no bytes), a staged size-only file as { p, ph: true }.
 */
'use strict';
const FLUSH_MS = 40, FLUSH_BYTES = 65536, LIVE_RATE = 524288;
let wasm = null;
async function ready() {
  if (wasm) return wasm;
  importScripts('bin/busybox.js');
  const r = await fetch('bin/busybox.wasm');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  wasm = await WebAssembly.compile(await r.arrayBuffer());
  return wasm;
}
function same(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

onmessage = async (ev) => {
  const m = ev.data || {};
  if (m.t === 'ping') { try { await ready(); postMessage({ t: 'pong' }); } catch (e) { postMessage({ t: 'pong', fail: String(e && e.message || e) }); } return; }
  const id = m.id;
  let mod;
  try { mod = await ready(); } catch (e) { postMessage({ id, t: 'fail', msg: 'fetch' }); return; }
  const inp = m.stdin || new Uint8Array(0), MAX_OUT = m.max || 16 * 1048576;
  let i = 0, total = 0, cut = false;
  // output: bytes collect in a buffer per stream, posted every FLUSH_MS or when full. When it is shown on screen
  // (m.live) the worker also waits so it sends at most LIVE_RATE bytes a second: `yes` cannot flood the page.
  const bufs = { out: new Uint8Array(FLUSH_BYTES), err: new Uint8Array(FLUSH_BYTES) }, pos = { out: 0, err: 0 };
  let last = Date.now(), sent = 0;
  const t0 = Date.now();
  function flush(k) {
    if (!pos[k]) return;
    const n = pos[k], b = bufs[k].slice(0, n); pos[k] = 0;
    postMessage({ id, t: k, b }, [b.buffer]);
    if (m.live) {
      sent += n;
      const due = t0 + sent * 1000 / LIVE_RATE;
      while (Date.now() < due) { /* throttle: the page shows it at screen speed */ }
    }
  }
  function put(k, c) {
    if (total >= MAX_OUT) { cut = true; throw new Error('cut'); }
    bufs[k][pos[k]++] = c; total++;
    if (pos[k] >= FLUSH_BYTES || Date.now() - last > FLUSH_MS) { flush('out'); flush('err'); last = Date.now(); }
  }
  let M;
  try {
    M = await self.BusyBoxModule({
      thisProgram: m.argv[0], noInitialRun: true,
      instantiateWasm(imports, done) { WebAssembly.instantiate(mod, imports).then((inst) => done(inst)); return {}; },
      stdin: () => (i < inp.length ? inp[i++] : null),
      stdout: (c) => put('out', c), stderr: (c) => { if (total < MAX_OUT) put('err', c); },
      print: () => {}, printErr: () => {},
      preRun: [(x) => { const E = (x || {}).ENV; if (E) Object.assign(E, m.env || {}); }],
    });
  } catch (e) { postMessage({ id, t: 'fail', msg: 'BusyBox did not start: ' + (e && e.message) }); return; }
  const F = M.FS, track = new Map(m.track || []);
  const orig = new Map();
  for (const op of m.ops || []) {
    try {
      if (op[0] === 'writeFile' && op[2] instanceof Uint8Array && track.has(op[1]) && !track.get(op[1])) orig.set(op[1], op[2]);
      F[op[0]].apply(F, op.slice(1));
    } catch (_) { /* replay what works, like the page did */ }
  }
  let code = 0;
  try { code = M.callMain(m.argv.slice(1)); } catch (e) {
    if (e && typeof e.status === 'number') code = e.status;
    else if (cut) code = 1;
    else { code = 1; const t = new TextEncoder().encode('busybox: ' + (e && e.message ? e.message : 'crashed') + '\n'); for (const c of t) { if (pos.err >= FLUSH_BYTES) flush('err'); bufs.err[pos.err++] = c; } }
  }
  if (typeof code !== 'number') code = 0;
  flush('out'); flush('err');
  const snap = { dirs: [], files: [] }, xfer = [];
  (function walk(p) {
    let names = [];
    try { names = F.readdir(p).filter((n) => n !== '.' && n !== '..'); } catch (_) { return; }
    for (const n of names) {
      const c = p + '/' + n;
      let s; try { s = F.lstat(c); } catch (_) { continue; }
      if (F.isDir(s.mode)) { snap.dirs.push(c); walk(c); }
      else if (F.isFile(s.mode)) {
        if (track.has(c) && track.get(c)) { snap.files.push({ p: c, ph: true }); continue; }
        const b = F.readFile(c), o = orig.get(c);
        if (o && same(o, b)) snap.files.push({ p: c, same: true });
        else { snap.files.push({ p: c, b }); xfer.push(b.buffer); }
      }
    }
  })('/drive');
  postMessage({ id, t: 'done', code, cut, snap }, xfer);
};
