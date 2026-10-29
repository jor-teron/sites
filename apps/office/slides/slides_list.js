/* Hub Office Slides SL1 — the slide list (SLList): numbered thumbnails (plain text drawn in the slide design at 3/20
   scale; up to 9 bullets each, so 100+ slides stay light), click to select, drag to reorder.
   Drag: mouse = press and move 6 px; touch / pen = hold 350 ms, then move (a quick swipe still scrolls the list).
   Vertical list on desktop, horizontal strip on phones (<= 760 px): the drop point follows the list's direction.
   No Delete key here on purpose (deleting is only in the ⋯ menu, with a confirm). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var listEl, inEl, cb = {}, slides = [], cur = 0;
  var MAX_LINES = 9;
  function thumbScale() { return matchMedia('(max-width:760px)').matches ? 112 / 960 : 144 / 960; }
  function inner(s, i) { return SLEdit.html(s, i, { max: MAX_LINES }); }   /* SL2: one renderer, shared with Present */
  function item(s, i) {
    var li = document.createElement('li');
    li.className = 'th' + (i === cur ? ' cur' : ''); li.dataset.i = i;
    li.setAttribute('aria-label', 'Slide ' + (i + 1) + (s.title ? ': ' + s.title : ''));
    li.setAttribute('aria-current', i === cur ? 'true' : 'false');
    li.innerHTML = '<span class="num">' + (i + 1) + '</span><div class="mini-s"><div class="mini-in slide sv" style="transform:scale(' + thumbScale() + ')">' + inner(s, i) + '</div></div>';
    return li;
  }
  function render(arr, c) {
    slides = arr; cur = c;
    var f = document.createDocumentFragment();
    arr.forEach(function (s, i) { f.appendChild(item(s, i)); });
    inEl.textContent = ''; inEl.appendChild(f);
    reveal();
  }
  function update(i) {
    var li = inEl.children[i]; if (!li || !slides[i]) return;
    li.querySelector('.mini-in').innerHTML = inner(slides[i], i);
    li.setAttribute('aria-label', 'Slide ' + (i + 1) + (slides[i].title ? ': ' + slides[i].title : ''));
  }
  function reveal() {
    var li = inEl.children[cur]; if (!li) return;
    var lr = li.getBoundingClientRect(), r = listEl.getBoundingClientRect();
    if (lr.top < r.top) listEl.scrollTop -= r.top - lr.top + 8; else if (lr.bottom > r.bottom) listEl.scrollTop += lr.bottom - r.bottom + 8;
    if (lr.left < r.left) listEl.scrollLeft -= r.left - lr.left + 8; else if (lr.right > r.right) listEl.scrollLeft += lr.right - r.right + 8;
  }
  function horiz() { return getComputedStyle(inEl).flexDirection === 'row'; }

  /* ---------- drag to reorder ---------- */
  var D = null;   /* { id, from, li, x0, y0, timer, on, ghost, line, to, touch } */
  function dropIndex(x, y) {
    var h = horiz(), kids = inEl.children, n = kids.length;
    for (var i = 0; i < n; i++) {
      var r = kids[i].getBoundingClientRect(), mid = h ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((h ? x : y) < mid) return i;
    }
    return n;
  }
  function placeLine(to) {
    var h = horiz(), kids = inEl.children, lr = listEl.getBoundingClientRect(), pos;
    if (to < kids.length) { var r = kids[to].getBoundingClientRect(); pos = h ? r.left - 5 : r.top - 5; }
    else { var r2 = kids[kids.length - 1].getBoundingClientRect(); pos = h ? r2.right + 3 : r2.bottom + 3; }
    D.line.classList.toggle('v', h);
    if (h) { D.line.style.left = (pos - lr.left + listEl.scrollLeft) + 'px'; D.line.style.top = ''; }
    else { D.line.style.top = (pos - lr.top + listEl.scrollTop) + 'px'; D.line.style.left = ''; }
  }
  function startDrag() {
    D.on = true; clearTimeout(D.timer);
    var ms = D.li.querySelector('.mini-s'), r = ms.getBoundingClientRect();
    var g = ms.cloneNode(true); g.id = 'drag-ghost'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    D.dx = D.x0 - r.left; D.dy = D.y0 - r.top;
    document.body.appendChild(g); D.ghost = g;
    D.line = document.createElement('div'); D.line.id = 'drop-line'; listEl.appendChild(D.line);
    D.li.classList.add('lifted');
    if (D.touch && navigator.vibrate) { try { navigator.vibrate(15); } catch (_) { /* */ } }
    moveDrag(D.x0, D.y0);
  }
  function autoScroll(x, y) {
    var r = listEl.getBoundingClientRect(), e = 28;
    if (horiz()) { if (x < r.left + e) listEl.scrollLeft -= 12; else if (x > r.right - e) listEl.scrollLeft += 12; }
    else { if (y < r.top + e) listEl.scrollTop -= 12; else if (y > r.bottom - e) listEl.scrollTop += 12; }
  }
  function moveDrag(x, y) {
    D.ghost.style.left = (x - D.dx) + 'px'; D.ghost.style.top = (y - D.dy) + 'px';
    autoScroll(x, y);
    D.to = dropIndex(x, y); placeLine(D.to);
  }
  function endDrag(commit) {
    if (!D) return;
    var d = D; D = null; clearTimeout(d.timer);
    if (!d.on) return;
    d.ghost.remove(); d.line.remove(); d.li.classList.remove('lifted');
    listEl.dataset.justDragged = '1'; setTimeout(function () { delete listEl.dataset.justDragged; }, 0);
    if (!commit) return;
    var to = d.to > d.from ? d.to - 1 : d.to;   /* index after removing the dragged slide */
    if (to !== d.from && cb.onMove) cb.onMove(d.from, to);
  }
  function onDown(e) {
    var li = e.target.closest && e.target.closest('.th'); if (!li || e.button > 0) return;
    D = { id: e.pointerId, from: +li.dataset.i, li: li, x0: e.clientX, y0: e.clientY, on: false, to: +li.dataset.i, touch: e.pointerType !== 'mouse' };
    if (D.touch) D.timer = setTimeout(function () { if (D && !D.on) startDrag(); }, 350);
  }
  function onMoveP(e) {
    if (!D || e.pointerId !== D.id) return;
    if (!D.on) {
      var dist = Math.abs(e.clientX - D.x0) + Math.abs(e.clientY - D.y0);
      if (D.touch) { if (dist > 10) { clearTimeout(D.timer); D = null; } return; }   /* moved early = a scroll */
      if (dist < 6) return;
      startDrag();
    }
    e.preventDefault(); moveDrag(e.clientX, e.clientY);
  }

  function init(o) {
    cb = o; listEl = $('list'); inEl = $('list-in');
    listEl.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMoveP, { passive: false });
    addEventListener('pointerup', function (e) { if (D && e.pointerId === D.id) endDrag(true); });
    addEventListener('pointercancel', function (e) { if (D && e.pointerId === D.id) endDrag(false); });
    /* while a touch drag is on, the page must not scroll */
    addEventListener('touchmove', function (e) { if (D && D.on) e.preventDefault(); }, { passive: false });
    listEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    listEl.addEventListener('dragstart', function (e) { e.preventDefault(); });
    listEl.addEventListener('click', function (e) {
      if (listEl.dataset.justDragged) return;
      var li = e.target.closest('.th'); if (li && cb.onSelect) cb.onSelect(+li.dataset.i);
    });
    listEl.addEventListener('keydown', function (e) {
      if (e.target !== listEl) return;
      var k = e.key, h = horiz(), prev = k === 'ArrowUp' || (h && k === 'ArrowLeft'), next = k === 'ArrowDown' || (h && k === 'ArrowRight');
      if (e.altKey && (prev || next)) { e.preventDefault(); if (cb.onNudge) cb.onNudge(prev ? -1 : 1); return; }
      if (prev || next) { e.preventDefault(); cb.onSelect(Math.max(0, Math.min(slides.length - 1, cur + (prev ? -1 : 1)))); }
      else if (k === 'Home' || k === 'End') { e.preventDefault(); cb.onSelect(k === 'Home' ? 0 : slides.length - 1); }
      else if (k === 'Enter') { e.preventDefault(); if (cb.onEnter) cb.onEnter(); }
      else if (k === 'Escape') endDrag(false);
    });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && D) { endDrag(false); } }, true);
    matchMedia('(max-width:760px)').addEventListener('change', function () { render(slides, cur); });
  }
  window.SLList = { init: init, render: render, update: update, reveal: reveal, dragging: function () { return !!(D && D.on); } };
})();
