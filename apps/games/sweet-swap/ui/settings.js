/* Shared theme (Auto = Hub, then device), hints, lowGraphics and gear.
 * No sound in 1a. Turn-based DOM: FPS, difficulty, controls, autoPause unused;
 * hiding the document always shows a pause card; motion honours reduced-motion. */
const SweetSettings = (() => {
  const gs = window.GameSettings;
  const defaults = { theme: 'auto', showHints: true, lowGraphics: false };
  const get = k => gs ? gs.get(k) : defaults[k];
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    let hub = ''; try { hub = localStorage.getItem('sites-hub.theme') || ''; } catch (_) {}
    const theme = get('theme');
    document.documentElement.classList.toggle('dark', theme === 'dark' ||
      (theme === 'auto' && (hub === 'dark' || (hub !== 'light' && media.matches))));
    document.documentElement.classList.toggle('low-motion', !!get('lowGraphics'));
  }
  gs?.onChange(apply);
  window.addEventListener('storage', apply);
  media.addEventListener('change', apply);
  window.addEventListener('focus', apply);
  apply();
  gs?.mountGear(document.getElementById('gearSlot'), 'sweet-swap');
  return { get, motion: () => !get('lowGraphics') && !matchMedia('(prefers-reduced-motion: reduce)').matches };
})();
