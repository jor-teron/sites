/* Agent — tests/ag42.test.cjs: AG42 in-app confirm and the image viewer after a delete.
   Node only: a tiny DOM stub, no browser, no network, no paid API. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { execFileSync } = require('node:child_process');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
function live(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
}

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name === 'tests') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (p.endsWith(path.join('app', 'api', 'hub'))) continue;
      walk(p, out);
    } else if (/\.(js|html)$/.test(name)) out.push(p);
  }
}

function offenses(file, src) {
  const s = live(src);
  const localPrompt = /function\s+prompt\s*\(/.test(s);
  const out = [];
  s.split('\n').forEach((line, n) => {
    if (/\bwindow\s*\.\s*(confirm|alert|prompt)\s*\(/.test(line)) out.push(n + 1 + ': ' + line.trim());
    const bare = line.match(/(^|[^\w.])(confirm|alert|prompt)\s*\(/g);
    if (bare) bare.forEach(tok => {
      const name = tok.match(/(confirm|alert|prompt)/)[1];
      if (name === 'prompt' && localPrompt) return;
      out.push(n + 1 + ': ' + line.trim());
    });
    if (/\.confirm\s*\(/.test(line) && !/HR\.confirm\s*\(/.test(line)) out.push(n + 1 + ': ' + line.trim());
  });
  return out;
}

test('no browser confirm, alert or prompt calls remain in the Agent app', () => {
  const files = [];
  walk(base, files);
  const bad = [];
  for (const f of files) {
    const rel = path.relative(base, f);
    if (rel === path.join('app', 'api', 'host.js')) continue;   /* sandbox forward for pinned hub copies; see below */
    const hits = offenses(rel, read(rel));
    if (hits.length) bad.push(rel + '\n  ' + hits.join('\n  '));
  }
  assert.deepEqual(bad, []);
  const host = read('app/api/host.js');
  assert.match(host, /confirm: function \(m\) \{ return real\.confirm\(m\); \}/);
  assert.equal(live(host).split('confirm(').length - 1, 1);
  assert.match(read('app/api/hub/api-keys.js'), /window\.confirm\(/);
  assert.equal(live(read('app/gui/confirm.js')).includes('innerHTML'), false);
});

function dom() {
  function node(tag) {
    return {
      tagName: String(tag).toUpperCase(), className: '', textContent: '', type: '', children: [], parentNode: null,
      listeners: {}, attrs: {}, open: false, modal: false,
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(ch) { ch.parentNode = this; this.children.push(ch); return ch; },
      removeChild(ch) { this.children = this.children.filter(c => c !== ch); ch.parentNode = null; ch.removed = true; return ch; },
      addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
      focus() { this.focused = true; document._focus = this; },
      close() { this.open = false; (this.listeners.close || []).slice().forEach(fn => fn()); },
      showModal() { this.open = true; this.modal = true; }
    };
  }
  const document = { _focus: null, createElement: node, body: null };
  document.body = node('body');
  return document;
}
function loadConfirm() {
  const document = dom();
  const window = {};
  const ctx = { document, window, Promise };
  vm.createContext(ctx);
  vm.runInContext(read('app/gui/confirm.js'), ctx, { filename: 'confirm.js' });
  return { HR: window.HR, document };
}
function buttons(dlg) { return dlg.children[1].children; }

