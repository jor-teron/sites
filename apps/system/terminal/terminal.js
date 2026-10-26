/*
 * Terminal (apps/system/terminal/terminal.js), T1 + T2 + T3 — the Hub's command line. T3 adds the line side
 * of the commands that change files (terminal_wr.js, terminal_edit.js): the redirects > and >> (an unquoted
 * > only; the output of the built-in commands in REDIR_OK is collected in CAP and written by
 * fs.redirect), the y/n question state (ask / answer: the next Enter answers, Ctrl+C = no) and the Tab
 * completion of the new commands. T2 adds the unix-style
 * file tree (/drive/local, /drive/gdrive, /drive/<folder>) and the read commands (pwd cd ls cat head tail wc
 * tree stat drives allow, `open <file>`); that part lives in terminal_fs.js (window.TermFs), built on
 * shared/fs (FsDrives, FsOps). The prompt is hub@hub:<cwd>$, cwd kept in localStorage 'hub-terminal.cwd'.
 * - One real <input> (#in) takes the keys: hardware keyboard, the phone's own keyboard and the
 *   Hub OSK (hub-controller.js forwardKey types into the focused input and fires keydown), paste.
 *   It is invisible; #before / #cur / #after draw the line with a blinking block cursor.
 * - Keys: Enter run, Up / Down history, Tab complete (commands, app ids, categories, themes),
 *   Ctrl+L clear, Ctrl+C cancel the line (copies instead when text is selected).
 * - History: localStorage 'hub-terminal.history' (JSON array, last 200). Not a 'sites-hub.' key,
 *   so typing never makes the Hub re-apply its prefs.
 * - Output is always text (textContent); nothing typed ever goes through innerHTML.
 * - Hub access (R57 rules): parent.__hubOpenApp when the Hub is the same-origin parent; on file://
 *   (no frame access) a {type:'hub-open-app'} message to the parent with '*', else location.origin
 *   (hub.js accepts it from its own frames only). Theme: the 'sites-hub.theme' key like Settings
 *   (sec_look.js: dark = key removed), then parent.HubPrefs.apply() and a {type:'hub-prefs'} message.
 * - Apps: window.HUB_APP_INDEX (hub/core/hub_appindex.js, generated): id -> [category, entry, name, icon, newTab].
 * - T5: BusyBox (terminal_bb.js, window.TermBB): a line with an unquoted | or <, `busybox <applet>`, `/bin/<applet>`,
 *   an applet the Terminal has no command for (sed, awk, sort, ...), or a Terminal file command given an option
 *   or a /bin, /etc path it does not know, runs in BusyBox (see README: who wins). cd / pwd / history / clear / exit
 *   stay here; cd also enters the virtual /bin and /etc.
 */
