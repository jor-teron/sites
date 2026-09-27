/**
 * sites hub — app bar in the header centre (generic; any app in the iframe may use it).
 *
 * Protocol (window.postMessage, all messages carry v: 1):
 *   hub → app  {type:'hub-hello', v:1}      after every iframe load (a few quick
 *                                            retries) and whenever the app says hub-ready
 *   app → hub  {type:'hub-ready'}            optional, on load (order does not matter)
 *   app → hub  {type:'hub-app', v:1, app:{name, version},
 *               stats:[{id, label, value}], buttons:[{id, label}]}
 *   app → hub  {type:'hub-stat', v:1, id, value}
 *   hub → app  {type:'hub-action', v:1, id}  when a header button is clicked
 * Only messages whose source is the current iframe's contentWindow are used.
 * The bar is cleared when the iframe navigates / another app is opened.
 * Apps that never answer are not affected.
 */
(function () {
  const V = 1;
  const HELLO_RETRY_MS = [0, 150, 400, 900, 1800];
  const MAX_STATS = 4;
  const MAX_BUTTONS = 3;
  const frame = document.getElementById('app-frame');
  const bar = document.getElementById('gamebar');
  if (!frame || !bar) return;

  let linked = false;
  let retryTimers = [];
  const statEls = new Map();

  function post(msg) {
    const w = frame.contentWindow;
    if (!w) return;
    try { w.postMessage(Object.assign({ v: V }, msg), '*'); } catch (_) { /* ignore */ }
  }

  function sendHello() { post({ type: 'hub-hello' }); }

  function clearRetries() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
  }

  function clearBar() {
    linked = false;
    clearRetries();
    statEls.clear();
    bar.textContent = '';
    bar.hidden = true;
  }

  function helloBurst() {
    clearRetries();
    HELLO_RETRY_MS.forEach((ms) => {
      retryTimers.push(setTimeout(() => { if (!linked) sendHello(); }, ms));
    });
  }

  function str(v, max) { return String(v == null ? '' : v).slice(0, max); }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(d) {
    const app = d.app && typeof d.app === 'object' ? d.app : {};
    bar.textContent = '';
    statEls.clear();

    const title = el('span', 'gb-title');
    const name = el('span', 'gb-name', str(app.name, 60));
    name.title = str(app.name, 60);
    title.appendChild(name);
    if (app.version != null && app.version !== '') title.appendChild(el('span', 'gb-ver', 'v' + str(app.version, 16)));
    bar.appendChild(title);

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

  window.addEventListener('message', (e) => {
    if (!e.source || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'hub-ready') {
      sendHello();
      return;
    }
    if (d.v !== V) return;
    if (d.type === 'hub-app') {
      linked = true;
      clearRetries();
      render(d);
    } else if (d.type === 'hub-stat' && linked) {
      const val = statEls.get(String(d.id));
      if (val) val.textContent = str(d.value, 20);
    }
  });

  // New document in the iframe (app switch, redirect, reload): start over.
  frame.addEventListener('load', () => {
    clearBar();
    helloBurst();
  });
  // Another app picked (src changes before the new page loads): clear at once.
  new MutationObserver(clearBar).observe(frame, { attributes: true, attributeFilter: ['src'] });

  window.__hubGamebar = { clear: clearBar, hello: sendHello };
})();
