/* Code School CS4 — a coding playground with two modes: Web (HTML/CSS/JS, CS1a) and SQL (CS4, ui/sql.js). Editor
   (CS.editor) on the left, live preview or SQL results on the right (stacked with Code / Preview or Results tabs on a
   phone held upright). The preview is a sandboxed iframe (srcdoc, scripts allowed, no access
   to this site); it updates a moment after you stop typing (Auto-run) or when you press Run. console.log and errors
   from your page show in a small Messages strip. Files: save under a name (up to 12 on this device), open, delete,
   New page, Reset to the starter, Download as .html or .sql (saves are tagged with their mode; Open switches mode).
   localStorage: learn.code-school.draft / .draft-sql (text), .slots {name: {code, t, mode}},
   .prefs {mode, auto, close, name, sqlName}; SQL mode also keeps .db (see ui/sql.js). */
(() => {
  const VER = 'CS4', K = 'learn.code-school.', store = LRN.store, MAX = 12, root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  const STARTER = [
    '<!DOCTYPE html>', '<html>', '<head>', '  <title>My first page</title>', '  <style>',
    '    /* CSS: how things look */', '    body { font-family: sans-serif; background: #fdf6e3; color: #333; padding: 16px; }',
    '    h1 { color: #2a7ab0; }', '    button { font-size: 18px; padding: 8px 16px; border-radius: 8px; }', '  </style>',
    '</head>', '<body>', '  <!-- HTML: what is on the page -->', '  <h1>Hello!</h1>',
    '  <p>Change this text and watch the preview change.</p>', '  <button id="btn">Press me</button>',
    '  <p id="out"></p>', '  <script>', '    // JavaScript: what happens when you do something', '    let count = 0;',
    "    document.getElementById('btn').onclick = function () {", '      count = count + 1;',
    "      document.getElementById('out').textContent = 'You pressed ' + count + ' times';", '      console.log(count);',
    '    };', '  </script>', '</body>', '</html>', ''].join('\n');
  const BLANK = '<!DOCTYPE html>\n<html>\n<head>\n  <title>New page</title>\n  <style>\n\n  </style>\n</head>\n<body>\n\n  <script>\n\n  </script>\n</body>\n</html>\n';
  // tiny hook put in front of the page (same line, so line numbers stay right): sends console + errors to us
  const HOOK = '<script>(function(){function s(k,a){try{parent.postMessage({cs:1,k:k,t:[].map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);return o.apply(console,arguments)}});' +
    'addEventListener("error",function(e){s("error",["Line "+e.lineno+": "+e.message])})})()<\/script>';
  const withHook = c => { const m = c.match(/^\s*<!doctype[^>]*>/i); return m ? m[0] + HOOK + c.slice(m[0].length) : HOOK + c; };

  const prefs = Object.assign({ mode: 'web', auto: true, close: true, name: 'My page', sqlName: 'My queries' }, store.read(K + 'prefs', {}) || {});
  const M = () => prefs.mode === 'sql' ? 'sql' : 'web', NK = () => M() === 'sql' ? 'sqlName' : 'name', DRAFT = m => K + (m === 'sql' ? 'draft-sql' : 'draft');
  const TPL = { web: { starter: STARTER, blank: BLANK, newName: 'New page', name: 'My page' }, sql: { starter: CS.SQL_STARTER, blank: CS.SQL_BLANK, newName: 'New queries', name: 'My queries' } };
  const LANG = { web: { hl: CS.highlight, keys: CS.KEYS }, sql: { hl: CS.hlSql, keys: ['Tab', '*', ',', '(', ')', ';', "'", '=', '<', '>', '.', '%', '_'] } };
  const savePrefs = () => store.write(K + 'prefs', prefs);
  const slots = () => { const s = store.read(K + 'slots', {}); return s && typeof s === 'object' ? s : {}; };

  // ---------- layout ----------
  const modes = h('div', { class: 'lrn-mode cs-modes', role: 'group', 'aria-label': 'Language' },
    ['web', 'sql'].map(m => h('button', { type: 'button', 'data-m': m, title: m === 'web' ? 'HTML, CSS and JavaScript' : 'SQL database', onclick: () => M() !== m && setMode(m) }, m === 'web' ? 'Web' : 'SQL')));
  const tabs = h('div', { class: 'lrn-mode cs-tabs', role: 'group', 'aria-label': 'Show' },
    ['code', 'view'].map(t => h('button', { type: 'button', 'data-t': t, onclick: () => tab(t) }, t === 'code' ? 'Code' : 'Preview')));
  const chk = (label, key, fn) => h('label', { class: 'cs-chk', 'data-only': 'web' }, h('input', { type: 'checkbox', checked: prefs[key], onchange: e => { prefs[key] = e.target.checked; savePrefs(); fn && fn(); } }), label);
  const runBtn = h('button', { type: 'button', class: 'lrn-qc cs-run', title: 'Run (Ctrl+Enter)', onclick: () => { run(); tab('view'); } }, '\u25B6 Run');
  const selBtn = h('button', { type: 'button', class: 'lrn-qc', 'data-only': 'sql', title: 'Run only the selected text (Ctrl+Shift+Enter)', onclick: () => { runSel(); tab('view'); } }, 'Run selection');
  const dlBtn = h('button', { type: 'button', class: 'lrn-qc', onclick: () => download() }, '\u2B07 Download');
  const codeSec = h('section', { class: 'cs-code', 'aria-label': 'Code' });
  const sqlSec = h('section', { class: 'cs-sql', 'aria-label': 'Results' });
  const frame = h('iframe', { class: 'cs-frame', title: 'Preview of your page', sandbox: 'allow-scripts allow-modals allow-forms' });
  const msgs = h('div', { class: 'cs-msgs', 'aria-live': 'polite', hidden: true });
  const viewSec = h('section', { class: 'cs-view', 'aria-label': 'Preview' }, frame, msgs);
  const toast = h('div', { class: 'lrn-toast', hidden: true });
  const filesSheet = h('div', { class: 'cs-sheet', role: 'dialog', 'aria-label': 'Files', hidden: true });
  const helpSheet = h('div', { class: 'cs-sheet', role: 'dialog', 'aria-label': 'Help', hidden: true });
  root.className = 'lrn cs';
  root.replaceChildren(
    h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Code School')), modes, tabs,
      h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Help', onclick: () => open(helpSheet) }, '?'), h('span', { class: 'cs-ver' }, VER)),
    h('div', { class: 'cs-bar' }, runBtn, selBtn, chk('Auto-run', 'auto', () => prefs.auto && run()), chk('Close tags', 'close'),
      h('button', { type: 'button', class: 'lrn-qc', onclick: () => { paintFiles(); open(filesSheet); } }, '\u{1F4C1} Files'), dlBtn,
      h('button', { type: 'button', class: 'lrn-qc', 'data-only': 'sql', title: 'Download the database file', onclick: () => S.downloadDb(slug(prefs.sqlName)).catch(() => {}) }, '\u2B07 .db'),
      twice('\u21BA Reset DB', () => S.resetDb().then(() => say('Sample database restored')).catch(() => {}), 'sql')),
    h('main', { class: 'cs-main', id: 'lrn-main' }, codeSec, viewSec, sqlSec), filesSheet, helpSheet, toast);

  let timer = 0, tt = 0;
  const ed = CS.editor(codeSec, { autoClose: () => prefs.close && M() === 'web', onChange: () => {
    clearTimeout(timer); timer = setTimeout(() => { store.write(DRAFT(M()), ed.value); M() === 'web' && prefs.auto && run(); }, 600);
  } });
  const S = CS.sqlMode({ host: sqlSec, full: () => ed.value, say });
  function run() {
    clearTimeout(timer); store.write(DRAFT(M()), ed.value);
    if (M() === 'sql') return S.run(ed.value, 0).catch(() => {});
    msgs.replaceChildren(); msgs.hidden = true; frame.srcdoc = withHook(ed.value);
  }
  function runSel() { const { start, end } = ed.selection(); if (start === end) return run(); S.run(ed.value.slice(start, end), start).catch(() => {}); }
  function say(t, ms) { toast.textContent = t; toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => { toast.hidden = true; }, ms || 1800); }
  function setMode(m, code, name) {
    if (m !== M()) { clearTimeout(timer); store.write(DRAFT(M()), ed.value); }                 // keep the other mode's work
    prefs.mode = m; savePrefs(); root.dataset.mode = m;
    modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    tabs.lastChild.textContent = m === 'sql' ? 'Results' : 'Preview'; dlBtn.textContent = '\u2B07 ' + (m === 'sql' ? '.sql' : '.html');
    dlBtn.title = 'Download as ' + (m === 'sql' ? 'an .sql script' : 'an .html page'); runBtn.title = m === 'sql' ? 'Run all statements (Ctrl+Enter)' : 'Run (Ctrl+Enter)';
    ed.setLang(LANG[m]); document.title = 'Code School ' + VER + ' \u2013 ' + (m === 'sql' ? 'SQL' : 'Web');
    const d = store.read(DRAFT(m), null);
    load(code != null ? code : typeof d === 'string' && d.trim() ? d : TPL[m].starter, name);
    if (m === 'sql') S.ensure().catch(() => {});                                                  // sql.js loads only now
  }
  function tab(t) { root.dataset.tab = t; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t))); }
  function load(code, name) { ed.value = code; if (name) { prefs[NK()] = name; savePrefs(); } store.write(DRAFT(M()), code); M() === 'web' && run(); }
  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || !e.data || e.data.cs !== 1) return;
    if (msgs.childElementCount > 50) msgs.firstChild.remove();
    msgs.append(h('div', { class: 'cs-m cs-' + e.data.k }, (e.data.k === 'error' ? '\u26A0 ' : '\u203A ') + String(e.data.t).slice(0, 300)));
    msgs.hidden = false; msgs.scrollTop = msgs.scrollHeight;
  });

  // ---------- files ----------
  function twice(label, fn, only) {                                                               // two taps for anything that throws work away
    let armed = 0; const b = h('button', { type: 'button', class: 'lrn-qc', 'data-only': only, onclick: () => {
      if (armed) { clearTimeout(armed); armed = 0; b.textContent = label; fn(); return; }
      b.textContent = 'Tap again to confirm'; armed = setTimeout(() => { armed = 0; b.textContent = label; }, 3000); } }, label); return b;
  }
  const slug = n => (n || 'my-page').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-page';
  function download() {
    const ext = M() === 'sql' ? '.sql' : '.html', file = slug(prefs[NK()]) + ext;
    const a = h('a', { href: URL.createObjectURL(new Blob([ed.value], { type: M() === 'sql' ? 'application/sql' : 'text/html' })), download: file });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Downloaded ' + file);
  }
  function save(name) {
    name = (name || '').trim().slice(0, 40) || TPL[M()].name; const s = slots();
    if (!s[name] && Object.keys(s).length >= MAX) return say('Up to ' + MAX + ' saves: delete one first'), false;
    s[name] = { code: ed.value, t: Date.now(), mode: M() }; store.write(K + 'slots', s); prefs[NK()] = name; savePrefs(); say('Saved \u201C' + name + '\u201D'); return true;
  }
  function paintFiles() {
    const m = M(), nameIn = h('input', { type: 'text', class: 'cs-name', value: prefs[NK()], maxlength: 40, 'aria-label': 'Name for this save' });
    const s = slots(), names = Object.keys(s).sort((a, b) => s[b].t - s[a].t);
    filesSheet.replaceChildren(h('div', { class: 'cs-card' },
      h('div', { class: 'cs-top' }, h('h2', null, 'Files'), h('button', { type: 'button', class: 'lrn-qc', onclick: close }, 'Close')),
      h('p', { class: 'cs-help' }, 'Saves stay on this device only (this browser). Download to keep a copy or share it.'),
      h('div', { class: 'cs-row' }, nameIn, h('button', { type: 'button', class: 'lrn-qc cs-run', onclick: () => { save(nameIn.value) && paintFiles(); } }, '\u{1F4BE} Save')),
      names.length ? h('ul', { class: 'cs-list' }, names.map(n => h('li', null, h('span', { class: 'cs-fn' }, h('span', null, h('i', { class: 'cs-tag' }, s[n].mode === 'sql' ? 'SQL' : 'Web'), ' ', n), h('small', null, new Date(s[n].t).toLocaleString())),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => { const x = slots()[n], xm = x.mode === 'sql' ? 'sql' : 'web';
          if (xm !== M()) setMode(xm, x.code, n); else load(x.code, n); close(); tab('code'); say('Opened \u201C' + n + '\u201D'); } }, 'Open'),
        twice('Delete', () => { const x = slots(); delete x[n]; store.write(K + 'slots', x); paintFiles(); say('Deleted'); }))))
        : h('p', { class: 'cs-help' }, 'Nothing saved yet.'),
      h('div', { class: 'cs-row' },
        twice('\u2728 ' + TPL[m].newName, () => { load(TPL[m].blank, TPL[m].newName); close(); tab('code'); }),
        twice('\u21BA Reset to starter', () => { load(TPL[m].starter, TPL[m].name); close(); tab('code'); }),
        h('button', { type: 'button', class: 'lrn-qc', onclick: download }, '\u2B07 Download ' + (m === 'sql' ? '.sql' : '.html')),
        m === 'sql' ? h('button', { type: 'button', class: 'lrn-qc', onclick: () => S.downloadDb(slug(prefs.sqlName)).catch(() => {}) }, '\u2B07 Download .db') : null)));
  }
  let openSheet = null;
  function open(sh) { close(); openSheet = sh; sh.hidden = false; const f = sh.querySelector('input,button'); f && f.focus(); }
  function close() { if (openSheet) openSheet.hidden = true; openSheet = null; }
  [filesSheet, helpSheet].forEach(sh => sh.addEventListener('click', e => { if (e.target === sh) close(); }));
  const tip = (b, t) => h('li', null, h('b', null, b), ' ', t);
  helpSheet.append(h('div', { class: 'cs-card' },
    h('div', { class: 'cs-top' }, h('h2', null, 'How to use Code School'), h('button', { type: 'button', class: 'lrn-qc', onclick: close }, 'Close')),
    h('p', { class: 'cs-help' }, 'Pick Web to make a web page or SQL to work with a database. In Web mode, type a web page in the code box. The preview shows what it looks like. A web page has three parts:'),
    h('ul', { class: 'cs-tips' }, tip('HTML', 'is what is on the page: headings, text, buttons, pictures.'), tip('CSS', 'is how it looks: colours, sizes, spacing. It goes inside <style>.'),
      tip('JavaScript', 'is what happens when you tap or type. It goes inside <script>.')),
    h('h3', null, 'Editor tips'),
    h('ul', { class: 'cs-tips' }, tip('Run', 'shows your page. With Auto-run on it updates by itself a moment after you stop typing.'),
      tip('Tab', 'adds 2 spaces. Shift+Tab takes them away. Select many lines to move them all.'),
      tip('Enter', 'keeps the same indent and adds one more step after { or an opening tag.'),
      tip('Close tags', 'when on, typing <p> adds </p> for you.'),
      tip('Key bar', 'under the code (on phones) types < > / = and other signs that are hard to find.'),
      tip('Messages', 'under the preview shows console.log and mistakes, with the line number.'),
      tip('Ctrl+Enter', 'runs, Ctrl+S saves (on a computer keyboard).'),
      tip('Files', 'saves under a name, opens and deletes saves, starts a new page, resets to the starter or downloads an .html file.')),
    h('h3', null, 'SQL mode'),
    h('ul', { class: 'cs-tips' }, tip('SQL', 'asks a database questions (SELECT) and changes it (CREATE TABLE, INSERT, UPDATE, DELETE). End each statement with ;'),
      tip('Run', 'runs every statement from top to bottom. Each SELECT shows a table with its number of rows.'),
      tip('Run selection', 'runs only the text you selected (Ctrl+Shift+Enter).'),
      tip('Tables', 'lists every table and its columns (\u{1F511} = primary key). Tap a table to see its rows.'),
      tip('Mistakes', 'stop the run and show the line and what went wrong. Statements above it have already run.'),
      tip('Reset DB', 'brings back the sample school database: classes, students and marks.'),
      tip('Keeping', 'the database stays on this device after each change. \u2B07 .sql downloads your script and \u2B07 .db the database file.')),
    h('p', { class: 'cs-help' }, 'The preview runs in a safe box: your page cannot touch this site or your saves.')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openSheet) close();
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.shiftKey && M() === 'sql' ? runSel() : run(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(prefs[NK()]); }
  });

  // ---------- start: last mode, its last draft or the starter ----------
  tab('code'); setMode(M());
})();
