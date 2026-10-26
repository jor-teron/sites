/*
 * Terminal settings file (apps/system/terminal/terminal_rc.js), T6 — aliases, variables and ~/.hubrc.
 * - At start the Terminal reads /drive/local/.hubrc (~/.hubrc) when it exists; nothing is ever created.
 *   Lines: `alias name='cmd ...'`, `export VAR=value`, `# comment`, empty lines. Anything else is skipped
 *   with a note (the file is not a shell script).
 * - Commands: alias [name[='cmd']], unalias [-a] name, export [VAR=value | VAR], env / printenv [VAR],
 *   source ~/.hubrc (or another file), reload (= source ~/.hubrc).
 * - expand(line): the first word, when it is an alias (not quoted), becomes the alias text (an alias can
 *   start with another alias, 10 levels at most, never itself again); then $VAR and ${VAR} are replaced
 *   everywhere except inside '...' (and \$ keeps a $). The result goes to the Terminal commands and to BusyBox.
 * - Session only: alias / export typed at the prompt last until the Terminal is closed or `reload`ed;
 *   to keep them, put them in ~/.hubrc (edit ~/.hubrc).
 * API: window.TermRc.install(ctx) -> { cmds, expand, env(), load(path?) }.
 */
(function () {
  'use strict';
  const RC = '/drive/local/.hubrc';
  const NAME = /^[A-Za-z0-9_.+:-]+$/, VAR = /^[A-Za-z_][A-Za-z0-9_]*$/;

  function unquote(v) {
    v = v.trim();
    if (v.length >= 2 && (v[0] === "'" || v[0] === '"') && v[v.length - 1] === v[0]) return v.slice(1, -1);
    return v;
  }

  function install(ctx) {
    const { print, err, dim, fs } = ctx;
    const aliases = new Map(), vars = new Map();
    const BASE = () => ({ HOME: '/drive/local', USER: 'hub', LOGNAME: 'hub', HOSTNAME: 'hub', SHELL: '/bin/sh', PATH: '/bin', TERM: 'dumb', LANG: 'C.UTF-8', PWD: fs ? fs.S.cwd : '/' });
    function env() { const e = BASE(); vars.forEach((v, k) => { e[k] = v; }); return e; }

    /** one `name=value` / `name='value'` pair; null when it is not one */
    function pair(s) {
      const i = s.indexOf('=');
      if (i <= 0) return null;
      return { k: s.slice(0, i).trim(), v: unquote(s.slice(i + 1)) };
    }
    function setAlias(s, quiet) {
      const p = pair(s);
      if (!p || !NAME.test(p.k)) { if (!quiet) err("alias: invalid alias '" + s + "'"); return false; }
      aliases.set(p.k, p.v); return true;
    }
    function setVar(s, quiet) {
      const p = pair(s);
      if (!p) { if (VAR.test(s.trim())) { if (!vars.has(s.trim())) vars.set(s.trim(), env()[s.trim()] || ''); return true; } }
      if (!p || !VAR.test(p.k)) { if (!quiet) err("export: '" + s + "': not a valid identifier"); return false; }
      let val = expandVars(p.v);
      if (val === '~' || val.indexOf('~/') === 0) val = '/drive/local' + val.slice(1);
      vars.set(p.k, val); return true;
    }

    /* ---------- expansion ---------- */
    function expandVars(line) {
      const e = env();
      let out = '', q = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q === "'") { out += c; if (c === "'") q = ''; continue; }
        if (c === '\\' && line[i + 1] === '$') { out += '\\$'; i++; continue; }
        if (c === '\\' && i + 1 < line.length) { out += c + line[++i]; continue; }
        if (c === "'" && !q) { q = "'"; out += c; continue; }
        if (c === '"') { q = q === '"' ? '' : '"'; out += c; continue; }
        if (c === '$') {
          let m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(line.slice(i + 1)) || /^([A-Za-z_][A-Za-z0-9_]*)/.exec(line.slice(i + 1));
          if (m) { const v = Object.prototype.hasOwnProperty.call(e, m[1]) ? e[m[1]] : ''; out += q ? v : v.replace(/([\\'"|<>])/g, '\\$1'); i += m[0].length; continue; }
        }
        out += c;
      }
      return out;
    }
    function expand(line) {
      let t = line.replace(/^\s+/, '');
      const seen = new Set();
      for (let n = 0; n < 10; n++) {
        const m = /^([^\s'"\\|<>]+)(?=$|[\s|<>])/.exec(t);
        if (!m || !aliases.has(m[1]) || seen.has(m[1])) break;
        seen.add(m[1]);
        t = aliases.get(m[1]) + t.slice(m[1].length);
      }
      return expandVars(t);
    }

    /* ---------- ~/.hubrc ---------- */
    async function load(path, loud) {
      if (!fs) return false;
      await fs.S.ready;
      const p = fs.norm(path || RC, fs.S.cwd);
      let text;
      try {
        const node = await fs.resolve(p);
        if (node.type !== 'file') { if (loud) err('source: ' + (path || '~/.hubrc') + ': Is a directory'); return false; }
        text = (await fs.readText(node)).text;
      } catch (e) {
        if (loud) { if (e && e.code === 'ENOENT') err('source: ' + (path || '~/.hubrc') + ': No such file or directory'); else fs.fail('source', path || '~/.hubrc', e); }
        return false;
      }
      let a = 0, v = 0;
      text.split(/\r?\n/).forEach((raw, i) => {
        const l = raw.trim();
        if (!l || l[0] === '#') return;
        let m;
        if ((m = /^alias\s+(.+)$/.exec(l))) { if (setAlias(m[1], true)) a++; else dim('.hubrc line ' + (i + 1) + ': bad alias, skipped'); }
        else if ((m = /^export\s+(.+)$/.exec(l))) { if (setVar(m[1], true)) v++; else dim('.hubrc line ' + (i + 1) + ': bad export, skipped'); }
        else dim('.hubrc line ' + (i + 1) + ': only alias, export and # comments are read, skipped');
      });
      if (loud) print('source: ' + (path || '~/.hubrc') + ': ' + a + (a === 1 ? ' alias, ' : ' aliases, ') + v + (v === 1 ? ' variable' : ' variables'));
      return true;
    }

    const q1 = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
    const cmds = {
      alias(args, rest) {
        if (!rest) { [...aliases.keys()].sort().forEach((k) => print('alias ' + k + '=' + q1(aliases.get(k)))); return; }
        if (rest.indexOf('=') < 0) {
          args.forEach((k) => { if (aliases.has(k)) print('alias ' + k + '=' + q1(aliases.get(k))); else err('alias: ' + k + ': not found'); });
          return;
        }
        setAlias(rest.trim());
      },
      unalias(args) {
        if (!args.length) { err('unalias: usage: unalias [-a] name [name ...]'); return; }
        if (args[0] === '-a') { aliases.clear(); return; }
        args.forEach((k) => { if (!aliases.delete(k)) err('unalias: ' + k + ': not found'); });
      },
      export(args) {
        if (!args.length) { [...vars.keys()].sort().forEach((k) => print('export ' + k + '=' + q1(vars.get(k)))); return; }
        args.forEach((a) => setVar(a));
      },
      env() { const e = env(); Object.keys(e).sort().forEach((k) => print(k + '=' + e[k])); },
      printenv(args) {
        const e = env();
        if (!args.length) { cmds.env(); return; }
        args.forEach((k) => { if (Object.prototype.hasOwnProperty.call(e, k)) print(e[k]); });
      },
      source(args) {
        if (args.length !== 1) { err('usage: source <file>   (source ~/.hubrc)'); return; }
        return load(args[0], true);
      },
      reload() { aliases.clear(); vars.clear(); return load(RC, true).then((ok) => { if (!ok) dim('reload: no ~/.hubrc (aliases and variables cleared)'); }); },
    };
    return { cmds, expand, env, load, aliases, vars };
  }
  window.TermRc = { install, RC };
})();
