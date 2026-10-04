/* Notely — nl_files.js: Open (picker / drag-drop) and Download. */
NL.files = (function () {
  const C = NL.config;
  let input;

  function looksText(file) {
    if (/^text\//.test(file.type) || /json|xml|javascript|csv|markdown/.test(file.type)) return true;
    return !file.type;   // .md / .log etc. often have no type
  }
  function load(file) {
    if (!file) return;
    if (file.size > C.maxOpenBytes) { NL.main.flash('File is too big (over ' + Math.round(C.maxOpenBytes / 1048576) + ' MB).'); return; }
    if (!looksText(file) && !/\.(txt|md|markdown|csv|log|json|ini|cfg|conf|ya?ml|html?|css|js)$/i.test(file.name)) {
      NL.main.flash('That does not look like a text file.');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || '');
      if (/\u0000/.test(text.slice(0, 2000))) { NL.main.flash('That does not look like a text file.'); return; }
      NL.editor.replaceAll(text.replace(/\r\n?/g, '\n'));
      NL.main.flash('Opened ' + file.name);
    };
    r.onerror = () => NL.main.flash('Could not read that file.');
    r.readAsText(file);
  }
  function open() { input.click(); }
  function download() {
    NL.editor.save();
    const blob = new Blob([NL.editor.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = C.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function init() {
    input = document.getElementById('file');
    input.addEventListener('change', () => { load(input.files && input.files[0]); input.value = ''; });
    let depth = 0;
    const has = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!has(e)) return; e.preventDefault(); depth++; document.body.classList.add('dragging'); });
    window.addEventListener('dragover', (e) => { if (has(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('drop', (e) => {
      if (!has(e)) return;
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
      load(e.dataTransfer.files[0]);
    });
  }
  return { init, open, download, load };
})();
