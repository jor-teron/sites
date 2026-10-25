/*
 * apps/office/shared/office-colour.js
 * SH1 shared colour picker: split button (apply last colour | open palette) + swatch grid.
 *   var P = OfficeColour.create({
 *     btn, arrow, menu, bar,            // elements (menu gets the swatches)
 *     palette: [[label, '#hex' | null]], // null = Automatic / No colour (shown as a wide row)
 *     key: 'app.lastColour', fallback: '#ff0000',   // last colour, stored ('none' = null)
 *     autoBar: '#000000',               // bar colour when the last colour is null
 *     onPick: fn(value), onOpen: fn(), onClose: fn(keep)  // onOpen runs before the menu shows
 *     autoRemember: false               // app calls P.remember itself (e.g. only on success)
 *   });
 *   P.last(), P.remember(v), P.syncBar(), P.open(), P.close(refocus, keep), P.isOpen()
 * One palette open at a time; outside click, Esc, Tab and resize close it.
 * Style: office-colour.css. Markup: .of-split > .of-split-main + .of-split-arrow; bar .of-colour-bar.
 */
var OfficeColour = (function () {
  var all = [], current = null;

  function create(o) {
    var P = { o: o };
    P.last = function () {
      var v = null;
      try { v = localStorage.getItem(o.key); } catch (e) {}
      return v === 'none' ? null : (v || o.fallback || null);
    };
    P.remember = function (v) { try { localStorage.setItem(o.key, v || 'none'); } catch (e) {} P.syncBar(); };
    P.syncBar = function () {
      if (!o.bar) return;
      var v = P.last();
      o.bar.style.background = v || o.autoBar || 'transparent';
      o.bar.classList.toggle('none', !v && !o.autoBar);
    };
    P.isOpen = function () { return current === P; };
    P.pick = function (v) { P.close(false, true); if (o.autoRemember !== false) P.remember(v); if (o.onPick) o.onPick(v); };
    P.open = function () {
      if (current === P) { P.close(); return; }
      if (current) current.close();
      if (o.onOpen) o.onOpen();
      var r = (o.arrow.parentElement || o.arrow).getBoundingClientRect(), m = o.menu;
      m.hidden = false;
      m.style.top = Math.round(r.bottom + 4) + 'px';
      m.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8))) + 'px';
      o.arrow.setAttribute('aria-expanded', 'true');
      current = P;
      var f = m.querySelector('.of-swatch');
      if (f) f.focus({ preventScroll: true });
    };
    P.close = function (refocus, keep) {
      if (current !== P) return;
      o.menu.hidden = true;
      o.arrow.setAttribute('aria-expanded', 'false');
      current = null;
      if (o.onClose) o.onClose(keep);
      if (refocus) o.arrow.focus();
    };

    var m = o.menu;
    m.classList.add('of-colour-menu');
    m.innerHTML = '';
    o.palette.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'of-swatch' + (c[1] ? '' : ' of-swatch-none');
      b.setAttribute('role', 'menuitem'); b.title = c[0]; b.setAttribute('aria-label', c[0]);
      if (c[1]) b.style.background = c[1]; else b.innerHTML = '<span>' + c[0] + '</span>';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { P.pick(c[1]); });
      m.appendChild(b);
    });
    m.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(m.querySelectorAll('.of-swatch'));
      var i = items.indexOf(document.activeElement);
      var step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
      if (step) {
        e.preventDefault();
        if (i < 0) i = 0; else if (i === 0 && step > 1) i = 1; else i = Math.max(0, Math.min(items.length - 1, i + step));
        items[i].focus();
      } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); P.close(true); }
      else if (e.key === 'Tab') P.close();
    });
    [o.btn, o.arrow].forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });
    o.btn.addEventListener('click', function () { if (current) current.close(); if (o.onPick) o.onPick(P.last()); });
    o.arrow.addEventListener('click', function () { P.open(); });
    o.arrow.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); P.open(); } });
    P.syncBar();
    all.push(P);
    return P;
  }

  document.addEventListener('mousedown', function (e) {
    if (!current) return;
    if (e.target.closest('.of-colour-menu') || e.target.closest('.of-split')) return;
    current.close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) current.close(true); });
  window.addEventListener('resize', function () { if (current) current.close(); });

  return { create: create, current: function () { return current; } };
})();
