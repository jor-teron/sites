/*
 * Project: notebook
 * File: nb_settings.js
 * Role: Settings panel open/close.
 */
function openSettings() {
  document.getElementById('settingsPanel').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('show');
}
