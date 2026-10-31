/*
 * H75 Hub dialog bridge — app frames ask the Hub to draw their UiDialog (shared/dialog/dialog.js).
 * App → Hub {type:'hub-dialog', id, method, args}; Hub → app {type:'hub-dialog-ack', id}, then
 * {type:'hub-dialog-result', id, value}. Same origin only, and the sender must be one of this
 * page's iframes. Methods: ask / confirm / choose / info. A closed frame just gets no answer.
 */
(function () {
  'use strict';
  const OK = { ask: 1, confirm: 1, choose: 1, info: 1 };
  window.__hubDialogHost = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'hub-dialog' || e.origin !== location.origin || !e.source) return;
    if (!Array.prototype.some.call(document.querySelectorAll('iframe'), (f) => f.contentWindow === e.source)) return;
    const U = window.UiDialog, ui = U && (U.local || U);
    if (!OK[d.method] || !ui || typeof ui[d.method] !== 'function' || !Array.isArray(d.args)) return;   // no ack → app draws it
    const src = e.source, send = (m) => { try { src.postMessage(m, location.origin); } catch (_) { /* frame gone */ } };
    send({ type: 'hub-dialog-ack', id: d.id });
    Promise.resolve().then(() => ui[d.method].apply(ui, d.args))
      .then((v) => send({ type: 'hub-dialog-result', id: d.id, value: v === undefined ? true : v }),
        () => send({ type: 'hub-dialog-result', id: d.id, value: null }));
  });
})();
