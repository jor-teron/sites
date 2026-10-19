/*
 * Basic right-click menu for pages (shared/ctxmenu/ctx_in_app.js). The Hub injects it into every
 * same-origin app it shows (Phone-mode frame and Desktop windows: hub/hub_ctx.js), and loads it
 * itself for its own text fields. It loads shared/ctxmenu/ctxmenu.js + ctxmenu.css from its own
 * folder when the page does not have them yet.
 *
 * Inside an app (auto-installed when the page runs in a frame):
 *   text field / textarea / contenteditable → Cut, Copy, Paste, Select all
 *     (Cut / Copy only with a selection, Cut / Paste only when editable; Paste only when the
 *      Clipboard API can read and the permission is not denied)
 *   link → Open, Open in new window (category tiles in a Desktop Hub), Open in new tab, Copy link
 *   elsewhere → Back, Reload app, Copy (with a selection), Select all
 * Left alone (the browser / the app keeps it):
 *   - Shift held while right-clicking = the browser's own menu (escape hatch)
 *   - the app already handled the event (preventDefault, e.g. the Files app's own menu)
 *   - touch long-press (text selection / callouts keep working on phones)
 *   - <html data-ctx="native"> opts a page out
 * API window.CtxInApp: editable(el), items(target, {page}) → Promise<items>, install({page, resolve})
 *   resolve(target, e) may return items (or null) first — the Hub uses it for its own chrome.
 */
