/* Shared theme: Auto follows Hub Light/Dark before the device preference. */
window.SCSettings = (() => {
  const gs = window.GameSettings;
  const defaults = { theme: 'auto', fpsLimit: 30, lowGraphics: false, autoPause: true, sfx: true, masterVolume: .8 };
  const get = k => gs ? gs.get(k) : defaults[k];
  function theme() {
    let t = get('theme');
    if (t === 'auto') { try { t = localStorage.getItem('sites-hub.theme'); } catch (_) {} }
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  }
  theme(); gs?.onChange(theme); addEventListener('storage', theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  return { get, mount: el => gs?.mountGear(el, 'star-colony'), theme };
})();
