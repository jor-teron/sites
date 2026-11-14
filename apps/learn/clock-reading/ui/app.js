/* Clock Reading CR5 — one page, no modes: a big live clock that always shows the real time in GMT (UTC), ticking once a
   second, with the digital time (12 h with AM / PM, or 24 h), the time in words and a "Now (GMT)" badge. Hover (mouse) or tap
   (touch) any part of the clock — the face, each hand, the centre pin, each of the 12 hour marks, the minute marks between
   them and the style's own parts (pendulum, shadow, crown ...) — to see its name and one plain line about it; tap anywhere
   else to close. Under the clock a row of 7 clock styles, all drawn in code; tap one to switch the big clock to it.
   Saves in localStorage: learn.clock-reading.style, .fmt ('12' / '24') and .sec (second hand, on unless turned off).
   In a Hub desktop window the header moves to the Hub title bar (LearnHubBar); CR3 sends no tabs and no buttons.
   CR5: drag the hour or minute hand (the shadow on the Sundial) to set any time. The clock stops and shows 'Your time'
   (no second hand); the digital time and words follow. The minute hand rolls the hour, the hour hand rolls AM / PM.
   'Back to now' returns to the live GMT clock. A tap without dragging still shows the part's name. */
(() => {
  const C = window.CR, VER = 'CR5', PRE = 'learn.clock-reading.', store = LRN.store;
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };
  let fmt = store.read(PRE + 'fmt', '12') === '24' ? '24' : '12', showSec = store.read(PRE + 'sec', true) !== false, tick = null;
  let setT = null;   // CR5: null = live GMT clock; a number = the time the child set by dragging a hand
  const clock = C.makeClock();
  clock.style(store.read(PRE + 'style', 'simple'));
  const digital = h('div', { class: 'cr-dig' }), words = h('div', { class: 'cr-words' });
  const gmt = h('div', { class: 'cr-gmt', title: 'The clock shows the time now in GMT (UTC), the time at 0\u00B0 longitude' }, '\u{1F30D} Now (GMT)');
  const back = h('button', { type: 'button', class: 'lrn-qc cr-back', hidden: true, onclick: () => live() }, '\u{1F552} Back to now');
  const badge = h('div', { class: 'cr-row cr-badge' }, gmt, back);
  const tip = h('div', { class: 'cr-tip', role: 'status', hidden: true }), stage = h('div', { class: 'cr-stage' }, clock.el, tip);
  const tog = (label, on, fn) => h('button', { type: 'button', class: 'lrn-qc cr-tog', 'aria-pressed': String(on), onclick: fn }, label);
  const togs = h('div', { class: 'cr-row' });
  const drawTogs = () => togs.replaceChildren(
    tog('12 hour', fmt === '12', () => { fmt = '12'; store.write(PRE + 'fmt', fmt); drawTogs(); now(); }),
    tog('24 hour', fmt === '24', () => { fmt = '24'; store.write(PRE + 'fmt', fmt); drawTogs(); now(); }),
    tog('Second hand', showSec, () => { showSec = !showSec; store.write(PRE + 'sec', showSec); clock.seconds(showSec && setT == null); drawTogs(); }));
  const side = h('div', { class: 'cr-side' }, badge, digital, words, togs,
    h('p', { class: 'lrn-sub cr-hint' }, 'Tap or hover any part of the clock to see what it is. The short hand tells the hour, the long hand the minutes. Drag a hand to set any time.'));
  const note = h('p', { class: 'cr-note', 'aria-live': 'polite' });
  const tiles = C.styles.map(st => h('button', { type: 'button', class: 'cr-st', 'data-style': st.id, title: st.note, onclick: () => pick(st.id) },
    C.miniClock(st.id), h('span', { class: 'cr-stn' }, st.name)));
  const row = h('section', { class: 'cr-styles', 'aria-label': 'Clock styles' }, h('div', { class: 'cr-strow', role: 'group', 'aria-label': 'Pick a clock style' }, tiles), note);
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Clock Reading')), h('span', { class: 'cr-ver' }, VER));
  side.append(row);   // CR4: the style tiles sit on the right, under the time panel, so the clock gets the full height
  const main = h('main', { class: 'lrn-main cr-main', id: 'lrn-main' }, stage, side);
  root.className = 'lrn cr'; root.replaceChildren(head, main);
  document.title = 'Clock Reading ' + VER;
  if (window.LearnHubBar) LearnHubBar.attach(head);   // Hub desktop window: the header goes to the title bar (no tabs, no buttons)

  function pick(id) {
    hideTip(); clock.style(id); store.write(PRE + 'style', clock.styleId); now();
    const st = C.styleById(clock.styleId);
    tiles.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === st.id)));
    note.replaceChildren(h('b', null, st.name + ': '), st.note);
  }
  // ---------- the live clock: 1 frame a second, on the whole second; paused while the page is hidden ----------
  function now() {
    const n = setT == null ? C.utcNow() : { t: setT, s: null }; clock.set(n.t, n.s);
    const d = fmt === '24' ? C.fmt24(n.t) : C.fmt12(n.t, true);
    if (digital.textContent !== d) { digital.textContent = d; words.textContent = C.words(n.t) + ' ' + C.part(n.t); }
  }
  const step = () => { now(); tick = setTimeout(step, 1000 - Date.now() % 1000 + 5); };
  const run = on => { clearTimeout(tick); tick = null; if (on && setT == null) step(); };
  document.addEventListener('visibilitychange', () => run(!document.hidden));
  // CR5: 'Your time' (set by dragging) and back to the live clock
  function setTime(t) {
    if (setT == null) { run(false); clock.seconds(false); gmt.textContent = '\u270B Your time'; gmt.classList.add('cr-own'); gmt.title = 'You set this time by dragging a hand'; back.hidden = false; }
    setT = C.norm(t); now();
  }
  function live() {
    setT = null; clock.seconds(showSec); gmt.textContent = '\u{1F30D} Now (GMT)'; gmt.classList.remove('cr-own');
    gmt.title = 'The clock shows the time now in GMT (UTC), the time at 0\u00B0 longitude'; back.hidden = true; run(!document.hidden);
  }

  // ---------- part labels: hover with a mouse, tap on touch; tap anywhere else (or Esc) closes ----------
  let onPart = null;
  function showTip(part, e) {
    const info = C.partInfo(clock.styleId, part.getAttribute('data-part'));
    if (!info) return hideTip();
    if (onPart !== part) { if (onPart) onPart.classList.remove('cr-on'); onPart = part; part.classList.add('cr-on'); }
    tip.replaceChildren(h('b', null, info.name), h('span', null, info.line)); tip.hidden = false;
    const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, w = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(r.width - w - 4, x - w / 2)) + 'px';
    tip.style.top = (y - th - 18 >= 0 ? y - th - 18 : Math.min(r.height - th - 4, y + 22)) + 'px';
  }
  function hideTip() { tip.hidden = true; if (onPart) onPart.classList.remove('cr-on'); onPart = null; }
  const partAt = e => e.target.closest && e.target.closest('[data-part]');
  // ---------- CR5: drag a hand. A press near a hand arms it; moving 6 px starts the drag (so a plain tap still shows the label) ----------
  let grab = null, tapDone = false;   // grab = { id, hand, x, y, on }
  const handAt = e => { const f = clock.toFace(e), L = clock.hands; return f && C.pickHand(clock.t, f.angle, f.r, L.hour, L.minute, L.minute > 0); };
  clock.el.addEventListener('touchstart', e => { if (e.touches.length === 1 && handAt(e.touches[0])) e.preventDefault(); }, { passive: false });   // no page scroll when a finger lands on a hand
  clock.el.addEventListener('pointerdown', e => {
    if (grab || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const hand = handAt(e); if (!hand) return;
    grab = { id: e.pointerId, hand, x: e.clientX, y: e.clientY, on: false };
    try { clock.el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const moveHand = (e, wrap) => { const f = clock.toFace(e); if (!f) return; const t = setT == null ? clock.t : setT;
    setTime(grab.hand === 'hour' ? C.dragHour(t, f.angle, wrap) : C.dragMinute(t, f.angle, wrap)); };
  const endGrab = (e, cancel) => {
    if (!grab || e.pointerId !== grab.id) return;
    const was = grab; grab = null; clock.dragging(false);
    try { clock.el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (cancel) return;
    if (!was.on && e.pointerType !== 'mouse') { const p = partAt(e) || clock.el.querySelector('[data-part=' + (clock.hands.minute ? was.hand : 'shadow') + ']'); if (p) showTip(p, e); tapDone = true; setTimeout(() => { tapDone = false; }, 400); }
    else if (was.on) { tapDone = true; setTimeout(() => { tapDone = false; }, 400); }
  };
  clock.el.addEventListener('pointermove', e => {
    if (grab && e.pointerId === grab.id) {
      if (!grab.on && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 6) return;
      if (!grab.on) { grab.on = true; hideTip(); clock.dragging(true); moveHand(e, false); return; }
      moveHand(e, true); return;
    }
    if (e.pointerType !== 'mouse') return; const p = partAt(e); p ? showTip(p, e) : hideTip();
  });
  clock.el.addEventListener('pointerup', e => endGrab(e, false));
  clock.el.addEventListener('pointercancel', e => endGrab(e, true));
  clock.el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !grab) hideTip(); });
  clock.el.addEventListener('click', e => { if (tapDone) { tapDone = false; return; } const p = partAt(e); p ? showTip(p, e) : hideTip(); });
  document.addEventListener('pointerdown', e => { if (!tip.hidden && !clock.el.contains(e.target)) hideTip(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });

  drawTogs(); clock.seconds(showSec); pick(clock.styleId); run(true);
})();