test('HR.confirm resolves true on OK and false on Cancel, and leaves the page', async () => {
  let env = loadConfirm();
  let p = env.HR.confirm('Keep this chat?', { okText: 'Yes', cancelText: 'No' });
  let dlg = env.document.body.children[0];
  assert.equal(dlg.tagName, 'DIALOG');
  assert.equal(dlg.modal, true);
  assert.equal(dlg.children[0].textContent, 'Keep this chat?');
  let pair = buttons(dlg);
  assert.equal(pair[0].textContent, 'No');
  assert.equal(pair[1].textContent, 'Yes');
  assert.equal(env.document._focus, pair[1]);
  assert.equal(/hr-confirm-danger/.test(pair[1].className), false);
  pair[1].onclick();
  assert.equal(await p, true);
  assert.equal(dlg.parentNode, null);
  assert.equal(env.document.body.children.length, 0);

  env = loadConfirm();
  p = env.HR.confirm('Delete this picture?', { danger: true });
  dlg = env.document.body.children[0];
  pair = buttons(dlg);
  assert.equal(pair[0].textContent, 'Cancel');
  assert.equal(pair[1].textContent, 'OK');
  assert.match(pair[1].className, /hr-confirm-danger/);
  assert.equal(env.document._focus, pair[0]);
  assert.equal(pair[0].attrs.autofocus, '');
  pair[0].onclick();
  assert.equal(await p, false);
  assert.equal(dlg.removed, true);
});

