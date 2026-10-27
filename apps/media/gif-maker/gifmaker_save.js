/* GIF Maker — the single save function. Downloads today; Hub Drive can be added here later. */
window.GMSave = {
  save(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return Promise.resolve(name);
  },
};
