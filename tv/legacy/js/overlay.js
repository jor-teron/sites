const overlay = document.getElementById('channelOverlay');
let hideTimer = null;

function showOverlay() {
  if (!overlay) return;
  overlay.classList.remove('hidden');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    overlay.classList.add('hidden');
  }, 2500);
}

function hideOverlay() {
  if (!overlay) return;
  overlay.classList.add('hidden');
}
