/**
 * Hub — image viewer for received files (images only). HubViewer.open(url, name) shows the
 * image over a dark backdrop (the hub shows faintly) with ✕ and Download. Closes on ✕, a
 * backdrop click, Esc, or the controller's B button (hub-controller.js injects B as the "x"
 * key into the app frame, so keys are watched in the hub page AND the frame while open).
 * Uses the card's blob URL (hub_notify.js revokes it), so it creates no object URLs itself.
 */
(function () {
  'use strict';
  let box = null, img = null, cur = null, frameWin = null;

  function btn(text, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function build() {
    box = document.createElement('div');
    box.id = 'hub-viewer'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    img = document.createElement('img');
    img.addEventListener('click', (e) => e.stopPropagation());
    const bar = document.createElement('div');
    bar.className = 'hv-bar';
    bar.append(btn('Download', save), btn('✕', close));
    box.append(img, bar);
    box.addEventListener('click', close);
    document.body.appendChild(box);
  }
  function save() {
    if (!cur) return;
    const a = document.createElement('a');
    a.href = cur.url; a.download = cur.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function onKey(e) {
    const k = e.key;
    if (k !== 'Escape' && k !== 'x' && k !== 'X') return;
    e.preventDefault(); e.stopImmediatePropagation();   // the app in the frame must not get it
    if (e.type === 'keydown') close();
  }
  function watch(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('keydown', onKey, true); window[f]('keyup', onKey, true);
    if (on) { try { const fr = document.getElementById('app-frame'); frameWin = fr && fr.contentWindow && fr.contentWindow.document ? fr.contentWindow : null; } catch (_) { frameWin = null; } }
    try { if (frameWin) { frameWin[f]('keydown', onKey, true); frameWin[f]('keyup', onKey, true); } } catch (_) { /* cross-origin */ }
    if (!on) frameWin = null;
  }
  function open(url, name) {
    if (!url) return;
    if (!box) build();
    if (cur) watch(false);
    cur = { url: url, name: name || 'image' };
    img.src = url; img.alt = cur.name; box.setAttribute('aria-label', cur.name);
    box.hidden = false;
    watch(true);
  }
  function close() {
    if (!cur) return;
    watch(false);
    cur = null; box.hidden = true; img.removeAttribute('src');
  }
  window.HubViewer = { open: open, close: close, get isOpen() { return !!cur; } };
})();
