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
 *   H17: hover (mouse, window .hover-tabs) 100 ms → same tab message plus hover:true; leaving a
 *   hover-opened menu tab posts {type:'hub-menu-leave', id, delay:300} (app closes its menu).
 *   hub → app  {type:'hub-action', v:1, id:'tab:<id>'}  on a tab click (a menu:true tab
 *               such as File sends 'tab:file' too; the app draws its own menu)
 * Tabs are sized by the Hub from --wm-title-h (24 / 28 / 34); the app sends no sizes.
 * Each bar only uses messages whose source is its own iframe's contentWindow.
 * R58: hub → app messages go to location.origin only (same pattern as R57 hub_link), so a
 *   cross-origin page in a window never gets them; on file:// (every page is origin 'null') '*',
 *   which is still only the bar's own iframe.
 *   On http a frame whose document is not readable / not the Hub's origin is skipped (no
 *   'target origin does not match' console warning).
 * A bar is cleared when its iframe loads a new document (and, for the Hub frame, when
 * another app is opened). Apps that never answer are not affected.
 *
 * H49 Hub title bar (HO1 Office Quick Access: apps/office/shared/office-hubbar.js is the app side).
 * Desktop mode window bars only (__hubGamebarAttach); the Phone mode #gamebar never uses it.
 *   hub → app  {hubTitleBarHello:{v:1}}       with every hub-hello burst after an iframe load
 *   app → hub  {hubTitleBar:{v:1, op:'set', buttons:[{id,label,icon,enabled,title}],
 *               tabs:[{id,label}], activeTab}}
 *   app → hub  {hubTitleBar:{v:1, op:'update', buttons:[{id, label?, icon?, enabled?, title?}],
 *               activeTab?}}                  patch by id (unknown ids ignored)
 *   app → hub  {hubTitleBar:{v:1, op:'clear'}}
 *   hub → app  {hubTitleBarClick:{v:1, kind:'button'|'tab', id}}
 * Accepted only when event.source is the window's own iframe AND event.origin is the Hub's origin
 * ('null' on file://). At most 8 buttons / 10 tabs; textContent only (label 24, icon 4, title 60,
 * tab 20 chars). Bar order: app name, quick buttons, tabs, stats, hub-app buttons, file name.
 * hubTitleBar tabs replace hub-app tabs (never both). When the tabs do not fit, they fold into
 * one ▾ button (active tab label) with a drop-down list. Disabled buttons are greyed out and do
 * nothing. Keys stay in the app (the Hub adds no shortcuts); focus goes back to the iframe after
 * a click. Cleared on a new document / src change in the iframe, on op:'clear', and in Phone mode.
 */
