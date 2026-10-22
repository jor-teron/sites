/*
 * Sound Recorder — saving. Every download goes through SRSave.save(blob, filename).
 * Today it is a browser download; swap the body for Hub Drive later without
 * touching the other modules. Returns a Promise that resolves to the file name.
 */
const SRSave = {
  save(blob, filename) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      resolve(filename);
    });
  },
  /* "Team call 2" + "webm" -> "Team-call-2.webm" */
  fileName(name, ext) {
    const base = String(name || 'recording').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'recording';
    return base + '.' + ext;
  },
  ext(mime) {
    const m = String(mime || '');
    if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a';
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('wav')) return 'wav';
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
    return 'webm';
  },
};
