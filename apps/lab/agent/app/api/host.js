/* Agent — app/api/host.js: Agent's own provider namespace (AG37). HR.apiHost = {window, storage, page, open(hash)}.
   The app-local copies in app/api/hub/ (Hub Builder 1 code, unchanged) run with `window` = HR.apiHost.window and
   `localStorage` = HR.apiHost.storage. So inside them:
   - window.top === window.self === this object. The real Hub (window.top.HubKeys / HubProviders / HubAPI) is never read,
     written or called, whether Agent runs standalone or inside the Hub iframe.
   - localStorage keys get the prefix 'agent.api:'. The Hub's record 'sites-hub.credentials' becomes Agent's own
     'agent.api:sites-hub.credentials' (keys, providers). The Hub's real record is never read, copied or removed.
   - 'storage' events from other Agent tabs are passed through with the prefix stripped; other keys are ignored.
   - HubKeys.open / HubProviders.open land on Agent's own page providers.html#keys/<name> (new tab from the chat,
     same page when already there), never Hub › API Keys.
   Same-origin browser storage is NOT a security boundary: any page on this origin can read it. Nothing is encrypted. */
window.HR = window.HR || {};
HR.apiHost = (function () {
  var real = window, PFX = 'agent.api:';
  var SELF = (document.currentScript && document.currentScript.src) || location.href;
  var PAGE = new URL('../../providers.html', SELF).href;
  var storage = {
    getItem: function (k) { try { return real.localStorage.getItem(PFX + k); } catch (e) { return null; } },
    setItem: function (k, v) { real.localStorage.setItem(PFX + k, String(v)); },
    removeItem: function (k) { try { real.localStorage.removeItem(PFX + k); } catch (e) {} }
  };
  function onPage() { try { var u = new URL(PAGE); return location.pathname === u.pathname; } catch (e) { return false; } }
  function open(hash) {
    hash = String(hash || 'keys').replace(/^#/, '');
    if (onPage()) { location.hash = hash; return true; }
    real.open(PAGE + '#' + hash, '_blank', 'noopener'); return true;
  }
  var W = {
    performance: real.performance,
    addEventListener: function (type, fn, o) {
      if (type !== 'storage') return real.addEventListener(type, fn, o);
      real.addEventListener('storage', function (e) {
        if (e.key !== null && (typeof e.key !== 'string' || e.key.indexOf(PFX) !== 0)) return;
        fn({ key: e.key === null ? null : e.key.slice(PFX.length), storageArea: e.storageArea === real.localStorage ? storage : e.storageArea == null ? null : {} });
      });
    },
    removeEventListener: function (type, fn, o) { if (type !== 'storage') real.removeEventListener(type, fn, o); },
    confirm: function (m) { return real.confirm(m); },
    open: function (u) { var h = ''; try { h = new URL(u, location.href).hash; } catch (e) {} return open(h); },
    __hubOpenApp: function (path, o) { return open(o && o.hash); }
  };
  Object.defineProperty(W, 'UiDialog', { get: function () { return real.UiDialog; } });
  W.top = W; W.self = W; W.window = W; W.parent = W;
  return { window: W, storage: storage, page: PAGE, open: open, PFX: PFX };
})();
