/* Remote — rm_main.js: start the RM1 connections list once the page has loaded. */
(function (root) {
  'use strict';

  /* Config and store constructors, loaded as script tags before this file. */
  var C = root.RM_CONFIG;
  var Store = root.RMStore;
  var UI = root.RMUI;

  /* Bind the store to localStorage, with an in-memory fallback if it is blocked. */
  function storage() {
    try {
      /* Probe setItem so private mode that throws later is caught now. */
      var s = localStorage;
      var k = C.LS_CONNS + ':probe';
      s.setItem(k, '1');
      s.removeItem(k);
      return s;
    } catch (e) {
      /* Tiny memory store that matches the localStorage shape. */
      var mem = {};
      return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
        setItem: function (key, val) { mem[key] = String(val); },
        removeItem: function (key) { delete mem[key]; }
      };
    }
  }

  /* Start the UI after the DOM is ready. */
  function start() {
    UI.init({ store: Store.make(storage()) });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
