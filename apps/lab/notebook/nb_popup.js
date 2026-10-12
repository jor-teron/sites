/*
 * Project: notebook
 * File: nb_popup.js
 * Role: Small quick-menu popup under the ☰ button, opened by HOLD (nb_float.js).
 *   Pen colour dots (black / blue / red, saved), Download PNG (current page), go to the settings page (49).
 *   Closes on any tap outside it.
 */
const nbPopup = document.getElementById('nbPopup');

function paintPens() {
  nbPopup.querySelectorAll('.pen').forEach((b) => b.classList.toggle('on', b.dataset.pen === penName));
}

function openPopup() {
  paintPens();
  nbPopup.hidden = false;
}

function closePopup() {
  nbPopup.hidden = true;
}

nbPopup.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pen) { setPen(b.dataset.pen); paintPens(); setTimeout(closePopup, 180); return; }
  const act = b.dataset.act;
  closePopup();
  if (act === 'png') downloadPNG();
  else if (act === 'settings') goToPage(SETTINGS_PAGE);
});

// Outside tap closes (capture, so it runs before the canvas / button handlers).
document.addEventListener('pointerdown', (e) => {
  if (!nbPopup.hidden && !nbPopup.contains(e.target)) closePopup();
}, true);
