const video = document.getElementById('video');
const channelListEl = document.getElementById('channelList');
const overlay = document.getElementById('channelOverlay');

let channels = [];
let currentIndex = 0;
let hls = null;

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
      ${ch.logo ? `<img src="${ch.logo}" onerror="this.style.display='none'">` : ''}
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
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
  } else {
    video.src = url;
    video.play().catch(()=>{});
  }
}

// ========== Header Navigation ==========
document.querySelectorAll('.nav-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    const page = tile.dataset.page;   // videos / photos
    const cat  = tile.dataset.cat;    // home / kids / india

    // Go to Videos page
    if (page === 'videos') {
      window.location.href = 'video.html';
      return;
    }

    // Go to Photos page
    if (page === 'photos') {
      window.location.href = 'photo.html';
      return;
    }

    // If we are currently on video.html or photo.html → go back to index.html
    const currentPage = window.location.pathname;
    if (currentPage.includes('video.html') || currentPage.includes('photo.html')) {
      // Save which category to open
      if (cat) localStorage.setItem('lastCat', cat);
      window.location.href = 'index.html';
      return;
    }

    // Already on index.html → just switch playlist
    document.querySelectorAll('.nav-tile').forEach(t => t.classList.remove('active'));
    tile.classList.add('active');

    if (cat) loadPlaylist(cat);
  });
});

// ========== Keyboard support ==========
document.addEventListener('keydown', (e) => {
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

// ========== Start ==========
const isLivePage = !window.location.pathname.includes('video.html') && 
                   !window.location.pathname.includes('photo.html');

if (isLivePage) {
  // Load HLS only on Live TV page
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7';
  script.onload = () => {
    const lastCat = localStorage.getItem('lastCat') || 'home';
    // Highlight correct tile
    document.querySelectorAll('.nav-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.cat === lastCat);
    });
    loadPlaylist(lastCat);
  };
  document.head.appendChild(script);
}
