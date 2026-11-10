/* Notely — nl_hubbar.js (NL4): Open and Download in the Hub window title bar.
   Uses HubTitleBar from ../shared/office-hubbar.js (set / update / onClick / onHello).
   Only after the Hub says hello (HubTitleBar.linked). Standalone, or a frame that
   never says hello, sends nothing and leaves the in-page buttons visible.
   OfficeQuick is Undo | Redo | Save | Print plus ribbon tabs. Notely has none of
   that — its document actions are Open and Download — so this talks to HubTitleBar
   directly, the same contract the other Office apps use through OfficeQuick.
   Enabled flags mirror the in-page buttons (both stay on: notes autosave, and
   Download always writes the current text). A change pushes HubTitleBar.update. */
NL.hubbar = (function () {
  const DEFS = [
    { id: 'open', el: 'btn-open', label: 'Open', icon: '📂', title: 'Open a text file (Ctrl+O)', run: () => NL.files.open() },
    { id: 'download', el: 'btn-download', label: 'Download', icon: '⤓', title: 'Download as Notely.txt (Ctrl+S)', run: () => NL.files.download() },
  ];
  let started = false;
  let sent = Object.create(null);

  function enabled(d) {
    const el = document.getElementById(d.el);
    return !(el && el.disabled);
  }
  function buttons() {
    return DEFS.map((d) => ({ id: d.id, label: d.label, icon: d.icon, enabled: enabled(d), title: d.title }));
  }
  function hideDupes() {
    DEFS.forEach((d) => {
      const el = document.getElementById(d.el);
      if (el) el.hidden = true;
    });
  }
  function publish() {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const list = buttons();
    HubTitleBar.set({ buttons: list });
    sent = Object.create(null);
    list.forEach((b) => { sent[b.id] = b.enabled; });
    hideDupes();
  }
  function sync() {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const patch = [];
    try {
      buttons().forEach((b) => {
        if (sent[b.id] !== b.enabled) {
          sent[b.id] = b.enabled;
          patch.push({ id: b.id, enabled: b.enabled });
        }
      });
      if (patch.length) HubTitleBar.update({ buttons: patch });
    } catch (e) { console.warn('NL.hubbar', e); }
  }
  function onClick(kind, id) {
    if (kind !== 'button' || typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    const d = DEFS.find((x) => x.id === id);
    if (!d || !enabled(d)) return;
    d.run();
    sync();
  }
  function watch() {
    if (typeof MutationObserver !== 'function') return;
    DEFS.forEach((d) => {
      const el = document.getElementById(d.el);
      if (!el) return;
      try {
        new MutationObserver(() => sync()).observe(el, { attributes: true, attributeFilter: ['disabled'] });
      } catch (e) { /* not a live element (tests) or observe unsupported */ }
    });
  }
  function init() {
    if (started || typeof HubTitleBar === 'undefined') return;
    started = true;
    HubTitleBar.onHello(publish);
    HubTitleBar.onClick(onClick);
    watch();
  }
  return { init, sync };
})();
