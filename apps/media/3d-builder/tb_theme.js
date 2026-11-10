/* 3D Builder — tb_theme.js: Auto / Light / Dark. TD1
   Auto follows Hub sites-hub.theme / sites-hub.themeAuto live (read-only).
   App preference is stored in 3dbuilder.theme {theme}. */

const KEY = '3dbuilder.theme';
const P = 'sites-hub.';

let mq = null;
let mode = 'auto';
const fns = [];

function read(k) {
  try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
}

export function loadMode() {
  try {
    const s = JSON.parse(read(KEY) || '{}');
    if (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto')) {
      mode = s.theme;
      return mode;
    }
  } catch (e) { /* ok */ }
  mode = 'auto';
  return mode;
}

function saveMode(m) {
  mode = (m === 'light' || m === 'dark') ? m : 'auto';
  let s = {};
  try { s = JSON.parse(read(KEY) || '{}') || {}; } catch (e) { s = {}; }
  s.theme = mode;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* blocked */ }
  return mode;
}

/**
 * Resolve 'dark' | 'light'.
 * App Light/Dark wins. App Auto → Hub explicit theme, or device if Hub Auto
 * is on or the Hub key is unset.
 */
export function resolve() {
  if (mode === 'dark' || mode === 'light') return mode;
  const auto = read(P + 'themeAuto') === '1';
  if (!auto) {
    const t = read(P + 'theme');
    if (t === 'dark' || t === 'light') return t;
  }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch (e) { /* ok */ }
  return 'light';
}

export function apply() {
  const eff = resolve();
  const el = document.documentElement;
  el.dataset.theme = eff;
  el.classList.toggle('light', eff === 'light');
  el.classList.toggle('dark', eff === 'dark');
  el.style.colorScheme = eff;
  const seg = document.getElementById('themeSeg');
  if (seg) {
    const buttons = seg.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('on', buttons[i].getAttribute('data-v') === mode);
    }
  }
  fns.forEach(function (fn) {
    try { fn(eff, mode); } catch (e) { /* app bug */ }
  });
  return eff;
}

export function setMode(m) {
  saveMode(m);
  return apply();
}

export function getMode() { return mode; }

export function onChange(fn) {
  if (typeof fn === 'function') fns.push(fn);
}

export function boot() {
  loadMode();
  apply();
  const seg = document.getElementById('themeSeg');
  if (seg) {
    seg.addEventListener('click', function (e) {
      const b = e.target && e.target.closest && e.target.closest('button');
      if (!b) return;
      setMode(b.getAttribute('data-v'));
    });
  }
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = function () { apply(); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  } catch (e) { /* ok */ }
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(P) === 0 || e.key === KEY) {
      if (e.key === KEY) loadMode();
      apply();
    }
  });
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'hub-prefs') apply();
  });
  window.addEventListener('focus', apply);
}