test('Enter confirms, Esc (cancel event) cancels, and the message is text only', async () => {
  let env = loadConfirm();
  const nasty = 'Send 2 pieces to ollama / nomic?\n\n<img src=x onerror=alert(1)>';
  let p = env.HR.confirm(nasty, { danger: true });
  let dlg = env.document.body.children[0];
  assert.equal(dlg.children[0].textContent, nasty);
  assert.equal(dlg.children[0].className, 'hr-confirm-msg');
  let prevented = false;
  dlg.listeners.keydown[0]({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(await p, true);
  assert.equal(dlg.parentNode, null);

  env = loadConfirm();
  p = env.HR.confirm('Delete the semantic index? Only the derived index file is removed.', { danger: true });
  dlg = env.document.body.children[0];
  const ev = { prevented: false, preventDefault() { this.prevented = true; } };
  dlg.listeners.cancel[0](ev);
  assert.equal(ev.prevented, true);
  assert.equal(await p, false);
  assert.equal(env.document.body.children.length, 0);
});

function viewEl() {
  return {
    hidden: false, textContent: '', title: '', src: '', alt: '', href: '', download: '', offsetWidth: 1,
    classList: { add() {}, remove() {} }, listeners: {}, open: false,
    setAttribute() {}, removeAttribute(name) { if (name === 'src') this.src = ''; },
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    focus() { this.focused = true; },
    close() { this.open = false; (this.listeners.close || []).slice().forEach(fn => fn()); },
    showModal() { this.open = true; }
  };
}
function loadViewer(answer) {
  const ids = {};
  ['imgView', 'ivImg', 'ivCount', 'ivCap', 'ivDl', 'ivPrev', 'ivNext', 'ivDel', 'ivX', 'ivStage'].forEach(id => { ids[id] = viewEl(); });
  const HR = { confirm(msg, opt) { HR.last = { msg, opt }; return Promise.resolve(answer); } };
  const ctx = { HR, document: { getElementById: id => ids[id] }, Date, Promise };
  vm.createContext(ctx);
  vm.runInContext(read('app/gui/imageviewer.js'), ctx, { filename: 'imageviewer.js' });
  return { HR, ids };
}
function pic(id, url) { return { rec: { id: id, prompt: 'p' + id, model: 'm', time: 1700000000000 }, url: url }; }
async function shoot(answer, list, index, fresh) {
  const v = loadViewer(answer);
  let got = null;
  v.HR.imgviewer.open(list, index, { onDelete(rec) { got = rec; return Promise.resolve(fresh); } });
  await v.ids.ivDel.onclick();
  return { v, got };
}

test('image viewer rebuilds from the fresh list after a delete', async () => {
  const a = pic(1, 'blob:old-1'), b = pic(2, 'blob:old-2'), c = pic(3, 'blob:old-3');
  let r = await shoot(true, [a, b, c], 0, [pic(2, 'blob:new-2'), pic(3, 'blob:new-3')]);
  assert.equal(r.got.id, 1);
  assert.deepEqual(r.v.HR.last, { msg: 'Delete this picture?', opt: { danger: true } });
  assert.equal(r.v.ids.ivImg.src, 'blob:new-2');
  assert.equal(r.v.ids.ivCount.textContent, '1 / 2');
  assert.equal(r.v.ids.imgView.open, true);

  r = await shoot(true, [a, b, c], 2, [pic(1, 'blob:new-1'), pic(2, 'blob:new-2')]);
  assert.equal(r.got.id, 3);
  assert.equal(r.v.ids.ivImg.src, 'blob:new-2');
  assert.equal(r.v.ids.ivCount.textContent, '2 / 2');

  r = await shoot(true, [a, b], 0, [pic(3, 'blob:new-3'), pic(2, 'blob:new-2')]);
  assert.equal(r.v.ids.ivImg.src, 'blob:new-2');

  r = await shoot(true, [a], 0, []);
  assert.equal(r.v.ids.imgView.open, false);
  assert.equal(r.v.ids.ivImg.src, '');

  r = await shoot(false, [a, b], 0, [pic(2, 'blob:new-2')]);
  assert.equal(r.got, null);
  assert.equal(r.v.ids.ivImg.src, 'blob:old-1');
  assert.equal(r.v.ids.imgView.open, true);

  r = await shoot(true, [a, b], 0, null);
  assert.equal(r.v.ids.ivImg.src, 'blob:old-2');
  assert.equal(r.v.ids.ivCount.textContent, '1 / 1');
});

test('pages load confirm.js, the worker version is agent-ag44, and the old lines stay as comments', () => {
  for (const f of ['app/gui/confirm.js', 'app/gui/chats.js', 'app/gui/imageviewer.js', 'app/gui/knowview.js', 'app/gui/semview.js', 'app/gui/imagepage.js', 'agent_sw.js'])
    execFileSync(process.execPath, ['--check', path.join(base, f)]);
  const agent = read('agent.html'), image = read('image.html'), sw = read('agent_sw.js'), swLive = live(sw);
  assert.ok(agent.indexOf('src="app/gui/confirm.js"') < agent.indexOf('src="app/gui/knowview.js"'));
  assert.ok(agent.indexOf('src="app/gui/confirm.js"') < agent.indexOf('src="app/gui/semview.js"'));
  assert.ok(agent.indexOf('src="app/gui/confirm.js"') < agent.indexOf('src="app/gui/chats.js"'));
  assert.ok(image.indexOf('src="app/gui/confirm.js"') < image.indexOf('src="app/gui/imageviewer.js"'));
  for (const html of [agent, image]) {
    const urls = []; let m, re = /\s(?:src|href)="([^"#:]+)"/g;
    while ((m = re.exec(html))) urls.push(m[1]);
    assert.ok(urls.includes('app/gui/confirm.js'), html.slice(0, 20));
  }
  assert.match(swLive, /VER = 'agent-ag44'/);
  assert.equal(swLive.includes("VER = 'agent-ag42'"), false);
  assert.equal(swLive.includes("VER = 'agent-ag40'"), false);
  assert.match(sw, /AG44 Legacy: VER = 'agent-ag42'/);
  assert.match(sw, /AG42 Legacy: VER = 'agent-ag40'/);
  assert.match(sw, /app\/gui\/confirm\.js/);
  assert.match(read('ui/components.css'), /\.hr-confirm/);
  assert.match(read('agent_readme.md'), /## AG42 — In-app confirm/);
  for (const f of ['app/gui/chats.js', 'app/gui/knowview.js', 'app/gui/semview.js', 'app/gui/imageviewer.js', 'app/gui/imagepage.js'])
    assert.match(read(f), /\(before AG42\)/);
  const consent = live(read('app/gui/semview.js'));
  assert.match(consent, /your user\/assistant notes, topics and knowledge documents/);
  assert.match(consent, /The provider sees this text and may charge for it/);
  assert.match(consent, /Session notes are not sent/);
  assert.match(live(read('app/gui/imagepage.js')), /return fresh/);
  assert.match(live(read('app/gui/imagepage.js')), /\.then\(gallery\)/);
  assert.match(live(read('app/gui/imageviewer.js')), /fresh\.slice\(\)/);
});
