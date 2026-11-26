/**
 * Photo Collage — Hub OS Window Title Bar integration H49/H110/PC7 (core/pc_hub_titlebar.js)
 * Listens immediately at script load for hubTitleBarHello so handshake is never missed.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.hubTitlebar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var hubTitleBarLinked = false;
  var hubTitleBarReady = false;
  var handlers = null;

  function hubTitleBarTarget() {
    return (location.origin && location.origin !== 'null') ? location.origin : '*';
  }

  function hubTitleBarButtons() {
    var counts = handlers && handlers.getHistoryState ? handlers.getHistoryState() : { undoCount: 0, redoCount: 0 };
    return [
      { id: 'undo', label: 'Undo', icon: '↩', enabled: counts.undoCount > 0, title: 'Undo (Ctrl+Z)' },
      { id: 'redo', label: 'Redo', icon: '↪', enabled: counts.redoCount > 0, title: 'Redo (Ctrl+Y)' },
      { id: 'add-photos', label: 'Add Photos', icon: '📷', enabled: true, title: 'Add photos to collage' },
      { id: 'add-page', label: '+ Page', icon: '📄', enabled: true, title: 'Add another empty page' },
      { id: 'print', label: 'Print', icon: '⎙', enabled: true, title: 'Print collage (Ctrl+P)' },
      { id: 'pdf', label: 'Save PDF', icon: '⤓', enabled: true, title: 'Save collage as PDF' },
      { id: 'clear', label: 'Clear', icon: '✕', enabled: true, title: 'Clear all photos' }
    ];
  }

  function applyHubTitleBarClass() {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('hub-titlebar');
    }
  }

  function sendHubTitleBar(op) {
    if (!hubTitleBarLinked || typeof window === 'undefined' || window.parent === window) return;
    var msg = { v: 1, op: op, buttons: hubTitleBarButtons() };
    if (op === 'set') msg.align = 'left';
    try {
      window.parent.postMessage({ hubTitleBar: msg }, hubTitleBarTarget());
    } catch (_) {}
  }

  function updateHubTitleBar() {
    sendHubTitleBar('update');
  }

  function handleHubTitleBarHello() {
    hubTitleBarLinked = true;
    applyHubTitleBarClass();
    if (hubTitleBarReady) sendHubTitleBar('set');
  }

  function handleHubTitleBarClick(id) {
    if (!hubTitleBarReady || !handlers || !handlers.onCommand) return;
    handlers.onCommand(id);
  }

  // PC7: register listener immediately at script execution
  if (typeof window !== 'undefined' && window.parent !== window) {
    (function installHubTitleBarListener() {
      var target = hubTitleBarTarget();
      window.addEventListener('message', function (e) {
        if (e.source !== window.parent || (target !== '*' && e.origin !== target)) return;
        var d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.hubTitleBarHello && d.hubTitleBarHello.v === 1) {
          handleHubTitleBarHello();
        } else if (hubTitleBarLinked && d.hubTitleBarClick && d.hubTitleBarClick.v === 1 && d.hubTitleBarClick.kind === 'button') {
          handleHubTitleBarClick(d.hubTitleBarClick.id);
        }
      });
    })();
  }

  function initHubTitleBar(nextHandlers) {
    handlers = nextHandlers || null;
    if (typeof window === 'undefined' || window.parent === window) return;
    hubTitleBarReady = true;
    if (hubTitleBarLinked) {
      applyHubTitleBarClass();
      sendHubTitleBar('set');
    }
  }

  return {
    initHubTitleBar: initHubTitleBar,
    updateHubTitleBar: updateHubTitleBar
  };
});
