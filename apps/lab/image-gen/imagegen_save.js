/* Image Gen — the single save function. Downloads today; Hub Drive can be added here later. */
window.IGSave = {
  save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return Promise.resolve(name);
  },
  fileName(prompt) {
    const slug = String(prompt || 'image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return slug + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
  },
};
