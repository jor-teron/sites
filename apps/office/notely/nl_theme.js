/* Notely — nl_theme.js (NL2): the theme always follows the system / Hub; no button, no saved choice
   ('notely-theme' is ignored; the NL1 cycle is in parked/nl_theme_cycle.js). It follows the Hub's Dark / Light live via shared/theme/hub_theme.js; the Hub accent
   (sites-hub.accent) replaces the theme accent when set. Colours come from config and are written as
   CSS variables on <body>, so hub_theme.js (which writes --accent / color-scheme on <html>) never overrides them. */
NL.theme = (function () {
  const C = NL.config, S = NL.store;
  let current = 'dark';
  const hubDark = () => (window.HubTheme ? HubTheme.hub() === 'dark' : S.get('sites-hub.theme') !== 'light');
  const hubAccent = () => { const a = S.get('sites-hub.accent') || ''; return /^#[0-9a-f]{6}$/i.test(a) ? a : ''; };
  function ink(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0b1220' : '#ffffff';
  }
  function apply() {
    current = hubDark() ? 'dark' : 'light';
    const t = Object.assign({}, C.themes[current]), acc = hubAccent();
    if (acc) { t.accent = acc; t.caret = acc; t.accentInk = ink(acc); }
    const st = document.body.style;
    for (const k of Object.keys(t)) st.setProperty('--' + k.replace(/[A-Z]/g, (x) => '-' + x.toLowerCase()), t[k]);
    document.documentElement.dataset.theme = current;
    st.colorScheme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.bar;
  }
  if (window.HubTheme) HubTheme.onChange(apply);
  return {
    init() { apply(); },
    get current() { return current; },
  };
})();
