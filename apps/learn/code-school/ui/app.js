/* Code School CS1a — a coding playground: editor (CS.editor) on the left, live preview on the right (stacked with
   Code / Preview tabs on a phone held upright). The preview is a sandboxed iframe (srcdoc, scripts allowed, no access
   to this site); it updates a moment after you stop typing (Auto-run) or when you press Run. console.log and errors
   from your page show in a small Messages strip. Files: save under a name (up to 12 on this device), open, delete,
   New page, Reset to the starter, Download as .html.
   localStorage: learn.code-school.draft (text), .slots {name: {code, t}}, .prefs {auto, close, name}. */
(() => {
  const VER = 'CS1a', K = 'learn.code-school.', store = LRN.store, MAX = 12, root = document.getElementById('app');
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

  const prefs = Object.assign({ auto: true, close: true, name: 'My page' }, store.read(K + 'prefs', {}) || {});
  const savePrefs = () => store.write(K + 'prefs', prefs);
  const slots = () => { const s = store.read(K + 'slots', {}); return s && typeof s === 'object' ? s : {}; };

  // ---------- layout ----------
  const tabs = h('div', { class: 'lrn-mode cs-tabs', role: 'group', 'aria-label': 'Show' },
    ['code', 'view'].map(t => h('button', { type: 'button', 'data-t': t, onclick: () => tab(t) }, t === 'code' ? 'Code' : 'Preview')));
  const chk = (label, key, fn) => h('label', { class: 'cs-chk' }, h('input', { type: 'checkbox', checked: prefs[key], onchange: e => { prefs[key] = e.target.checked; savePrefs(); fn && fn(); } }), label);
  const runBtn = h('button', { type: 'button', class: 'lrn-qc cs-run', title: 'Run (Ctrl+Enter)', onclick: () => { run(); tab('view'); } }, '\u25B6 Run');
  const codeSec = h('section', { class: 'cs-code', 'aria-label': 'Code' });
  const frame = h('iframe', { class: 'cs-frame', title: 'Preview of your page', sandbox: 'allow-scripts allow-modals allow-forms' });
  const msgs = h('div', { class: 'cs-msgs', 'aria-live': 'polite', hidden: true });
  const viewSec = h('section', { class: 'cs-view', 'aria-label': 'Preview' }, frame, msgs);
  const toast = h('div', { class: 'lrn-toast', hidden: true });
  const filesSheet = h('div', { class: 'cs-sheet', role: 'dialog', 'aria-label': 'Files', hidden: true });
  const helpSheet = h('div', { class: 'cs-sheet', role: 'dialog', 'aria-label': 'Help', hidden: true });
  root.className = 'lrn cs';
  root.replaceChildren(
    h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Code School')), tabs,
      h('button', { type: 'button', class: 'lrn-qc', 'aria-label': 'Help', onclick: () => open(helpSheet) }, '?'), h('span', { class: 'cs-ver' }, VER)),
    h('div', { class: 'cs-bar' }, runBtn, chk('Auto-run', 'auto', () => prefs.auto && run()), chk('Close tags', 'close'),
      h('button', { type: 'button', class: 'lrn-qc', onclick: () => { paintFiles(); open(filesSheet); } }, '\u{1F4C1} Files'),
      h('button', { type: 'button', class: 'lrn-qc', onclick: download }, '\u2B07 Download')),
    h('main', { class: 'cs-main', id: 'lrn-main' }, codeSec, viewSec), filesSheet, helpSheet, toast);

  let timer = 0, tt = 0;
  const ed = CS.editor(codeSec, { autoClose: () => prefs.close, onChange: () => {
    clearTimeout(timer); timer = setTimeout(() => { store.write(K + 'draft', ed.value); prefs.auto && run(); }, 600);
  } });
  function run() { clearTimeout(timer); store.write(K + 'draft', ed.value); msgs.replaceChildren(); msgs.hidden = true; frame.srcdoc = withHook(ed.value); }
  function say(t) { toast.textContent = t; toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => { toast.hidden = true; }, 1800); }
  function tab(t) { root.dataset.tab = t; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t))); }
  function load(code, name) { ed.value = code; if (name) { prefs.name = name; savePrefs(); } run(); }
  window.addEventListener('message', e => {
    if (e.source !== frame.contentWindow || !e.data || e.data.cs !== 1) return;
    if (msgs.childElementCount > 50) msgs.firstChild.remove();
    msgs.append(h('div', { class: 'cs-m cs-' + e.data.k }, (e.data.k === 'error' ? '\u26A0 ' : '\u203A ') + String(e.data.t).slice(0, 300)));
    msgs.hidden = false; msgs.scrollTop = msgs.scrollHeight;
  });

  // ---------- files ----------
  const slug = n => (n || 'my-page').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-page';
  function download() {
    const a = h('a', { href: URL.createObjectURL(new Blob([ed.value], { type: 'text/html' })), download: slug(prefs.name) + '.html' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); say('Downloaded ' + slug(prefs.name) + '.html');
  }
  function save(name) {
    name = (name || '').trim().slice(0, 40) || 'My page'; const s = slots();
    if (!s[name] && Object.keys(s).length >= MAX) return say('Up to ' + MAX + ' saves: delete one first'), false;
    s[name] = { code: ed.value, t: Date.now() }; store.write(K + 'slots', s); prefs.name = name; savePrefs(); say('Saved \u201C' + name + '\u201D'); return true;
  }
  const twice = (label, fn) => { let armed = 0; const b = h('button', { type: 'button', class: 'lrn-qc', onclick: () => {
    if (armed) { clearTimeout(armed); armed = 0; fn(); return; }
    b.textContent = 'Tap again to confirm'; armed = setTimeout(() => { armed = 0; b.textContent = label; }, 3000); } }, label); return b; };
  function paintFiles() {
    const nameIn = h('input', { type: 'text', class: 'cs-name', value: prefs.name, maxlength: 40, 'aria-label': 'Name for this save' });
    const s = slots(), names = Object.keys(s).sort((a, b) => s[b].t - s[a].t);
    filesSheet.replaceChildren(h('div', { class: 'cs-card' },
      h('div', { class: 'cs-top' }, h('h2', null, 'Files'), h('button', { type: 'button', class: 'lrn-qc', onclick: close }, 'Close')),
      h('p', { class: 'cs-help' }, 'Saves stay on this device only (this browser). Download to keep a copy or share it.'),
      h('div', { class: 'cs-row' }, nameIn, h('button', { type: 'button', class: 'lrn-qc cs-run', onclick: () => { save(nameIn.value) && paintFiles(); } }, '\u{1F4BE} Save')),
      names.length ? h('ul', { class: 'cs-list' }, names.map(n => h('li', null, h('span', { class: 'cs-fn' }, n, h('small', null, new Date(s[n].t).toLocaleString())),
        h('button', { type: 'button', class: 'lrn-qc', onclick: () => { load(slots()[n].code, n); close(); tab('code'); say('Opened \u201C' + n + '\u201D'); } }, 'Open'),
        twice('Delete', () => { const x = slots(); delete x[n]; store.write(K + 'slots', x); paintFiles(); say('Deleted'); }))))
        : h('p', { class: 'cs-help' }, 'Nothing saved yet.'),
      h('div', { class: 'cs-row' },
        twice('\u2728 New page', () => { load(BLANK, 'New page'); close(); tab('code'); }),
        twice('\u21BA Reset to starter', () => { load(STARTER, 'My page'); close(); tab('code'); }),
        h('button', { type: 'button', class: 'lrn-qc', onclick: download }, '\u2B07 Download .html'))));
  }
  let openSheet = null;
  function open(sh) { close(); openSheet = sh; sh.hidden = false; const f = sh.querySelector('input,button'); f && f.focus(); }
  function close() { if (openSheet) openSheet.hidden = true; openSheet = null; }
  [filesSheet, helpSheet].forEach(sh => sh.addEventListener('click', e => { if (e.target === sh) close(); }));
  const tip = (b, t) => h('li', null, h('b', null, b), ' ', t);
  helpSheet.append(h('div', { class: 'cs-card' },
    h('div', { class: 'cs-top' }, h('h2', null, 'How to use Code School'), h('button', { type: 'button', class: 'lrn-qc', onclick: close }, 'Close')),
    h('p', { class: 'cs-help' }, 'Type a web page in the code box. The preview shows what it looks like. A web page has three parts:'),
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
    h('p', { class: 'cs-help' }, 'The preview runs in a safe box: your page cannot touch this site or your saves.')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openSheet) close();
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(prefs.name); }
  });

  // ---------- start: last draft or the starter ----------
  tab('code');
  const draft = store.read(K + 'draft', null);
  load(typeof draft === 'string' && draft.trim() ? draft : STARTER);
})();
