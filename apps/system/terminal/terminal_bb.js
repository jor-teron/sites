/*
 * Terminal BusyBox (apps/system/terminal/terminal_bb.js), T5 — real Linux commands (BusyBox 1.36.1 built
 * to WebAssembly, bin/busybox.wasm + bin/busybox.js) on the Hub's /drive files.
 *
 * - Lazy: bin/busybox.js (a <script>, works on file:// too) and bin/busybox.wasm (fetch, compiled once) load
 *   on the first BusyBox command. On file:// most browsers refuse to fetch the .wasm: the command then
 *   says so and the Terminal's own commands keep working.
 * - One run = one fresh BusyBox instance (clean globals, own memory file system). Before the run the files the
 *   command names are copied in ("staged") from the /drive tree (terminal_fs.js: Local / OPFS, Google Drive,
 *   added folders), plus /bin (every applet as /bin/<name> -> busybox) and the read-only /etc
 *   (terminal_etc.js). After the run every staged drive folder is compared: changed and new files / folders
 *   are written back, staged files that are gone are deleted. /bin, /etc, /tmp changes are thrown away.
 * - What is staged: each word that is a path under /drive (a file: its bytes; a folder: its files, all levels
 *   for find / du / tar / cp -r / grep -r / ls -R / diff -r / rm -r, else one level); a word that is a new
 *   name gets its folder created so the command can write there. ls / find / du / stat / test only need
 *   names and sizes: their files are sized, not read (and never written back).
 *   Limits: 3000 files and 32 MB read per run; output 64 MB on screen, 16 MB into a pipe (T7; in-page fallback: 4 MB, 20 s).
 * - T7: the applet runs in a Web Worker (terminal_worker.js): staging is recorded here (a list of memory file
 *   system calls) and replayed there; stdout / stderr stream back in chunks, so the page stays responsive and
 *   the last command of a line prints as it goes. Ctrl+C (cancel()) terminates the worker at once, nothing is
 *   written back, and a new worker is made for the next command. No SharedArrayBuffer / COOP / COEP needed.
 *   Where a worker cannot be made (file:// in most browsers) it runs in the page as in T5.
 * - Pipes a | b | c, redirects > file, >> file, < file. Stages run one after the other (stdout -> stdin).
 *   A Terminal command with no BusyBox applet (help, history, apps, tree, drives, ...) may start a pipe.
 * - Output is text only (textContent via ctx.block / ctx.err), like the rest of the Terminal.
 * API: window.TermBB.install(ctx) -> { applets, isApplet, wants(name, args, line), exec(line), parse, cancel }.
 * ctx.stream(cls) (T7, optional) -> { write(text), end() }: a growing output block.
 */
