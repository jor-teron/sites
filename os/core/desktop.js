// Desktop area + bottom panel (apps and open windows).
import * as wm from './wm.js';
import * as registry from './registry.js';

export function mount(os) {
  const desktop = document.createElement('div');
  desktop.id = 'desktop';
  const panel = document.createElement('div');
  panel.id = 'panel';
  document.body.append(desktop, panel);
  wm.mount(desktop);

  function render() {
    panel.replaceChildren();
    for (const app of registry.list()) {
      const b = document.createElement('button');
      b.className = 'app';
      b.textContent = app.name || app.id;
      b.dataset.app = app.id;
      b.onclick = () => registry.open(app.id, os).catch(e => os.log('app ' + app.id + ' failed: ' + e.message));
      panel.append(b);
    }
    const sep = document.createElement('span');
    sep.className = 'sep';
    panel.append(sep);
    for (const w of wm.list()) {
      const b = document.createElement('button');
      b.className = 'task' + (w.active ? ' active' : '');
      b.textContent = w.title;
      b.onclick = () => w.focus();
      panel.append(b);
    }
  }
  wm.onChange(render);
  render();
  return { desktop, panel, render };
}
