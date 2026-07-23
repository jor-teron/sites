const video = document.getElementById('video');
const channelList = document.getElementById('channel-list');
const overlay = document.getElementById('overlay');

let hls = null;
let items = [];
let currentIndex = -1;
let hideTimeout = null;

// Number input system
let numberBuffer = '';
let numberTimeout = null;
const NUMBER_DELAY = 1500; // 1.5 seconds

// Special apps
const specialItems = [
  {
    name: "YouTube",
    type: "app",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/YouTube_full-color_icon_%282017%29.svg/120px-YouTube_full-color_icon_%282017%29.svg.png",
    action: () => { window.location.href = "vnd.youtube://"; }
  },
  {
    name: "Play Store",
    type: "app",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/200px-Google_Play_Store_badge_EN.svg.png",
    action: () => { window.location.href = "intent://play.google.com/store#Intent;scheme=https;package=com.android.vending;end"; }
  },
  {
    name: "Settings",
    type: "app",
    logo: "https://cdn-icons-png.flaticon.com/512/3524/3524659.png",
    action: () => { window.location.href = "intent://com.android.settings/#Intent;scheme=android-app;end"; }
  }
];

function loadPlaylist() {
  fetch('local.m3u')
    .then(res => res.text())
    .then(text => {
      const channels = parseM3U(text);
      items = [...specialItems, ...channels];
      buildList();
      if (items.length > 3) {
        setTimeout(() => activateItem(3), 400);
      }
    })
    .catch(() => {
      overlay.textContent = 'Failed to load local.m3u';
      overlay.style.display = 'block';
    });
}

function parseM3U(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const result = [];
  let current = null;

  for (let line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);

      current = {
        name: name,
        logo: logoMatch ? logoMatch[1] : '',
        group: groupMatch ? groupMatch[1] : 'Live',
        url: '',
        type: 'channel'
      };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      result.push(current);
      current = null;
    }
  }
  return result;
}

function buildList() {
  channelList.innerHTML = '';

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'channel';
    div.dataset.index = idx;

    // Number
    const numberSpan = document.createElement('div');
    numberSpan.className = 'channel-number';
    numberSpan.textContent = (idx + 1) + '.';

    // Logo
    const img = document.createElement('img');
    img.src = item.logo || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23333" width="48" height="48"/><text x="24" y="30" fill="%23999" text-anchor="middle" font-size="14">📺</text></svg>';
    img.onerror = () => {
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23333" width="48" height="48"/><text x="24" y="30" fill="%23999" text-anchor="middle" font-size="14">📺</text></svg>';
    };

    // Name
    const info = document.createElement('div');
    info.className = 'channel-info';
    info.innerHTML = `
      <div class="channel-name">${item.name}</div>
      <div class="channel-group">${item.type === 'app' ? 'App' : (item.group || 'Live')}</div>
    `;

    div.appendChild(numberSpan);
    div.appendChild(img);
    div.appendChild(info);
    div.onclick = () => activateItem(idx);
    channelList.appendChild(div);
  });
}

function activateItem(index) {
  if (index < 0 || index >= items.length) return;

  document.querySelectorAll('.channel').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.channel[data-index="${index}"]`);
  if (active) {
    active.classList.add('active');
    active.scrollIntoView({ block: 'nearest' });
  }

  currentIndex = index;
  overlay.style.display = 'none';
  hideNumberDisplay();

  const item = items[index];

  if (item.type === 'app') {
    item.action();
  } else {
    playChannel(item);
  }
}

function playChannel(ch) {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.src = '';

  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(ch.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = ch.url;
    video.play().catch(() => {});
  }
}

// ===== Number Input System =====
function showNumberDisplay(num) {
  let display = document.getElementById('number-display');
  if (!display) {
    display = document.createElement('div');
    display.id = 'number-display';
    display.style.cssText = `
      position: fixed;
      top: 40%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      font-weight: bold;
      color: white;
      background: rgba(0,0,0,0.7);
      padding: 20px 50px;
      border-radius: 16px;
      z-index: 100;
      font-family: Arial, sans-serif;
    `;
    document.body.appendChild(display);
  }
  display.textContent = num;
  display.style.display = 'block';
}

function hideNumberDisplay() {
  const display = document.getElementById('number-display');
  if (display) display.style.display = 'none';
}

function handleNumberInput(digit) {
  numberBuffer += digit;
  showNumberDisplay(numberBuffer);

  clearTimeout(numberTimeout);
  numberTimeout = setTimeout(() => {
    const channelNum = parseInt(numberBuffer);
    if (!isNaN(channelNum) && channelNum >= 1 && channelNum <= items.length) {
      activateItem(channelNum - 1); // convert to 0-based index
    }
    numberBuffer = '';
    hideNumberDisplay();
  }, NUMBER_DELAY);
}

// Keyboard
document.addEventListener('keydown', (e) => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('hidden');
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => sidebar.classList.add('hidden'), 5000);

  if (items.length === 0) return;

  // Number keys (0-9)
  if (e.key >= '0' && e.key <= '9') {
    handleNumberInput(e.key);
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    currentIndex = (currentIndex + 1) % items.length;
    highlightCurrent();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    highlightCurrent();
  } else if (e.key === 'Enter' || e.key === ' ') {
    activateItem(currentIndex);
  } else if (e.key.toLowerCase() === 'f') {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
});

function highlightCurrent() {
  document.querySelectorAll('.channel').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.channel[data-index="${currentIndex}"]`);
  if (active) {
    active.classList.add('active');
    active.scrollIntoView({ block: 'nearest' });
  }
}

document.addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('hidden');
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => sidebar.classList.add('hidden'), 5000);
});

// Start
loadPlaylist();
