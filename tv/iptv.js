const video = document.getElementById('video');
const channelList = document.getElementById('channel-list');
const channelCount = document.getElementById('channel-count');
const overlay = document.getElementById('overlay');

let hls = null;
let channels = [];
let currentIndex = -1;
let hideTimeout = null;
let allItems = [];

function loadPlaylist() {
  fetch('local.m3u')
    .then(res => res.text())
    .then(text => {
      channels = parseM3U(text);
      channelCount.textContent = channels.length;
      buildList();
      if (channels.length > 0) {
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
  
  const appItems = Array.from(document.querySelectorAll('.app-item'));
  allItems = [...appItems, ...channels];

  channels.forEach((ch, idx) => {
    const div = document.createElement('div');
    div.className = 'channel';
    div.dataset.index = appItems.length + idx;

    const img = document.createElement('img');
    img.src = ch.logo || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23333" width="48" height="48"/><text x="24" y="30" fill="%23999" text-anchor="middle" font-size="14">📺</text></svg>';

    const info = document.createElement('div');
    info.className = 'channel-info';
    info.innerHTML = `<div class="channel-name">${ch.name}</div><div class="channel-group">${ch.group || ''}</div>`;

    div.appendChild(img);
    div.appendChild(info);
    div.onclick = () => activateItem(appItems.length + idx);
    channelList.appendChild(div);
  });
}

function activateItem(index) {
  if (index < 0 || index >= allItems.length) return;

  document.querySelectorAll('.channel').forEach(el => el.classList.remove('active'));
  const els = document.querySelectorAll('.channel');
  if (els[index]) {
    els[index].classList.add('active');
    els[index].scrollIntoView({ block: 'nearest' });
  }

  currentIndex = index;
  overlay.style.display = 'none';

  if (index < 3) {
    const action = document.querySelectorAll('.app-item')[index].dataset.action;
    openApp(action);
  } else {
    const channelIndex = index - 3;
    playChannel(channels[channelIndex]);
  }
}

function openApp(action) {
  let url = '';
  if (action === 'youtube') {
    url = 'vnd.youtube://';
  } else if (action === 'playstore') {
    url = 'market://';
  } else if (action === 'settings') {
    url = 'intent://com.android.settings/#Intent;scheme=android-app;end';
  }

  if (url) {
    window.location.href = url;
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
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = ch.url;
    video.play().catch(() => {});
  }
}

document.addEventListener('keydown', (e) => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('hidden');
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => sidebar.classList.add('hidden'), 5000);

  if (allItems.length === 0) return;

  const num = parseInt(e.key);
  if (!isNaN(num) && num >= 0 && num <= 9) {
    let target = num === 0 ? 9 : num - 1;
    if (target < allItems.length) {
      activateItem(target);
      return;
    }
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    currentIndex = (currentIndex + 1) % allItems.length;
    highlightCurrent();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    currentIndex = (currentIndex - 1 + allItems.length) % allItems.length;
    highlightCurrent();
  } else if (e.key === 'Enter' || e.key === ' ') {
    activateItem(currentIndex);
  } else if (e.key.toLowerCase() === 'f') {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  }
});

function highlightCurrent() {
  document.querySelectorAll('.channel').forEach(el => el.classList.remove('active'));
  const els = document.querySelectorAll('.channel');
  if (els[currentIndex]) {
    els[currentIndex].classList.add('active');
    els[currentIndex].scrollIntoView({ block: 'nearest' });
  }
}

document.addEventListener('click', () => {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.remove('hidden');
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => sidebar.classList.add('hidden'), 5000);
});

loadPlaylist();
