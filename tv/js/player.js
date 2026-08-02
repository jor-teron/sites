let hls = null;
const video = document.getElementById('video');

function playChannel(index) {
  if (!video || index < 0 || index >= channels.length) return;

  const ch = channels[index];

  // Special tiles
  if (ch.type === 'app') {
    window.location.href = ch.action;
    return;
  }
  if (ch.type === 'page') {
    window.location.href = ch.action;
    return;
  }
  if (ch.type === 'empty') return;

  // Normal stream
  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (ch.url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(ch.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else {
    video.src = ch.url;
    video.play().catch(() => {});
  }
}