(function () {
  'use strict';
  const V = 'T7';
  const APPLETS = ('[ [[ ascii awk base64 basename bc bunzip2 bzcat bzip2 cal cat cksum cmp comm cp crc32 cut date dc diff ' +
    'dirname dos2unix du echo egrep expand expr factor false fgrep find fold grep gunzip gzip head hexdump ln ls md5sum ' +
    'mkdir mktemp mv nl od paste printenv printf pwd readlink realpath rev rm rmdir sed seq sha1sum sha256sum sha3sum ' +
    'sha512sum shuf sleep sort split stat strings sum tac tail tar tee test touch tr true truncate tsort uname unexpand uniq ' +
    'unix2dos unzip usleep wc whoami xxd yes zcat').split(' ');   // = bin/APPLETS.txt
  const SET = new Set(APPLETS);
  const DEEP = new Set(['find', 'du', 'tar']);
  const DEEP_R = new Set(['cp', 'grep', 'egrep', 'fgrep', 'ls', 'diff', 'rm']);   // deep with -r / -R
  const META = new Set(['ls', 'find', 'du', 'stat', 'test', '[', '[[', 'realpath', 'readlink', 'basename', 'dirname']);
  const CWD_USERS = new Set(['ls', 'find', 'du']);
  const MAX_FILES = 3000, MAX_BYTES = 32 * 1048576, META_BYTES = 64 * 1048576, MAX_OUT = 4 * 1048576, MAX_MS = 20000, W_MAX_OUT = 64 * 1048576, W_PIPE_OUT = 16 * 1048576;
  const ENV_ = { HOME: '/drive/local', USER: 'hub', LOGNAME: 'hub', HOSTNAME: 'hub', PATH: '/bin', SHELL: '/bin/sh', TERM: 'dumb', LANG: 'C.UTF-8' };

  /* ---------- loading ---------- */
  let loading = null;
  function base() { const s = document.currentScript; return s ? new URL('.', s.src).href : ''; }
  const HERE = base() || new URL('.', location.href).href;
  function load() {
    if (loading) return loading;
    loading = (async () => {
      if (typeof window.BusyBoxModule !== 'function') {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = HERE + 'bin/busybox.js?v=' + V;
          s.onload = res; s.onerror = () => rej(new Error('could not load bin/busybox.js'));
          document.head.appendChild(s);
        });
      }
      const url = HERE + 'bin/busybox.wasm?v=' + V;
      let buf = null;
      try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); buf = await r.arrayBuffer(); } catch (e) {
        buf = await new Promise((res) => {   // some browsers allow XHR on file:// where fetch is refused
          try {
            const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
            x.onload = () => res(x.response && x.response.byteLength ? x.response : null); x.onerror = () => res(null); x.send();
          } catch (_) { res(null); }
        });
        if (!buf) throw Object.assign(new Error('fetch'), { file: location.protocol === 'file:' });
      }
      return WebAssembly.compile(buf);
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  /* ---------- T7: the worker ---------- */
  /** a stand-in for FS while staging for the worker: records the calls, knows which paths exist */
  function recorder() {
    const ops = [], have = new Set(['/', '/tmp', '/home', '/home/web_user', '/dev']);
    const add = (p) => { have.add(p); };
    const R = { ops };
    ['mkdir', 'writeFile', 'chmod', 'symlink', 'rmdir', 'mkdirTree', 'truncate', 'utime', 'chdir'].forEach((k) => {
      R[k] = function () {
        const a = Array.prototype.slice.call(arguments);
        ops.push([k].concat(a));
        if (k === 'mkdir' || k === 'writeFile') add(a[0]);
        else if (k === 'symlink') add(a[1]);
        else if (k === 'rmdir') have.delete(a[0]);
        else if (k === 'mkdirTree') { const s = a[0].split('/').filter(Boolean); let c = ''; s.forEach((x) => { c += '/' + x; add(c); }); }
      };
    });
    R.analyzePath = (p) => ({ exists: have.has(p) });
    return R;
  }
  let W = null, wBad = false, wReady = false, wCur = null, wId = 0;
  function worker() {
    if (W) return W;
    if (wBad || typeof Worker !== 'function') return null;
    try { W = new Worker(HERE + 'terminal_worker.js?v=' + V); } catch (_) { wBad = true; return null; }
    W.onmessage = (ev) => { const m = ev.data || {}; if (wCur && m.id === wCur.id) wCur.on(m); };
    W.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); if (wCur) wCur.on({ id: wCur.id, t: 'fail', msg: wReady ? 'the BusyBox worker stopped' : 'fetch' }); };
    return W;
  }
  /** Ctrl+C: stop the running applet now (the worker is thrown away; the next command makes a new one) */
  function cancel() {
    if (!wCur) return false;
    const c = wCur; wCur = null;
    try { W.terminate(); } catch (_) { /* gone */ }
    W = null;
    c.done(null);
    return true;
  }

  /* ---------- the line: words, | > >> < ---------- */
  function parse(str) {
    const toks = [];
    let cur = '', has = false, q = '';
    const flush = () => { if (has || cur) { toks.push({ t: cur }); cur = ''; has = false; } };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) {
        if (c === q) q = '';
        else if (c === '\\' && q === '"' && i + 1 < str.length && /["\\$`]/.test(str[i + 1])) cur += str[++i];
        else cur += c;
      } else if (c === '"' || c === "'") { q = c; has = true; }
      else if (c === '\\' && i + 1 < str.length) { cur += str[++i]; has = true; }
      else if (c === '~' && !cur && !has && (i + 1 >= str.length || /[\s/|<>]/.test(str[i + 1]))) cur = ENV_.HOME;   // ~ and ~/x
      else if (c === '|') { flush(); toks.push({ op: '|' }); }
      else if (c === '>') { flush(); const op = str[i + 1] === '>' ? '>>' : '>'; toks.push({ op }); i += op.length - 1; }
      else if (c === '<') { flush(); toks.push({ op: '<' }); }
      else if (/\s/.test(c)) flush();
      else cur += c;
    }
    if (q) return { error: 'unexpected end of line (missing ' + q + ')' };
    flush();
    const stages = [[]];
    let out = null, inp = null;
    for (let i = 0; i < toks.length; i++) {
      const k = toks[i];
      if (!k.op) { stages[stages.length - 1].push(k.t); continue; }
      if (k.op === '|') {
        if (out) return { error: 'the redirect > goes last' };
        if (!stages[stages.length - 1].length) return { error: "syntax error near '|'" };
        stages.push([]); continue;
      }
      const nx = toks[i + 1];
      if (!nx || nx.op) return { error: "syntax error: file name missing after '" + k.op + "'" };
      i++;
      if (k.op === '<') { if (inp || stages.length > 1) return { error: '< works on the first command only' }; inp = nx.t; }
      else { if (out) return { error: 'only one > or >> per command' }; out = { op: k.op, target: nx.t }; }
    }
    if (!stages[stages.length - 1].length) return { error: stages.length > 1 ? "syntax error near '|'" : 'empty command' };
    return { stages, out, inp };
  }
  function unquotedHas(str, chars) {
    let q = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) { if (c === q) q = ''; else if (c === '\\' && q === '"') i++; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '\\') i++;
      else if (chars.indexOf(c) >= 0) return true;
    }
    return false;
  }

  /* ---------- install ---------- */
  function install(ctx) {
    const fs = ctx.fs;   // terminal_fs.js api
    const { err, dim, block } = ctx;
    const O = () => window.FsOps;
    const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
    const isVirt = (p) => p === '/' || p === '/bin' || p === '/etc' || p.indexOf('/bin/') === 0 || p.indexOf('/etc/') === 0;
    /* the Terminal's own ls / cat / grep ... understand these options; anything else goes to BusyBox */
    const JS_OPTS = { ls: /^-[laAh]+$/, wc: /^-[lwc]+$/, grep: /^-[inr]+$/, head: /^-(n\d*|\d+)$/, tail: /^-(n\d*|\d+)$/, cat: null, echo: null, date: null, stat: null, find: /^-(name|iname|type)$/, mkdir: /^-p$/, touch: null, rm: /^-[rf]+$/, rmdir: null, cp: /^-[rf]+$/, mv: /^-f$/, pwd: null };

    /** true when this line should run in BusyBox rather than the Terminal's own command */
    function wants(name, args, line) {
      if (unquotedHas(line, '|<')) return true;
      if (name === 'busybox' || name.indexOf('/bin/') === 0) return true;
      if (!SET.has(name)) return false;
      if (!ctx.hasJs(name)) return true;
      if (name === 'pwd') return false;
      if (name === 'date') return args.length > 0;   // date +%Y, date -u ...: BusyBox; plain date: the Terminal's
      if (name === 'echo') return /^-[neE]+$/.test(args[0] || '');
      const cwd = fs.S.cwd;
      if (isVirt(cwd) && cwd !== '/') return true;
      if (name === 'ls' && cwd === '/' && !args.some((a) => a.charAt(0) !== '-')) return true;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.charAt(0) === '-' && a.length > 1) {
          const re = JS_OPTS[name];
          if (!re || !re.test(a)) return true;
          if (/^-(n|name|iname|type)$/.test(a)) i++;
          continue;
        }
        if (isVirt(fs.norm(a, cwd))) return true;
      }
      return false;
    }

    /* ---------- staging ---------- */
    function pathOk(F, p) { try { return !!F.analyzePath(p).exists; } catch (_) { return false; } }
    function mkdirs(F, p) { if (!pathOk(F, p)) F.mkdirTree(p); }
    function realOf(abs) { const s = abs.split('/').filter(Boolean); return s[0] === 'drive' && s.length >= 2; }
    const dirname = (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };

    async function stageAll(F, argv, st) {
      F.mkdir('/bin'); F.writeFile('/bin/busybox', ''); F.chmod('/bin/busybox', 0o755);
      APPLETS.forEach((a) => { if (a !== 'busybox') { try { F.symlink('busybox', '/bin/' + a); } catch (_) { /* ignore */ } } });
      F.mkdir('/etc');
      const etc = (window.TermEtc && window.TermEtc.files) || { hostname: 'hub\n' };
      Object.keys(etc).forEach((n) => { F.writeFile('/etc/' + n, etc[n]); F.chmod('/etc/' + n, 0o444); });
      try { F.rmdir('/home/web_user'); F.rmdir('/home'); } catch (_) { /* ignore */ }
      F.mkdir('/drive');
      let ms = [];
      try { ms = await fs.mounts(); } catch (_) { ms = []; }
      ms.forEach((m) => { mkdirs(F, '/drive/' + m.name); });
      const app = argv[0];
      const flagR = argv.slice(1).some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive');
      const deep = DEEP.has(app) || (DEEP_R.has(app) && flagR);
      st.meta = META.has(app);
      const cwd = fs.S.cwd;
      const words = argv.slice(1).filter((a) => !(a.charAt(0) === '-' && a.length > 1));
      if (CWD_USERS.has(app) || (app === 'grep' && flagR)) words.push('.');
      for (const w of words) {
        if (ctx.epoch() !== st.ep) throw new Error('cancelled');
        const p = fs.norm(w, cwd);
        if (!realOf(p)) continue;
        await stagePath(F, p, deep ? Infinity : 1, st);
      }
      if (realOf(cwd)) { try { await stagePath(F, cwd, 0, st); } catch (_) { /* cwd gone */ } }
      if (pathOk(F, cwd)) F.chdir(cwd); else if (isVirt(cwd) || cwd === '/drive') { mkdirs(F, cwd); F.chdir(cwd); }
    }
    /** stage abs (a file, or a folder with `depth` levels of its content); a missing path gets its folder */
    async function stagePath(F, abs, depth, st) {
      let node;
      try { node = await fs.resolve(abs); } catch (e) {
        if (e && e.code === 'ENOENT') {
          const up = dirname(abs);
          if (realOf(up) && up !== abs) { try { const n = await fs.resolve(up); if (n.type === 'dir') { mkdirs(F, up); st.dirs.set(up, st.dirs.get(up) || { full: false }); } } catch (_) { /* ignore */ } }
          return;
        }
        throw e;
      }
      mkdirs(F, node.type === 'dir' ? abs : dirname(abs));
      if (node.type === 'file') { await stageFile(F, abs, node.dir, node.name, node.handle, st); return; }
      await stageDir(F, abs, node, depth, st);
    }
    async function stageDir(F, abs, node, depth, st) {
      const had = st.dirs.get(abs);
      if (had && had.depth >= depth) return;
      st.dirs.set(abs, { full: depth === Infinity, depth });
      mkdirs(F, abs);
      if (depth <= 0) return;
      const list = await fs.entries(node);
      for (const e of list) {
        if (ctx.epoch() !== st.ep) throw new Error('cancelled');
        const p = abs + '/' + e.name;
        if (e.kind === 'directory') {
          mkdirs(F, p);
          if (depth > 1) await stageDir(F, p, await fs.childNode(node, e), depth - 1, st);
          else if (!st.dirs.has(p)) st.dirs.set(p, { full: false, depth: 0 });
        } else await stageFile(F, p, node.handle, e.name, e.handle, st, e);
      }
    }
    async function stageFile(F, abs, dirH, name, h, st, info) {
      if (st.files.has(abs)) return;
      if (st.files.size >= MAX_FILES) throw Object.assign(new Error('too many files to hand to BusyBox (limit ' + MAX_FILES + ')'), { code: 'ELIMIT' });
      let size = info ? info.size : 0, mod = info ? info.modified : 0;
      if (st.meta) {   // names and sizes only: sparse file, never written back
        if (!info) { try { if (h && h.meta) { size = h.meta.size || 0; mod = h.meta.modified || 0; } else { const f = await h.getFile(); size = f.size; mod = f.lastModified; } } catch (_) { /* unreadable */ } }
        F.writeFile(abs, '');
        if (st.metaBytes + size <= META_BYTES) { F.truncate(abs, size); st.metaBytes += size; }
        st.files.set(abs, { ph: true });
      } else {
        const file = await O().readFile(dirH, name);
        if (st.bytes + file.size > MAX_BYTES) throw Object.assign(new Error('too much data to hand to BusyBox (limit 32 MB per command)'), { code: 'ELIMIT' });
        const b = new Uint8Array(await file.arrayBuffer());
        st.bytes += b.length; mod = file.lastModified;
        F.writeFile(abs, b);
        st.files.set(abs, { b });
      }
      if (mod) { try { F.utime(abs, mod, mod); } catch (_) { /* ignore */ } }
    }

    /* ---------- writing back ---------- */
    const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    async function dirHandle(abs, create) {
      try { const n = await fs.resolve(abs); if (n.type === 'dir' && !n.virtual) return n; } catch (e) { if (!create || !e || e.code !== 'ENOENT') throw e; }
      if (!create) return null;
      const up = await dirHandle(dirname(abs), true);
      const nm = abs.slice(abs.lastIndexOf('/') + 1);
      await up.handle.getDirectoryHandle(nm, { create: true });
      return fs.resolve(abs);
    }
    /** what /drive holds after a run (in-page; the worker sends the same shape): { dirs, files: [{ p, same?, ph?, b? }] } */
    function snapOf(F, st) {
      const snap = { dirs: [], files: [] };
      (function walk(p) {
        let names = [];
        try { names = F.readdir(p).filter((n) => n !== '.' && n !== '..'); } catch (_) { return; }
        for (const n of names) {
          const c = p + '/' + n;
          let s; try { s = F.lstat(c); } catch (_) { continue; }
          if (F.isDir(s.mode)) { snap.dirs.push(c); walk(c); }
          else if (F.isFile(s.mode)) {
            const t = st.files.get(c);
            if (t && t.ph) { snap.files.push({ p: c, ph: true }); continue; }
            const b = F.readFile(c);
            snap.files.push(t && same(t.b, b) ? { p: c, same: true } : { p: c, b });
          }
        }
      })('/drive');
      return snap;
    }
    async function writeBack(snap, st) {
      const seenF = new Set(), seenD = new Set(), newDirs = [], writes = [];
      snap.dirs.forEach((d) => { seenD.add(d); if (!st.dirs.has(d) && d.split('/').length > 3) newDirs.push(d); });
      snap.files.forEach((f) => { seenF.add(f.p); if (f.b) writes.push({ p: f.p, b: f.b }); });
      let n = 0;
      const bad = (p, e) => { err('busybox: ' + p + ': ' + (e && (e.code === 'EPERM' || e.name === 'NotAllowedError') ? 'Permission needed: run `allow ' + (e.mount ? e.mount.name : p.split('/')[2]) + '`' : 'not saved (' + (e && e.message ? e.message : 'write failed') + ')')); };
      for (const d of newDirs) { try { await dirHandle(d, true); n++; } catch (e) { bad(d, e); } }
      for (const w of writes) {
        try { const dir = await dirHandle(dirname(w.p), true); await O().writeFile(dir.handle, w.p.slice(w.p.lastIndexOf('/') + 1), new Blob([w.b])); n++; } catch (e) { bad(w.p, e); }
      }
      const gone = [];
      st.files.forEach((v, p) => { if (!seenF.has(p)) gone.push({ p, kind: 'file' }); });
      st.dirs.forEach((v, p) => { if (v.full && !seenD.has(p) && realOf(p) && p.split('/').length > 3) gone.push({ p, kind: 'directory' }); });
      gone.sort((a, b) => a.p.length - b.p.length);
      const done = [];
      for (const g of gone) {
        if (done.some((d) => g.p.indexOf(d + '/') === 0)) continue;
        try {
          const dir = await dirHandle(dirname(g.p), false);
          if (!dir) continue;
          await O().remove(dir.handle, { name: g.p.slice(g.p.lastIndexOf('/') + 1), kind: g.kind });
          if (g.kind === 'directory') done.push(g.p);
          n++;
        } catch (e) { if (!(e && (e.code === 'ENOENT' || e.name === 'NotFoundError'))) bad(g.p, e); }
      }
      return n;
    }

    /* ---------- one applet ---------- */
    /** T7: run in the worker; onOut / onErr get the text as it comes (null = collect it); null result = Ctrl+C */
    async function runWorker(argv, input, ep, onOut, onErr) {
      const st = { files: new Map(), dirs: new Map(), bytes: 0, metaBytes: 0, ep, meta: false };
      const R = recorder();
      try { await stageAll(R, argv, st); } catch (e) { return stageErr(e); }
      if (ctx.epoch() !== ep) return null;
      const w = worker();
      if (!w) return undefined;   // no worker here: run in the page
      const track = [];
      st.files.forEach((v, p) => track.push([p, !!v.ph]));
      const env = Object.assign({}, ENV_, ctx.env ? ctx.env() : {}, { PWD: fs.S.cwd });
      const outs = [], errs = [];
      let outN = 0;
      const dO = new TextDecoder('utf-8'), dE = new TextDecoder('utf-8');
      const res = await new Promise((resolve) => {
        const id = ++wId;
        wCur = {
          id, done: resolve,
          on(m) {
            if (m.t === 'out') {
              if (onOut) onOut(dO.decode(m.b, { stream: true }));
              else if (outN < W_MAX_OUT) { outs.push(m.b); outN += m.b.length; }
            } else if (m.t === 'err') {
              if (onErr) onErr(dE.decode(m.b, { stream: true })); else errs.push(m.b);
            } else if (m.t === 'done' || m.t === 'fail') { wCur = null; resolve(m); }
          },
        };
        w.postMessage({ id, live: !!onOut, max: onOut ? W_MAX_OUT : W_PIPE_OUT, argv, env, stdin: input || new Uint8Array(0), ops: R.ops, track, cwd: fs.S.cwd });
      });
      if (!res) return null;
      if (res.t === 'fail') {
        if (res.msg === 'fetch') { if (!wReady) { wBad = true; try { w.terminate(); } catch (_) { /* gone */ } W = null; return undefined; } throw new Error('fetch'); }
        throw new Error(res.msg);
      }
      wReady = true;
      if (onOut) onOut(dO.decode());
      if (onErr) onErr(dE.decode());
      const wrote = await writeBack(res.snap, st);
      const out = new Uint8Array(outN); let o = 0;
      outs.forEach((b) => { out.set(b, o); o += b.length; });
      let eb = new Uint8Array(errs.reduce((a, b) => a + b.length, 0)); o = 0;
      errs.forEach((b) => { eb.set(b, o); o += b.length; });
      return { out, err: dec.decode(eb), code: res.code, cut: res.cut ? (onOut ? 'wout' : 'wpipe') : false, wrote };
    }
    function stageErr(e) {
      if (e && e.message === 'cancelled') return null;
      if (e && e.code) { const m = e.mount; throw new Error(e.code === 'ELIMIT' ? e.message : e.code === 'EPERM' ? 'Permission needed: run `allow ' + (m ? m.name : '<mount>') + '`' : e.code === 'EDRIVE' ? 'that drive is not available' : e.message); }
      throw e;
    }
    /** T5: run in the page (no worker: file://), 4 MB / 20 s */
    async function runApplet(argv, input, ep) {
      const wasm = await load();
      const out = [], errs = [];
      let outN = 0, errN = 0, cut = false, i = 0;
      const t0 = Date.now();
      const tick = () => { if (Date.now() - t0 > MAX_MS) { cut = 'time'; throw new Error('time'); } };
      const inp = input || new Uint8Array(0);
      const st = { files: new Map(), dirs: new Map(), bytes: 0, metaBytes: 0, ep, meta: false };
      const name = argv[0];
      const M = await window.BusyBoxModule({
        thisProgram: name,
        noInitialRun: true,
        instantiateWasm(imports, done) { WebAssembly.instantiate(wasm, imports).then((inst) => done(inst)); return {}; },
        stdin: () => { tick(); return i < inp.length ? inp[i++] : null; },
        stdout: (c) => { tick(); if (outN >= MAX_OUT) { cut = 'out'; throw new Error('cut'); } out.push(c); outN++; },
        stderr: (c) => { if (errN < 65536) { errs.push(c); errN++; } },
        print: () => {}, printErr: () => {},
        preRun: [(m) => { const E = (m || M || {}).ENV; if (E) Object.assign(E, ENV_, ctx.env ? ctx.env() : {}, { PWD: fs.S.cwd }); }],
      });
      const F = M.FS;
      try { await stageAll(F, argv, st); } catch (e) { return stageErr(e); }
      if (ctx.epoch() !== ep) return null;
      let code = 0;
      try { code = M.callMain(argv.slice(1)); } catch (e) {
        if (e && typeof e.status === 'number') code = e.status;
        else if (e && e.name === 'ExitStatus') code = e.status | 0;
        else if (cut) code = 1;
        else { code = 1; errs.push.apply(errs, enc.encode('busybox: ' + (e && e.message ? e.message : 'crashed') + '\n')); }
      }
      if (typeof code !== 'number') code = 0;
      const wrote = await writeBack(snapOf(F, st), st);
      return { out: Uint8Array.from(out), err: dec.decode(Uint8Array.from(errs)), code, cut, wrote };
    }

    /* ---------- a whole line ---------- */
    async function readIn(arg) {
      const p = fs.abs(arg);
      if (isVirt(p)) {
        const m = /^\/etc\/([^/]+)$/.exec(p), t = m && window.TermEtc ? window.TermEtc.text(m[1]) : null;
        if (t == null) throw new Error(arg + ': No such file or directory');
        return enc.encode(t);
      }
      const n = await fs.resolve(p);
      if (n.type !== 'file') throw new Error(arg + ': Is a directory');
      return new Uint8Array(await (await O().readFile(n.dir, n.name)).arrayBuffer());
    }
    async function writeOut(target, bytes, append) {
      const bad = await fs.redirectCheck(target);
      if (bad) throw new Error(target + ': ' + bad);
      const p = fs.abs(target);
      const dir = await fs.resolve(dirname(p)), nm = p.slice(p.lastIndexOf('/') + 1);
      let body = bytes;
      if (append) {
        try { const old = new Uint8Array(await (await O().readFile(dir.handle, nm)).arrayBuffer()); body = new Uint8Array(old.length + bytes.length); body.set(old); body.set(bytes, old.length); } catch (_) { /* new file */ }
      }
      try { await O().writeFile(dir.handle, nm, new Blob([body])); } catch (e) {
        if (e && e.name === 'NotAllowedError') throw new Error(target + ': Permission needed: run `allow ' + (dir.mount ? dir.mount.name : '<mount>') + '`');
        throw e;
      }
    }
    function show(bytes) {
      if (!bytes.length) return;
      block(dec.decode(bytes).replace(/\n$/, ''));
    }
    async function exec(line) {
      const P = parse(line);
      if (P.error) { err('sh: ' + P.error); return; }
      const ep = ctx.epoch();
      if (P.out) {   // check the target before anything runs
        await fs.S.ready;
        const bad = await fs.redirectCheck(P.out.target);
        if (bad) { err('sh: ' + P.out.target + ': ' + bad); return; }
      }
      let input = null;
      if (P.inp) { try { await fs.S.ready; input = await readIn(P.inp); } catch (e) { err('sh: ' + e.message); return; } }
      for (let s = 0; s < P.stages.length; s++) {
        let words = P.stages[s];
        let name = words[0];
        if (name === 'cd' || name === 'clear' || name === 'exit' || name === 'history' && words[1] === '-c') { err('sh: ' + name + ' cannot be used in a pipe or with a redirect'); return; }
        let argv = null;
        if (name === 'busybox') {
          argv = words.slice(1);
          if (!argv.length) argv = ['busybox', '--help'];
          else if (argv[0].charAt(0) === '-') argv = ['busybox'].concat(argv);
          name = argv[0];
        } else if (name.indexOf('/bin/') === 0) { argv = [name.slice(5)].concat(words.slice(1)); name = argv[0]; }
        else if (SET.has(name)) argv = words;
        if (argv && argv[0] !== 'busybox' && !SET.has(argv[0])) { err(name + ': applet not found (ls /bin lists them)'); return; }
        let r;
        if (!argv) {
          if (!ctx.hasJs(name)) { err(name + ': command not found'); return; }
          const txt = await ctx.capture(name, words.slice(1));
          if (txt === null) { err('sh: ' + name + ": output cannot be piped"); return; }
          r = { out: enc.encode(txt), err: '', code: 0 };
        } else {
          await fs.S.ready;
          const last = s === P.stages.length - 1 && !P.out && ctx.stream;
          let so = null, se = null;
          const onOut = last ? (t) => { if (t) (so || (so = ctx.stream(''))).write(t); } : null;
          const onErr = last ? (t) => { if (t) (se || (se = ctx.stream('err'))).write(t); } : null;
          try {
            let said = false;
            if (!wReady && !wBad && !loading) { dim('(loading BusyBox \u2026)'); said = true; }
            r = wBad ? undefined : await runWorker(argv, input, ep, onOut, onErr);
            if (r === undefined) { if (!loading && !said) dim('(loading BusyBox \u2026)'); r = await runApplet(argv, input, ep); }
            else if (r && last) { if (so) so.end(); if (se) se.end(); r.out = new Uint8Array(0); r.err = ''; }
          } catch (e) {
            if (e && e.message === 'fetch') {
              err(name + ': BusyBox could not be loaded' + (e.file ? ': this browser does not let a page opened as a file (file://) read bin/busybox.wasm.' : '.'));
              dim(e.file ? 'Open the Hub over http(s) (any web server) to use the BusyBox commands. The Terminal\'s own commands (help) still work.' : 'Check the connection, then try again.');
              return;
            }
            err(name + ': ' + (e && e.message ? e.message : 'failed')); return;
          }
          if (!r) return;   // Ctrl+C
        }
        if (r.err) err(r.err.replace(/\n$/, ''));
        if (r.cut) dim(name + ': stopped (' + (r.cut === 'time' ? 'ran longer than 20 s' : r.cut === 'wout' ? 'more than 64 MB of output' : r.cut === 'wpipe' ? 'more than 16 MB into the pipe' : 'more than 4 MB of output') + ')');
        input = r.out;
        if (ctx.epoch() !== ep) return;
      }
      if (P.out) {
        try { await writeOut(P.out.target, input, P.out.op === '>>'); } catch (e) { err('sh: ' + (e && e.message ? e.message : 'write failed')); }
      } else show(input);
    }
    return { applets: APPLETS.slice(), isApplet: (n) => SET.has(n), wants, exec, parse, load, cancel, busy: () => !!wCur };
  }
  window.TermBB = { install, APPLETS };
})();
