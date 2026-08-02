let channels = [];

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
        url: '',
        type: 'stream'
      };
    } else if (line && !line.startsWith('#') && current) {
      current.url = line;
      list.push(current);
      current = null;
    }
  }
  return list;
}

async function loadPlaylist(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load playlist');
    const text = await res.text();
    return parseM3U(text);
  } catch (err) {
    console.error('Playlist load error:', err);
    return [];
  }
}
