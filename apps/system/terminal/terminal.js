/*
 * Terminal (apps/system/terminal/terminal.js), T1 — the Hub's command line.
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
 */
(function () {
  'use strict';
  const IS_FILE = location.protocol === 'file:';
  const ROOT = '../../../';
  const HIST_KEY = 'hub-terminal.history', HIST_MAX = 200;
  const PS = 'hub:~$ ';
  const THEMES = ['dark', 'light'];
  const term = document.getElementById('term'), out = document.getElementById('out');
  const form = document.getElementById('line'), input = document.getElementById('in');
  const elB = document.getElementById('before'), elC = document.getElementById('cur'), elA = document.getElementById('after');

  /* ---------- output (text only) ---------- */
  function print(text, cls) {
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

  /* ---------- commands ---------- */
  const HELP = [
    ['help', 'this list'],
    ['clear', 'clear the screen (Ctrl+L)'],
    ['echo <text>', 'print the text'],
    ['date', 'date and time'],
    ['history [-c]', 'commands you typed (-c clears them)'],
    ['apps [category]', 'list the Hub apps (ids for open)'],
    ['open <app>', 'open an app by id or name'],
    ['build', 'the Hub build (hub/build.txt)'],
    ['theme [name]', 'show or set the Hub theme (' + THEMES.join(', ') + ')'],
  ];
  const CMDS = {
    help() {
      print('Commands:');
      HELP.forEach((h) => print('  ' + h[0].padEnd(17) + h[1]));
      dim('Keys: Up/Down history, Tab complete, Ctrl+L clear, Ctrl+C cancel line');
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
      if (!rest) { err('usage: open <app>'); dim('apps lists the ids'); return; }
      const m = findApps(rest);
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
    theme(args) {
      const cur = prefsGet('theme') === 'light' ? 'light' : 'dark';
      if (!args.length) { print('Theme: ' + cur); dim('Themes: ' + THEMES.join(', ') + ' (theme <name> sets it; Terminal itself stays green)'); return; }
      const t = args[0].toLowerCase();
      if (THEMES.indexOf(t) < 0) { err('theme: unknown theme "' + args[0] + '"'); dim('Themes: ' + THEMES.join(', ')); return; }
      if (!prefsSet('theme', t === 'dark' ? '' : t)) { err('theme: could not save (storage blocked)'); return; }
      print('Theme set to ' + t);
    },
  };
  const NAMES = Object.keys(CMDS);

  let busy = null;
  function run(line) {
    print(PS + line);
    remember(line);
    hPos = hist.length; draft = '';
    const t = line.trim();
    if (!t) return;
    const name = t.split(/\s+/)[0];
    const rest = t.slice(name.length).trim();
    const args = rest ? rest.split(/\s+/) : [];
    const fn = Object.prototype.hasOwnProperty.call(CMDS, name) ? CMDS[name] : null;
    if (!fn) { err(name + ': command not found'); return; }
    try {
      const p = fn(args, rest);
      if (p && p.then) { busy = p; p.then(() => { if (busy === p) busy = null; toBottom(); }); }
    } catch (e) { err(name + ': ' + (e && e.message ? e.message : 'failed')); }
  }

  /* ---------- Tab completion ---------- */
  function commonPrefix(list) {
    let p = list[0] || '';
    list.forEach((s) => { while (s.toLowerCase().indexOf(p.toLowerCase()) !== 0) p = p.slice(0, -1); });
    return p;
  }
  function complete() {
    const v = input.value, pos = input.selectionStart == null ? v.length : input.selectionStart;
    const head = v.slice(0, pos), tail = v.slice(pos);
    const m = head.match(/^(\s*)(\S*)$/);
    let word, pool;
    if (m) { word = m[2]; pool = NAMES; }
    else {
      const cmd = head.trim().split(/\s+/)[0];
      word = head.match(/(\S*)$/)[1];
      pool = cmd === 'open' ? appList().map((a) => a.id)
        : cmd === 'apps' ? categories().map((c) => c.toLowerCase())
          : cmd === 'theme' ? THEMES
            : cmd === 'help' ? NAMES : [];
    }
    const hits = pool.filter((s) => s.toLowerCase().indexOf(word.toLowerCase()) === 0).sort();
    if (!hits.length) return;
    const base = head.slice(0, head.length - word.length);
    if (hits.length === 1) {
      const nv = base + hits[0] + (tail[0] === ' ' ? '' : ' ');
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

  /* ---------- keys ---------- */
  function submit() {
    const line = input.value;
    setLine('');
    run(line);
    toBottom();
  }
  /** One key for the line; true = handled (the caller prevents the default). */
  function lineKey(k, ctrl, alt, meta) {
    if (k === 'Enter') { submit(); return true; }
    if (k === 'ArrowUp' && !alt) { histMove(-1); return true; }
    if (k === 'ArrowDown' && !alt) { histMove(1); return true; }
    if (k === 'Tab' && !alt && !ctrl && !meta) { complete(); return true; }
    if (ctrl && !alt && !meta && (k === 'l' || k === 'L')) { CMDS.clear(); return true; }
    if (ctrl && !alt && !meta && (k === 'c' || k === 'C')) {
      const sel = String(window.getSelection ? window.getSelection() : '');
      const inSel = input.selectionStart !== input.selectionEnd;
      if (sel || inSel) return false;   // copy
      print(PS + input.value + '^C');
      busy = null;
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
    if (tap && e.target !== input && !String(window.getSelection())) { e.preventDefault(); focusIn(); }
    tap = null;
  }, { passive: false });
  window.addEventListener('focus', () => setTimeout(focusIn, 0));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', toBottom);
  window.addEventListener('resize', toBottom);

  /* ---------- start ---------- */
  print('Hub Terminal (T1)');
  dim("Type 'help' for commands. Tab completes, Up/Down = history.");
  render();
  focusIn();
  window.HubTerminal = { run: (l) => run(String(l)), commands: NAMES.slice() };   // tests / console
})();
