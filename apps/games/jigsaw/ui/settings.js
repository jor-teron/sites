/* JIG-1a uses theme, autoPause, showHints, fpsLimit and gear. No sound/rotation yet. */
window.JigsawSettings = (() => {
  const gs = window.GameSettings, defaults = { theme:'auto', autoPause:true, showHints:true, fpsLimit:30 };
  const get = k => gs ? gs.get(k) : defaults[k];
  function theme() {
    let hub = ''; try { hub = localStorage.getItem('sites-hub.theme') || ''; } catch (_) {}
    const t = get('theme'), dark = t === 'dark' || (t === 'auto' &&
      (hub === 'dark' || (!['light','dark'].includes(hub) && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', dark);
  }
  gs?.onChange(theme); window.addEventListener('storage', theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme); theme();
  return { get, onChange: cb => gs ? gs.onChange(cb) : () => {}, mountGear: el => gs?.mountGear(el, 'jigsaw') };
})();
