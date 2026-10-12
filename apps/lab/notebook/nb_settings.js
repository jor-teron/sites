/*
 * Project: notebook
 * File: nb_settings.js
 * Role: Settings panel open/close. Hold ☰ opens it as a full panel anywhere; on the back cover
 *   (last page) the same panel is always shown as a printed card on the cloth (CSS .backcover).
 */
function openSettings() {
  document.getElementById('settingsPanel').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('show');
}
