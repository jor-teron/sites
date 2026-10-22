// LandCraft L2b map picker, modelled on AoE RTS: a 2-digit box (one digit = same map, 7 -> 07),
// Play / Random / Continue, the last map remembered in localStorage 'landcraft.map'.
// In game: a small "Map NN" button (top left) or Esc opens it again to switch maps.
const KEY = 'landcraft.map';
export const label = function (n) { return String(n).padStart(2, '0'); };

export function setupPicker(o) { // o: { canvas, current() -> map number or null, load(n) }
  const $ = function (id) { return document.getElementById(id); };
  const ov = $('picker'), inp = $('map-input'), note = $('map-note'), badge = $('mapbtn');
  const bPlay = $('map-play'), bRandom = $('map-random'), bCont = $('map-continue');
  const touch = function () { return document.body.classList.contains('touch'); };
  const last = function () {
    try { const v = localStorage.getItem(KEY); return /^\d{1,2}$/.test(v || '') ? +v : null; } catch (e) { return null; }
  };
  const remember = function (n) { try { localStorage.setItem(KEY, String(n)); } catch (e) {} };
  const pick = function () { return /^\d{1,2}$/.test(inp.value) ? parseInt(inp.value, 10) : null; };
  function show() {
    const n = pick(), l = last(), cur = o.current();
    bPlay.disabled = n === null;
    bCont.disabled = l === null;
    bCont.textContent = l === null ? 'Continue' : 'Continue ' + label(l);
    note.classList.toggle('bad', n === null && inp.value !== '');
    note.textContent = n === null ? (inp.value === '' ? 'Type a map number 00-99' : 'Digits only: a map number 00-99')
      : 'Map ' + label(n) + (n === 0 ? ' \u00b7 flat test world' : '') + (n === cur ? ' \u00b7 current' : '');
  }
  function isOpen() { return !ov.hidden; }
  function open() {
    if (document.pointerLockElement) document.exitPointerLock();
    ov.hidden = false;
    const cur = o.current(), l = last();
    inp.value = label(cur !== null ? cur : l !== null ? l : 1);
    show();
    if (!touch()) { inp.focus(); inp.select(); }
  }
  function close() { ov.hidden = true; inp.blur(); }
  function go(n) {
    if (n === null) return;
    remember(n); close();
    if (n !== o.current()) o.load(n);
    badge.textContent = 'Map ' + label(n); badge.hidden = false;
    if (!touch() && o.canvas.requestPointerLock) { // pointer lock only after Play (a click is a user gesture)
      const p = o.canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () {});
    }
  }
  inp.addEventListener('input', show);
  bPlay.addEventListener('click', function () { go(pick()); });
  bCont.addEventListener('click', function () { go(last()); });
  bRandom.addEventListener('click', function () { const n = Math.floor(Math.random() * 100); inp.value = label(n); go(n); });
  badge.addEventListener('click', open);
  badge.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  // Keys typed in the picker never reach the game (WASD, 1-7); Enter plays, Esc resumes the current map.
  ov.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); go(pick()); }
    else if (e.key === 'Escape' && o.current() !== null) { e.preventDefault(); close(); }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !isOpen() && !document.pointerLockElement) open(); });
  // Like Minecraft: Esc while playing frees the mouse and shows the menu.
  document.addEventListener('pointerlockchange', function () { if (!document.pointerLockElement && !isOpen() && o.current() !== null) open(); });

  // Start: ?map=NN goes straight into that map (picker skipped); otherwise show the picker.
  const q = /[?&]map=(\d{1,2})(?:&|$)/.exec(location.search);
  if (q) { remember(+q[1]); close(); o.load(+q[1]); badge.textContent = 'Map ' + label(+q[1]); badge.hidden = false; } else open();
  return { open: open, close: close, isOpen: isOpen, last: last };
}
