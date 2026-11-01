/*
 * Settings → Do Not Disturb (apps/system/settings/sec_dnd.js), H82. Right after Hub bar.
 * Uses the Hub's window.HubDnd (hub/core/hub_dnd.js) when the parent has it, else the same keys:
 * 'sites-hub.dnd' '1' = on, 'sites-hub.dndFavs' '1' = favourites still ring. This device only (not synced).
 */
(function () {
  'use strict';
  const ui = Settings.ui;
  const hub = () => { try { return (window.parent !== window && window.parent.HubDnd) || null; } catch (_) { return null; } };
  const get = (k) => { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch (_) { /* blocked */ } };
  const isOn = () => { const H = hub(); return H ? H.isOn() : get('sites-hub.dnd'); };
  const favs = () => { const H = hub(); return H ? H.allowFavs() : get('sites-hub.dndFavs'); };
  Settings.add({
    id: 'dnd', title: 'Do Not Disturb', icon: '\uD83D\uDD15',
    render(pane) {
      const a = ui.switch('Do Not Disturb', 'No pop-ups or call alerts; calls are logged as missed in the Notification Centre', isOn(),
        (v) => { const H = hub(); if (H) H.set(v); else put('sites-hub.dnd', v); });
      a.dataset.key = 'dnd';
      const b = ui.switch('Favourites still ring', 'While Do Not Disturb is on, urgent calls from favourites still show', favs(),
        (v) => { const H = hub(); if (H) H.setAllowFavs(v); else put('sites-hub.dndFavs', v); });
      b.dataset.key = 'dndFavs';
      pane.append(a, b, ui.note('Applies to the whole Hub and the phone page on this device. Not sent with Send profile.'));
    }
  });
  // keep the open pane in step with the 🔔 switch, the phone tile or another tab
  window.addEventListener('storage', (e) => {
    if (e.key !== 'sites-hub.dnd' && e.key !== 'sites-hub.dndFavs') return;
    if (location.hash.replace('#', '').split('/')[0] === 'dnd') Settings.open('dnd');
  });
})();
