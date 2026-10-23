/*
 * Terminal file tree (apps/system/terminal/terminal_fs.js), T2 (+ T3 hook) — the unix-style view of the Hub's drives
 * and the READ commands. Built on the shared code, nothing re-implemented: window.FsDrives
 * (shared/fs/fs_drives.js: list, handle, access, allow), window.FsOps (shared/fs/fs_ops.js: list, readFile,
 * stats) and, for `open <file>`, window.FsRef + window.FileTypes. Read-only: nothing in THIS file writes a
 * file; the commands that change files (T3) live in terminal_wr.js and are plugged in at the end of install().
 *
 * The tree (Jor's definition):
 *   /                        root, holds only `drive`
 *   /drive/                  holds every drive, one folder each (a "mount")
 *   /drive/local/            the Local drive (OPFS); ~ is this folder
 *   /drive/gdrive/           Google Drive (the "hub" folder of it), only when FsDrives.list() has it
 *   /drive/<name>/           each real folder added with "Add folder" in Files; <name> is the drive's
 *                            name made unix-safe (spaces -> _, odd characters -> _) and unique (-2, -3 on a
 *                            clash). name <-> drive id is kept in localStorage 'hub-terminal.mounts'
 *                            so a name stays the same after a reload.
 * Paths are plain strings, normalised by hand (. .. ~), so nothing here depends on the browser's URL rules.
 * A mount that needs the browser's permission (a folder after a reload) answers with
 * "Permission needed: run `allow <mount>`" instead of failing; `allow` asks from the Enter keypress.
 *
 * install(ctx) -> { cmds, init, prompt, complete, openPath }. ctx (from terminal.js): print, err, dim, block,
 * columns, onCwd, hubOpen. Output is text only.
 */
