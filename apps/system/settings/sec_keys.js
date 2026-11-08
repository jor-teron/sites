/* H138b: API Keys moved to its own System app. Keep all legacy #keys[/name] links. */
(function () {
  'use strict';
  const ui = window.Settings.ui;
  const target = new URL('../api-keys/', location.href);
  Settings.add({
    id: 'keys', title: 'API Keys', icon: '\uD83D\uDD11',
    render(pane, sub) {
      const hash = 'keys' + (sub ? '/' + encodeURIComponent(String(sub).trim().toLowerCase()) : '');
      const url = target.href.split('#')[0] + '#' + hash;
      const link = ui.el('a', 'tap', 'Open API Keys');
      link.href = url;
      pane.append(ui.note('API Keys is now a separate app in System.'), link);
      // Prefer the Hub app window; otherwise navigate this frame (no popup required).
      try {
        if (window.top.__hubOpenApp && window.top.__hubOpenApp('apps/system/api-keys/', { hash })) return;
      } catch (_) { /* cross-origin: only navigate our own frame */ }
      location.replace(url);
    }
  });
})();
