/* Notely — nl_keys.js: Ctrl/Cmd+S download, Ctrl/Cmd+O open, Tab inserts a tab. */
NL.keys = {
  init() {
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); NL.files.download(); return; }
      if (mod && !e.altKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); NL.files.open(); return; }
      if (e.key === 'Tab' && !mod && !e.altKey && !e.shiftKey && e.target === NL.editor.el) { e.preventDefault(); NL.editor.insert('\t'); }
    });
  },
};
