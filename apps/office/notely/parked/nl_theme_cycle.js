/* PARKED (NL2): not loaded by notely.html; kept so it may be reused. The NL1 theme module with the System → Light → Dark
   cycle (#btn-theme) and the saved 'notely-theme' choice. NL2 nl_theme.js follows the system/Hub only.
   Notely — nl_theme.js: theme mode system | light | dark (NL1), remembered.
   System (default) follows the Hub's Dark / Light live via shared/theme/hub_theme.js; the Hub accent
   (sites-hub.accent) replaces the theme accent when set. Colours come from config and are written as
   CSS variables on <body>, so hub_theme.js (which writes --accent / color-scheme on <html>) never overrides them.
   The theme button cycles System -> Light -> Dark and shows the current mode. */
NL.theme = (function () {
  const C = NL.config, S = NL.store, MODES = ['system', 'light', 'dark'], LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
  let mode = C.defaultTheme, current = 'dark';
  const hubDark = () => (window.HubTheme ? HubTheme.hub() === 'dark' : S.get('sites-hub.theme') !== 'light');
  const hubAccent = () => { const a = S.get('sites-hub.accent') || ''; return /^#[0-9a-f]{6}$/i.test(a) ? a : ''; };
  function ink(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0b1220' : '#ffffff';
  }
  function apply(m) {
    mode = MODES.indexOf(m) >= 0 ? m : C.defaultTheme;
    current = mode === 'system' ? (hubDark() ? 'dark' : 'light') : mode;
    const t = Object.assign({}, C.themes[current]), acc = hubAccent();
    if (acc) { t.accent = acc; t.caret = acc; t.accentInk = ink(acc); }
    const st = document.body.style;
    for (const k of Object.keys(t)) st.setProperty('--' + k.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase()), t[k]);
    document.documentElement.dataset.theme = current;
    st.colorScheme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.bar;
    const b = document.getElementById('btn-theme');
    if (b) { const nx = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; b.textContent = LABEL[mode]; b.title = 'Theme: ' + LABEL[mode] + ' (tap for ' + LABEL[nx] + ')'; }
  }
  if (window.HubTheme) HubTheme.onChange(() => apply(mode));
  return {
    init() { apply(S.get(C.keys.theme) || C.defaultTheme); },
    toggle() { apply(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); S.set(C.keys.theme, mode); },
    get current() { return current; },
    get mode() { return mode; },
  };
})();
