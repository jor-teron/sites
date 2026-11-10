/* Video Editor — ve_tip.js: Office-style hover tips (HPS6 pattern). VD3
   Mouse only. Delay Off / 100 / 500 / 1000 ms from Settings (video-editor-v1 tip).
   One reused #ve-tip, no idle timers or observers. */
(function (root) {
  'use strict';

  var PREFS = 'video-editor-v1';
  var tip = null;
  var cur = null;
  var timer = 0;

  function readTipDelay() {
    try {
      var s = JSON.parse(localStorage.getItem(PREFS) || '{}') || {};
      var d = Number(s.tip);
      if (d === 0 || d === 100 || d === 500 || d === 1000) return d;
    } catch (_) { /* ok */ }
    return 100;
  }

  function setTipDelay(ms) {
    var d = Number(ms);
    if (d !== 0 && d !== 100 && d !== 500 && d !== 1000) d = 100;
    var s = {};
    try { s = JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (_) { s = {}; }
    s.tip = d;
    try { localStorage.setItem(PREFS, JSON.stringify(s)); } catch (_) { /* blocked */ }
    return d;
  }

  function take(el) {
    var t = el.getAttribute('title');
    if (t != null) {
      el.removeAttribute('title');
      if (t) {
        el.setAttribute('data-tip', t);
        if (!el.hasAttribute('aria-label') && !(el.textContent || '').trim()) {
          el.setAttribute('aria-label', t);
        }
      }
    }
    var stored = el.getAttribute('data-tip');
    if (stored) return stored;
    var a = el.getAttribute('aria-label');
    return a && !(el.textContent || '').trim() ? a : '';
  }

  function hide() {
    clearTimeout(timer);
    timer = 0;
    cur = null;
    if (tip && !tip.hidden) tip.hidden = true;
  }

  function show(el, text) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 've-tip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var x = r.left + r.width / 2 - w / 2;
    var y = r.bottom + 6;
    if (y + h > vh - 4) y = r.top - h - 6;
    if (y < 4) {
      y = Math.max(4, r.top + r.height / 2 - h / 2);
      x = r.left - w - 8;
      if (x < 4) x = r.right + 8;
    }
    x = Math.max(4, Math.min(x, vw - w - 4));
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
  }

  function boot() {
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse') { hide(); return; }
      var t = e.target && e.target.closest ? e.target.closest('[title], [data-tip], [aria-label]') : null;
      if (t === cur) return;
      hide();
      if (!t) return;
      if (t.closest && t.closest('#dlg')) return;
      var text = take(t);
      var d = readTipDelay();
      if (!text || !(d > 0)) return;
      cur = t;
      timer = setTimeout(function () {
        timer = 0;
        if (cur === t && t.isConnected) show(t, text);
      }, d);
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget))) hide();
    }, { passive: true });
    ['pointerdown', 'keydown', 'wheel', 'blur'].forEach(function (ev) {
      window.addEventListener(ev, hide, { passive: true, capture: true });
    });
    document.addEventListener('scroll', hide, { passive: true, capture: true });
    function sweep() {
      var els = document.querySelectorAll('[title]');
      for (var i = 0; i < els.length; i++) take(els[i]);
    }
    if (document.readyState === 'complete') sweep();
    else window.addEventListener('load', function () { setTimeout(sweep, 0); }, { once: true });
    root.VETip = { hide: hide, delay: readTipDelay, setDelay: setTipDelay, take: take, sweep: sweep };
  }

  root.VETip = { boot: boot, hide: hide, delay: readTipDelay, setDelay: setTipDelay, take: take };
})(typeof window !== 'undefined' ? window : globalThis);
