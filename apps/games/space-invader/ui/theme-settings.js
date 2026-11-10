/* SI-T1: per-game visuals only. Shared games difficulty/FPS are deliberately not
 * applied: the original simulation is per-frame and must remain unchanged. */
window.SpaceInvaderAppearance = (() => {
  'use strict';
  const renderer = window.SpaceInvaderThemes, KEY = 'space-invader.visualTheme';
  const dialog = document.getElementById('theme-settings'), grid = document.getElementById('theme-grid');
  const status = document.getElementById('theme-status');
  const valid = value => value === 'auto' || renderer.themes.some(t => t.id === value);
  const read = () => { try { const v = localStorage.getItem(KEY); return valid(v) ? v : 'auto'; } catch (_) { return 'auto'; } };
  let selected = read(), active, previewId = 0;
  function resolve() {
    // HubTheme implements the Hub's live storage/message/focus contract; unset = light.
    let dark = false;
    if (window.HubTheme) dark = HubTheme.effective() === 'dark';
    else { try { dark = localStorage.getItem('sites-hub.theme') === 'dark'; } catch (_) { /* light */ } }
    return selected === 'auto' ? (dark ? 'classic' : 'flat') : selected;
  }
  function apply() {
    active = renderer.get(resolve());
    const root = document.documentElement;
    root.dataset.visualTheme = active.id;
    for (const [key, value] of Object.entries({ bg: active.bg, ink: active.ink, accent: active.player, muted: active.muted, font: active.font })) root.style.setProperty(`--si-${key}`, value);
    root.style.colorScheme = ['paper', 'flat', 'gameboy'].includes(active.id) ? 'light' : 'dark';
    document.getElementById('theme-name').textContent = `${selected === 'auto' ? 'Auto · ' : ''}${active.name}`;
    dialog.querySelectorAll('input[name="visual-theme"]').forEach(input => { input.checked = input.value === selected; });
  }
  for (const t of renderer.themes) {
    const label = document.createElement('label'); label.className = 'theme-card';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'visual-theme'; input.value = t.id;
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 120; canvas.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = t.name;
    label.append(input, canvas, text); grid.append(label); t.thumbnail = canvas.getContext('2d');
  }
  dialog.addEventListener('change', e => {
    if (e.target.name !== 'visual-theme' || !valid(e.target.value)) return;
    selected = e.target.value; apply();
    try { localStorage.setItem(KEY, selected); status.textContent = `${active.name} saved.`; }
    catch (_) { status.textContent = 'Preview applied. Storage is unavailable; this choice cannot be saved.'; }
  });
  function previews(time) {
    for (const t of renderer.themes) renderer.preview(t.thumbnail, t, time);
    if (dialog.open && !renderer.motion.matches) previewId = requestAnimationFrame(previews);
  }
  const paintPreviews = () => { cancelAnimationFrame(previewId); previews(performance.now()); };
  renderer.motion.addEventListener('change', () => { if (dialog.open) paintPreviews(); });
  dialog.addEventListener('close', () => { cancelAnimationFrame(previewId); document.getElementById('theme-open').focus(); });
  window.addEventListener('storage', e => {
    if (!e.key || e.key === KEY) { selected = read(); apply(); }
    else if (e.key.startsWith('sites-hub.')) apply();
  });
  window.addEventListener('focus', apply);
  if (window.HubTheme) HubTheme.onChange(apply);
  apply();
  return { current: () => active, dialog, open: () => { dialog.showModal(); paintPreviews(); } };
})();
