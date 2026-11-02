/* myllm_tabs.js — ML1 2026-11-02: Train | Plan tab row for MyLLM.
 * Remembers the last tab in localStorage 'myllm.tab' and honours #plan / #train. */
(function () {
  'use strict';
  const KEY = 'myllm.tab';
  function show(name) {
    if (name !== 'plan') name = 'train';
    document.querySelectorAll('.tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.getElementById('train').hidden = name !== 'train';
    document.getElementById('plan').hidden = name !== 'plan';
    try { localStorage.setItem(KEY, name); } catch (e) { /* storage off */ }
  }
  function init() {
    document.querySelectorAll('.tabs .tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
    let start = location.hash.slice(1);
    if (!start) { try { start = localStorage.getItem(KEY) || ''; } catch (e) { /* ignore */ } }
    show(start);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
