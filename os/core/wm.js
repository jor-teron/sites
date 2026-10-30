// Tiny window manager: create, drag, focus, close.
let root = document.body;
let z = 10;
let offset = 0;
const windows = new Set();
const listeners = new Set();

export function mount(el) { root = el; }
export function list() { return [...windows]; }
export function onChange(fn) { listeners.add(fn); }
const changed = () => listeners.forEach(fn => fn());

function clamp(el) {
  const maxX = Math.max(0, root.clientWidth - el.offsetWidth);
  const maxY = Math.max(0, root.clientHeight - 30);
  el.style.left = Math.min(Math.max(0, el.offsetLeft), maxX) + 'px';
  el.style.top = Math.min(Math.max(0, el.offsetTop), maxY) + 'px';
}

export function createWindow({ title = 'Window', width = 360, height = 240 } = {}) {
  const el = document.createElement('div');
  el.className = 'win';
  el.style.width = width + 'px';
  el.style.height = height + 'px';
  el.style.left = 40 + offset + 'px';
  el.style.top = 30 + offset + 'px';
  offset = (offset + 24) % 120;
  el.innerHTML = '<div class="title"><span></span><button title="Close">×</button></div><div class="body"></div>';
  el.querySelector('.title span').textContent = title;
  const bar = el.querySelector('.title');
  const body = el.querySelector('.body');

  const win = {
    el, body, title,
    focus() { el.style.zIndex = ++z; windows.forEach(w => w.active = w === win); changed(); },
    close() { el.remove(); windows.delete(win); changed(); },
  };

  el.addEventListener('pointerdown', () => win.focus());
  bar.querySelector('button').addEventListener('click', e => { e.stopPropagation(); win.close(); });

  bar.addEventListener('pointerdown', e => {
    if (e.target.tagName === 'BUTTON') return;
    const dx = e.clientX - el.offsetLeft, dy = e.clientY - el.offsetTop;
    bar.setPointerCapture?.(e.pointerId);
    const move = ev => { el.style.left = ev.clientX - dx + 'px'; el.style.top = ev.clientY - dy + 'px'; clamp(el); };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });

  root.appendChild(el);
  clamp(el);
  windows.add(win);
  win.focus();
  return win;
}
