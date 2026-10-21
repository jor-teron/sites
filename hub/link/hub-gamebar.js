/**
 * sites hub — app bar (generic; any app in the iframe may use it).
 * Phone mode: in the header centre (#gamebar) for the Hub frame (#app-frame).
 * Desktop mode: in each window's title bar (wm_windows.js calls __hubGamebarAttach(frame, slot)).
 *
 * Protocol (window.postMessage, all messages carry v: 1):
 *   hub → app  {type:'hub-hello', v:1}      after every iframe load (a few quick
 *                                            retries) and whenever the app says hub-ready
 *   app → hub  {type:'hub-ready'}            optional, on load (order does not matter)
 *   app → hub  {type:'hub-app', v:1, app:{name, version},
 *               stats:[{id, label, value}], buttons:[{id, label}]}
 *   app → hub  {type:'hub-stat', v:1, id, value}
 *   hub → app  {type:'hub-action', v:1, id}  when a bar button is clicked
 * R44 ribbon tabs (e.g. Draftly), same v:1, all optional:
 *   app → hub  {type:'hub-app', v:1, app (string or {name, version}),
 *               tabs:[{id, label, menu?}], activeTab, title}   title = file name
 *   app → hub  {type:'hub-tab', v:1, id}       active tab changed inside the app
 *   app → hub  {type:'hub-title', v:1, value}  file name changed
 *   hub → app  {type:'hub-action', v:1, id:'tab:<id>'}  on a tab click (a menu:true tab
 *               such as File sends 'tab:file' too; the app draws its own menu)
 * Tabs are sized by the Hub from --wm-title-h (24 / 28 / 34); the app sends no sizes.
 * Each bar only uses messages whose source is its own iframe's contentWindow.
 * A bar is cleared when its iframe loads a new document (and, for the Hub frame, when
 * another app is opened). Apps that never answer are not affected.
 */
