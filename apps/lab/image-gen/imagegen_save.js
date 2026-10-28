/* Image Gen — the single save module. Downloads today; Hub Drive can be added here later.
   toGallery(): Gallery (apps/media/gallery) only shows files from a folder/files you open on the device and keeps no shared
   store, so "Send to Gallery" saves the PNG (Downloads) and the app explains how to see it in Gallery. */
window.IGSave = {
  save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return Promise.resolve(name);
  },
  toGallery(blob, prompt, tag) { return this.save(blob, this.fileName(prompt, tag)); },
  fileName(prompt, tag) {
    const slug = String(prompt || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return slug + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + (tag ? '-' + tag : '') + '.png';
  },
};
