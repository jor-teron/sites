/*
 * Forwarder (H129c, 2026-11-04 IST): hub_receive.js moved to desktop/link/hub_receive.js.
 * Kept for one release so an old cached page or anything that still loads hub/link/hub_receive.js keeps working;
 * removed in a later release. desktop/desktop.html loads desktop/link/hub_receive.js directly and never loads this file.
 * Loads the new file once (skipped if it is already on the page): while the page is still parsing it is
 * written in place (same order and timing as the old tag), afterwards it is appended (async = false).
 */
(function () {
  'use strict';
  var me = document.currentScript, rel = 'desktop/link/hub_receive.js', u;
  try { u = (me && me.src ? new URL('../../' + rel, me.src) : new URL(rel, document.baseURI)).href; } catch (_) { u = rel; }
  var bare = u.split(/[?#]/)[0], ss = document.scripts;
  for (var i = 0; i < ss.length; i++) if (ss[i] !== me && ss[i].src && ss[i].src.split(/[?#]/)[0] === bare) return;
  if (document.readyState === 'loading') { document.write('<script src="' + u + '"><\/script>'); return; }
  var s = document.createElement('script'); s.src = u; s.async = false; (document.head || document.documentElement).appendChild(s);
})();
