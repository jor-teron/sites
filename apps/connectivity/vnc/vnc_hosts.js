/* vnc_hosts.js — VNC1 saved hosts: localStorage 'vnc-hosts-v1' ({id,name,relay,host,port,password}) + list and editor UI. */
const KEY = 'vnc-hosts-v1';
export const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
const save = (l) => localStorage.setItem(KEY, JSON.stringify(l));

export function initHosts(onConnect) {
  const ul = document.getElementById('hosts'), dlg = document.getElementById('edit'), f = document.getElementById('editForm');
  let editing = null;
  const render = () => {
    const l = load(); ul.textContent = '';
    document.getElementById('empty').hidden = l.length > 0;
    for (const h of l) {
      const li = document.createElement('li');
      li.innerHTML = '<div class="nm"></div><div class="sub"></div><div class="row"><button class="big jelly" data-a="c">Connect</button><button class="big ghost jelly" data-a="e">Edit</button><button class="big ghost jelly" data-a="d">Delete</button></div>';
      li.querySelector('.nm').textContent = h.name;
      li.querySelector('.sub').textContent = h.host + ':' + h.port + ' via ' + h.relay;
      li.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'c') onConnect(h);
        if (a === 'e') open(h);
        if (a === 'd' && confirm('Delete ' + h.name + '?')) { save(load().filter((x) => x.id !== h.id)); render(); }
      };
      ul.appendChild(li);
    }
  };
  const open = (h) => {
    editing = h || null; f.reset();
    document.getElementById('editTitle').textContent = h ? 'Edit host' : 'Add host';
    if (h) for (const k of ['name', 'relay', 'host', 'port', 'password']) f.elements[k].value = h[k] || '';
    dlg.showModal();
  };
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    const v = Object.fromEntries(new FormData(f)); v.port = +v.port || 5900;
    const l = load();
    if (editing) Object.assign(l.find((x) => x.id === editing.id) || {}, v);
    else l.push({ id: Date.now().toString(36), ...v });
    save(l); render();
  });
  document.getElementById('addBtn').onclick = () => open();
  render();
}
