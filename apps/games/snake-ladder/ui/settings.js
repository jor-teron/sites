/* Shared theme and gear bridge. Auto follows Hub then the device. Works without GS.
   SNL-2b uses lowGraphics; SNL-2c uses sfx/masterVolume/difficulty. No continuous loop,
   so FPS, controls, 3D, music and showFps are not used. */
const SNLSettings = (() => {
  const gs = window.GameSettings;
  const fallback = { theme: 'auto', lowGraphics: false, sfx: true, masterVolume: 0.8, difficulty: 'normal' };
  const get = (k) => (gs ? gs.get(k) : fallback[k]);
  const reduced = () => get('lowGraphics') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function apply() {
    document.documentElement.classList.toggle('reduced-motion', reduced());
    let hub = '';
    try {
      hub = localStorage.getItem('sites-hub.theme') || '';
    } catch (_) {}
    const dark =
      get('theme') === 'dark' ||
      (get('theme') === 'auto' &&
        (hub ? hub === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches));
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  function init() {
    gs?.mountGear(document.getElementById('gear'), 'snake-ladder');
    gs?.onChange(apply);
    addEventListener('storage', apply);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', apply);
    apply();
  }
  return { get, init, apply, reduced };
})();
