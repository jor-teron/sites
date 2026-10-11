/*
  Project: sites (shared)
  File: shared/share/share_wa.js
  Role: ShareWA (release 4). Share to WhatsApp / WhatsApp Business (the OS picks / asks).
  - text(t): opens https://wa.me/?text=<encoded> in a new tab (app opens on phones).
  - files(list, text?): navigator.share({files}) when canShare, else downloads each file.
    Returns a Promise<'shared' | 'downloaded' | 'cancelled'>.
*/
(function () {
  'use strict';
  function text(t) {
    window.open('https://wa.me/?text=' + encodeURIComponent(String(t || '')), '_blank', 'noopener');
  }
  function download(f) {
    var url = URL.createObjectURL(f);
    var a = document.createElement('a');
    a.href = url; a.download = f.name || 'file'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function files(list, t) {
    list = Array.prototype.slice.call(list || []).map(function (f) {
      return f instanceof File ? f : new File([f], (f && f.name) || 'file', { type: (f && f.type) || '' });
    });
    if (!list.length) return Promise.resolve('cancelled');
    var data = { files: list };
    if (t) data.text = t;
    if (navigator.canShare && navigator.share && navigator.canShare({ files: list })) {
      return navigator.share(data).then(function () { return 'shared'; }, function () { return 'cancelled'; });
    }
    list.forEach(download);
    return Promise.resolve('downloaded');
  }
  window.ShareWA = { text: text, files: files };
})();
