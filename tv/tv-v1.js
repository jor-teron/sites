/*
 * TV Player v1
 * Based on tv-v2 remote UX. One page; swap playlists in place.
 * No Android app intents. Edit PLAYLISTS below to change sources.
 */

// ========== EDIT THESE ==========
const PLAYLISTS = {
  home: 'channels/home.m3u',
  kids: 'channels/kids.m3u',
  more: 'channels/home-more.m3u',
  india: 'https://iptv-org.github.io/iptv/countries/in.m3u'
};

const DEFAULT_CATEGORY = 'home';
const STORAGE_KEY = 'tv-v1-last';
const NUMBER_DELAY = 1500;
const HIDE_DELAY = 5000;

const CATEGORY_TILES = [
  { key: 'kids', name: 'Kids', group: 'Category', logo: '../image/chase.png' },
  { key: 'more', name: 'More', group: 'Category', logo: '../image/arrow_blue.png' },
  { key: 'india', name: 'India', group: 'Category', logo: '../image/india.png' }
];

const HOME_CATEGORY_LOGO = '../image/home.png';

const PLACEHOLDER_LOGO =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect fill="%23333" width="70" height="70"/><text x="35" y="40" fill="%23999" text-anchor="middle" font-size="18">TV</text></svg>';

// ========== STATE ==========
const video = document.getElementById('video');
const channelList = document.getElementById('channel-list');
const overlay = document.getElementById('overlay');

let hls = null;
let items = [];
let currentIndex = -1;
let currentCategory = DEFAULT_CATEGORY;
let hideTimeout = null;
let numberBuffer = '';
let numberTimeout = null;

// ========== STORAGE ==========
function readLast() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (!PLAYLISTS[data.category]) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function saveLast(category, index, item) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        category: category,
        index: index,
        name: item && item.name ? item.name : '',
        url: item && item.url ? item.url : ''
      })
    );
  } catch (e) {
    /* ignore quota / private mode */
  }
}

// ========== M3U ==========
function parseM3U(text) {
  const lines = text.split('\n').map(function (l) {
    return l.trim();
  }).filter(Boolean);
  const result = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
      const logoMatch =
        line.match(/tvg-logo="([^"]*)"/i) ||
        line.match(/tvg-logo='([^']*)'/i);
      const groupMatch =
        line.match(/group-title="([^"]*)"/i) ||
        line.match(/group-title='([^']*)'/i);

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

// ========== PLAYLIST LOAD ==========
function showOverlay(msg) {
  overlay.textContent = msg;
  overlay.style.display = 'block';
}

function hideOverlay() {
  overlay.style.display = 'none';
}

function categoryTilesFor(category) {
  if (category === 'home') {
    return CATEGORY_TILES.map(function (t) {
      return {
        name: t.name,
        logo: t.logo || '',
        group: t.group,
        type: 'category',
        categoryKey: t.key
      };
    });
  }
  return [
    {
      name: 'Home',
      logo: HOME_CATEGORY_LOGO,
      group: 'Category',
      type: 'category',
      categoryKey: 'home'
    }
  ];
}

function loadPlaylist(category, options) {
  options = options || {};
  const url = PLAYLISTS[category];
  if (!url) {
    showOverlay('Unknown category: ' + category);
    return;
  }

  currentCategory = category;
  showOverlay('Loading ' + category + '...');

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (text) {
      const channels = parseM3U(text);
      items = categoryTilesFor(category).concat(channels);
      buildList();

      let startIndex = items.findIndex(function (it) {
        return it.type === 'channel';
      });
      if (startIndex < 0) startIndex = 0;

      if (options.preferName || options.preferUrl) {
        const found = items.findIndex(function (it) {
          if (it.type !== 'channel') return false;
          if (options.preferUrl && it.url === options.preferUrl) return true;
          if (options.preferName && it.name === options.preferName) return true;
          return false;
        });
        if (found >= 0) startIndex = found;
      } else if (typeof options.startIndex === 'number' &&
                 options.startIndex >= 0 &&
                 options.startIndex < items.length &&
                 items[options.startIndex].type === 'channel') {
        startIndex = options.startIndex;
      }

      if (items.length) {
        setTimeout(function () {
          activateItem(startIndex);
        }, 200);
      } else {
        showOverlay('No channels in playlist');
      }
    })
    .catch(function (err) {
      console.error(err);
      showOverlay('Failed to load playlist');
    });
}

