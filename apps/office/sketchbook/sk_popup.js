/*
 * Project: sketchbook
 * File: sk_popup.js
 * Role: Small quick-menu popup under the ☰ button, opened by HOLD (sk_float.js).
 *   Pen colour dots (black / blue / red, saved), Download PNG (current page), go to the settings page (49).
 *   Closes on any tap outside it.
 */
const skPopup = document.getElementById('skPopup');

function paintPens() {
  skPopup.querySelectorAll('.pen').forEach((b) => b.classList.toggle('on', b.dataset.pen === penName));
}

function openPopup() {
  paintPens();
  skPopup.hidden = false;
}

function closePopup() {
  skPopup.hidden = true;
}

skPopup.addEventListener('click', (e) => {
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
  if (!skPopup.hidden && !skPopup.contains(e.target)) closePopup();
}, true);
