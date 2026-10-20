/*
 * Hub — role at start-up (one-connection release, 2026-10-12). Loaded before every other hub
 * script. Sets window.__hubRemote = { code } when this Hub must run as a JOINER (phone remote)
 * instead of hosting its own code:
 *   - hub.html?join=1234 (the desktop's Connect QR): always; the code is saved, the ?join
 *     is dropped from the address bar (reloads rejoin from the saved code);
 *   - no ?join, but a saved join code ('shared-link-join-code') on a touch-primary device.
 * Desktop (mouse) without ?join stays the host. Manual Disconnect (hub_remote.js) forgets the
 * saved code, so the next load hosts again.
 */
(function () {
  'use strict';
  const KEY = 'shared-link-join-code';
  const RE = /^\d{4}$/;
  let code = '';
  try {
    const u = new URL(location.href);
    const j = (u.searchParams.get('join') || '').trim();
    if (RE.test(j)) {
      code = j;
      try { localStorage.setItem(KEY, j); } catch (_) { /* blocked */ }
      u.searchParams.delete('join');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } else {
      let saved = '';
      try { saved = localStorage.getItem(KEY) || ''; } catch (_) { /* blocked */ }
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
      if (RE.test(saved) && touch) code = saved;
    }
  } catch (_) { /* old browser: host */ }
  if (code) {
    window.__hubRemote = { code: code };
    document.documentElement.classList.add('hub-remote');
  }
})();
