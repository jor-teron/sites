const video = document.getElementById('video');
const channelListEl = document.getElementById('channelList');
const overlay = document.getElementById('channelOverlay');

let channels = [];
let currentIndex = 0;
let hls = null;
let hideTimer = null;

// ========== Playlist sources ==========
const playlists = {
  home:  'channels/home.m3u',
  kids:  'channels/kids.m3u',
  india: 'https://iptv-org.github.io/iptv/countries/in.m3u'
};

// ========== Parse M3U ==========
function parseM3U(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const list = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const name = (line.split(',').pop() || 'Unknown').trim();
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      current = {
        name,
        logo: logoMatch ? logoMatch[1] : '',
        url: ''
      };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      list.push(current);
      current = null;
    }
  }
  return list;
}

// ========== Load playlist ==========
async function loadPlaylist(key) {
  const url = playlists[key];
  if (!url) return;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    const text = await res.text();
    channels = parseM3U(text);
    currentIndex = 0;
    renderChannels();
    if (channels.length > 0) playChannel(0);
    showOverlay();
  } catch (err) {
    console.error(err);
    if (channelListEl) {
      channelListEl.innerHTML = `<div style="color:white;padding:20px;">Failed to load playlist</div>`;
    }
  }
}

// ========== Render channel tiles ==========
function renderChannels() {
  if (!channelListEl) return;
  channelListEl.innerHTML = '';
  channels.forEach((ch, i) => {
    const div = document.createElement('div');
    div.className = 'channel' + (i === currentIndex ? ' active' : '');
    div.innerHTML = `
      <span class="num">${i + 1}</span>
      \( {ch.logo ? `<img src=" \){ch.logo}" onerror="this.style.display='none'">` : ''}
      <span class="name">${ch.name}</span>
    `;
    div.onclick = () => playChannel(i);
    channelListEl.appendChild(div);
  });
}

// ========== Play channel ==========
function playChannel(index) {
  if (!video || index < 0 || index >= channels.length) return;
  currentIndex = index;

  document.querySelectorAll('.channel').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  const ch = channels[index];
  const url = ch.url;

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else {
    video.src = url;
    video.play().catch(() => {});
  }

  showOverlay();
}

// ========== Overlay show / hide ==========
function showOverlay() {
  if (!overlay) return;
  overlay.classList.remove('hidden');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    overlay.classList.add('hidden');
  }, 2000); // 2 seconds
}

// ========== Header Navigation ==========
document.querySelectorAll('.nav-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    const page = tile.dataset.page;
    const cat  = tile.dataset.cat;

    if (page === 'videos') {
      window.location.href = 'video.html';
      return;
    }
    if (page === 'photos') {
      window.location.href = 'photo.html';
      return;
    }

    const currentPage = window.location.pathname;
    if (currentPage.includes('video.html') || currentPage.includes('photo.html')) {
      if (cat) localStorage.setItem('lastCat', cat);
      window.location.href = 'index.html';
      return;
    }

    document.querySelectorAll('.nav-tile').forEach(t => t.classList.remove('active'));
    tile.classList.add('active');

    if (cat) loadPlaylist(cat);
  });
});

// ========== Activity detection ==========
function onActivity() {
  showOverlay();
}

document.addEventListener('keydown', (e) => {
  onActivity();

  if (!channels.length) return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    playChannel((currentIndex + 1) % channels.length);
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    playChannel((currentIndex - 1 + channels.length) % channels.length);
  }
  if (e.key === 'Enter') {
    playChannel(currentIndex);
  }
});

document.addEventListener('mousemove', onActivity);
document.addEventListener('click', onActivity);
document.addEventListener('touchstart', onActivity);

// ========== Start ==========
const isLivePage = !window.location.pathname.includes('video.html') &&
                   !window.location.pathname.includes('photo.html');

if (isLivePage) {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7';
  script.onload = () => {
    const lastCat = localStorage.getItem('lastCat') || 'home';
    document.querySelectorAll('.nav-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.cat === lastCat);
    });
    loadPlaylist(lastCat);
  };
  document.head.appendChild(script);
}