(function () {
  'use strict';
  const HOME = '/drive/local', LIMIT = 1048576, SNIFF = 8192, NODE_CAP = 1500;
  const MAP_KEY = 'hub-terminal.mounts', CWD_KEY = 'hub-terminal.cwd';
  const D = () => window.FsDrives, O = () => window.FsOps;
  const ls_get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const ls_set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* blocked */ } };

  /* ---------- small helpers ---------- */
  const cmpName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
  const byName = (a, b) => ((a.kind === 'directory') === (b.kind === 'directory') ? cmpName(a.name, b.name) : a.kind === 'directory' ? -1 : 1);
  const p2 = (n) => String(n).padStart(2, '0');
  function fmtDate(ms) {
    if (!ms) return '-               ';
    const d = new Date(ms);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function human(n) {
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  }
  function safeName(name) {
    let s = String(name || '').trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/_{2,}/g, '_');
    s = s.replace(/^[._-]+/, '');
    return s || 'folder';
  }
  const join = (a, b) => (a === '/' ? '' : a) + '/' + b;
  const E = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

  /* ---------- mounts: /drive/<name> <-> drive id ---------- */
  async function mounts() {
    const d = D();
    if (!d) return [];
    let list = [];
    try { list = await d.list(); } catch (_) { list = []; }
    let saved = {};
    try { saved = JSON.parse(ls_get(MAP_KEY) || '{}') || {}; } catch (_) { saved = {}; }
    const taken = new Set(['local', 'gdrive']), out = [], map = {};
    list.filter((x) => x.kind === 'local' || x.kind === 'gdrive').forEach((x) => out.push({ name: x.kind === 'local' ? 'local' : 'gdrive', id: x.id, kind: x.kind, label: x.name }));
    const folders = list.filter((x) => x.kind !== 'local' && x.kind !== 'gdrive');
    const nameOf = {};
    folders.forEach((x) => {   // a saved name keeps its folder, as long as it is still free
      const s = saved[x.id];
      if (typeof s === 'string' && s && !taken.has(s)) { taken.add(s); nameOf[x.id] = s; }
    });
    folders.forEach((x) => {
      if (!nameOf[x.id]) {
        const base = safeName(x.name);
        let n = base, i = 2;
        while (taken.has(n)) n = base + '-' + (i++);
        taken.add(n); nameOf[x.id] = n;
      }
    });
    folders.forEach((x) => { map[x.id] = nameOf[x.id]; out.push({ name: nameOf[x.id], id: x.id, kind: x.kind, label: x.name }); });
    if (JSON.stringify(map) !== JSON.stringify(saved)) ls_set(MAP_KEY, JSON.stringify(map));
    return out;
  }
  async function accessOf(m) {
    try { return await D().access(m.id); } catch (_) { return 'denied'; }
  }
  function accessText(m, a) {
    if (m.kind === 'gdrive') return a === 'granted' ? 'granted' : 'sign-in needed';
    return a;
  }

  /* ---------- paths ---------- */
  function norm(p, cwd) {
    p = String(p == null ? '' : p);
    if (p === '~' || p.indexOf('~/') === 0) p = HOME + p.slice(1);
    if (p.charAt(0) !== '/') p = cwd + '/' + p;
    const out = [];
    p.split('/').forEach((s) => { if (!s || s === '.') return; if (s === '..') out.pop(); else out.push(s); });
    return '/' + out.join('/');
  }
  function pretty(abs) {   // ~ abbreviation for the prompt
    if (abs === HOME) return '~';
    if (abs.indexOf(HOME + '/') === 0) return '~' + abs.slice(HOME.length);
    return abs;
  }

  /** abs path -> node { type:'dir'|'file', virtual?, path, name, handle?, dir?, mount?, isMount? }. Throws E(...). */
  async function resolve(abs) {
    const segs = abs.split('/').filter(Boolean);
    if (!segs.length) return { type: 'dir', virtual: true, path: '/', name: '/' };
    if (segs[0] !== 'drive') throw E('ENOENT');
    if (segs.length === 1) return { type: 'dir', virtual: true, path: '/drive', name: 'drive', vdrive: true };
    const ms = await mounts();
    const m = ms.find((x) => x.name === segs[1]);
    if (!m) throw E('ENOENT');
    const acc = await accessOf(m);
    if (acc === 'denied' || (m.kind === 'gdrive' && acc !== 'granted')) throw E('EDRIVE', { mount: m });
    if (acc !== 'granted') throw E('EPERM', { mount: m });
    let h = null;
    try { h = await D().handle(m.id); } catch (_) { h = null; }
    if (!h) throw E('EDRIVE', { mount: m });
    let node = { type: 'dir', path: '/drive/' + m.name, name: m.name, handle: h, mount: m, isMount: true };
    for (let i = 2; i < segs.length; i++) {
      const part = segs[i], parent = node.handle;
      let next = null;
      try { next = { type: 'dir', handle: await parent.getDirectoryHandle(part) }; } catch (e1) {
        if (e1 && e1.name === 'NotAllowedError') throw E('EPERM', { mount: m });
        try { next = { type: 'file', handle: await parent.getFileHandle(part), dir: parent }; } catch (e2) {
          if (e2 && e2.name === 'NotAllowedError') throw E('EPERM', { mount: m });
          throw E('ENOENT');
        }
      }
      if (node.type === 'file') throw E('ENOTDIR');
      node = Object.assign(next, { path: join(node.path, part), name: part, mount: m });
      if (node.type === 'file' && i < segs.length - 1) throw E('ENOTDIR');
    }
    return node;
  }

  /** Entries of a directory node: [{ name, kind, size, modified, handle?, mount?, virtual? }], dirs first. */
  async function entries(node) {
    if (node.path === '/') return [{ name: 'drive', kind: 'directory', size: 0, modified: 0, virtual: true }];
    if (node.vdrive) return (await mounts()).map((m) => ({ name: m.name, kind: 'directory', size: 0, modified: 0, virtual: true, mount: m }));
    try { return (await O().list(node.handle)).sort(byName); } catch (e) {
      if (e && e.name === 'NotAllowedError') throw E('EPERM', { mount: node.mount });
      throw e;
    }
  }
  async function childNode(parent, e) {
    const path = join(parent.path, e.name);
    if (e.virtual) return resolve(path);
    return { type: e.kind === 'directory' ? 'dir' : 'file', path, name: e.name, handle: e.handle, dir: parent.handle, mount: parent.mount };
  }

  /* ---------- text files ---------- */
  async function readText(node) {
    const file = await O().readFile(node.dir, node.name);
    if (file.size > LIMIT) throw E('EBIG', { size: file.size });
    const buf = new Uint8Array(await file.arrayBuffer());
    for (let i = 0, n = Math.min(buf.length, SNIFF); i < n; i++) if (buf[i] === 0) throw E('EBIN');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { throw E('EBIN'); }
    return { text, size: file.size, file };
  }
  const lines = (t) => { const a = t.split('\n'); if (a.length && a[a.length - 1] === '') a.pop(); return a; };

  /* ---------- install ---------- */
  function install(ctx) {
    const S = { cwd: HOME, old: '', ready: null };
    const { print, err, dim, block } = ctx;
    const setCwd = (p) => { S.cwd = p; ls_set(CWD_KEY, p); ctx.onCwd(); };

    /** One error line for a failed path. what: 'ls' has its own wording. */
    function fail(cmd, arg, e, how) {
      const c = e && e.code;
      if (c === 'ENOENT') err(cmd + ': ' + (how === 'access' ? 'cannot access \'' + arg + '\'' : arg) + ': No such file or directory');
      else if (c === 'ENOTDIR') err(cmd + ': ' + (how === 'access' ? 'cannot access \'' + arg + '\'' : arg) + ': Not a directory');
      else if (c === 'EPERM' || (e && e.name === 'NotAllowedError')) {
        const m = e.mount;
        err(cmd + ': ' + arg + ': Permission needed: run `allow ' + (m ? m.name : '<mount>') + '`');
      } else if (c === 'EDRIVE') {
        const m = e.mount;
        err(cmd + ': ' + arg + ': ' + (m && m.kind === 'gdrive' ? 'Google Drive is not connected (sign in from the Files app)' : m && m.kind === 'local' ? 'Local storage is not available here (browsers block it on file://; open the Hub over http or https)' : 'that drive is not available'));
      } else if (c === 'EBIG') err(cmd + ': ' + arg + ': file too large (' + human(e.size) + ', limit 1 MB)');
      else if (c === 'EBIN') err(cmd + ': ' + arg + ': binary or not UTF-8 text, not shown');
      else err(cmd + ': ' + arg + ': ' + (e && e.message ? e.message : 'input/output error'));
    }
    const abs = (p) => norm(p, S.cwd);

    /** -abc style flags. Returns { set, rest } or null (after printing the error). */
    function flags(cmd, args, allowed) {
      const set = new Set(), rest = [];
      let end = false;
      for (const a of args) {
        if (end || a === '-' || a.charAt(0) !== '-') { rest.push(a); continue; }
        if (a === '--') { end = true; continue; }
        for (const ch of a.slice(1)) {
          if (allowed.indexOf(ch) < 0) { err(cmd + ": invalid option -- '" + ch + "'"); return null; }
          set.add(ch);
        }
      }
      return { set, rest };
    }
    /** head / tail: [-n N | -nN | -N] files. */
    function countArgs(cmd, args) {
      let n = 10;
      const files = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        let m;
        if (a === '-n') {
          if (i + 1 >= args.length) { err(cmd + ": option requires an argument -- 'n'"); return null; }
          n = args[++i];
        } else if ((m = /^-n(.+)$/.exec(a)) || (m = /^-(\d+)$/.exec(a))) n = m[1];
        else { files.push(a); continue; }
        if (!/^\d+$/.test(String(n))) { err(cmd + ': invalid number of lines: \'' + n + '\''); return null; }
        n = parseInt(n, 10);
      }
      return { n, files };
    }

    const ready = (fn) => async function () { await S.ready; return fn.apply(this, arguments); };

    /** size / modified / type of a file node, without downloading it (Google Drive: .meta). */
    async function fileInfo(node) {
      const h = node.handle;
      if (h.meta) return { size: h.meta.size || 0, modified: h.meta.modified || 0, type: h.meta.type || '' };
      const f = await h.getFile();
      return { size: f.size, modified: f.lastModified, type: f.type || '' };
    }
    const sizeText = (e, hum) => (e.kind === 'directory' ? '-' : hum ? human(e.size) : String(e.size));
    const nameOut = (e) => e.name + (e.kind === 'directory' ? '/' : '');

    async function lsShow(list, withDots, long, hum) {
      if (withDots) list = [{ name: '.', kind: 'directory', size: 0, modified: 0 }, { name: '..', kind: 'directory', size: 0, modified: 0 }].concat(list);
      if (!list.length) return;
      if (!long) { print(ctx.columns(list.map(nameOut))); return; }
      const w = Math.max.apply(null, list.map((e) => sizeText(e, hum).length));
      const rows = [];
      for (const e of list) {
        let extra = '';
        if (e.mount) extra = '   (' + e.mount.label + ', ' + e.mount.kind + ', ' + accessText(e.mount, await accessOf(e.mount)) + ')';
        rows.push((e.kind === 'directory' ? 'd' : '-') + '  ' + sizeText(e, hum).padStart(w) + '  ' + fmtDate(e.modified) + '  ' + nameOut(e) + extra);
      }
      print(rows.join('\n'));
    }

    /** the text of each file argument; the callback gets (text, file, arg). Errors are printed per file. */
    async function eachText(cmd, files, fn) {
      let ok = true;
      for (const a of files) {
        try {
          const node = await resolve(abs(a));
          if (node.type === 'dir') { err(cmd + ': ' + a + ': Is a directory'); ok = false; continue; }
          const r = await readText(node);
          await fn(r.text, r, a);
        } catch (e) { ok = false; fail(cmd, a, e); }
      }
      return ok;
    }

    const cmds = {
      pwd() { print(S.cwd); },
      cd: ready(async (args) => {
        if (args.length > 1) { err('cd: too many arguments'); return; }
        let t = args[0];
        const dash = t === '-';
        if (t === undefined) t = '~';
        else if (dash) { if (!S.old) { err('cd: OLDPWD not set'); return; } t = S.old; }
        const target = abs(t);
        try {
          const node = await resolve(target);
          if (node.type !== 'dir') { err('cd: ' + t + ': Not a directory'); return; }
          if (target !== S.cwd) S.old = S.cwd;
          setCwd(target);
          if (dash) print(target);
        } catch (e) { fail('cd', t, e); }
      }),
      ls: ready(async (args) => {
        const f = flags('ls', args, 'laAh');
        if (!f) return;
        const long = f.set.has('l'), all = f.set.has('a') || f.set.has('A'), hum = f.set.has('h');
        const targets = f.rest.length ? f.rest : ['.'];
        const files = [], dirs = [];
        for (const t of targets) {
          try {
            const node = await resolve(abs(t));
            if (node.type === 'dir') dirs.push({ t, node });
            else files.push({ name: t, kind: 'file', ...(await fileInfo(node)) });
          } catch (e) { fail('ls', t, e, 'access'); }
        }
        if (files.length) await lsShow(files.sort((a, b) => cmpName(a.name, b.name)), false, long, hum);
        let first = !files.length;
        for (const d of dirs) {
          try {
            let list = await entries(d.node);
            if (!all) list = list.filter((e) => e.name.charAt(0) !== '.');
            if (targets.length > 1) { if (!first) print(''); print(d.t + ':'); }
            first = false;
            await lsShow(list, all && !d.node.virtual, long, hum);
          } catch (e) { fail('ls', d.t, e, 'access'); }
        }
      }),
      cat: ready(async (args) => {
        if (!args.length) { err('usage: cat <file> [file...]'); return; }
        await eachText('cat', args, (text) => { block(text.replace(/\n$/, '')); });
      }),
      head: ready(async (args) => {
        const c = countArgs('head', args);
        if (!c) return;
        if (!c.files.length) { err('usage: head [-n N] <file> [file...]'); return; }
        await eachText('head', c.files, (text, r, a) => {
          if (c.files.length > 1) print('==> ' + a + ' <==');
          block(lines(text).slice(0, c.n).join('\n'));
        });
      }),
      tail: ready(async (args) => {
        const c = countArgs('tail', args);
        if (!c) return;
        if (!c.files.length) { err('usage: tail [-n N] <file> [file...]'); return; }
        await eachText('tail', c.files, (text, r, a) => {
          if (c.files.length > 1) print('==> ' + a + ' <==');
          const l = lines(text);
          block(c.n ? l.slice(-c.n).join('\n') : '');
        });
      }),
      wc: ready(async (args) => {
        const f = flags('wc', args, 'lwc');
        if (!f) return;
        if (!f.rest.length) { err('usage: wc [-l] [-w] [-c] <file> [file...]'); return; }
        const want = f.set.size ? f.set : new Set(['l', 'w', 'c']);
        const rows = [], tot = { l: 0, w: 0, c: 0 };
        await eachText('wc', f.rest, (text, r, a) => {
          const v = { l: (text.match(/\n/g) || []).length, w: (text.match(/\S+/g) || []).length, c: r.size };
          Object.keys(v).forEach((k) => { tot[k] += v[k]; });
          rows.push({ v, a });
        });
        if (rows.length > 1) rows.push({ v: tot, a: 'total' });
        const w = Math.max(1, ...rows.map((r) => Math.max(...['l', 'w', 'c'].filter((k) => want.has(k)).map((k) => String(r.v[k]).length))));
        rows.forEach((r) => print(['l', 'w', 'c'].filter((k) => want.has(k)).map((k) => String(r.v[k]).padStart(w)).join(' ') + ' ' + r.a));
      }),
      tree: ready(async (args) => {
        let depth = 2, all = false;
        const paths = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          let m;
          if (a === '-a') all = true;
          else if (a === '-L') {
            if (!/^\d+$/.test(args[i + 1] || '')) { err('tree: Missing argument to -L option.'); return; }
            depth = parseInt(args[++i], 10);
          } else if ((m = /^-L(\d+)$/.exec(a))) depth = parseInt(m[1], 10);
          else if (a.charAt(0) === '-' && a.length > 1) { err("tree: invalid option -- '" + a.replace(/^-+/, '') + "'"); return; }
          else paths.push(a);
        }
        if (depth < 1) { err('tree: Invalid level, must be greater than 0.'); return; }
        const t = paths[0] || '.';
        let root;
        try { root = await resolve(abs(t)); } catch (e) { fail('tree', t, e, 'access'); return; }
        const out = [t === '.' ? '.' : t + (root.type === 'dir' ? '' : '')];
        const cnt = { d: 0, f: 0, n: 0, cut: false };
        async function walk(node, prefix, level) {
          let list;
          try { list = await entries(node); } catch (e) {
            out.push(prefix + '\u2514\u2500\u2500 [' + (e.code === 'EPERM' ? 'permission needed: run `allow ' + (e.mount ? e.mount.name : '') + '`' : 'cannot read') + ']');
            return;
          }
          if (!all) list = list.filter((e) => e.name.charAt(0) !== '.');
          for (let i = 0; i < list.length; i++) {
            if (cnt.n >= NODE_CAP) { cnt.cut = true; return; }
            cnt.n++;
            const e = list[i], last = i === list.length - 1, isDir = e.kind === 'directory';
            out.push(prefix + (last ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ') + nameOut(e));
            if (isDir) cnt.d++; else cnt.f++;
            if (isDir && level < depth) {
              let child;
              try { child = await childNode(node, e); } catch (er) {
                out.push(prefix + (last ? '    ' : '\u2502   ') + '\u2514\u2500\u2500 [' + (er.code === 'EPERM' ? 'permission needed: run `allow ' + (er.mount ? er.mount.name : '') + '`' : er.mount && er.mount.kind === 'gdrive' ? 'not connected: sign in from Files' : 'not available') + ']');
                continue;
              }
              await walk(child, prefix + (last ? '    ' : '\u2502   '), level + 1);
              if (cnt.cut) return;
            }
          }
        }
        if (root.type === 'dir') await walk(root, '', 1);
        out.push('');
        out.push(cnt.d + (cnt.d === 1 ? ' directory, ' : ' directories, ') + cnt.f + (cnt.f === 1 ? ' file' : ' files') + (cnt.cut ? ' (output limited to ' + NODE_CAP + ' entries)' : ''));
        block(out.join('\n'));
      }),
      stat: ready(async (args) => {
        if (!args.length) { err('usage: stat <path> [path...]'); return; }
        for (const a of args) {
          try {
            const node = await resolve(abs(a));
            const rows = ['  File: ' + node.path];
            if (node.type === 'file') {
              const i = await fileInfo(node);
              rows.push('  Type: regular file' + (i.type ? ' (' + i.type + ')' : ''), '  Size: ' + i.size + ' bytes (' + human(i.size) + ')', 'Modify: ' + (i.modified ? fmtDate(i.modified) + ':' + p2(new Date(i.modified).getSeconds()) : '-'));
            } else {
              rows.push('  Type: ' + (node.isMount ? 'directory (mount)' : node.virtual ? 'directory (virtual)' : 'directory'));
              const l = await entries(node);
              const nd = l.filter((e) => e.kind === 'directory').length;
              rows.push('  Items: ' + l.length + ' (' + nd + ' folders, ' + (l.length - nd) + ' files)');
            }
            if (node.mount) rows.push(' Mount: ' + node.mount.name + ' (' + node.mount.label + ', ' + node.mount.kind + ', ' + accessText(node.mount, await accessOf(node.mount)) + ')');
            print(rows.join('\n'));
          } catch (e) { fail('stat', a, e, 'access'); }
        }
      }),
      drives: ready(async () => {
        const ms = await mounts();
        if (!ms.length) { dim('(no drives: this browser has no private storage)'); return; }
        const rows = [], need = [];
        for (const m of ms) {
          const a = accessText(m, await accessOf(m));
          if (a !== 'granted' && m.kind !== 'gdrive') need.push(m.name);
          rows.push(['/drive/' + m.name, m.kind, a, m.label]);
        }
        const head = ['MOUNT', 'KIND', 'ACCESS', 'NAME'];
        const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
        print([head].concat(rows).map((r) => r.map((c, i) => (i === 3 ? c : c.padEnd(w[i]))).join('  ')).join('\n'));
        need.forEach((n) => dim('Permission needed: run `allow ' + n + '`'));
      }),
      allow: ready(async (args) => {
        if (args.length !== 1) { err('usage: allow <mount>   (see `drives`)'); return; }
        const n = args[0].replace(/^\/?(drive\/)?/, '').replace(/\/+$/, '');
        const m = (await mounts()).find((x) => x.name === n);
        if (!m) { err('allow: ' + args[0] + ': no such mount (see `drives`)'); return; }
        if (await accessOf(m) === 'granted') { print(m.name + ': already allowed'); return; }
        if (m.kind === 'gdrive') { err('allow: Google Drive is not connected. Sign in from the Files app, then try again.'); return; }
        const go = async () => {
          const ok = await D().allow(m.id);
          const now = await accessOf(m);
          if (ok && now === 'granted') print(m.name + ': access allowed');
          else err('allow: ' + m.name + ': not allowed (' + now + '). Click the button below to try again.');
          return ok;
        };
        const ua = navigator.userActivation;
        if (ua && !ua.isActive) {   // no fresh key / click (e.g. keys relayed by the Hub): the browser needs a real click
          dim('The browser wants a click for this:');
          ctx.button('Allow ' + m.name, go);
          return;
        }
        const ok = await go();
        if (!ok) ctx.button('Allow ' + m.name, go);
      }),
    };

    /* ---------- open <file | folder> (Viewer / Notely / Files, same hand-offs as the Files app) ---------- */
    async function openPath(arg) {
      let node;
      try { node = await resolve(abs(arg)); } catch (e) { fail('open', arg, e); return; }
      const mountId = node.mount ? node.mount.id : '';
      const rel = node.mount ? node.path.slice(('/drive/' + node.mount.name).length).replace(/^\/+/, '') : '';
      if (node.type === 'dir') {
        if (!mountId) { ctx.hubOpen('apps/system/files/', null, 'Files'); return; }
        ctx.hubOpen('apps/system/files/', 'drive=' + encodeURIComponent(mountId) + (rel ? '&path=' + encodeURIComponent(rel) : ''), 'Files');
        return;
      }
      const FT = window.FileTypes, FR = window.FsRef;
      const kind = FT ? FT.kind(node.name) : '';
      const parentRel = rel.split('/').slice(0, -1).join('/');
      if (kind === 'image' || kind === 'video') {
        if (!FR) { err('open: file hand-off is not available here'); return; }
        FR.openIn('apps/system/viewer/', { drive: mountId, path: parentRel, name: node.name });
        print('Opening ' + node.name + ' in Viewer \u2026');
      } else if (kind === 'text') {
        try {
          const r = await readText(node);
          if (r.size > 2 * 1024 * 1024) throw E('EBIG', { size: r.size });
          sessionStorage.setItem('notely-handoff', JSON.stringify({ name: node.name, text: r.text, t: Date.now() }));
          ctx.hubOpen('apps/office/notely/', null, 'Notely');
        } catch (e) { fail('open', arg, e); }
      } else err('open: ' + arg + ': no app opens this kind of file');
    }

    /* ---------- Tab completion for paths ---------- */
    const esc = (n) => n.replace(/([\\\s'"])/g, '\\$1');
    /** raw = the word as typed (maybe quoted / escaped). Returns { keep, hits }: keep = the typed part
        before the name being completed, hits = full replacements for the rest ('dir/' ends with '/'). */
    async function completePath(raw, dirsOnly) {
      const q = raw.charAt(0) === '"' || raw.charAt(0) === "'" ? raw.charAt(0) : '';
      const body = q ? raw.slice(1) : raw;
      const slash = body.lastIndexOf('/');
      const dirRaw = body.slice(0, slash + 1), partRaw = body.slice(slash + 1);
      const unesc = (s) => (q ? s : s.replace(/\\(.)/g, '$1'));
      const part = unesc(partRaw), dirPath = unesc(dirRaw);
      if (!dirPath && part.charAt(0) === '~' && part.indexOf('/') < 0) return { keep: q, hits: part === '~' ? ['~/'] : [] };
      let node;
      try { node = await resolve(abs(dirPath || '.')); } catch (_) { return { keep: q + dirRaw, hits: [] }; }
      if (node.type !== 'dir') return { keep: q + dirRaw, hits: [] };
      let list;
      try { list = await entries(node); } catch (_) { return { keep: q + dirRaw, hits: [] }; }
      const lo = part.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().indexOf(lo) === 0 && (part.charAt(0) === '.' || e.name.charAt(0) !== '.') && (!dirsOnly || e.kind === 'directory'));
      return { keep: q + dirRaw, hits: list.map((e) => (q ? e.name : esc(e.name)) + (e.kind === 'directory' ? '/' : '')) };
    }
    async function completeMount(word) {
      return (await mounts()).map((m) => m.name).filter((n) => n.toLowerCase().indexOf(word.toLowerCase()) === 0);
    }

    async function init() {
      let saved = ls_get(CWD_KEY) || '';
      const tryDir = async (p) => { const n = await resolve(p); return n.type === 'dir'; };
      let cwd = HOME;
      if (saved && saved.charAt(0) === '/') {
        try { if (await tryDir(saved)) cwd = saved; } catch (e) { if (e && e.code === 'EPERM') cwd = saved; }   // needs permission: cannot check, keep
      }
      if (cwd === HOME) { try { await tryDir(HOME); } catch (_) { cwd = '/'; } }
      S.cwd = cwd; ls_set(CWD_KEY, cwd); ctx.onCwd();
    }
    S.ready = init().catch(() => { S.cwd = '/'; ctx.onCwd(); });

    const api = { cmds, S, openPath, completePath, completeMount, prompt: () => pretty(S.cwd), resolve, entries, mounts, norm,
      childNode, readText, abs, fail, flags, ready, pretty, setCwd, E, join, human, ctx };
    /* T3: the commands that change files + find / grep (terminal_wr.js) */
    if (window.TermWr) {
      const w = window.TermWr.install(api);
      Object.assign(cmds, w.cmds);
      api.redirectCheck = w.redirectCheck; api.redirect = w.redirect;
    }
    return api;
  }
  window.TermFs = { install, HOME, _t: { norm, safeName, human } };
})();
