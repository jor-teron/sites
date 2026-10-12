/*
 * Project: notebook
 * File: nb_settings.js
 * Role: Settings panel. Shown only as a printed card on page 49 (CSS .backcover, toggled in
 *   nb_canvas.js). openSettings() (full overlay) is kept but no gesture calls it any more.
 */
function openSettings() {
  document.getElementById('settingsPanel').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('show');
}