(function () {
  'use strict';
  if (window.CtxInApp) return;
  const me = document.currentScript;
  const dir = me && me.src ? me.src.replace(/[^/]*(\?.*)?$/, '') : '';
  const q = me && me.src && me.src.indexOf('?') > 0 ? me.src.slice(me.src.indexOf('?')) : '';

  /** ctxmenu.js / .css from this folder, once. */
  function need() {
    if (window.CtxMenu) return Promise.resolve();
    if (!dir) return Promise.reject(new Error('no ctxmenu'));
    if (!document.querySelector('link[href*="ctxmenu.css"]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + 'ctxmenu.css' + q;
      (document.head || document.documentElement).appendChild(l);
    }
    return need.p || (need.p = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = dir + 'ctxmenu.js' + q;
      s.onload = () => res(); s.onerror = rej;
      (document.head || document.documentElement).appendChild(s);
    }));
  }

  const TEXTY = /^(text|search|url|tel|email|password|number|)$/i;
  /** The editable field under t (input / textarea / contenteditable) or null. */
  function editable(t) {
    if (!t || !t.closest) return null;
    const f = t.closest('input, textarea, [contenteditable]');
    if (!f) return null;
    if (f.tagName === 'INPUT' && !TEXTY.test(f.type || '')) return null;
    if (f.isContentEditable === false && !/^(INPUT|TEXTAREA)$/.test(f.tagName)) return null;
    return f;
  }
  const isField = (f) => f.tagName === 'INPUT' || f.tagName === 'TEXTAREA';
  function range(f) {
    try { return f.selectionStart == null ? null : [f.selectionStart, f.selectionEnd]; } catch (_) { return null; }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => execCopy(text));
    }
    execCopy(text);
    return Promise.resolve();
  }
  function execCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    const back = document.activeElement;
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) { /* nothing more to try */ }
    ta.remove();
    if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (_) { /* gone */ }
  }
  /** Can Paste work here? (Clipboard API read + permission not denied.) */
  function canRead() {
    if (!navigator.clipboard || !navigator.clipboard.readText || !window.isSecureContext) return Promise.resolve(false);
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(true);
    const t = new Promise((res) => setTimeout(() => res(true), 150));
    return Promise.race([navigator.permissions.query({ name: 'clipboard-read' }).then((p) => p.state !== 'denied', () => true), t]);
  }
  /** Put text into field f in place of [s, e] (undo-able where execCommand still works). */
  function insert(f, text, r) {
    try { f.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    if (isField(f) && r) { try { f.setSelectionRange(r[0], r[1]); } catch (_) { /* type without selection */ } }
    let ok = false;
    try { ok = document.execCommand(text ? 'insertText' : 'delete', false, text); } catch (_) { ok = false; }
    if (!ok && isField(f) && r) {
      f.setRangeText(text, r[0], r[1], 'end');
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function editItems(f) {
    const ro = isField(f) ? (f.readOnly || f.disabled) : !f.isContentEditable;
    const r = isField(f) ? range(f) : null;
    let sel = '', domRange = null;
    if (isField(f)) { if (r && f.type !== 'password') sel = f.value.slice(r[0], r[1]); }
    else { const s = getSelection(); sel = String(s || ''); domRange = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }
    const back = () => { if (domRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(domRange); } };
    return canRead().then((read) => [
      !ro && { label: 'Cut', icon: '\u2702', hint: 'Ctrl+X', disabled: !sel, action: () => { copyText(sel); back(); insert(f, '', r); } },
      { label: 'Copy', icon: '\u2398', hint: 'Ctrl+C', disabled: !sel, action: () => copyText(sel) },
      !ro && read && { label: 'Paste', icon: '\uD83D\uDCCB', hint: 'Ctrl+V', action: () => {
        navigator.clipboard.readText().then((t) => { back(); insert(f, t, r); }, () => { /* refused */ });
      } },
      { sep: true },
      { label: 'Select all', icon: '\u2611', hint: 'Ctrl+A', action: () => {
        f.focus();
        if (isField(f)) { try { f.select(); } catch (_) { /* ignore */ } } else document.execCommand('selectAll');
      } }
    ]);
  }

  function hubDesktop() {
    try { const p = window.parent; return p !== window && !!p.HubWM && !!p.HubMode && p.HubMode.isDesktop(); } catch (_) { return false; }
  }
  function linkItems(a) {
    const href = a.href;
    const tile = a.classList.contains('tile') && a.target !== '_blank' && hubDesktop();
    return [
      { label: 'Open', icon: '\u2197', action: () => a.click() },
      tile && { label: 'Open in new window', icon: '\u29C9', action: () => a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })) },
      { label: 'Open in new tab', icon: '\u2934', action: () => window.open(href, '_blank', 'noopener') },
      { sep: true },
      { label: 'Copy link', icon: '\uD83D\uDD17', action: () => copyText(href) }
    ];
  }

  /** Menu for target. page: Back / Reload app rows (inside an app). */
  function items(t, o) {
    o = o || {};
    const f = editable(t);
    if (f) return editItems(f);
    const a = t && t.closest && t.closest('a[href]');
    if (a && !/^javascript:/i.test(a.getAttribute('href') || '')) return Promise.resolve(linkItems(a));
    const sel = String(getSelection() || '');
    return Promise.resolve([
      o.page && { label: 'Back', icon: '\u2190', disabled: history.length <= 1, action: () => history.back() },
      o.page && { label: 'Reload app', icon: '\u21BB', action: () => location.reload() },
      { sep: true },
      sel && { label: 'Copy', icon: '\u2398', hint: 'Ctrl+C', action: () => copyText(sel) },
      (o.page || sel) && { label: 'Select all', icon: '\u2611', hint: 'Ctrl+A', action: () => { const s = getSelection(); s.removeAllRanges(); s.selectAllChildren(document.body); } }
    ].concat(o.extra || []));
  }

  let lastPointer = 'mouse';
  function install(o) {
    o = o || {};
    if (install.done) return;
    install.done = true;
    window.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, true);
    window.addEventListener('contextmenu', (e) => {
      if (e.defaultPrevented || e.shiftKey) return;                        // app's own menu / escape hatch
      if (document.documentElement.dataset.ctx === 'native') return;
      let x = e.clientX, y = e.clientY;
      if (!x && !y && e.target && e.target.getBoundingClientRect) {         // ContextMenu key / Shift+F10
        const r = e.target.getBoundingClientRect(); x = r.left + 8; y = r.top + Math.min(r.height, 24);
      }
      const touch = lastPointer === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents);
      const own = o.resolve ? o.resolve(e.target, e, touch) : null;
      if (own) { e.preventDefault(); if (own.length) need().then(() => CtxMenu.open(x, y, own, own.opts)); return; }
      if (touch) return;                                                   // phones: keep the native text menu
      e.preventDefault();
      const t = e.target;
      need().then(() => items(t, { page: o.page, extra: o.extra ? o.extra() : null })).then((list) => CtxMenu.open(x, y, list), () => { /* no menu */ });
    });
  }

  window.CtxInApp = { editable, items, install, copyText, need };
  // Inside a frame (an app shown by the Hub): on by default
  if (window.parent !== window && !window.__ctxInAppManual) install({ page: true });
})();
