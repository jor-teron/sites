/* Notely — nl_theme.js: dark / light colours from config as CSS variables, remembered. */
NL.theme = (function () {
  const C = NL.config, S = NL.store;
  let current = C.defaultTheme;
  function apply(name) {
    current = C.themes[name] ? name : C.defaultTheme;
    const t = C.themes[current], st = document.documentElement.style;
    for (const k of Object.keys(t)) st.setProperty('--' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), t[k]);
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.bar;
    const b = document.getElementById('btn-theme');
    if (b) { b.textContent = current === 'dark' ? 'Light' : 'Dark'; b.title = 'Switch to ' + b.textContent.toLowerCase() + ' theme'; }
  }
  return {
    init() { apply(S.get(C.keys.theme) || C.defaultTheme); },
    toggle() { apply(current === 'dark' ? 'light' : 'dark'); S.set(C.keys.theme, current); },
    get current() { return current; },
  };
})();