(function () {
  const V = 1;
  const HELLO_RETRY_MS = [0, 150, 400, 900, 1800];
  const MAX_STATS = 4;
  const MAX_BUTTONS = 3;
  const MAX_TABS = 8;
  const TB_MAX_BUTTONS = 8;   // H49 hubTitleBar
  const TB_MAX_TABS = 10;
  const bars = new Set();   // live bar instances
  const IS_FILE = location.protocol === 'file:';
  const TARGET = IS_FILE ? '*' : location.origin;   // R58
  /** R58: the frame shows a page of the Hub's own origin (file://: can't tell, every page is 'null'). */
  function ownDoc(w) {
    if (IS_FILE) return true;
    try { return w.location.origin === location.origin; } catch (_) { return false; }
  }

  function str(v, max) { return String(v == null ? '' : v).slice(0, max); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** One app bar: frame = its iframe, bar = the element it draws into. */
  function makeBar(frame, bar, opts) {
    const titleBar = !!(opts && opts.titleBar);   // H49: window title bar (Desktop mode) only
    let linked = false;
    let legacy = null;          // H49: last hub-app message (redrawn together with tb)
    let tb = null;              // H49: {buttons:[], tabs:[], activeTab} from hubTitleBar
    const tbBtnEls = new Map(); // H49: quick button id → button
    let tbMenu = null;          // H49: open ▾ tab list
    let foldEl = null, stripEl = null;
    let retryTimers = [];
    const statEls = new Map();
    const tabEls = new Map();   // R44: tab id → button
    let fileEl = null;          // R44: file name span

    function post(msg) {
      const w = frame.contentWindow;
      if (!w || !ownDoc(w)) return;   // R58: another site in the frame gets nothing (and no console warning)
      try { w.postMessage(Object.assign({ v: V }, msg), TARGET); } catch (_) { /* ignore */ }
    }
    function sendHello() {
      post({ type: 'hub-hello' });
      if (titleBar && deskOn() && !tb) postRaw({ hubTitleBarHello: { v: V } });   // H49
    }
    function postRaw(msg) {   // H49: the hubTitleBar messages are {hubTitleBar…:{v:1,…}} (no type)
      const w = frame.contentWindow;
      if (!w || !ownDoc(w)) return;
      try { w.postMessage(msg, TARGET); } catch (_) { /* ignore */ }
    }
    function clearRetries() { retryTimers.forEach(clearTimeout); retryTimers = []; }
    function clear() {
      linked = false;
      legacy = null;
      tb = null;
      clearRetries();
      statEls.clear();
      tabEls.clear();
      tbBtnEls.clear();
      closeMenu();
      foldEl = stripEl = null;
      fileEl = null;
      bar.classList.remove('gb-has-tabs', 'gb-has-tb', 'gb-fold');
      bar.textContent = '';
      bar.hidden = true;
    }
    function helloBurst() {
      clearRetries();
      HELLO_RETRY_MS.forEach((ms) => {
        // Legacy: if (!linked) sendHello();   H49: also until the app answered hubTitleBar
        retryTimers.push(setTimeout(() => {
          if (!linked) sendHello();
          else if (titleBar && !tb && deskOn()) postRaw({ hubTitleBarHello: { v: V } });   // legacy part linked: tb hello only
        }, ms));
      });
    }
    function render(d) { legacy = d; draw(); }   // H49: hub-app message (drawn with the tb part)
    /** H49: the whole bar = legacy hub-app part + hubTitleBar part (tb). */
    function draw() {
      closeMenu();
      if (!legacy && !tb) { const keep = linked; clear(); linked = keep; return; }
      const d = legacy || {};
      const app = d.app && typeof d.app === 'object' ? d.app : (typeof d.app === 'string' ? { name: d.app } : {});
      bar.textContent = '';
      tbBtnEls.clear();
      foldEl = stripEl = null;
      statEls.clear();
      tabEls.clear();
      fileEl = null;
      const title = el('span', 'gb-title');
      const name = el('span', 'gb-name', str(app.name, 60));
      name.title = str(app.name, 60);
      title.appendChild(name);
      if (app.version != null && app.version !== '') title.appendChild(el('span', 'gb-ver', 'v' + str(app.version, 16)));
      bar.appendChild(title);
      bar.classList.toggle('gb-has-tb', !!tb);
      if (tb) renderTbButtons();
      // Legacy: renderTabs(d);   H49: hubTitleBar tabs win over hub-app tabs (never both)
      if (tb && tb.tabs.length) renderTbTabs(d); else renderTabs(d);
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
      if (tb && tb.tabs.length) requestAnimationFrame(fit);
    }

    /* ---------- H49 hubTitleBar ---------- */
    function deskOn() { return document.body.classList.contains('wm-desktop'); }
    function backToApp(b) { if (b) b.blur(); try { frame.focus(); } catch (_) { /* ignore */ } }
    function tbClick(kind, id) { postRaw({ hubTitleBarClick: { v: V, kind, id } }); }
    function tbButton(src, full) {
      const o = { id: str(src.id, 32) };
      if (full || src.label != null) o.label = str(src.label != null ? src.label : src.id, 24);
      if (full || src.icon != null) o.icon = str(src.icon, 4);
      if (full || src.enabled != null) o.enabled = src.enabled !== false;
      if (full || src.title != null) o.title = str(src.title, 60);
      return o;
    }
    function paintTbButton(btn, b) {
      btn.textContent = '';
      if (b.icon) btn.appendChild(el('span', 'gb-qicon', b.icon));
      else btn.appendChild(el('span', 'gb-qlabel', b.label));
      btn.title = b.title || b.label;
      btn.setAttribute('aria-label', b.label);
      btn.disabled = !b.enabled;
      btn.classList.toggle('gb-qbtn-off', !b.enabled);
    }
    function renderTbButtons() {
      if (!tb.buttons.length) return;
      const grp = el('div', 'gb-qa');
      grp.setAttribute('role', 'toolbar');
      tb.buttons.forEach((b) => {
        const btn = el('button', 'gb-qbtn');
        btn.type = 'button';
        btn.dataset.id = b.id;
        paintTbButton(btn, b);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = tb && tb.buttons.find((x) => x.id === b.id);
          if (cur && cur.enabled) tbClick('button', b.id);
          backToApp(btn);
        });
        btn.addEventListener('dblclick', (e) => e.stopPropagation());
        tbBtnEls.set(b.id, btn);
        grp.appendChild(btn);
      });
      bar.appendChild(grp);
    }
    function renderTbTabs(d) {
      bar.classList.add('gb-has-tabs');
      const strip = el('div', 'gb-tabs gb-tbtabs');
      strip.setAttribute('role', 'tablist');
      tb.tabs.forEach((t) => {
        const b = el('button', 'gb-tab', t.label);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.dataset.tab = t.id;
        b.addEventListener('click', (e) => { e.stopPropagation(); pickTab(t.id); backToApp(b); });
        b.addEventListener('dblclick', (e) => e.stopPropagation());
        tabEls.set(t.id, b);
        strip.appendChild(b);
      });
      bar.appendChild(strip);
      stripEl = strip;
      foldEl = el('button', 'gb-tab gb-fold-btn');
      foldEl.type = 'button';
      foldEl.setAttribute('aria-haspopup', 'menu');
      foldEl.addEventListener('click', (e) => { e.stopPropagation(); bar.scrollLeft = 0; if (tbMenu) closeMenu(); else openMenu(); });
      foldEl.addEventListener('dblclick', (e) => e.stopPropagation());
      bar.appendChild(foldEl);
      fileEl = el('span', 'gb-file');   // the hub-app file name still shows
      bar.appendChild(fileEl);
      setFile(d.title);
      setActiveTab(tb.activeTab);
    }
    function pickTab(id) {
      if (!tb) return;
      tb.activeTab = id;
      setActiveTab(id);
      tbClick('tab', id);
    }
    function foldLabel() {
      if (!foldEl || !tb) return;
      const t = tb.tabs.find((x) => x.id === tb.activeTab) || tb.tabs[0];
      foldEl.textContent = (t ? t.label : '') + ' \u25BE';
      foldEl.title = 'Tabs';
    }
    /** Narrow window: fold the tab strip into the ▾ button (measured with the strip shown). */
    function fit() {
      if (!stripEl || !bar.isConnected) return;
      bar.classList.remove('gb-fold');
      const over = bar.scrollWidth > bar.clientWidth + 1 || stripEl.scrollWidth > stripEl.clientWidth + 1;
      bar.classList.toggle('gb-fold', over);
      bar.scrollLeft = 0;   // overflow:hidden bar: a focused button must not scroll the quick buttons away
      if (!over) closeMenu();
      foldLabel();
    }
    function closeMenu() {
      if (!tbMenu) return;
      tbMenu.remove();
      tbMenu = null;
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', closeMenu);
      document.removeEventListener('keydown', escKey, true);
    }
    function outside(e) { if (tbMenu && !tbMenu.contains(e.target) && e.target !== foldEl) closeMenu(); }
    function escKey(e) { if (e.key === 'Escape') { closeMenu(); backToApp(foldEl); } }
    function openMenu() {
      if (!tb || !foldEl) return;
      closeMenu();
      const m = el('div', 'gb-tabmenu');
      m.setAttribute('role', 'menu');
      tb.tabs.forEach((t) => {
        const it = el('button', 'gb-tabmenu-it' + (t.id === tb.activeTab ? ' gb-tab-on' : ''), t.label);
        it.type = 'button';
        it.setAttribute('role', 'menuitem');
        it.dataset.tab = t.id;
        it.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); pickTab(t.id); foldLabel(); backToApp(null); });
        m.appendChild(it);
      });
      const r = foldEl.getBoundingClientRect();
      m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 180)) + 'px';
      m.style.top = (r.bottom + 2) + 'px';
      document.body.appendChild(m);
      tbMenu = m;
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('blur', closeMenu);   // a click into an iframe
      document.addEventListener('keydown', escKey, true);
    }
    function originOk(e) { return e.origin === location.origin || (IS_FILE && e.origin === 'null'); }
    function onTitleBar(m) {
      if (!m || typeof m !== 'object' || m.v !== V) return;
      if (!deskOn()) { if (tb) { tb = null; draw(); } return; }   // Desktop mode only
      if (m.op === 'set') {
        const buttons = (Array.isArray(m.buttons) ? m.buttons : []).filter((b) => b && b.id != null).slice(0, TB_MAX_BUTTONS).map((b) => tbButton(b, true));
        const tabs = (Array.isArray(m.tabs) ? m.tabs : []).filter((t) => t && t.id != null).slice(0, TB_MAX_TABS)
          .map((t) => ({ id: str(t.id, 32), label: str(t.label != null ? t.label : t.id, 20) }));
        tb = { buttons, tabs, activeTab: m.activeTab != null ? str(m.activeTab, 32) : (tabs[0] ? tabs[0].id : '') };
        clearRetries();
        draw();
      } else if (m.op === 'update' && tb) {
        (Array.isArray(m.buttons) ? m.buttons : []).slice(0, TB_MAX_BUTTONS).forEach((p) => {
          if (!p || p.id == null) return;
          const cur = tb.buttons.find((x) => x.id === str(p.id, 32));
          if (!cur) return;
          Object.assign(cur, tbButton(p, false));
          const btn = tbBtnEls.get(cur.id);
          if (btn) paintTbButton(btn, cur);
        });
        if (m.activeTab != null) { tb.activeTab = str(m.activeTab, 32); setActiveTab(tb.activeTab); foldLabel(); }
      } else if (m.op === 'clear') {
        if (tb) { tb = null; draw(); }
      }
    }
    function hoverOn() { const win = frame.closest && frame.closest('.wm-win'); return !!(win && win.classList.contains('hover-tabs')); }
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
        // H17: hover to open (mouse only, window has .hover-tabs from hub-app-caps hoverTabs:true)
        let hT = 0, lT = 0;
        b.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || !hoverOn()) return;
          clearTimeout(lT);
          if (t.menu && b._hoverOpen) return;
          clearTimeout(hT);
          hT = setTimeout(() => {
            if (t.menu) b._hoverOpen = true; else setActiveTab(id);
            post({ type: 'hub-action', id: 'tab:' + id, hover: true });
          }, 100);
        });
        b.addEventListener('pointerleave', (e) => {
          if (e.pointerType !== 'mouse') return;
          clearTimeout(hT);
          if (!t.menu || !b._hoverOpen) return;
          // the menu lives in the app: tell it the pointer left File; the app closes the menu
          // 300 ms later unless the pointer is on the menu (or comes back to File: re-enter cancels)
          lT = setTimeout(() => { b._hoverOpen = false; post({ type: 'hub-menu-leave', id, delay: 300 }); }, 0);
        });
        b.addEventListener('click', () => { clearTimeout(hT); clearTimeout(lT); b._hoverOpen = false; }, true);
        tabEls.set(id, b);
        strip.appendChild(b);
      });
      bar.appendChild(strip);
      // R42: fade hint at an edge with more tabs behind it (small phones scroll the strip)
      const fade = () => {
        const more = strip.scrollWidth - strip.clientWidth;
        strip.classList.toggle('gb-more-r', more > 1 && strip.scrollLeft < more - 1);
        strip.classList.toggle('gb-more-l', strip.scrollLeft > 1);
      };
      strip.addEventListener('scroll', fade, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(fade).observe(strip);
      requestAnimationFrame(fade);
      fileEl = el('span', 'gb-file');
      bar.appendChild(fileEl);
      setFile(d.title);
      setActiveTab(d.activeTab != null ? d.activeTab : '');
    }
    function onMessage(e) {
      if (!e.source || e.source !== frame.contentWindow) return;
      // H49: hubTitleBar (window bars only, same origin only)
      if (titleBar && e.data && typeof e.data === 'object' && e.data.hubTitleBar) {
        if (originOk(e)) onTitleBar(e.data.hubTitleBar);
        return;
      }
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
        if (tb && tb.tabs.length && d.id != null) { tb.activeTab = str(d.id, 32); foldLabel(); }   // H49
      } else if (d.type === 'hub-title' && linked) {
        setFile(d.value);
      }
    }
    // New document in the iframe (app switch, redirect, reload): start over.
    const onLoad = () => { clear(); helloBurst(); };
    frame.addEventListener('load', onLoad);
    // H49: auto-clear the title-bar part as soon as the frame is pointed elsewhere (before load)
    let srcMo = null, ro = null;
    if (titleBar) {
      srcMo = new MutationObserver(() => { if (tb) { tb = null; draw(); } });
      srcMo.observe(frame, { attributes: true, attributeFilter: ['src'] });
      const win = frame.closest && frame.closest('.wm-win');
      if (window.ResizeObserver && win) { ro = new ResizeObserver(() => { if (stripEl) fit(); }); ro.observe(win); }
    }
    const inst = {
      onMessage, clear, hello: sendHello, kick: helloBurst,
      /** H49: Phone mode / tests: drop the hubTitleBar part */
      tbClear() { if (tb) { tb = null; draw(); } },
      tbState() { return tb ? JSON.parse(JSON.stringify(tb)) : null; },
      destroy() {
        clear(); frame.removeEventListener('load', onLoad);
        if (srcMo) srcMo.disconnect(); if (ro) ro.disconnect();
        bars.delete(inst);
      }
    };
    bars.add(inst);
    return inst;
  }

  window.addEventListener('message', (e) => { bars.forEach((b) => b.onMessage(e)); });
  // H49: hubTitleBar is Desktop mode only
  window.addEventListener('hub-wm-mode', (e) => { if (e.detail && e.detail.mode !== 'desktop') bars.forEach((b) => b.tbClear && b.tbClear()); });

  /** wm_windows.js: an app bar inside a window's title bar. Returns { destroy }. */
  window.__hubGamebarAttach = (frame, slot) => {
    // Legacy: const b = makeBar(frame, slot);
    const b = makeBar(frame, slot, { titleBar: true });   // H49: window bars take hubTitleBar
    b.kick();   // the window's page may already be loading / loaded
    return b;
  };

  /* R42: Phone mode Home button (#home-btn in .header-left): back to the home tiles
     (#empty > .home) via hub.js goHome. Shown only while an app is open in Phone mode;
     never in Desktop mode (CSS hides it; the taskbar has Show desktop there). */
  (function homeBtn() {
    const btn = document.getElementById('home-btn');
    const empty = document.getElementById('empty');
    if (!btn || !empty) return;
    const sync = () => {
      const desk = document.body.classList.contains('wm-desktop');
      btn.hidden = desk || empty.classList.contains('hidden') === false;
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.__hubHome) window.__hubHome();   // AH1-F1: Home screen or App Hub (Settings → Desktop)
      else if (window.__hubGoHome) window.__hubGoHome();
      sync();
      btn.blur();
    });
    new MutationObserver(sync).observe(empty, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
  })();

  const frame = document.getElementById('app-frame');
  const bar = document.getElementById('gamebar');
  if (!frame || !bar) return;
  const main = makeBar(frame, bar);
  // Another app picked (src / data-app changes before the new page loads; hub.js sets
  // data-app on every switch): clear at once.
  new MutationObserver(main.clear).observe(frame, { attributes: true, attributeFilter: ['src', 'data-app'] });
  window.__hubGamebar = { clear: main.clear, hello: main.hello };
})();
