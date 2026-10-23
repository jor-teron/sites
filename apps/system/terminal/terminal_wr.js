/*
 * Terminal file changes + search (apps/system/terminal/terminal_wr.js), T3 — the commands that CHANGE files
 * (mkdir touch cp mv rm rmdir edit), the file side of the > and >> redirects, and the search commands
 * (find grep). Plugs into terminal_fs.js: TermFs.install() calls TermWr.install(api) with its own helpers
 * (resolve, entries, readText, fail, flags, ...) and merges the returned commands. Nothing is re-implemented:
 * the work is done by FsOps (shared/fs/fs_ops.js: mkdir, writeFile, copy, move, remove, stats, inside,
 * validName) on the drive handles, so Local (OPFS), picked folders and the Google Drive mount all behave the
 * same. No shared code is changed.
 *
 * Safety:
 *   - paths are normalised by hand (. .. ~) and clamp at /, so nothing can leave /drive/<mount>; every
 *     operation goes through a mount's directory handle (never through a URL or a string path)
 *   - / , /drive , every mount root (~ is /drive/local) and . / .. can never be removed or moved; the current
 *     folder (or one above it) cannot be removed
 *   - cp / mv never overwrite silently: they ask y/n (ctx.ask) unless -f; rm of a folder (-r) asks unless -f
 *   - a mount without read-write permission answers "Permission needed: run `allow <mount>`" (FsDrives.allow
 *     already asks for readwrite); a write the browser refuses later maps to the same message
 *   - real host folders have no trash: a removed file is gone
 * Output is text only.
 */
