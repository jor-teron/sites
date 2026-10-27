/*
 * OCR — ocr_hubkey.js (release 4)
 * The Cloud Vision key from the Hub: window.top.HubKeys.get('gvision') (Hub H28.2, hub/keys.readme.md).
 * Read in try/catch (standalone or cross-origin = no Hub), kept in memory only, never written to localStorage.
 * The Hub key wins; the popover's own field (ocr_vision_api_key) is the standalone / "not in Hub" fallback.
 * HubKeys.onChange re-reads the key and refreshes the toolbar + popover.
 */
(function (OCR) {
  'use strict';

  const H = OCR.hubKey = {};
  const NAME = 'gvision';
  let val = '';                        // memory only

  H.hub = () => { try { const h = window.top && window.top.HubKeys; return h && typeof h.get === 'function' ? h : null; } catch (_) { return null; } };
  H.inHub = () => !!H.hub();
  H.value = () => val;
  H.load = async () => {
    const h = H.hub();
    if (!h) { val = ''; return ''; }
    try { val = (await h.get(NAME)) || ''; } catch (_) { val = ''; }
    return val;
  };
  H.open = () => { const h = H.hub(); if (h) try { h.open(NAME); } catch (_) { /* ignore */ } };
  H.init = () => {
    const h = H.hub();
    if (!h) return;
    const redraw = () => { if (OCR.ui) { OCR.ui.sync(); OCR.ui.paintKey(); } };
    H.load().then(redraw);
    try { h.onChange((e) => { if (!e || !e.name || e.name === NAME) H.load().then(redraw); }); } catch (_) { /* ignore */ }
  };
})(window.OCR);
