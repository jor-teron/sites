/*
 * Camera — saving. Every photo and video goes through CameraSave.save(blob, filename).
 * Today it is a browser download; swap the body for Hub Drive later without
 * touching camera_logic.js. Returns a Promise that resolves to the file name.
 */
const CameraSave = {
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

  /* photo-20261021-124501.jpg (local time) */
  fileName(prefix, ext, date) {
    const d = date || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return prefix + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
  },
};