(function () {
  'use strict';
  const LIMIT = 1048576, MAX_LINES = 200, SCAN_CAP = 20000, FILE_CAP = 3000, LINE_CAP = 300;
  const O = () => window.FsOps;

  function install(api) {
    const { S, resolve, entries, readText, abs, fail, flags, ready, E, join, human, ctx } = api;
    const { print, err, dim } = ctx;
    const segsOf = (a) => a.split('/').filter(Boolean);
    const dirname = (a) => '/' + segsOf(a).slice(0, -1).join('/');
    const base = (a) => segsOf(a).slice(-1)[0] || '';
    const isNA = (e) => !!e && e.name === 'NotAllowedError';
    const shownPath = (a) => api.pretty(a);

    /* ---------- errors ---------- */
    function msgOf(e) {
      const c = e && e.code;
      if (c === 'EPERM' || isNA(e)) return 'Permission needed: run `allow ' + (e.mount ? e.mount.name : '<mount>') + '`';
      if (c === 'ENOENT') return 'No such file or directory';
      if (c === 'ENOTDIR') return 'Not a directory';
      if (c === 'EEXIST') return 'File exists';
      if (c === 'EISDIR') return 'Is a directory';
      if (c === 'ENOTEMPTY') return 'Directory not empty';
      if (c === 'EACCES') return 'Permission denied' + (e.text ? ' (' + e.text + ')' : '');
      if (c === 'EBADNAME') return 'Invalid name (' + e.text + ')';
      if (c === 'EBIG') return 'file too large (' + human(e.size) + ', limit 1 MB)';
      if (c === 'EBIN') return 'binary or not UTF-8 text';
      if (c === 'EDRIVE') {
        const m = e.mount;
        return m && m.kind === 'gdrive' ? 'Google Drive is not connected (sign in from the Files app)'
          : m && m.kind === 'local' ? 'Local storage is not available here (browsers block it on file://; open the Hub over http or https)' : 'that drive is not available';
      }
      if (e && e.name === 'QuotaExceededError') return 'No space left on the drive';
      return e && e.message ? e.message : 'input/output error';
    }
    const OWN = new Set(['EEXIST', 'EISDIR', 'ENOTEMPTY', 'EACCES', 'EBADNAME', 'ESAME']);
    function werr(cmd, arg, e, how) {
      if (e && (OWN.has(e.code) || e.name === 'QuotaExceededError')) err(cmd + ': ' + arg + ': ' + msgOf(e));
      else fail(cmd, arg, e, how);
    }
    /** run a write on a mount: a refusal by the browser becomes "Permission needed" */
    async function guard(mount, fn) {
      try { return await fn(); } catch (e) {
        if (isNA(e)) throw E('EPERM', { mount });
        throw e;
      }
    }

    /* ---------- path helpers ---------- */
    /** 'virtual' for / and /drive, 'root' for a mount root (/drive/<name>, ~ is /drive/local), '' otherwise */
    function special(a) {
      if (a === '/' || a === '/drive') return 'virtual';
      const s = segsOf(a);
      return s.length === 2 && s[0] === 'drive' ? 'root' : '';
    }
    /** an existing real folder (not / or /drive): { handle, mount, path } */
    async function realDir(a) {
      const n = await resolve(a);
      if (n.virtual) throw E('EACCES', { text: 'only the folders under /drive/<drive> can be changed' });
      if (n.type !== 'dir') throw E('ENOTDIR');
      return n;
    }
    /** { node, parent, name } of an existing path; parent is null for / , /drive and mount roots */
    async function locate(a) {
      const node = await resolve(a);
      if (node.virtual || node.isMount) return { node, parent: null, name: node.name };
      return { node, parent: await resolve(dirname(a)), name: node.name };
    }
    /** 'dir' | 'file' | null for one name inside a folder handle */
    async function kindOf(h, name) {
      try { await h.getDirectoryHandle(name); return 'dir'; } catch (e1) { if (isNA(e1)) throw e1; }
      try { await h.getFileHandle(name); return 'file'; } catch (e2) { if (isNA(e2)) throw e2; }
      return null;
    }
    function checkName(name) {
      const why = O().validName(name);
      if (why) throw E('EBADNAME', { text: why });
    }
    const inCwd = (a) => S.cwd === a || S.cwd.indexOf(a === '/' ? '/' : a + '/') === 0;
    const ask = (q) => (ctx.ask ? ctx.ask(q) : Promise.resolve(false));

    /* ---------- mkdir ---------- */
    async function mkdirP(a) {
      const s = segsOf(a);
      if (s[0] !== 'drive' || s.length < 2) throw E('EACCES', { text: 'only /drive/<drive> can hold folders' });
      let cur = await realDir('/drive/' + s[1]), path = '/drive/' + s[1];
      for (let i = 2; i < s.length; i++) {
        const name = s[i];
        checkName(name);
        const k = await kindOf(cur.handle, name);
        if (k === 'file') throw E('ENOTDIR');
        const h = k ? await cur.handle.getDirectoryHandle(name) : await guard(cur.mount, () => cur.handle.getDirectoryHandle(name, { create: true }));
        path = join(path, name);
        cur = { type: 'dir', handle: h, mount: cur.mount, path, name };
      }
    }
    const mkdir = ready(async (args) => {
      const f = flags('mkdir', args, 'p');
      if (!f) return;
      if (!f.rest.length) { err('usage: mkdir [-p] <folder> [folder...]'); return; }
      const p = f.set.has('p');
      for (const a of f.rest) {
        const w = "cannot create directory '" + a + "'";
        try {
          const t = abs(a);
          if (special(t) === 'virtual' || (special(t) === 'root' && p)) { if (!p) throw E('EEXIST'); continue; }
          if (p) { await mkdirP(t); continue; }
          const sp = segsOf(t);
          if (sp[0] !== 'drive' || sp.length < 3) {
            try { await resolve(t); throw E('EEXIST'); } catch (e0) { if (e0.code === 'EEXIST') throw e0; }
            throw E('EACCES', { text: 'drives come from the Files app (Add folder), folders go inside them' });
          }
          const parent = await realDir(dirname(t)), name = base(t);
          if (await kindOf(parent.handle, name)) throw E('EEXIST');
          checkName(name);
          await guard(parent.mount, () => O().mkdir(parent.handle, name));
        } catch (e) { werr('mkdir', w, e); }
      }
    });

    /* ---------- touch ---------- */
    const touch = ready(async (args) => {
      if (!args.length) { err('usage: touch <file> [file...]'); return; }
      for (const a of args) {
        const w = "cannot touch '" + a + "'";
        try {
          const t = abs(a);
          try { await resolve(t); continue; } catch (e0) { if (e0.code !== 'ENOENT') throw e0; }   // exists: nothing to do
          const parent = await realDir(dirname(t)), name = base(t);
          checkName(name);
          await guard(parent.mount, () => O().writeFile(parent.handle, name, new Blob([])));
        } catch (e) { werr('touch', w, e); }
      }
    });

    /* ---------- cp / mv ---------- */
    async function transfer(cmd, args) {
      const mv = cmd === 'mv';
      const f = flags(cmd, args, mv ? 'f' : 'rRf');
      if (!f) return;
      const force = f.set.has('f'), rec = f.set.has('r') || f.set.has('R');
      if (f.rest.length < 2) { err('usage: ' + cmd + (mv ? '' : ' [-r]') + ' [-f] <source>... <dest>'); return; }
      const destArg = f.rest[f.rest.length - 1], srcArgs = f.rest.slice(0, -1);
      const destAbs = abs(destArg);
      let destNode = null;
      try { destNode = await resolve(destAbs); } catch (e) { if (e.code !== 'ENOENT') { werr(cmd, destArg, e); return; } }
      if (destNode && destNode.virtual) { err(cmd + ": cannot create in '" + destArg + "': Permission denied (copy into /drive/<drive>)"); return; }
      const into = !!(destNode && destNode.type === 'dir');
      if (srcArgs.length > 1 && !into) { err(cmd + ": target '" + destArg + "' is not a directory"); return; }
      for (const a of srcArgs) {
        const sAbs = abs(a);
        try {
          const s = await locate(sAbs);
          if (s.node.virtual) throw E('EACCES', { text: "'" + a + "' only lists the drives, it is not a real folder" });
          if (mv && s.node.isMount) throw E('EACCES', { text: "'" + a + "' is the root of the drive '" + s.node.mount.name + "', it cannot be moved" });
          if (s.node.type === 'dir' && !mv && !rec) { err("cp: -r not specified; omitting directory '" + a + "'"); continue; }
          let tDir, tName, tAbs;
          if (into) { tDir = destNode; tName = s.name; tAbs = join(destAbs, s.name); }
          else { tDir = await realDir(dirname(destAbs)); tName = base(destAbs); tAbs = destAbs; }
          checkName(tName);
          const shown = into ? (destArg.replace(/\/+$/, '') || '/') + (destArg === '/' ? '' : '/') + tName : destArg;
          if (tAbs === sAbs) throw E('ESAME', {});
          if (s.node.type === 'dir' && (tAbs.indexOf(sAbs + '/') === 0 || tDir.path === sAbs || await O().inside(s.node.handle, tDir.handle))) {
            err(cmd + ": cannot " + (mv ? 'move' : 'copy') + " a directory into itself: '" + a + "' to '" + shown + "'"); continue;
          }
          const tk = await kindOf(tDir.handle, tName);
          let removeFirst = false;
          if (tk) {
            const sDir = s.node.type === 'dir';
            if (!sDir && tk === 'dir') { err(cmd + ": cannot overwrite directory '" + shown + "' with a file"); continue; }
            if (sDir && tk === 'file') { err(cmd + ": cannot overwrite file '" + shown + "' with a directory"); continue; }
            if (sDir && mv) {
              const t = await childOf(tDir, tName);
              if ((await entries(t)).length) { err('mv: cannot move \'' + a + '\' to \'' + shown + '\': Directory not empty'); continue; }
              removeFirst = true;
            }
            if (!force) {
              const q = !sDir ? cmd + ": overwrite '" + shown + "'? (y/n)"
                : cmd + ": '" + shown + "' already exists. Merge into it, same-name files are overwritten? (y/n)";
              if (mv && sDir) { if (!(await ask(cmd + ": replace the empty directory '" + shown + "'? (y/n)"))) { dim(cmd + ": '" + a + "' not moved"); continue; } }
              else if (!(await ask(q))) { dim(cmd + ": '" + shown + "' not overwritten"); continue; }
            }
          }
          if (removeFirst) await guard(tDir.mount, () => O().remove(tDir.handle, { name: tName, kind: 'directory' }));
          if (mv) {
            await guard(tDir.mount, () => O().move(s.node.handle, s.parent.handle, tDir.handle, tName));
            if (inCwd(sAbs)) api.setCwd(tAbs + S.cwd.slice(sAbs.length));
          } else await guard(tDir.mount, () => O().copy(s.node.handle, tDir.handle, tName));
        } catch (e) {
          if (e && e.code === 'ESAME') err(cmd + ": '" + a + "' and '" + destArg + "' are the same file");
          else werr(cmd, (mv ? "cannot move '" : "cannot copy '") + a + "'", e);
        }
      }
    }
    async function childOf(dirNode, name) {
      const h = await dirNode.handle.getDirectoryHandle(name);
      return { type: 'dir', handle: h, path: join(dirNode.path, name), name, mount: dirNode.mount };
    }

    /* ---------- rm / rmdir ---------- */
    /** the refusals shared by rm and rmdir; returns a message or '' */
    function refuseRemove(cmd, raw, a) {
      if (/(^|\/)\.\.?\/*$/.test(raw)) return "refusing to remove '.' or '..': '" + raw + "'";
      const sp = special(a);
      if (sp === 'virtual') return "cannot remove '" + raw + "': it only lists the drives, it is not a real folder";
      if (sp === 'root') return "refusing to remove '" + raw + "': it is the root of the drive '" + segsOf(a)[1] + "'. Remove what is inside instead";
      if (inCwd(a)) return "cannot remove '" + raw + "': it is the current directory or contains it, cd out first";
      return '';
    }
    const rm = ready(async (args) => {
      const f = flags('rm', args, 'rRf');
      if (!f) return;
      const force = f.set.has('f'), rec = f.set.has('r') || f.set.has('R');
      if (!f.rest.length) { if (!force) err('usage: rm [-r] [-f] <path> [path...]'); return; }
      for (const raw of f.rest) {
        const a = abs(raw);
        const bad = refuseRemove('rm', raw, a);
        if (bad) { err('rm: ' + bad); continue; }
        try {
          let s;
          try { s = await locate(a); } catch (e0) { if (force && e0.code === 'ENOENT') continue; throw e0; }
          const isDir = s.node.type === 'dir';
          if (isDir && !rec) { err("rm: cannot remove '" + raw + "': Is a directory (use -r)"); continue; }
          if (isDir && !force) {
            const st = await O().stats(s.node.handle);
            const what = st.files || st.folders ? st.files + ' file' + (st.files === 1 ? '' : 's') + ', ' + st.folders + ' folder' + (st.folders === 1 ? '' : 's') + ', ' + human(st.bytes) : 'empty';
            if (!(await ask("rm: remove directory '" + raw + "' and everything in it (" + what + ")? There is no trash, this cannot be undone. (y/n)"))) { dim("rm: '" + raw + "' not removed"); continue; }
          }
          await guard(s.parent.mount, () => O().remove(s.parent.handle, { name: s.name, kind: isDir ? 'directory' : 'file' }));
        } catch (e) { werr('rm', "cannot remove '" + raw + "'", e); }
      }
    });
    const rmdir = ready(async (args) => {
      if (!args.length) { err('usage: rmdir <folder> [folder...]'); return; }
      for (const raw of args) {
        const a = abs(raw);
        const bad = refuseRemove('rmdir', raw, a);
        if (bad) { err('rmdir: ' + bad); continue; }
        const w = "failed to remove '" + raw + "'";
        try {
          const s = await locate(a);
          if (s.node.type !== 'dir') throw E('ENOTDIR');
          if ((await entries(s.node)).length) throw E('ENOTEMPTY');
          await guard(s.parent.mount, () => O().remove(s.parent.handle, { name: s.name, kind: 'directory' }));
        } catch (e) { werr('rmdir', w, e); }
      }
    });

    /* ---------- writing text (redirects, edit) ---------- */
    /** Check that "> target" can work, before the command runs. '' = ok, else the reason. */
    async function redirectCheck(arg) {
      try {
        const t = abs(arg);
        const sp = special(t);
        if (sp) throw E('EISDIR');
        const parent = await realDir(dirname(t));
        const name = base(t);
        checkName(name);
        if ((await kindOf(parent.handle, name)) === 'dir') throw E('EISDIR');
        return '';
      } catch (e) { return msgOf(e); }
    }
    /** write text to a file (append = add to the end). Throws E(...). Returns the byte count. */
    async function putText(arg, text, append) {
      const t = abs(arg);
      if (special(t)) throw E('EISDIR');
      const parent = await realDir(dirname(t)), name = base(t);
      checkName(name);
      const k = await kindOf(parent.handle, name);
      if (k === 'dir') throw E('EISDIR');
      let body = text;
      if (append && k === 'file') body = (await readText(await resolve(t))).text + text;
      const blob = new Blob([body], { type: 'text/plain' });
      await guard(parent.mount, () => O().writeFile(parent.handle, name, blob));
      return blob.size;
    }
    async function redirect(arg, text, append) {
      try { await putText(arg, text, append); return true; } catch (e) { err('sh: ' + arg + ': ' + msgOf(e)); return false; }
    }

    /* ---------- edit ---------- */
    const edit = ready(async (args) => {
      if (args.length !== 1) { err('usage: edit <file>'); return; }
      const arg = args[0], t = abs(arg);
      let text = '', isNew = false;
      try {
        const n = await resolve(t);
        if (n.type === 'dir') { err('edit: ' + arg + ': Is a directory'); return; }
        text = (await readText(n)).text;
      } catch (e) {
        if (e && e.code === 'ENOENT') {
          try {
            await realDir(dirname(t));
            checkName(base(t));
            isNew = true;
          } catch (e2) { werr('edit', arg, e2); return; }
        } else { werr('edit', arg, e); return; }
      }
      if (!window.TermEdit) { err('edit: the editor is not available'); return; }
      const res = await window.TermEdit.open({
        path: shownPath(t), text, isNew, limit: LIMIT,
        save: async (v) => { try { return await putText(arg, v, false); } catch (e) { throw new Error(msgOf(e)); } },
      });
      if (res && res.saved) print('edit: saved ' + shownPath(t) + ' (' + human(res.bytes) + ')');
      else if (isNew) dim('edit: ' + arg + ' was not created (nothing saved)');
    });

    /* ---------- find / grep ---------- */
    const globRe = (p, ci) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', ci ? 'i' : '');
    /** depth-first walk of a folder node. fn(entry, shownPath, node) -> false to stop. st: { count, stop, ep }. */
    async function walk(node, shown, fn, st) {
      let list;
      try { list = await entries(node); } catch (e) { fail('find', shown || '/', e); return; }
      for (const e of list) {
        if (st.stop) return;
        if (ctx.epoch && ctx.epoch() !== st.ep) { st.stop = 'cancel'; return; }
        if (++st.count > SCAN_CAP) { st.stop = 'scan'; return; }
        const sp = (shown === '/' ? '' : shown) + '/' + e.name;
        let child = null;
        try { child = await api.childNode(node, e); } catch (e1) { fail('find', sp, e1); continue; }
        if ((await fn(e, sp, child)) === false) { st.stop = st.stop || 'fn'; return; }
        if (e.kind === 'directory') await walk(child, sp, fn, st);
      }
    }
    const find = ready(async (args) => {
      const paths = [];
      let i = 0;
      while (i < args.length && args[i].charAt(0) !== '-') paths.push(args[i++]);
      let pat = null, ci = false, type = '';
      for (; i < args.length; i++) {
        const a = args[i];
        if (a === '-name' || a === '-iname') {
          if (i + 1 >= args.length) { err('find: missing argument to `' + a + "'"); return; }
          pat = args[++i]; ci = a === '-iname';
        } else if (a === '-type') {
          const v = args[++i];
          if (v !== 'f' && v !== 'd') { err("find: Unknown argument to -type: " + (v || '')); return; }
          type = v;
        } else { err("find: unknown predicate `" + a + "'"); dim('usage: find [path...] [-name pattern | -iname pattern] [-type f|d]'); return; }
      }
      if (!paths.length) paths.push('.');
      const re = pat == null ? null : globRe(pat, ci);
      const out = [];
      const st = { count: 0, stop: '', ep: ctx.epoch ? ctx.epoch() : 0 };
      const hit = (name, kind, sp) => {
        if (re && !re.test(name)) return true;
        if (type === 'f' && kind === 'directory') return true;
        if (type === 'd' && kind !== 'directory') return true;
        if (out.length >= MAX_LINES) { st.stop = 'limit'; return false; }
        out.push(sp);
        return true;
      };
      for (const p of paths) {
        if (st.stop) break;
        let node;
        try { node = await resolve(abs(p)); } catch (e) { fail('find', p, e, 'access'); continue; }
        const shown = p === '/' ? '/' : p.replace(/\/+$/, '') || '/';
        if (hit(node.name === '/' ? '/' : node.name, node.type === 'dir' ? 'directory' : 'file', shown) === false) break;
        if (node.type === 'dir') await walk(node, shown, (e, sp) => hit(e.name, e.kind, sp), st);
      }
      if (out.length) print(out.join('\n'));
      else if (!st.stop) dim('(nothing found)');
      if (st.stop === 'limit') dim('find: only the first ' + MAX_LINES + ' results are shown, narrow the search (a deeper path or a more exact -name)');
      else if (st.stop === 'scan') dim('find: stopped after looking at ' + SCAN_CAP + ' items, narrow the path');
    });
    const clip = (s) => (s.length > LINE_CAP ? s.slice(0, LINE_CAP) + '\u2026' : s);
    const grep = ready(async (args) => {
      const f = flags('grep', args, 'inrR');
      if (!f) return;
      const nums = f.set.has('n'), icase = f.set.has('i'), rec = f.set.has('r') || f.set.has('R');
      if (f.rest.length < 1 || (f.rest.length < 2 && !rec)) { err('usage: grep [-i] [-n] [-r] <text> <file|folder>...'); dim('The text is plain text, not a pattern. Put -- before text that starts with a dash.'); return; }
      const needle = icase ? f.rest[0].toLowerCase() : f.rest[0];
      const targets = f.rest.length > 1 ? f.rest.slice(1) : ['.'];
      const out = [];
      const st = { count: 0, stop: '', ep: ctx.epoch ? ctx.epoch() : 0 };
      let skipped = 0, files = 0, multi = rec || targets.length > 1;
      const scan = async (node, shown, named) => {
        let r;
        try { r = await readText(node); } catch (e) {
          if (e && (e.code === 'EBIG' || e.code === 'EBIN')) { if (named) err('grep: ' + shown + ': ' + (e.code === 'EBIG' ? 'file too large, skipped (limit 1 MB)' : 'binary file, skipped')); else skipped++; return; }
          fail('grep', shown, e); return;
        }
        files++;
        const ls = r.text.split('\n');
        for (let n = 0; n < ls.length; n++) {
          const line = ls[n];
          if ((icase ? line.toLowerCase() : line).indexOf(needle) < 0) continue;
          if (out.length >= MAX_LINES) { st.stop = 'limit'; return; }
          out.push((multi ? shown + ':' : '') + (nums ? (n + 1) + ':' : '') + clip(line));
        }
      };
      for (const t of targets) {
        if (st.stop) break;
        let node;
        try { node = await resolve(abs(t)); } catch (e) { fail('grep', t, e, 'access'); continue; }
        if (node.type === 'file') { await scan(node, t, true); continue; }
        if (!rec) { err('grep: ' + t + ': Is a directory (use -r to search inside)'); continue; }
        const shown = t === '/' ? '/' : t.replace(/\/+$/, '') || '/';
        await walk(node, shown, async (e, sp, child) => {
          if (e.kind === 'directory') return true;
          if (files + skipped >= FILE_CAP) { st.stop = 'files'; return false; }
          await scan(child, sp, false);
          return st.stop !== 'limit';
        }, st);
      }
      if (out.length) print(out.join('\n'));
      else if (!st.stop) dim('(no matches)');
      if (st.stop === 'limit') dim('grep: only the first ' + MAX_LINES + ' matches are shown, narrow the search');
      else if (st.stop === 'files') dim('grep: stopped after ' + FILE_CAP + ' files, narrow the folder');
      else if (st.stop === 'scan') dim('grep: stopped after looking at ' + SCAN_CAP + ' items, narrow the folder');
      if (skipped) dim('grep: skipped ' + skipped + ' binary or large file' + (skipped === 1 ? '' : 's'));
    });

    const cmds = {
      mkdir, touch, rmdir, rm, edit, find, grep,
      cp: ready((args) => transfer('cp', args)),
      mv: ready((args) => transfer('mv', args)),
    };
    return { cmds, redirectCheck, redirect };
  }
  window.TermWr = { install, _t: { LIMIT, MAX_LINES } };
})();
