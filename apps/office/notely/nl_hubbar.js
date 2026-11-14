/* Notely — nl_hubbar.js (NL5): word count, Open and Download in the Hub
   window title bar, in that order.
   Uses HubTitleBar from ../shared/office-hubbar.js (set / update / onClick / onHello).
   Only after the Hub says hello (HubTitleBar.linked). Standalone, or a frame that
   never says hello, sends nothing and leaves the in-page toolbar visible.
   OfficeQuick is Undo | Redo | Save | Print plus ribbon tabs. Notely has none of
   that — its document actions are Open and Download — so this talks to HubTitleBar
   directly, the same contract the other Office apps use through OfficeQuick.
   The H49 title-bar contract has buttons and tabs only, no text item, and
   office-hubbar.js was not edited, so the count is a disabled button with no
   icon (Hub then draws the label). Labels are at most 24 characters; the full
   "N words · M characters" text (or a flash message) goes in the tooltip.
   Enabled flags for Open and Download mirror the in-page buttons (both stay
   on: notes autosave, and Download always writes the current text). A change
   to those flags, or to the count / flash text, pushes HubTitleBar.update.
   (before NL5) DEFS was only Open and Download; the in-page word count stayed. */
NL.hubbar = (function () {
  const DEFS = [
    { id: 'count', kind: 'status' },
    { id: 'open', el: 'btn-open', label: 'Open', icon: '📂', title: 'Open a text file (Ctrl+O)', run: () => NL.files.open() },
    { id: 'download', el: 'btn-download', label: 'Download', icon: '⤓', title: 'Download as Notely.txt (Ctrl+S)', run: () => NL.files.download() },
  ];
  let started = false;
  let sent = Object.create(null);
  let syncTimer = 0;

  function fitLabel(text) {
    let s = String(text == null ? '' : text);
    if (s.length <= 24) return s;
    s = s.replace(/characters\b/g, 'chars').replace(/character\b/g, 'char');
    if (s.length <= 24) return s;
    s = s.replace(/ words\b/g, ' w').replace(/ word\b/g, ' w')
      .replace(/ chars\b/g, ' ch').replace(/ char\b/g, ' ch');
    if (s.length <= 24) return s;
    return s.slice(0, 24);
  }
  function countText() {
    const el = document.getElementById('status');
    if (el && el.classList && el.classList.contains('flash') && el.dataset && el.dataset.msg) {
      return String(el.dataset.msg);
    }
    const t = el && el.textContent != null ? String(el.textContent).trim() : '';
    return t || '0 words · 0 characters';
  }
  function enabled(d) {
    if (d.kind === 'status') return false;
    const el = document.getElementById(d.el);
    return !(el && el.disabled);
  }
  function buttonFor(d) {
    if (d.kind === 'status') {
      const text = countText();
      return { id: d.id, label: fitLabel(text), icon: '', enabled: false, title: text.slice(0, 60) };
    }
    return { id: d.id, label: d.label, icon: d.icon, enabled: enabled(d), title: d.title };
  }
  function buttons() {
    return DEFS.map(buttonFor);
  }
  function hideDupes() {
    /* (before NL5) only #btn-open and #btn-download were hidden. */
    const bar = document.getElementById('bar') || document.querySelector('.bar');
    if (bar) bar.hidden = true;
    DEFS.forEach((d) => {
      if (!d.el) return;
      const el = document.getElementById(d.el);
      if (el) el.hidden = true;
    });
  }
  function snapshot(b) {
    return b.enabled + '\0' + (b.label || '') + '\0' + (b.title || '');
  }
  function publish() {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const list = buttons();
    HubTitleBar.set({ buttons: list });
    sent = Object.create(null);
    list.forEach((b) => { sent[b.id] = snapshot(b); });
    hideDupes();
  }
  function sync() {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const patch = [];
    try {
      buttons().forEach((b) => {
        const prev = sent[b.id];
        const next = snapshot(b);
        if (prev === next) return;
        const old = prev ? String(prev).split('\0') : [];
        sent[b.id] = next;
        const item = { id: b.id };
        if (old[0] !== String(b.enabled)) item.enabled = b.enabled;
        if (old[1] !== (b.label || '')) item.label = b.label;
        if (old[2] !== (b.title || '')) item.title = b.title;
        if (item.enabled === undefined && item.label === undefined && item.title === undefined) return;
        patch.push(item);
      });
      if (patch.length) HubTitleBar.update({ buttons: patch });
    } catch (e) { console.warn('NL.hubbar', e); }
  }
  function scheduleSync() {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    if (syncTimer) return;
    const later = (typeof requestAnimationFrame === 'function')
      ? (fn) => requestAnimationFrame(fn)
      : (fn) => setTimeout(fn, 80);
    syncTimer = later(() => { syncTimer = 0; sync(); });
  }
  function onClick(kind, id) {
    if (kind !== 'button' || typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const d = DEFS.find((x) => x.id === id);
    if (!d || d.kind === 'status' || !enabled(d) || !d.run) return;
    d.run();
    sync();
  }
  function watch() {
    if (typeof MutationObserver !== 'function') return;
    DEFS.forEach((d) => {
      if (!d.el) return;
      const el = document.getElementById(d.el);
      if (!el) return;
      try {
        new MutationObserver(() => sync()).observe(el, { attributes: true, attributeFilter: ['disabled'] });
      } catch (e) { /* not a live element (tests) or observe unsupported */ }
    });
    const status = document.getElementById('status');
    if (status) {
      try {
        new MutationObserver(() => scheduleSync()).observe(status, {
          characterData: true, childList: true, subtree: true,
          attributes: true, attributeFilter: ['class', 'data-msg'],
        });
      } catch (e) { /* tests / observe unsupported */ }
    }
  }
  function init() {
    if (started || typeof HubTitleBar === 'undefined') return;
    started = true;
    HubTitleBar.onHello(publish);
    HubTitleBar.onClick(onClick);
    watch();
  }
  return { init, sync, scheduleSync, fitLabel };
})();
