// LandCraft LC3: small FPS counter (top right, under the ⚙ gear), shown when the 'showFps' setting is on.
// tick() is called once per drawn frame; the number updates twice a second.
export function setupHud(settings) {
  const el = document.createElement('div');
  el.id = 'fps';
  document.body.appendChild(el);
  let frames = 0, since = performance.now();
  function apply() { el.hidden = !settings.get('showFps'); }
  apply();
  settings.onChange(function (ch) { if ('showFps' in ch) apply(); });
  return {
    tick: function (now) {
      frames++;
      if (now - since >= 500) { el.textContent = Math.round(frames * 1000 / (now - since)) + ' fps'; frames = 0; since = now; }
    }
  };
}