(function () {
  const V = 1;
  const HELLO_RETRY_MS = [0, 150, 400, 900, 1800];
  const MAX_STATS = 4;
  const MAX_BUTTONS = 3;
  const MAX_TABS = 8;
  const bars = new Set();   // live bar instances

  function str(v, max) { return String(v == null ? '' : v).slice(0, max); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** One app bar: frame = its iframe, bar = the element it draws into. */
  function makeBar(frame, bar) {
    let linked = false;
    let retryTimers = [];
    const statEls = new Map();
    const tabEls = new Map();   // R44: tab id → button
    let fileEl = null;          // R44: file name span

    function post(msg) {
      const w = frame.contentWindow;
      if (!w) return;
      try { w.postMessage(Object.assign({ v: V }, msg), '*'); } catch (_) { /* ignore */ }
    }
    function sendHello() { post({ type: 'hub-hello' }); }
    function clearRetries() { retryTimers.forEach(clearTimeout); retryTimers = []; }
    function clear() {
      linked = false;
      clearRetries();
      statEls.clear();
      tabEls.clear();
      fileEl = null;
      bar.classList.remove('gb-has-tabs');
      bar.textContent = '';
      bar.hidden = true;
    }
    function helloBurst() {
      clearRetries();
      HELLO_RETRY_MS.forEach((ms) => {
        retryTimers.push(setTimeout(() => { if (!linked) sendHello(); }, ms));
      });
    }
    function render(d) {
      const app = d.app && typeof d.app === 'object' ? d.app : (typeof d.app === 'string' ? { name: d.app } : {});
      bar.textContent = '';
      statEls.clear();
      tabEls.clear();
      fileEl = null;
      const title = el('span', 'gb-title');
      const name = el('span', 'gb-name', str(app.name, 60));
      name.title = str(app.name, 60);
      title.appendChild(name);
      if (app.version != null && app.version !== '') title.appendChild(el('span', 'gb-ver', 'v' + str(app.version, 16)));
      bar.appendChild(title);
      renderTabs(d);
      (Array.isArray(d.stats) ? d.stats : []).slice(0, MAX_STATS).forEach((st) => {
        if (!st || st.id == null) return;
        const chip = el('span', 'gb-stat');
        chip.appendChild(el('span', 'gb-label', str(st.label != null ? st.label : st.id, 20)));
        const val = el('b', 'gb-val', str(st.value, 20));
        chip.appendChild(val);
        statEls.set(String(st.id), val);
        bar.appendChild(chip);
      });
      (Array.isArray(d.buttons) ? d.buttons : []).slice(0, MAX_BUTTONS).forEach((b) => {
        if (!b || b.id == null) return;
        const btn = el('button', 'gb-btn', str(b.label != null ? b.label : b.id, 24));
        btn.type = 'button';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          post({ type: 'hub-action', id: String(b.id) });
          btn.blur();
          try { frame.focus(); } catch (_) { /* ignore */ }
        });
        bar.appendChild(btn);
      });
      bar.hidden = false;
    }
    function setActiveTab(id) {
      tabEls.forEach((b, k) => {
        const on = k === String(id);
        b.classList.toggle('gb-tab-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    function setFile(v) {
      if (!fileEl) return;
      const s = str(v, 120);
      fileEl.textContent = s;
      fileEl.title = s;
      fileEl.hidden = !s;
    }
    // R44: ribbon tabs + file name (only when the app sends tabs)
    function renderTabs(d) {
      const tabs = (Array.isArray(d.tabs) ? d.tabs : []).filter((t) => t && t.id != null).slice(0, MAX_TABS);
      bar.classList.toggle('gb-has-tabs', tabs.length > 0);
      if (!tabs.length) return;
      const strip = el('div', 'gb-tabs');
      strip.setAttribute('role', 'tablist');
      tabs.forEach((t) => {
        const id = String(t.id);
        const b = el('button', 'gb-tab' + (t.menu ? ' gb-tab-menu' : ''), str(t.label != null ? t.label : id, 20));
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.dataset.tab = id;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!t.menu) setActiveTab(id);   // a menu tab (File) does not change the selection
          post({ type: 'hub-action', id: 'tab:' + id });
          b.blur();
          try { frame.focus(); } catch (_) { /* ignore */ }
        });
        b.addEventListener('dblclick', (e) => e.stopPropagation());   // no maximise from a tab
        tabEls.set(id, b);
        strip.appendChild(b);
      });
      bar.appendChild(strip);
      fileEl = el('span', 'gb-file');
      bar.appendChild(fileEl);
      setFile(d.title);
      setActiveTab(d.activeTab != null ? d.activeTab : '');
    }
    function onMessage(e) {
      if (!e.source || e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'hub-ready') { sendHello(); return; }
      if (d.v !== V) return;
      if (d.type === 'hub-app') {
        linked = true;
        clearRetries();
        render(d);
      } else if (d.type === 'hub-stat' && linked) {
        const val = statEls.get(String(d.id));
        if (val) val.textContent = str(d.value, 20);
      } else if (d.type === 'hub-tab' && linked) {
        setActiveTab(d.id);
      } else if (d.type === 'hub-title' && linked) {
        setFile(d.value);
      }
    }
    // New document in the iframe (app switch, redirect, reload): start over.
    const onLoad = () => { clear(); helloBurst(); };
    frame.addEventListener('load', onLoad);
    const inst = {
      onMessage, clear, hello: sendHello, kick: helloBurst,
      destroy() { clear(); frame.removeEventListener('load', onLoad); bars.delete(inst); }
    };
    bars.add(inst);
    return inst;
  }

  window.addEventListener('message', (e) => { bars.forEach((b) => b.onMessage(e)); });

  /** wm_windows.js: an app bar inside a window's title bar. Returns { destroy }. */
  window.__hubGamebarAttach = (frame, slot) => {
    const b = makeBar(frame, slot);
    b.kick();   // the window's page may already be loading / loaded
    return b;
  };

  const frame = document.getElementById('app-frame');
  const bar = document.getElementById('gamebar');
  if (!frame || !bar) return;
  const main = makeBar(frame, bar);
  // Another app picked (src / data-app changes before the new page loads; hub.js sets
  // data-app on every switch): clear at once.
  new MutationObserver(main.clear).observe(frame, { attributes: true, attributeFilter: ['src', 'data-app'] });
  window.__hubGamebar = { clear: main.clear, hello: main.hello };
})();
