/* SCSave.save(blob, name): single save path. Uses File System Access picker when present, else a download link. */
window.SCSave = {
  async save(blob, name) {
    if (window.showSaveFilePicker && window.top === window) {
      try {
        const ext = name.split('.').pop(), h = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'Video', accept: { [blob.type.split(';')[0]]: ['.' + ext] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close(); return true;
      } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000); return true;
  }
};
