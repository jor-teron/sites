let currentIndex = 0;
let numberBuffer = '';
let numberTimer = null;
let isOverlayVisible = true;

function updateActiveTile() {
  document.querySelectorAll('.channel').forEach((el, i) => {
    el.classList.toggle('active', i === currentIndex);
  });

  const activeEl = document.querySelector('.channel.active');
  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function handleNumberInput(num) {
  numberBuffer += num;
  showNumberDisplay(numberBuffer);

  clearTimeout(numberTimer);
  numberTimer = setTimeout(() => {
    const channelNum = parseInt(numberBuffer, 10);
    numberBuffer = '';
    hideNumberDisplay();

    if (channelNum >= 1 && channelNum <= channels.length) {
      currentIndex = channelNum - 1;
      updateActiveTile();
      playChannel(currentIndex);
      showOverlay();
    }
  }, 1500);
}

function showNumberDisplay(text) {
  let el = document.getElementById('numberDisplay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'numberDisplay';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = 'block';
}

function hideNumberDisplay() {
  const el = document.getElementById('numberDisplay');
  if (el) el.style.display = 'none';
}

function onActivity(e) {
  // If overlay is hidden, first interaction only shows it
  if (overlay && overlay.classList.contains('hidden')) {
    showOverlay();
    isOverlayVisible = true;

    // Prevent this same event from also selecting a channel
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }

  showOverlay();
}

function setupInput() {
  document.addEventListener('keydown', (e) => {
    onActivity(e);

    // Number keys
    if (/^[0-9]$/.test(e.key)) {
      handleNumberInput(e.key);
      return;
    }

    if (!channels.length) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      currentIndex = (currentIndex + 1) % channels.length;
      updateActiveTile();
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      currentIndex = (currentIndex - 1 + channels.length) % channels.length;
      updateActiveTile();
    }
    if (e.key === 'Enter') {
      playChannel(currentIndex);
    }
  });

  document.addEventListener('click', onActivity);
  document.addEventListener('touchstart', onActivity);
  document.addEventListener('mousemove', onActivity);
}
