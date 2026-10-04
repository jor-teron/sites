/**
 * Hub phone controller — trackpad pointer.
 * The phone's Trackpad (controller/ctrl_trackpad.js) sends, over the normal controller link:
 *   {t:'ptr', dx, dy}        finger movement in phone px (already batched per frame)
 *   {t:'tap', b}             click: b 0 = left, 1 = middle, 2 = right (contextmenu)
 *   {t:'mb', b, s:1|0}       button held / released (bottom bar buttons, drag lock)
 *   {t:'wheel', dx, dy}      two-finger drag in phone px (natural direction: drag up = scroll down)
 * The hub draws its own arrow (#hub-pointer) over the page — a web page cannot move the real
 * mouse — and dispatches synthetic pointer / mouse / wheel events at the element under it,
 * looking inside the same-origin app iframe (and nested same-origin iframes) with coordinates
 * mapped into that document. A left press also focuses the field / button under the arrow.
 * Synthetic wheel events do not scroll by themselves, so if nobody cancels the wheel event the
 * nearest scrollable ancestor (or the page) is scrolled by hand.
 * Settings: HUB_CTRL_CONFIG.pointer (hub_controller_config.js).
 */
(function () {
  'use strict';

  const CFG = Object.assign({
    speed: 1.6, acceleration: 0.9, accelCap: 3, size: 22, hideAfterMs: 4000, scrollSpeed: 2.2,
    color: '#ffffff', outline: '#111111', hoverEvents: true,
  }, (window.HUB_CTRL_CONFIG || {}).pointer || {});

  const BIT = [1, 4, 2];                 // MouseEvent.buttons bit for button 0 / 1 / 2
  let x = Math.round(innerWidth / 2);
  let y = Math.round(innerHeight / 2);
  let buttons = 0;
  let overEl = null;
  const downAt = [null, null, null];     // element pressed per button
  let node = null;
  let ring = null;
  let hideTimer = 0;

  function ensureNode() {
    if (node) return node;
    node = document.createElement('div');
    node.id = 'hub-pointer';
    node.setAttribute('aria-hidden', 'true');
    const s = Number(CFG.size) || 22;
    node.innerHTML =
      '<svg width="' + Math.round(s * 0.72) + '" height="' + s + '" viewBox="0 0 16 22">' +
      '<path d="M1 1 L1 17.5 L5.2 13.6 L8.1 20.4 L11 19.2 L8.2 12.6 L14 12.6 Z" fill="' + CFG.color +
      '" stroke="' + CFG.outline + '" stroke-width="1.4" stroke-linejoin="round"/></svg><span class="ring"></span>';
    ring = node.querySelector('.ring');
    document.body.appendChild(node);
    return node;
  }

  function place() {
    ensureNode().style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function show() {
    ensureNode().classList.add('show');
    clearTimeout(hideTimer);
    if (CFG.hideAfterMs > 0) hideTimer = setTimeout(maybeHide, CFG.hideAfterMs);
  }
  function maybeHide() {
    if (buttons) { hideTimer = setTimeout(maybeHide, CFG.hideAfterMs); return; }   // never while dragging
    if (node) node.classList.remove('show');
  }
  function pulse() {
    if (!ring) return;
    ring.classList.remove('go');
    void ring.offsetWidth;
    ring.classList.add('go');
  }
  function renderState() {
    if (!node) return;
    node.classList.toggle('down', !!buttons);
    node.classList.toggle('drag', !!(buttons & 1));
  }

  /** Element under the arrow, following same-origin iframes. */
  function hit() {
    let doc = document;
    let cx = x, cy = y;
    for (let i = 0; i < 6; i++) {
      const el = doc.elementFromPoint(cx, cy);
      if (!el) return { el: doc.body || doc.documentElement, doc: doc, cx: cx, cy: cy };
      if (el.tagName !== 'IFRAME' && el.tagName !== 'FRAME') return { el: el, doc: doc, cx: cx, cy: cy };
      let inner = null;
      try { inner = el.contentDocument; } catch (_) { inner = null; }
      if (!inner || !inner.documentElement) return { el: el, doc: doc, cx: cx, cy: cy };   // cross-origin: the frame itself
      const r = el.getBoundingClientRect();
      cx -= r.left + el.clientLeft;
      cy -= r.top + el.clientTop;
      doc = inner;
    }
    return { el: doc.body, doc: doc, cx: cx, cy: cy };
  }

  function fire(h, type, button, extra, target) {
    const t = target || h.el;
    if (!t || !t.dispatchEvent) return true;
    const w = (t.ownerDocument && t.ownerDocument.defaultView) || h.doc.defaultView || window;
    const init = Object.assign({
      bubbles: true, cancelable: type !== 'mouseenter' && type !== 'mouseleave', composed: true, view: w,
      clientX: h.cx, clientY: h.cy, screenX: x, screenY: y,
      button: button || 0, buttons: buttons, detail: type === 'click' || type === 'auxclick' ? 1 : 0,
    }, extra || {});
    let ev;
    try {
      if (type.indexOf('pointer') === 0) {
        ev = new (w.PointerEvent || w.MouseEvent)(type, Object.assign(init, { pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      } else if (type === 'wheel') {
        ev = new w.WheelEvent(type, init);
      } else {
        ev = new w.MouseEvent(type, init);
      }
      return t.dispatchEvent(ev);
    } catch (err) {
      console.warn('hub pointer', type, err);
      return true;
    }
  }

  const FOCUSABLE = 'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href],[tabindex],[contenteditable=""],[contenteditable="true"]';
  function focusAt(h) {
    const w = h.doc.defaultView;
    const el = h.el && h.el.closest ? h.el.closest(FOCUSABLE) : null;
    try {
      if (window.__hubFocusFrame && h.doc !== document) window.__hubFocusFrame();
      else if (w) w.focus();
    } catch (_) { /* ignore */ }
    if (el && typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    } else {
      const a = h.doc.activeElement;
      if (a && a !== h.doc.body && typeof a.blur === 'function') a.blur();
    }
  }

  function commonAncestor(a, b) {
    if (!a || !b || a.ownerDocument !== b.ownerDocument) return null;
    for (let n = a; n; n = n.parentNode) if (n.contains && n.contains(b)) return n;
    return null;
  }

  function hover(h) {
    if (!CFG.hoverEvents) return;
    if (h.el !== overEl) {
      if (overEl && overEl.isConnected) {
        fire(h, 'pointerout', 0, { relatedTarget: h.el }, overEl);
        fire(h, 'mouseout', 0, { relatedTarget: h.el }, overEl);
      }
      fire(h, 'pointerover', 0, { relatedTarget: overEl });
      fire(h, 'mouseover', 0, { relatedTarget: overEl });
      overEl = h.el;
    }
    fire(h, 'pointermove', 0);
    fire(h, 'mousemove', 0);
  }

  function move(dx, dy) {
    dx = Number(dx) || 0; dy = Number(dy) || 0;
    const mag = Math.hypot(dx, dy);
    const gain = CFG.speed * Math.min(CFG.accelCap || 3, 1 + (CFG.acceleration || 0) * Math.max(0, mag - 2) / 8);
    x = Math.max(0, Math.min(innerWidth - 1, x + dx * gain));
    y = Math.max(0, Math.min(innerHeight - 1, y + dy * gain));
    place();
    show();
    hover(hit());
  }

  function press(b) {
    b = b | 0;
    if (b < 0 || b > 2 || (buttons & BIT[b])) return;
    place(); show();
    const h = hit();
    const first = !buttons;
    buttons |= BIT[b];
    downAt[b] = h.el;
    if (first) fire(h, 'pointerdown', b);
    const ok = fire(h, 'mousedown', b);
    if (b === 0 && ok) focusAt(h);
    renderState();
  }

  function release(b) {
    b = b | 0;
    if (b < 0 || b > 2 || !(buttons & BIT[b])) return;
    place(); show();
    const h = hit();
    buttons &= ~BIT[b];
    if (!buttons) fire(h, 'pointerup', b);
    fire(h, 'mouseup', b);
    const target = commonAncestor(downAt[b], h.el);
    downAt[b] = null;
    if (target) {
      if (b === 0) fire(h, 'click', 0, null, target);
      else if (b === 1) fire(h, 'auxclick', 1, null, target);
    }
    if (b === 2) fire(h, 'contextmenu', 2);
    renderState();
  }

  function tap(b) {
    press(b);
    release(b);
    pulse();
  }

  function canScroll(el, w, vertical) {
    if (!el || el.nodeType !== 1) return false;
    const cs = w.getComputedStyle(el);
    const ov = vertical ? cs.overflowY : cs.overflowX;
    if (!/(auto|scroll|overlay)/.test(ov)) return false;
    return vertical ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
  }

  function scrollBy(h, sx, sy) {
    let doc = h.doc;
    let el = h.el;
    for (let hop = 0; hop < 6 && doc; hop++) {
      const w = doc.defaultView;
      for (let n = el; n && n !== doc.documentElement && n !== doc.body; n = n.parentElement) {
        if ((sy && canScroll(n, w, true)) || (sx && canScroll(n, w, false))) {
          const bx = n.scrollLeft, by = n.scrollTop;
          n.scrollBy(sx, sy);
          if (n.scrollLeft !== bx || n.scrollTop !== by) return;
        }
      }
      const se = doc.scrollingElement || doc.documentElement;
      const bx = w.scrollX, by = w.scrollY;
      w.scrollBy(sx, sy);
      if (w.scrollX !== bx || w.scrollY !== by || !se) return;
      // nothing moved here: try the document that holds this frame
      const fe = w.frameElement;
      if (!fe) return;
      el = fe;
      doc = fe.ownerDocument;
    }
  }

  function wheel(dx, dy) {
    place(); show();
    const sx = -(Number(dx) || 0) * CFG.scrollSpeed;    // natural: fingers up → page moves up (scroll down)
    const sy = -(Number(dy) || 0) * CFG.scrollSpeed;
    if (!sx && !sy) return;
    const h = hit();
    const ok = fire(h, 'wheel', 0, { deltaX: sx, deltaY: sy, deltaZ: 0, deltaMode: 0 });
    if (ok) scrollBy(h, sx, sy);
  }

  function releaseAll() {
    for (let b = 0; b < 3; b++) if (buttons & BIT[b]) release(b);
  }

  function handle(msg) {
    switch (msg.t) {
      case 'ptr': move(msg.dx, msg.dy); return true;
      case 'tap': tap(msg.b); return true;
      case 'mb': if (msg.s) press(msg.b); else release(msg.b); return true;
      case 'wheel': wheel(msg.dx, msg.dy); return true;
      default: return false;
    }
  }

  window.addEventListener('resize', () => {
    x = Math.min(x, innerWidth - 1);
    y = Math.min(y, innerHeight - 1);
    if (node) place();
  });

  const ext = window.HubCtrlExt = window.HubCtrlExt || { handlers: [], onClose: [], files: null };
  ext.handlers.push(handle);
  ext.onClose.push(releaseAll);

  window.__hubPointer = {
    handle, releaseAll,
    get x() { return x; }, get y() { return y; }, get buttons() { return buttons; },
    get visible() { return !!(node && node.classList.contains('show')); },
  };
})();
