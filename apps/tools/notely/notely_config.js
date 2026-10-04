/* Notely — notely_config.js: every tunable in one place (loaded first). */
window.NL = window.NL || {};
NL.config = {
  defaultTheme: 'dark',
  themes: {
    dark:  { bg: '#121418', bar: '#181b21', border: '#2c3340', text: '#e8eaed', muted: '#9aa0a6', btn: '#232831', btnHover: '#2c323d', accent: '#6ea8fe', accentInk: '#0b1220', paper: '#121418', caret: '#6ea8fe', selection: 'rgba(110,168,254,0.30)' },
    light: { bg: '#f6f7f9', bar: '#ffffff', border: '#d9dde3', text: '#1d2127', muted: '#5f6670', btn: '#eef0f3', btnHover: '#e3e6ea', accent: '#1a66d9', accentInk: '#ffffff', paper: '#ffffff', caret: '#1a66d9', selection: 'rgba(26,102,217,0.22)' },
  },
  fontSize: { min: 12, max: 32, step: 2, default: 17 },
  autosaveMs: 400,
  undoMs: 5000,
  filename: 'Notely.txt',
  maxOpenBytes: 5 * 1024 * 1024,
  keys: {
    text: 'notely-text',
    theme: 'notely-theme',
    font: 'notely-font',
    imported: 'notely-imported',
    notepadText: 'notepad-text',   // read once, never written
  },
};
