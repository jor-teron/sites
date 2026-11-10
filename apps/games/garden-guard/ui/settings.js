/* Auto (System) follows the Hub first, then the device. Fixed physics ignores FPS. */
(function (G) {
  'use strict';
  const gs = window.GameSettings, fallback = {theme:'auto',fpsLimit:30,autoPause:true,lowGraphics:false};
  G.setting = k => gs ? gs.get(k) : fallback[k];
  G.theme = function () {
    let hub = ''; try { hub = localStorage.getItem('sites-hub.theme') || ''; } catch (_) {}
    const mode = G.setting('theme');
    const dark = mode === 'dark' || (mode === 'auto' && (hub === 'dark' || (!['light','dark'].includes(hub) && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  if (gs) { gs.mountGear(document.getElementById('gear'),'garden-guard'); gs.onChange(G.theme); }
  else { const a = document.createElement('a'); a.href = '../common/settings/games-settings.html?from=garden-guard'; a.textContent = '⚙'; a.ariaLabel = 'Game settings'; document.getElementById('gear').append(a); }
  addEventListener('storage',G.theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',G.theme);
  G.theme();
})(window.GardenGuard);