// ========== UI ==========
function buildList() {
  channelList.innerHTML = '';

  items.forEach(function (item, idx) {
    const div = document.createElement('div');
    div.className = 'channel' + (item.type === 'category' ? ' category' : '');
    div.dataset.index = String(idx);

    const numberSpan = document.createElement('div');
    numberSpan.className = 'channel-number';
    numberSpan.textContent = idx + 1 + '.';

    const img = document.createElement('img');
    img.alt = '';
    img.src = item.logo || PLACEHOLDER_LOGO;
    img.onerror = function () {
      img.src = PLACEHOLDER_LOGO;
    };

    const info = document.createElement('div');
    info.className = 'channel-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'channel-name';
    nameEl.textContent = item.name;

    const groupEl = document.createElement('div');
    groupEl.className = 'channel-group';
    groupEl.textContent =
      item.type === 'category' ? 'Category' : item.group || 'Live';

    info.appendChild(nameEl);
    info.appendChild(groupEl);

    div.appendChild(numberSpan);
    div.appendChild(img);
    div.appendChild(info);
    div.onclick = function () {
      activateItem(idx);
    };
    channelList.appendChild(div);
  });
}

function highlightCurrent() {
  document.querySelectorAll('.channel').forEach(function (el) {
    el.classList.remove('active');
  });
  const active = document.querySelector(
    '.channel[data-index="' + currentIndex + '"]'
  );
  if (active) {
    active.classList.add('active');
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function activateItem(index) {
  if (index < 0 || index >= items.length) return;

  currentIndex = index;
  highlightCurrent();
  hideOverlay();
  hideNumberDisplay();

  const item = items[index];

  if (item.type === 'category') {
    loadPlaylist(item.categoryKey);
    startHideTimer();
    return;
  }

  playChannel(item);
  saveLast(currentCategory, index, item);
  startHideTimer();
}

function playChannel(ch) {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.removeAttribute('src');
  video.load();

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(ch.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      video.play().catch(function () {});
    });
    hls.on(Hls.Events.ERROR, function (_e, data) {
      if (data && data.fatal) {
        showOverlay('Stream error');
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = ch.url;
    video.play().catch(function () {});
  } else {
    showOverlay('HLS not supported');
  }
}

// ========== NUMBER PAD ==========
function showNumberDisplay(num) {
  let display = document.getElementById('number-display');
  if (!display) {
    display = document.createElement('div');
    display.id = 'number-display';
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
  numberTimeout = setTimeout(function () {
    const channelNum = parseInt(numberBuffer, 10);
    if (!isNaN(channelNum) && channelNum >= 1 && channelNum <= items.length) {
      activateItem(channelNum - 1);
    }
    numberBuffer = '';
    hideNumberDisplay();
  }, NUMBER_DELAY);
}

// ========== OVERLAY VISIBILITY ==========
function startHideTimer() {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(function () {
    channelList.classList.add('hidden');
  }, HIDE_DELAY);
}

function showList() {
  channelList.classList.remove('hidden');
  startHideTimer();
}

// ========== INPUT ==========
document.addEventListener('keydown', function (e) {
  showList();
  if (items.length === 0) return;

  if (e.key >= '0' && e.key <= '9') {
    handleNumberInput(e.key);
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    currentIndex = (currentIndex + 1) % items.length;
    highlightCurrent();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    highlightCurrent();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    activateItem(currentIndex);
  }
});

document.addEventListener('click', showList);

// ========== START ==========
(function start() {
  const last = readLast();
  if (last) {
    loadPlaylist(last.category, {
      startIndex: typeof last.index === 'number' ? last.index : undefined,
      preferName: last.name,
      preferUrl: last.url
    });
  } else {
    loadPlaylist(DEFAULT_CATEGORY);
  }
})();