(function () {
  'use strict';
  const IS_FILE = location.protocol === 'file:';
  const ROOT = '../../../';
  const HIST_KEY = 'hub-terminal.history', HIST_MAX = 200;
  let PS = 'hub@hub:~$ ';   // T2: follows the current folder (terminal_fs.js)
  const THEMES = ['dark', 'light'];
  const term = document.getElementById('term'), out = document.getElementById('out');
  const form = document.getElementById('line'), input = document.getElementById('in');
  const elB = document.getElementById('before'), elC = document.getElementById('cur'), elA = document.getElementById('after');

  /* ---------- output (text only) ---------- */
  let CAP = null;   // T3: while a redirect (> / >>) runs, plain output is collected here instead of shown
  function print(text, cls) {
    if (CAP && !cls) { CAP.push(String(text == null ? '' : text)); return; }
    String(text == null ? '' : text).split('\n').forEach((t) => {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = t;
      out.appendChild(d);
    });
    while (out.childElementCount > 2000) out.firstElementChild.remove();
    toBottom();
  }
  const err = (t) => print(t, 'err');
  const dim = (t) => print(t, 'dim');
  /** One text block (many lines in one element): file contents, trees. */
  function block(text) {
    if (CAP) { CAP.push(String(text == null ? '' : text)); return; }
    const d = document.createElement('div');
    d.textContent = String(text == null ? '' : text);
    out.appendChild(d);
    toBottom();
  }
  /** A real button for the rare thing that needs a click (allow). Text only. */
  function button(label, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tbtn'; b.textContent = '[ ' + label + ' ]';
    b.addEventListener('click', () => { Promise.resolve(fn()).then((ok) => { if (ok) b.remove(); }); });
    const d = document.createElement('div'); d.appendChild(b); out.appendChild(d);
    toBottom();
  }
  /** Words of a command line: 'single', "double" quotes and \ escapes keep spaces in one word. */
  function tokenize(str) {
    const words = [];
    let cur = '', has = false, q = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) {
        if (c === q) q = '';
        else if (c === '\\' && q === '"' && i + 1 < str.length && /["\\]/.test(str[i + 1])) cur += str[++i];
        else cur += c;
      } else if (c === '"' || c === "'") { q = c; has = true; }
      else if (c === '\\' && i + 1 < str.length) { cur += str[++i]; has = true; }
      else if (/\s/.test(c)) { if (has || cur) { words.push(cur); cur = ''; has = false; } }
      else cur += c;
    }
    if (has || cur) words.push(cur);
    return words;
  }
  /** tokenize + the redirect: an unquoted > or >> (T3). { words, redir: { op, target } | null, cut, error } */
  function parseLine(str) {
    const words = [], ops = [];
    let cur = '', has = false, q = '';
    const flush = () => { if (has || cur) { words.push({ t: cur, i: ops.length }); cur = ''; has = false; } };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) {
        if (c === q) q = '';
        else if (c === '\\' && q === '"' && i + 1 < str.length && /["\\]/.test(str[i + 1])) cur += str[++i];
        else cur += c;
      } else if (c === '"' || c === "'") { q = c; has = true; }
      else if (c === '\\' && i + 1 < str.length) { cur += str[++i]; has = true; }
      else if (c === '>') { flush(); const op = str[i + 1] === '>' ? '>>' : '>'; ops.push({ op, at: i }); i += op.length - 1; }
      else if (/\s/.test(c)) flush();
      else cur += c;
    }
    flush();
    const plain = words.filter((w) => w.i === 0).map((w) => w.t);
    if (!ops.length) return { words: plain, redir: null, cut: -1 };
    if (ops.length > 1) return { words: plain, redir: null, cut: -1, error: "only one > or >> per command" };
    const after = words.filter((w) => w.i === 1).map((w) => w.t);
    if (!after.length) return { words: plain, redir: null, cut: -1, error: "syntax error: file name missing after '" + ops[0].op + "'" };
    if (after.length > 1) return { words: plain, redir: null, cut: -1, error: "syntax error: the redirect goes last, with one file name (quote names with spaces)" };
    return { words: plain, redir: { op: ops[0].op, target: after[0] }, cut: ops[0].at };
  }
  function toBottom() { term.scrollTop = term.scrollHeight; }
  function columns(list) {
    if (!list.length) return '';
    const w = Math.max.apply(null, list.map((s) => s.length)) + 2;
    const per = Math.max(1, Math.floor(charsPerLine() / w));
    const rows = [];
    for (let i = 0; i < list.length; i += per) rows.push(list.slice(i, i + per).map((s) => s.padEnd(w)).join('').trimEnd());
    return rows.join('\n');
  }
  function charsPerLine() {
    const probe = document.createElement('span'); probe.textContent = 'MMMMMMMMMM';
    probe.style.visibility = 'hidden'; out.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 10 || 9; probe.remove();
    return Math.max(20, Math.floor((out.clientWidth || 600) / cw));
  }

  /* ---------- the line ---------- */
  function render() {
    const v = input.value, p = input.selectionStart == null ? v.length : input.selectionStart;
    elB.textContent = v.slice(0, p);
    elC.textContent = v[p] || ' ';
    elA.textContent = v.slice(p + 1);
  }
  function setLine(v) { input.value = v; input.setSelectionRange(v.length, v.length); render(); }
  function focusIn() { try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); } }

  /* ---------- history ---------- */
  let hist = [];
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); if (Array.isArray(h)) hist = h.filter((x) => typeof x === 'string').slice(-HIST_MAX); } catch (_) { hist = []; }
  let hPos = hist.length, draft = '';
  function saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-HIST_MAX))); } catch (_) { /* blocked */ } }
  function remember(line) {
    if (!line.trim()) return;
    if (hist[hist.length - 1] !== line) hist.push(line);
    if (hist.length > HIST_MAX) hist = hist.slice(-HIST_MAX);
    saveHist();
  }
  function histMove(d) {
    if (hPos === hist.length) draft = input.value;
    const n = Math.min(hist.length, Math.max(0, hPos + d));
    if (n === hPos) return;
    hPos = n;
    setLine(hPos === hist.length ? draft : hist[hPos]);
  }

  /* ---------- apps (hub_appindex.js) ---------- */
  function appList() {
    const idx = window.HUB_APP_INDEX || {};
    return Object.keys(idx).filter((id) => Array.isArray(idx[id]) && id[0] !== '~')
      .map((id) => ({ id, cat: String(idx[id][0] || ''), entry: String(idx[id][1] || ''), name: String(idx[id][2] || id) }));
  }
  function categories() {
    const seen = [];
    appList().forEach((a) => { if (a.cat && seen.indexOf(a.cat) < 0) seen.push(a.cat); });
    return seen;
  }
  function findApps(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const all = appList();
    const exact = all.filter((a) => a.id.toLowerCase() === q || a.name.toLowerCase() === q);
    if (exact.length) return exact.slice(0, 1);
    const pre = all.filter((a) => a.id.toLowerCase().indexOf(q) === 0 || a.name.toLowerCase().indexOf(q) === 0);
    if (pre.length) return pre;
    return all.filter((a) => a.name.toLowerCase().indexOf(q) >= 0);
  }

  /* ---------- the Hub (parent) ---------- */
  const inFrame = window.parent !== window;
  function hubWin() {
    try { const p = window.parent; return p !== window && typeof p.__hubOpenApp === 'function' ? p : null; } catch (_) { return null; }
  }
  function openApp(a) {
    const hub = hubWin();
    if (hub) {
      if (hub.__hubOpenApp(a.entry) === false) { err('open: the Hub could not open ' + a.name); return; }
      print('Opening ' + a.name + ' …');
      return;
    }
    if (!inFrame) {
      err('open: not running inside the Hub.');
      dim('Open the Hub (hub.html) and start Terminal there, or go to hub.html#' + a.id);
      return;
    }
    // file:// (no frame access): ask the Hub by message; hub.js checks the sender is its own frame
    try {
      window.parent.postMessage({ type: 'hub-open-app', url: new URL(ROOT + a.entry, location.href).href, name: a.name },
        (IS_FILE || location.origin === 'null') ? '*' : location.origin);
      print('Opening ' + a.name + ' …');
    } catch (_) { err('open: could not reach the Hub'); }
  }
  function prefsGet(k) { try { return localStorage.getItem('sites-hub.' + k) || ''; } catch (_) { return ''; } }
  function prefsSet(k, v) {
    try { if (v) localStorage.setItem('sites-hub.' + k, v); else localStorage.removeItem('sites-hub.' + k); } catch (_) { return false; }
    try { const p = window.parent; if (p !== window && p.HubPrefs) p.HubPrefs.apply(); } catch (_) { /* no frame access */ }
    try { if (inFrame) window.parent.postMessage({ type: 'hub-prefs', key: k }, (IS_FILE || location.origin === 'null') ? '*' : location.origin); } catch (_) { /* ignore */ }
    return true;
  }

  /** Open a Hub app by its path (with an optional #hash for it); used by `open <file | folder>`. */
  function hubOpen(entry, hash, name) {
    const hub = hubWin();
    if (hub) {
      if (hub.__hubOpenApp(entry, hash ? { hash } : undefined) === false) { err('open: the Hub could not open ' + name); return; }
      print('Opening ' + name + ' \u2026');
      return;
    }
    if (!inFrame) { err('open: not running inside the Hub.'); return; }
    try {   // file://: the Hub cannot be reached directly, hub.js takes the message (no #hash: the app opens on its own page)
      window.parent.postMessage({ type: 'hub-open-app', url: new URL(ROOT + entry, location.href).href, name },
        (IS_FILE || location.origin === 'null') ? '*' : location.origin);
      print('Opening ' + name + ' \u2026');
    } catch (_) { err('open: could not reach the Hub'); }
  }
  /* ---------- the file tree (terminal_fs.js, T2) ---------- */
  const elPs = document.getElementById('ps');
  function setPrompt() {
    PS = 'hub@hub:' + (fs ? fs.prompt() : '~') + '$ ';
    if (elPs) elPs.textContent = PS.replace(/ $/, '\u00a0');
  }
  /* T3: a y/n question (rm, cp, mv) answered with the next Enter; epoch counts Ctrl+C so long searches stop */
  let asking = null, epoch = 0;
  function ask(q) {
    return new Promise((resolve) => {
      asking = { resolve };
      print(q, 'ask');
      if (elPs) elPs.textContent = '(y/n)\u00a0';
      toBottom();
    });
  }
  function answer(text, cancelled) {
    if (!asking) return;
    const a = text.trim().toLowerCase();
    if (!cancelled && a && !/^(y|yes|n|no)$/.test(a)) { print('(y/n)  ' + text); dim('Please answer y or n.'); return; }
    const a0 = asking; asking = null;
    print('(y/n)  ' + text + (cancelled ? '^C' : ''));
    setPrompt();
    a0.resolve(!cancelled && /^y(es)?$/.test(a));
  }
  const fs = window.TermFs ? window.TermFs.install({ print, err, dim, block, columns, button, hubOpen, onCwd: setPrompt, ask, epoch: () => epoch }) : null;

  /* ---------- commands ---------- */
  const HELP = [
    ['help', 'this list'],
    ['clear', 'clear the screen (Ctrl+L)'],
    ['echo <text>', 'print the text'],
    ['date', 'date and time'],
    ['history [-c]', 'commands you typed (-c clears them)'],
    ['apps [category]', 'list the Hub apps (ids for open)'],
    ['open <app|path>', 'open an app (id or name), or a file / folder (Viewer, Notely, Files)'],
    ['build', 'the Hub build (hub/build.txt)'],
    ['theme [name]', 'show or set the Hub theme (' + THEMES.join(', ') + ')'],
    ['exit', 'clear the screen and start a new session'],
  ];
  const HELP_FS = [
    ['pwd', 'print the current folder'],
    ['cd [path]', 'change folder (no path = ~, - = back, .. = up)'],
    ['ls [-l] [-a] [-h] [path]', 'list a folder (-l size + date, -a hidden, -h readable sizes)'],
    ['cat <file>...', 'show text files (up to 1 MB)'],
    ['head [-n N] <file>', 'first N lines (10)'],
    ['tail [-n N] <file>', 'last N lines (10)'],
    ['wc [-lwc] <file>...', 'lines, words, bytes'],
    ['tree [path] [-L n]', 'folder tree (2 levels; -a hidden)'],
    ['stat <path>', 'type, size, date, drive'],
    ['drives', 'the mounts under /drive and their access'],
    ['allow <mount>', 'ask the browser for access to a folder drive'],
  ];
  const HELP_WR = [
    ['mkdir [-p] <folder>...', 'make folders (-p: with the folders above them)'],
    ['touch <file>...', 'make empty files (an existing file is left alone)'],
    ['cp [-r] [-f] <src>... <dest>', 'copy files (-r folders); asks y/n before overwriting, -f skips'],
    ['mv [-f] <src>... <dest>', 'move or rename, also between drives; asks y/n before overwriting'],
    ['rm [-r] [-f] <path>...', 'delete (-r folders: asks y/n, -f does not ask)'],
    ['rmdir <folder>...', 'delete empty folders'],
    ['edit <file>', 'text editor (Ctrl+S save, Ctrl+X / Esc exit), text files under 1 MB'],
    ['find [path] -name <pat>', 'find by name (* and ?; -iname ignores case; -type f|d)'],
    ['grep [-i] [-n] [-r] <text> <path>', 'find text in files (-r folders; plain text, not a pattern)'],
  ];
  const CMDS = {
    help() {
      print('Commands:');
      HELP.forEach((h) => print('  ' + h[0].padEnd(26) + h[1]));
      if (fs) {
        print('Files (look around):');
        HELP_FS.forEach((h) => print('  ' + h[0].padEnd(26) + h[1]));
        if (fs.cmds.mkdir) {
          print('Files (change, need write access: allow <mount>):');
          HELP_WR.forEach((h) => print('  ' + h[0].padEnd(26) + h[1]));
          print('  ' + 'cmd > file, cmd >> file'.padEnd(26) + 'write / append the output (echo, cat, ls, grep, ...)');
          dim('There is no trash: rm and overwriting delete for good, real host folders too. Wildcards are only for find -name.');
        }
        dim('Tree: / > drive > local (~), gdrive, <your folders>. Quote names with spaces or escape them: cat "my file.txt".');
      }
      if (bb) {
        print('BusyBox (T5, ' + bb.applets.length + ' commands, ls /bin lists them):');
        print('  ' + 'sed awk sort uniq cut tr seq diff ...'.padEnd(26) + 'real Linux commands on your /drive files; <cmd> --help for options');
        print('  ' + 'a | b,  < file,  > file'.padEnd(26) + 'pipes and redirects; cat /etc/os-release');
        print('  ' + '/bin/<cmd>, busybox <cmd>'.padEnd(26) + 'force the BusyBox one (ls, cat, grep, ... are the Terminal\'s own)');
      }
      dim('Keys: Up/Down history, Tab complete (commands, paths), Ctrl+L clear, Ctrl+C cancel line');
    },
    clear() { out.textContent = ''; },
    echo(args, rest) { print(rest); },
    date() {
      const d = new Date();
      print(d.toString());
      dim('UTC ' + d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z'));
    },
    history(args) {
      if (args[0] === '-c') { hist = []; hPos = 0; saveHist(); print('History cleared'); return; }
      if (!hist.length) { dim('(no history)'); return; }
      const w = String(hist.length).length;
      print(hist.map((h, i) => '  ' + String(i + 1).padStart(w) + '  ' + h).join('\n'));
    },
    apps(args, rest) {
      const all = appList(), cats = categories();
      if (!all.length) { err('apps: the app list is not available'); return; }
      let show = cats;
      if (rest) {
        const q = rest.toLowerCase();
        show = cats.filter((c) => c.toLowerCase() === q);
        if (!show.length) show = cats.filter((c) => c.toLowerCase().indexOf(q) === 0);
        if (!show.length) { err('apps: no category "' + rest + '"'); dim('Categories: ' + cats.map((c) => c.toLowerCase()).join(', ')); return; }
      }
      show.forEach((c) => {
        const list = all.filter((a) => a.cat === c);
        print(c + ' (' + list.length + ')');
        const w = Math.max.apply(null, list.map((a) => a.id.length)) + 2;
        print(list.map((a) => '  ' + a.id.padEnd(w) + a.name).join('\n'));
      });
      if (!rest) dim('apps <category> lists one; open <id> opens an app');
    },
    open(args, rest) {
      if (!rest) { err('usage: open <app | file | folder>'); dim('apps lists the ids; open ~/pic.png opens a file'); return; }
      const pathy = fs && /^(\.{1,2}(\/|$)|~|\/)/.test(args[0] || '');
      if (pathy && args.length === 1) return fs.openPath(args[0]);
      const m = findApps(rest);
      if (!m.length && fs && args.length === 1) return fs.openPath(args[0]);
      if (!m.length) { err('open: no app "' + rest + '"'); return; }
      if (m.length > 1) { err('open: "' + rest + '" matches ' + m.length + ' apps:'); print(columns(m.map((a) => a.id))); return; }
      openApp(m[0]);
    },
    build() {
      if (IS_FILE) { print('build: not available when the Hub is opened as a file'); return; }
      return Promise.all([
        fetch(ROOT + 'hub/build.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
        fetch(ROOT + 'hub/version.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      ]).then(([b, v]) => {
        const l = b.split(/\r?\n/);
        print('Build:   ' + (l[0] || '?') + '\nCache:   ' + (l[1] || '?') + '\nRelease: ' + (l[2] || '?') + '\nDate:    ' + (l[3] || '?'));
        const ver = v.split(/\r?\n/)[0];
        if (ver) print('Version: ' + ver);
      }).catch(() => err('build: could not read hub/build.txt'));
    },
    exit() { out.textContent = ''; print('Hub Terminal (T5)'); dim('New session. Close the window to leave.'); },
    theme(args) {
      const cur = prefsGet('theme') === 'light' ? 'light' : 'dark';
      if (!args.length) { print('Theme: ' + cur); dim('Themes: ' + THEMES.join(', ') + ' (theme <name> sets it; Terminal itself stays green)'); return; }
      const t = args[0].toLowerCase();
      if (THEMES.indexOf(t) < 0) { err('theme: unknown theme "' + args[0] + '"'); dim('Themes: ' + THEMES.join(', ')); return; }
      if (!prefsSet('theme', t === 'dark' ? '' : t)) { err('theme: could not save (storage blocked)'); return; }
      print('Theme set to ' + t);
    },
  };
  if (fs) Object.assign(CMDS, fs.cmds);
  /* T5: cd also enters the virtual /, /bin and /etc (BusyBox shows them) */
  if (fs && CMDS.cd) {
    const cd0 = CMDS.cd;
    CMDS.cd = async (args) => {
      const t = args.length === 1 && args[0] !== '-' ? fs.norm(args[0], fs.S.cwd) : '';
      if (t === '/bin' || t === '/etc') { await fs.S.ready; if (t !== fs.S.cwd) fs.S.old = fs.S.cwd; fs.setCwd(t); return; }
      if (/^\/(bin|etc)\//.test(t)) { err('cd: ' + args[0] + ': Not a directory'); return; }
      return cd0(args);
    };
  }
  const hasJs = (n) => Object.prototype.hasOwnProperty.call(CMDS, n);
  /** T5: run a Terminal command for a pipe and return its plain output (null: it has no plain output) */
  async function capture(name, args) {
    if (!REDIR_OK.has(name)) return null;
    const prev = CAP; CAP = [];
    let got;
    try { await CMDS[name](args, args.join(' ')); } catch (e) { err(name + ': ' + (e && e.message ? e.message : 'failed')); }
    finally { got = CAP; CAP = prev; }
    return got.length ? got.join('\n') + '\n' : '';
  }
  const bb = window.TermBB && fs ? window.TermBB.install({ fs, print, err, dim, block, hasJs, capture, epoch: () => epoch }) : null;
  const NAMES = Object.keys(CMDS).concat(bb ? bb.applets.filter((a) => !hasJs(a) && /^[a-z]/.test(a)) : []);

  /* Lines run one after the other (a file command is async), so output keeps the order of the prompts. */
  let chain = Promise.resolve();
  function run(line) {
    remember(line);
    hPos = hist.length; draft = '';
    chain = chain.then(() => exec(line)).catch(() => {});
    return chain;
  }
  async function exec(line) {
    print(PS + line);
    const t = line.trim();
    if (!t) return;
    const name = (t.match(/^[^\s>]+/) || [''])[0];
    if (!name) { err("sh: syntax error near '>'"); return; }
    if (bb && bb.wants(name.split('|')[0], tokenize(t.split('|')[0]).slice(1), t)) { await bb.exec(t); toBottom(); return; }   // T5
    const rest0 = t.slice(name.length).trim();
    const P = parseLine(rest0);
    const fn = Object.prototype.hasOwnProperty.call(CMDS, name) ? CMDS[name] : null;
    if (!fn) { err(name + ': command not found'); return; }
    if (P.error) { err('sh: ' + P.error); return; }
    const args = P.words;
    let rest = rest0;
    if (P.redir) {   // echo hello > f writes the words (quotes removed); other commands get the text before the >
      rest = name === 'echo' ? args.join(' ') : rest0.slice(0, P.cut).trim();
      if (!REDIR_OK.has(name)) { err('sh: ' + name + ": output cannot be redirected with " + P.redir.op); return; }
      if (!fs || !fs.redirect) { err('sh: redirects need the file tree'); return; }
      await fs.S.ready;
      const bad = await fs.redirectCheck(P.redir.target);
      if (bad) { err('sh: ' + P.redir.target + ': ' + bad); return; }
      CAP = [];
    }
    let got = null;
    try {
      await fn(args, rest);
    } catch (e) { err(name + ': ' + (e && e.message ? e.message : 'failed')); }
    finally { got = CAP; CAP = null; }
    if (P.redir) await fs.redirect(P.redir.target, got && got.length ? got.join('\n') + '\n' : '', P.redir.op === '>>');
    toBottom();
  }
  const REDIR_OK = new Set(['help', 'echo', 'date', 'history', 'apps', 'build', 'theme', 'pwd', 'ls', 'cat', 'head', 'tail', 'wc', 'tree', 'stat', 'drives', 'find', 'grep']);

  /* ---------- Tab completion ---------- */
  function commonPrefix(list) {
    let p = list[0] || '';
    list.forEach((s) => { while (s.toLowerCase().indexOf(p.toLowerCase()) !== 0) p = p.slice(0, -1); });
    return p;
  }
  function apply(v, pos, base, hits, word, tail, noSpaceAfter) {
    if (input.value !== v) return;   // the line changed while the folder was being read
    if (hits.length === 1) {
      const nv = base + hits[0] + (noSpaceAfter || hits[0].slice(-1) === '/' || tail[0] === ' ' ? '' : ' ');
      input.value = nv + tail; input.setSelectionRange(nv.length, nv.length); render();
      return;
    }
    const cp = commonPrefix(hits);
    if (cp.length > word.length) {
      const nv = base + cp;
      input.value = nv + tail; input.setSelectionRange(nv.length, nv.length); render();
      return;
    }
    print(PS + v);
    print(columns(hits));
  }
  const PATH_CMDS = ['cd', 'ls', 'cat', 'head', 'tail', 'wc', 'tree', 'stat', 'mkdir', 'touch', 'cp', 'mv', 'rm', 'rmdir', 'edit', 'find', 'grep'];
  const DIRS_ONLY = ['cd', 'tree', 'rmdir', 'mkdir'];
  function complete() {
    const v = input.value, pos = input.selectionStart == null ? v.length : input.selectionStart;
    const head = v.slice(0, pos), tail = v.slice(pos);
    const m = head.match(/^(\s*)(\S*)$/);
    let word, pool;
    if (m) { word = m[2]; pool = NAMES; }
    else {
      const cmd = head.trim().split(/\s+/)[0];
      // the word being typed: the text after the last space that is not escaped or inside quotes
      let start = 0, q = '';
      for (let i = 0; i < head.length; i++) {
        const c = head[i];
        if (q) { if (c === q) q = ''; } else if (c === '\\') i++; else if (c === '"' || c === "'") q = c; else if (/\s/.test(c)) start = i + 1;
      }
      const raw = head.slice(start);
      const prev = tokenize(head.slice(0, start));   // the words before this one (cmd first)
      const afterRedir = prev.length > 1 && /^>>?$/.test(prev[prev.length - 1]);
      let skip = false;   // grep: the first plain word is the text; find: the word after -name / -iname / -type
      if (cmd === 'grep') skip = prev.slice(1).filter((w) => w.charAt(0) !== '-').length === 0;
      else if (cmd === 'find') skip = /^-(name|iname|type)$/.test(prev[prev.length - 1] || '');
      if (fs && !skip && (PATH_CMDS.indexOf(cmd) >= 0 || afterRedir || (bb && (bb.isApplet(cmd) || cmd.indexOf('/bin/') === 0))) && !(raw.charAt(0) === '-' && !q)) {
        fs.completePath(raw, !afterRedir && DIRS_ONLY.indexOf(cmd) >= 0).then((r) => apply(v, pos, head.slice(0, start) + r.keep, r.hits.sort(), raw.slice(r.keep.length), tail));
        return;
      }
      if (fs && cmd === 'allow') {
        fs.completeMount(raw).then((h) => { if (h.length) apply(v, pos, head.slice(0, start), h.sort(), raw, tail); });
        return;
      }
      if (fs && cmd === 'open' && /^(\.{0,2}\/|~|\.)/.test(raw)) {
        fs.completePath(raw, false).then((r) => apply(v, pos, head.slice(0, start) + r.keep, r.hits.sort(), raw.slice(r.keep.length), tail));
        return;
      }
      word = head.match(/(\S*)$/)[1];
      pool = cmd === 'open' ? appList().map((a) => a.id)
        : cmd === 'apps' ? categories().map((c) => c.toLowerCase())
          : cmd === 'theme' ? THEMES
            : cmd === 'help' ? NAMES : [];
    }
    const hits = pool.filter((s) => s.toLowerCase().indexOf(word.toLowerCase()) === 0).sort();
    if (!hits.length) return;
    apply(v, pos, head.slice(0, head.length - word.length), hits, word, tail);
  }

  /* ---------- keys ---------- */
  function submit() {
    const line = input.value;
    setLine('');
    if (asking) { answer(line); toBottom(); return; }
    run(line);
    toBottom();
  }
  /** One key for the line; true = handled (the caller prevents the default). */
  function lineKey(k, ctrl, alt, meta) {
    if (k === 'Enter') { submit(); return true; }
    if (asking && (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Tab')) return true;   // a y/n question: no history / completion
    if (k === 'ArrowUp' && !alt) { histMove(-1); return true; }
    if (k === 'ArrowDown' && !alt) { histMove(1); return true; }
    if (k === 'Tab' && !alt && !ctrl && !meta) { complete(); return true; }
    if (ctrl && !alt && !meta && (k === 'l' || k === 'L')) { CMDS.clear(); return true; }
    if (ctrl && !alt && !meta && (k === 'c' || k === 'C')) {
      const sel = String(window.getSelection ? window.getSelection() : '');
      const inSel = input.selectionStart !== input.selectionEnd;
      if (sel || inSel) return false;   // copy
      if (asking) { const v = input.value; setLine(''); answer(v, true); return true; }
      print(PS + input.value + '^C');
      epoch++;
      chain = Promise.resolve();   // later lines no longer wait for a slow command
      setLine(''); hPos = hist.length; draft = '';
      return true;
    }
    return false;
  }
  input.addEventListener('keydown', (e) => {
    if (lineKey(e.key, e.ctrlKey, e.altKey, e.metaKey)) { e.preventDefault(); return; }
    setTimeout(render, 0);
  });
  /* Hub OSK / phone-remote keys when the Hub cannot reach this document (file://: every file is
     its own origin). Same origin, hub-controller.js types into the input itself, so this only
     listens when the parent is unreachable, and only to the parent window. */
  let parentReach = true;
  try { void window.parent.document; } catch (_) { parentReach = false; }
  if (inFrame && !parentReach) {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window.parent || !d || d.type !== 'hub-key' || !d.s) return;
      if (!IS_FILE && e.origin !== location.origin) return;
      const k = typeof d.key === 'string' ? d.key.slice(0, 32) : '';
      if (!k || lineKey(k, !!d.ctrl, !!d.alt, false)) return;
      const v = input.value, a = input.selectionStart, b = input.selectionEnd;
      if (k.length === 1 && !d.ctrl && !d.alt) input.setRangeText(k, a, b, 'end');
      else if (k === 'Backspace' && (a !== b || a > 0)) input.setRangeText('', a === b ? a - 1 : a, b, 'end');
      else if (k === 'Delete' && (a !== b || a < v.length)) input.setRangeText('', a, a === b ? a + 1 : b, 'end');
      else if (k === 'ArrowLeft') input.setSelectionRange(Math.max(0, a - 1), Math.max(0, a - 1));
      else if (k === 'ArrowRight') input.setSelectionRange(Math.min(v.length, b + 1), Math.min(v.length, b + 1));
      else if (k === 'Home') input.setSelectionRange(0, 0);
      else if (k === 'End') input.setSelectionRange(v.length, v.length);
      else return;
      if (hPos === hist.length) draft = input.value;
      render(); toBottom();
    });
  }
  // phone keyboards that send no Enter keydown (keyCode 229) still submit the form
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  input.addEventListener('input', () => { if (hPos === hist.length) draft = input.value; render(); toBottom(); });
  ['keyup', 'click', 'select'].forEach((t) => input.addEventListener(t, render));
  document.addEventListener('selectionchange', () => { if (document.activeElement === input) render(); });
  input.addEventListener('focus', () => { term.classList.add('focus'); render(); });
  input.addEventListener('blur', () => term.classList.remove('focus'));
  // a click / tap anywhere focuses the line (not while selecting output to copy)
  term.addEventListener('mouseup', () => { if (!String(window.getSelection())) focusIn(); });
  // a tap (not a scroll) on touch screens: focus without moving the page
  let tap = null;
  term.addEventListener('touchstart', (e) => { const t = e.touches[0]; tap = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  term.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (tap && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap = null; }, { passive: true });
  term.addEventListener('touchend', (e) => {
    if (tap && e.target !== input && !(e.target.closest && e.target.closest('button')) && !String(window.getSelection())) { e.preventDefault(); focusIn(); }
    tap = null;
  }, { passive: false });
  window.addEventListener('focus', () => setTimeout(() => { if (!(window.TermEdit && window.TermEdit.isOpen())) focusIn(); }, 0));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', toBottom);
  window.addEventListener('resize', toBottom);

  /* ---------- start ---------- */
  print('Hub Terminal (T5)');
  dim("Type 'help' for commands. Tab completes, Up/Down = history. ls / shows the tree, cd ~ goes home, ls /bin lists the BusyBox commands.");
  render();
  focusIn();
  window.HubTerminal = { run: (l) => run(String(l)), commands: NAMES.slice(), fs, bb, asking: () => !!asking };   // tests / console
})();
