/*
 * Project: notebook
 * File: nb_settings.js
 * Role: Page 49 = settings / About / How to / Tips written on ruled paper. #settingsPanel is a
 *   text layer shown only on that page (class .onpage, toggled in nb_canvas.js); it does not take
 *   taps except its small PNG / PDF links, so drawing and the ☰ gestures still work there.
 *   Also: Button bottom/top and Swap gestures toggles (saved, applied live + on load).
 */

// Apply button position (body.btn-top) and fill the How-to list for the current mapping.
function applyPrefs() {
  document.body.classList.toggle('btn-top', btnTop);
  document.getElementById('togPos').textContent = btnTop ? 'top' : 'bottom';
  document.getElementById('togSwap').textContent = swapGestures ? 'on' : 'off';
  const name = { next: 'next page', prev: 'previous page', grid: 'all pages' };
  const rows = [['left', 'drag ☰ left'], ['right', 'drag ☰ right'], ['up', 'pull ☰ up'], ['down', 'pull ☰ down']]
    .filter(([d]) => gestureFor(d))
    .map(([d, t]) => '<li>' + t + ' → ' + name[gestureFor(d)] + '</li>');
  rows.unshift('<li>tap ☰ → quick menu (pen colour, PNG, settings)</li>');
  rows.push('<li>hold ☰ still 1 s → crumple this page (+1, max 5)</li>');
  document.getElementById('howTo').innerHTML = rows.join('');
}

document.getElementById('togPos').addEventListener('click', () => { btnTop = !btnTop; savePrefs(); applyPrefs(); });
document.getElementById('togSwap').addEventListener('click', () => { swapGestures = !swapGestures; savePrefs(); applyPrefs(); });
